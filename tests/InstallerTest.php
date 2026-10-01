<?php
declare(strict_types=1);

namespace Tests;

use App\Core\Db;
use App\Installer;
use PHPUnit\Framework\TestCase;

final class InstallerTest extends TestCase
{
    private string $root;

    protected function setUp(): void
    {
        $db = new Db(new \PDO((string) getenv('SF_TEST_DSN'), (string) getenv('SF_TEST_USER'), (string) getenv('SF_TEST_PASSWORD')));
        $db->pdo->exec('SET FOREIGN_KEY_CHECKS = 0');
        foreach ($db->all('SHOW TABLES') as $row) {
            $db->pdo->exec('DROP TABLE `' . array_values($row)[0] . '`');
        }
        $db->pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        $this->root = sys_get_temp_dir() . '/sf-install-' . bin2hex(random_bytes(4));
        mkdir($this->root);
        symlink(dirname(__DIR__) . '/migrations', $this->root . '/migrations');
        file_put_contents($this->root . '/install.key', "cle-de-test-suffisamment-longue\n");
    }

    protected function tearDown(): void
    {
        foreach (['migrations', 'config.php', 'install.key', 'install.lock'] as $f) {
            @unlink($this->root . '/' . $f);
        }
        @rmdir($this->root);
    }

    private function input(array $over = []): array
    {
        preg_match('/host=([^;]+);dbname=([^;]+)/', (string) getenv('SF_TEST_DSN'), $m);
        return $over + [
            'db_host' => $m[1], 'db_name' => $m[2], 'db_user' => (string) getenv('SF_TEST_USER'),
            'db_password' => (string) getenv('SF_TEST_PASSWORD'), 'organisme' => 'Mon OF',
            'prenom' => 'A', 'nom' => 'B', 'email' => 'admin@of.test', 'password' => 'MotDePasse123',
        ];
    }

    public function testInstallationComplete(): void
    {
        $i = new Installer($this->root);
        $this->assertFalse($i->isLocked());
        $this->assertFalse($i->checkKey('mauvaise'));
        $this->assertTrue($i->checkKey(' cle-de-test-suffisamment-longue '));

        $msg = $i->run($this->input());
        $this->assertStringContainsString('admin@of.test', $msg);

        $config = require $this->root . '/config.php';
        $this->assertTrue($config['cookie_secure']);
        $this->assertFalse($config['signup_enabled']);
        $db = Db::connect($config['db']);
        $this->assertSame('Mon OF', $db->value('SELECT nom FROM organismes'));
        $this->assertSame(4, (int) $db->value('SELECT COUNT(*) FROM questionnaires'));

        $this->assertTrue($i->isLocked(), 'verrouillé après usage');
        $this->assertFileDoesNotExist($this->root . '/install.key');
    }

    public function testMauvaisIdentifiantsBase(): void
    {
        $this->expectException(\PDOException::class);
        (new Installer($this->root))->run($this->input(['db_password' => 'faux']));
    }

    public function testMotDePasseTropCourt(): void
    {
        $this->expectException(\App\Core\HttpError::class);
        (new Installer($this->root))->run($this->input(['password' => 'court']));
    }

    public function testSansCleVerrouille(): void
    {
        unlink($this->root . '/install.key');
        $this->assertTrue((new Installer($this->root))->isLocked());
    }
}
