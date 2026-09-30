<?php
declare(strict_types=1);

namespace Tests;

use App\Core\ArraySession;
use App\Core\Request;
use App\Core\Response;

/** Simule un navigateur (cookie de session + jeton CSRF). */
final class Client
{
    public ArraySession $session;
    public string $csrf = '';
    public string $email = '';
    public string $token = '';

    public function __construct(private readonly \Closure $handler)
    {
        $this->session = new ArraySession();
    }

    public function call(string $method, string $path, array $body = [], array $headers = []): Response
    {
        $parts = parse_url($path);
        parse_str($parts['query'] ?? '', $query);
        if ($this->csrf !== '') {
            $headers['x-csrf-token'] ??= $this->csrf;
        }
        if ($this->token !== '') {
            $headers['x-access-token'] ??= $this->token;
        }
        return ($this->handler)(new Request($method, $parts['path'], $query, $body, $headers, '127.0.0.1', 'phpunit'), $this->session);
    }

    /** Appel qui doit réussir : renvoie les données. */
    public function ok(string $method, string $path, array $body = []): mixed
    {
        $r = $this->call($method, $path, $body);
        if ($r->status >= 300) {
            throw new \RuntimeException("$method $path → {$r->status} " . json_encode($r->data, JSON_UNESCAPED_UNICODE));
        }
        return $r->data;
    }
}
