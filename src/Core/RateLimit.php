<?php
declare(strict_types=1);

namespace App\Core;

final class RateLimit
{
    public function __construct(private readonly Db $db)
    {
    }

    /** Lève 429 si plus de $max tentatives dans la fenêtre. Enregistre la tentative. */
    public function hit(string $bucket, int $max, int $windowSeconds): void
    {
        $since = gmdate('Y-m-d H:i:s', time() - $windowSeconds);
        $count = (int) $this->db->value('SELECT COUNT(*) FROM rate_limits WHERE bucket = ? AND created_at > ?', [$bucket, $since]);
        if ($count >= $max) {
            throw new HttpError(429, 'Trop de tentatives, réessayez dans quelques minutes');
        }
        $this->db->insert('rate_limits', ['bucket' => $bucket, 'created_at' => gmdate('Y-m-d H:i:s')]);
        if (random_int(1, 50) === 1) {
            $this->db->exec('DELETE FROM rate_limits WHERE created_at < ?', [gmdate('Y-m-d H:i:s', time() - 86400)]);
        }
    }

    public function clear(string $bucket): void
    {
        $this->db->exec('DELETE FROM rate_limits WHERE bucket = ?', [$bucket]);
    }
}
