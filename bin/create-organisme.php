<?php
declare(strict_types=1);

// Crée un organisme et son compte administrateur :
//   php bin/create-organisme.php "Nom de l'organisme" email@exemple.fr "MotDePasse" [Prénom] [Nom]
use App\Controllers\AuthController;
use App\Core\Db;

require dirname(__DIR__) . '/src/bootstrap.php';
$config = require dirname(__DIR__) . '/config.php';
if ($argc < 4) {
    fwrite(STDERR, "Usage : php bin/create-organisme.php \"Nom\" email motdepasse [prenom] [nom]\n");
    exit(1);
}
AuthController::assertStrong($argv[3]);
$uid = AuthController::createOrganisme(Db::connect($config['db']), $argv[1], $argv[2], $argv[3], $argv[4] ?? '', $argv[5] ?? '');
echo "Organisme créé, administrateur #$uid\n";
