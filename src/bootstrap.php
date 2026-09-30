<?php
declare(strict_types=1);

// Autoload minimal (pas de dépendance Composer en production : simple dépôt FTP possible).
spl_autoload_register(static function (string $class): void {
    if (!str_starts_with($class, 'App\\')) {
        return;
    }
    $file = __DIR__ . '/' . str_replace('\\', '/', substr($class, 4)) . '.php';
    if (is_file($file)) {
        require $file;
    }
});
