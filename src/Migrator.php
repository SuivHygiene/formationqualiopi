<?php
declare(strict_types=1);

namespace App;

use App\Core\Db;

final class Migrator
{
    public static function run(Db $db, string $dir, callable $log): int
    {
        $db->pdo->exec('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(40) PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
        $done = array_column($db->all('SELECT version FROM schema_migrations'), 'version');
        $files = glob($dir . '/*.sql') ?: [];
        sort($files);
        foreach ($files as $file) {
            $version = basename($file, '.sql');
            if (in_array($version, $done, true)) {
                continue;
            }
            $sql = (string) file_get_contents($file);
            foreach (self::statements($sql) as $st) {
                if (stripos($st, 'CREATE TABLE schema_migrations') === 0) {
                    continue;
                }
                $db->pdo->exec($st);
            }
            $db->insert('schema_migrations', ['version' => $version]);
            $log("Migration appliquée : $version");
        }
        return 0;
    }

    /** @return list<string> */
    private static function statements(string $sql): array
    {
        $sql = preg_replace('/^\s*--.*$/m', '', $sql) ?? '';
        return array_values(array_filter(array_map('trim', explode(";\n", $sql . "\n")), static fn ($s) => $s !== ''));
    }
}
