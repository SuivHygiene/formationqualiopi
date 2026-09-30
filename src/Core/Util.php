<?php
declare(strict_types=1);

namespace App\Core;

final class Util
{
    public static function now(): string
    {
        return gmdate('Y-m-d H:i:s');
    }

    /** Code alphanumérique sans caractères ambigus (0/O, 1/I/L). */
    public static function code(int $len): string
    {
        $alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        $s = '';
        for ($i = 0; $i < $len; $i++) {
            $s .= $alphabet[random_int(0, strlen($alphabet) - 1)];
        }
        return $s;
    }

    public static function digits(int $len): string
    {
        $s = '';
        for ($i = 0; $i < $len; $i++) {
            $s .= (string) random_int(0, 9);
        }
        return $s;
    }

    /** @param array<string,mixed> $row @param list<string> $fields */
    public static function decodeJson(array $row, array $fields): array
    {
        foreach ($fields as $f) {
            if (isset($row[$f]) && is_string($row[$f])) {
                $row[$f] = json_decode($row[$f], true);
            }
        }
        return $row;
    }
}
