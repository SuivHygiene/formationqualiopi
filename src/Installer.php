<?php
declare(strict_types=1);

namespace App;

use App\Controllers\AuthController;
use App\Core\Db;

/**
 * Installation sans accès SSH : écrit config.php, crée les tables et le premier organisme.
 * Protégée par une clé à usage unique (fichier install.key à la racine du projet, hors web).
 */
final class Installer
{
    public function __construct(private readonly string $root)
    {
    }

    public function keyFile(): string
    {
        return $this->root . '/install.key';
    }

    public function configFile(): string
    {
        return $this->root . '/config.php';
    }

    public function isLocked(): bool
    {
        return is_file($this->root . '/install.lock') || !is_file($this->keyFile());
    }

    public function checkKey(string $given): bool
    {
        $key = trim((string) @file_get_contents($this->keyFile()));
        return strlen($key) >= 24 && hash_equals($key, trim($given));
    }

    /** @return list<array{string,bool,string}> [libellé, ok, détail] */
    public function prerequisites(): array
    {
        return [
            ['PHP 8.2 ou plus', version_compare(PHP_VERSION, '8.2.0', '>='), PHP_VERSION],
            ['Extension pdo_mysql', extension_loaded('pdo_mysql'), ''],
            ['Extension mbstring', extension_loaded('mbstring'), ''],
            ['Dossier du projet inscriptible (pour config.php)', is_writable($this->root), $this->root],
            ['Connexion HTTPS', ($_SERVER['HTTPS'] ?? '') !== '' && ($_SERVER['HTTPS'] ?? '') !== 'off' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https', 'activez le certificat SSL du sous-domaine'],
        ];
    }

    /**
     * @param array<string,string> $in
     * @return string message de réussite
     */
    public function run(array $in): string
    {
        foreach (['db_host', 'db_name', 'db_user', 'db_password', 'organisme', 'email', 'password'] as $k) {
            if (trim((string) ($in[$k] ?? '')) === '') {
                throw new \InvalidArgumentException('Tous les champs sont obligatoires.');
            }
        }
        if (!filter_var($in['email'], FILTER_VALIDATE_EMAIL)) {
            throw new \InvalidArgumentException('E-mail invalide.');
        }
        AuthController::assertStrong($in['password']);
        if (!preg_match('/^[A-Za-z0-9_.\-]+$/', $in['db_host'] . $in['db_name'] . $in['db_user'])) {
            throw new \InvalidArgumentException('Hôte, nom de base ou utilisateur : caractères non autorisés.');
        }

        $db = Db::connect([
            'dsn' => sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $in['db_host'], $in['db_name']),
            'user' => $in['db_user'],
            'password' => $in['db_password'],
        ]);

        Migrator::run($db, $this->root . '/migrations', static fn () => null);

        $existing = (int) $db->value('SELECT COUNT(*) FROM organismes');
        if ($existing === 0) {
            AuthController::createOrganisme($db, trim($in['organisme']), $in['email'], $in['password'], trim($in['prenom'] ?? ''), trim($in['nom'] ?? ''));
        }

        $config = [
            'db' => [
                'dsn' => sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $in['db_host'], $in['db_name']),
                'user' => $in['db_user'],
                'password' => $in['db_password'],
            ],
            'api_base' => '/api',
            'timezone' => 'Europe/Paris',
            'cookie_secure' => true,
            'signup_enabled' => false,
            'debug' => false,
        ];
        $php = "<?php\n// Généré par l'installation le " . gmdate('Y-m-d H:i') . " UTC. Ne pas publier.\nreturn " . var_export($config, true) . ";\n";
        if (file_put_contents($this->configFile(), $php, LOCK_EX) === false) {
            throw new \RuntimeException('Impossible d\'écrire config.php.');
        }
        @chmod($this->configFile(), 0600);
        file_put_contents($this->root . '/install.lock', gmdate('c'));
        @unlink($this->keyFile());

        return $existing === 0
            ? 'Installation terminée : tables créées et compte administrateur ' . $in['email'] . ' prêt.'
            : 'Tables à jour. Des organismes existaient déjà : aucun compte créé.';
    }
}
