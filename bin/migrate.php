<?php
declare(strict_types=1);

// Applique les migrations SQL non encore passées : php bin/migrate.php
use App\Core\Db;

require dirname(__DIR__) . '/src/bootstrap.php';
$config = require dirname(__DIR__) . '/config.php';
$db = Db::connect($config['db']);
exit(\App\Migrator::run($db, dirname(__DIR__) . '/migrations', static fn (string $m) => print("$m\n")));
