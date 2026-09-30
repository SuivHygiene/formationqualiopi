<?php
declare(strict_types=1);

namespace App\Core;

/** Session en mémoire (tests). */
final class ArraySession implements SessionStore
{
    /** @var array<string,mixed> */
    public array $data = [];

    public function get(string $key): mixed
    {
        return $this->data[$key] ?? null;
    }

    public function set(string $key, mixed $value): void
    {
        $this->data[$key] = $value;
    }

    public function regenerate(): void
    {
    }

    public function destroy(): void
    {
        $this->data = [];
    }
}
