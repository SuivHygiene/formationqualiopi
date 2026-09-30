<?php
declare(strict_types=1);

namespace App\Core;

final class HttpError extends \RuntimeException
{
    /** @param array<string,string> $fields */
    public function __construct(public readonly int $status, string $message, public readonly array $fields = [])
    {
        parent::__construct($message, $status);
    }

    public static function notFound(string $what = 'Ressource'): self
    {
        return new self(404, "$what introuvable");
    }

    public static function forbidden(string $msg = 'Accès refusé'): self
    {
        return new self(403, $msg);
    }

    public static function bad(string $msg, array $fields = []): self
    {
        return new self(422, $msg, $fields);
    }
}
