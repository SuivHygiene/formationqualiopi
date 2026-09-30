<?php
declare(strict_types=1);

use App\App;
use App\Core\Context;
use App\Core\Db;
use App\Core\HttpError;
use App\Core\NativeSession;
use App\Core\Request;
use App\Core\Response;

require dirname(__DIR__, 2) . '/src/bootstrap.php';
$config = require dirname(__DIR__, 2) . '/config.php';

header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");
header('Referrer-Policy: same-origin');

try {
    $req = Request::fromGlobals($config['api_base'] ?? '/api');
} catch (HttpError $e) {
    Response::json(['error' => $e->getMessage()], $e->status)->send();
    exit;
}
$secure = ($config['cookie_secure'] ?? true) === true;
$ctx = new Context(Db::connect($config['db']), new NativeSession($secure), $config);
(new App($ctx))->handle($req)->send();
