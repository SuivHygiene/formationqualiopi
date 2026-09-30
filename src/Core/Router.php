<?php
declare(strict_types=1);

namespace App\Core;

final class Router
{
    /** @var list<array{string,string,callable}> */
    private array $routes = [];

    public function add(string $method, string $pattern, callable $handler): void
    {
        $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', $pattern) . '$#';
        $this->routes[] = [$method, $regex, $handler];
    }

    public function dispatch(Request $req): Response
    {
        $methodAllowed = false;
        foreach ($this->routes as [$method, $regex, $handler]) {
            if (!preg_match($regex, $req->path, $m)) {
                continue;
            }
            if ($method !== $req->method) {
                $methodAllowed = true;
                continue;
            }
            $req->params = array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY);
            $result = $handler($req);
            return $result instanceof Response ? $result : Response::json($result);
        }
        throw new HttpError($methodAllowed ? 405 : 404, $methodAllowed ? 'Méthode non autorisée' : 'Route inconnue');
    }
}
