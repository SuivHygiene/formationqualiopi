<?php
declare(strict_types=1);

namespace App\Core;

interface SessionStore
{
    public function get(string $key): mixed;

    public function set(string $key, mixed $value): void;

    public function regenerate(): void;

    public function destroy(): void;
}
