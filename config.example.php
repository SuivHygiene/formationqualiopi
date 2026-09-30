<?php
// Copier en config.php (HORS de la racine web : ce fichier est au-dessus de public/).
return [
    'db' => [
        'dsn' => 'mysql:host=localhost;dbname=suivformation;charset=utf8mb4',
        'user' => 'suivformation',
        'password' => 'CHANGER-MOI',
    ],
    'api_base' => '/api',          // chemin public de l'API
    'timezone' => 'Europe/Paris',
    'cookie_secure' => true,        // false uniquement en local (http)
    'signup_enabled' => false,      // true = inscription libre de nouveaux organismes
    'debug' => false,
];
