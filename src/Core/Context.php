<?php
declare(strict_types=1);

namespace App\Core;

/** Services partagés d'une requête. */
final class Context
{
    public readonly Auth $auth;
    public readonly RateLimit $rateLimit;

    /** @param array<string,mixed> $config */
    public function __construct(public readonly Db $db, public readonly SessionStore $session, public readonly array $config)
    {
        $this->auth = new Auth($db, $session);
        $this->rateLimit = new RateLimit($db);
    }

    public function audit(Request $req, string $action, string $entity, ?int $entityId = null): void
    {
        $u = $this->auth->user();
        $this->db->insert('audit_log', [
            'organisme_id' => $u['organisme_id'] ?? null,
            'user_id' => $u['id'] ?? null,
            'action' => $action,
            'entity' => $entity,
            'entity_id' => $entityId,
            'ip' => $req->ip,
            'created_at' => Util::now(),
        ]);
    }

    public function timezone(): \DateTimeZone
    {
        return new \DateTimeZone($this->config['timezone'] ?? 'Europe/Paris');
    }
}
