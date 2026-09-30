<?php
declare(strict_types=1);

namespace App;

use App\Controllers\AdminController;
use App\Controllers\AuthController;
use App\Controllers\DashboardController;
use App\Controllers\DocumentController;
use App\Controllers\PortailController;
use App\Controllers\Resources;
use App\Controllers\SessionController;
use App\Core\Context;
use App\Core\HttpError;
use App\Core\Request;
use App\Core\Response;
use App\Core\Router;

final class App
{
    /** Routes accessibles sans session back-office ni jeton CSRF. */
    private const PUBLIC_PREFIXES = ['/auth/login', '/auth/signup', '/auth/me', '/portail/', '/verification/'];

    private readonly Router $router;

    public function __construct(private readonly Context $ctx)
    {
        $this->router = new Router();
        (new AuthController($ctx))->register($this->router);
        (new AdminController($ctx))->register($this->router);
        Resources::register($ctx, $this->router);
        $sessions = new SessionController($ctx);
        $sessions->register($this->router);
        (new DocumentController($ctx, $sessions))->register($this->router);
        (new PortailController($ctx))->register($this->router);
        (new DashboardController($ctx))->register($this->router);
    }

    public function handle(Request $req): Response
    {
        try {
            $public = false;
            foreach (self::PUBLIC_PREFIXES as $p) {
                if (str_starts_with($req->path, $p)) {
                    $public = true;
                    break;
                }
            }
            if (!$public && $req->method !== 'GET') {
                $this->ctx->auth->require();
                $this->ctx->auth->checkCsrf($req);
            }
            return $this->router->dispatch($req);
        } catch (HttpError $e) {
            $body = ['error' => $e->getMessage()];
            if ($e->fields) {
                $body['fields'] = $e->fields;
            }
            return Response::json($body, $e->status);
        } catch (\Throwable $e) {
            error_log('[suivformation] ' . $e::class . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
            if ($this->ctx->config['debug'] ?? false) {
                return Response::json(['error' => $e->getMessage(), 'where' => $e->getFile() . ':' . $e->getLine()], 500);
            }
            return Response::json(['error' => 'Erreur interne'], 500);
        }
    }
}
