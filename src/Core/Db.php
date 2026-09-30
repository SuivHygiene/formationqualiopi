<?php
declare(strict_types=1);

namespace App\Core;

use PDO;

final class Db
{
    public function __construct(public readonly PDO $pdo)
    {
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
        $pdo->setAttribute(PDO::ATTR_STRINGIFY_FETCHES, false);
    }

    /** @param array<string,mixed> $config */
    public static function connect(array $config): self
    {
        return new self(new PDO($config['dsn'], $config['user'] ?? null, $config['password'] ?? null, [
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4, time_zone = '+00:00'",
        ]));
    }

    /** @return list<array<string,mixed>> */
    public function all(string $sql, array $params = []): array
    {
        $st = $this->pdo->prepare($sql);
        $st->execute($params);
        return $st->fetchAll();
    }

    /** @return array<string,mixed>|null */
    public function one(string $sql, array $params = []): ?array
    {
        $st = $this->pdo->prepare($sql);
        $st->execute($params);
        $row = $st->fetch();
        return $row === false ? null : $row;
    }

    public function value(string $sql, array $params = []): mixed
    {
        $st = $this->pdo->prepare($sql);
        $st->execute($params);
        $v = $st->fetchColumn();
        return $v === false ? null : $v;
    }

    public function exec(string $sql, array $params = []): int
    {
        $st = $this->pdo->prepare($sql);
        $st->execute($params);
        return $st->rowCount();
    }

    /** @param array<string,mixed> $data */
    public function insert(string $table, array $data): int
    {
        $cols = array_keys($data);
        $sql = sprintf(
            'INSERT INTO `%s` (%s) VALUES (%s)',
            $table,
            implode(',', array_map(static fn ($c) => "`$c`", $cols)),
            implode(',', array_map(static fn ($c) => ":$c", $cols)),
        );
        $this->exec($sql, $data);
        return (int) $this->pdo->lastInsertId();
    }

    /**
     * @param array<string,mixed> $data
     * @param array<string,mixed> $where égalités combinées par AND
     */
    public function update(string $table, array $data, array $where): int
    {
        if ($data === []) {
            return 0;
        }
        $set = implode(',', array_map(static fn ($c) => "`$c` = :s_$c", array_keys($data)));
        $cond = implode(' AND ', array_map(static fn ($c) => "`$c` = :w_$c", array_keys($where)));
        $params = [];
        foreach ($data as $k => $v) {
            $params["s_$k"] = $v;
        }
        foreach ($where as $k => $v) {
            $params["w_$k"] = $v;
        }
        return $this->exec("UPDATE `$table` SET $set WHERE $cond", $params);
    }

    public function transaction(callable $fn): mixed
    {
        $this->pdo->beginTransaction();
        try {
            $r = $fn($this);
            $this->pdo->commit();
            return $r;
        } catch (\Throwable $e) {
            $this->pdo->rollBack();
            throw $e;
        }
    }
}
