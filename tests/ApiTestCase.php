<?php
declare(strict_types=1);

namespace Tests;

use App\App;
use App\Controllers\AuthController;
use App\Core\ArraySession;
use App\Core\Context;
use App\Core\Db;
use App\Core\Request;
use App\Migrator;
use PHPUnit\Framework\TestCase;

/** Tests d'intégration : vraie base MySQL/MariaDB, requêtes rejouées en mémoire. */
abstract class ApiTestCase extends TestCase
{
    protected static Db $db;
    /** @var array<string,mixed> */
    protected array $config = ['timezone' => 'Europe/Paris', 'signup_enabled' => true, 'debug' => true];

    public static function setUpBeforeClass(): void
    {
        self::$db = new Db(new \PDO((string) getenv('SF_TEST_DSN'), (string) getenv('SF_TEST_USER'), (string) getenv('SF_TEST_PASSWORD')));
        self::$db->pdo->exec("SET time_zone = '+00:00'");
        self::$db->pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach (self::$db->all('SHOW TABLES') as $row) {
            self::$db->pdo->exec('DROP TABLE `' . array_values($row)[0] . '`');
        }
        self::$db->pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        Migrator::run(self::$db, dirname(__DIR__) . '/migrations', static fn () => null);
    }

    /** Crée un organisme + admin et renvoie une session connectée. */
    protected function newOrg(string $nom = 'OF Test'): Client
    {
        $email = strtolower(preg_replace('/\W/', '', $nom)) . bin2hex(random_bytes(3)) . '@test.fr';
        AuthController::createOrganisme(self::$db, $nom, $email, 'MotDePasse123', 'Ada', 'Admin');
        $c = $this->client();
        $r = $c->call('POST', '/auth/login', ['email' => $email, 'password' => 'MotDePasse123']);
        $this->assertSame(200, $r->status, json_encode($r->data));
        $c->csrf = $r->data['csrf'];
        $c->email = $email;
        return $c;
    }

    protected function client(): Client
    {
        return new Client(fn (Request $req, ArraySession $s) => (new App(new Context(self::$db, $s, $this->config)))->handle($req));
    }
}
