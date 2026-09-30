<?php
// Routeur du serveur PHP intégré (développement local uniquement) :
//   php -S 127.0.0.1:8080 -t public bin/dev-router.php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (str_starts_with($path, '/api/') || $path === '/api') {
    require __DIR__ . '/../public/api/index.php';
    return true;
}
return false;
