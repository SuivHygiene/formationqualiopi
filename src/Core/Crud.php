<?php
declare(strict_types=1);

namespace App\Core;

/**
 * CRUD générique cloisonné par organisme.
 * Chaque requête filtre sur organisme_id de l'utilisateur connecté.
 */
final class Crud
{
    /**
     * @param array<string,string> $spec     règles Validator
     * @param list<string>         $search   colonnes recherchables (?q=)
     * @param list<string>         $filters  colonnes filtrables par égalité (?col=val)
     * @param list<string>         $json     colonnes JSON à décoder en sortie
     * @param list<string>         $writeRoles rôles autorisés en écriture
     */
    public function __construct(
        private readonly Context $ctx,
        public readonly string $table,
        public readonly string $label,
        public readonly array $spec,
        private readonly array $search = [],
        private readonly array $filters = [],
        private readonly string $order = 'id DESC',
        private readonly array $json = [],
        private readonly array $writeRoles = ['admin', 'gestionnaire'],
        private readonly string $listColumns = '*',
        private readonly bool $hasUpdatedAt = true,
        private readonly ?\Closure $beforeSave = null,
    ) {
    }

    public function register(Router $r, string $base): void
    {
        $r->add('GET', $base, fn (Request $q) => $this->list($q));
        $r->add('POST', $base, fn (Request $q) => $this->create($q));
        $r->add('GET', "$base/{id}", fn (Request $q) => $this->get($q->param('id')));
        $r->add('PUT', "$base/{id}", fn (Request $q) => $this->update($q));
        $r->add('DELETE', "$base/{id}", fn (Request $q) => $this->delete($q));
    }

    /** @return list<array<string,mixed>> */
    public function list(Request $req): array
    {
        $org = $this->ctx->auth->orgId();
        $where = ['organisme_id = ?'];
        $params = [$org];
        $q = trim((string) ($req->query['q'] ?? ''));
        if ($q !== '' && $this->search) {
            $where[] = '(' . implode(' OR ', array_map(static fn ($c) => "`$c` LIKE ?", $this->search)) . ')';
            foreach ($this->search as $_) {
                $params[] = '%' . addcslashes($q, '%_\\') . '%';
            }
        }
        foreach ($this->filters as $f) {
            if (isset($req->query[$f]) && $req->query[$f] !== '') {
                $where[] = "`$f` = ?";
                $params[] = (string) $req->query[$f];
            }
        }
        $limit = min(1000, max(1, (int) ($req->query['limit'] ?? 500)));
        $rows = $this->ctx->db->all(
            "SELECT {$this->listColumns} FROM `{$this->table}` WHERE " . implode(' AND ', $where) . " ORDER BY {$this->order} LIMIT $limit",
            $params,
        );
        return array_map(fn ($r) => Util::decodeJson($r, $this->json), $rows);
    }

    /** @return array<string,mixed> */
    public function get(int $id): array
    {
        $row = $this->ctx->db->one("SELECT * FROM `{$this->table}` WHERE id = ? AND organisme_id = ?", [$id, $this->ctx->auth->orgId()]);
        if (!$row) {
            throw HttpError::notFound($this->label);
        }
        return Util::decodeJson($row, $this->json);
    }

    /** @return array<string,mixed> */
    public function create(Request $req): array
    {
        $this->ctx->auth->require(...$this->writeRoles);
        $org = $this->ctx->auth->orgId();
        $data = Validator::clean($req->body, $this->spec, false, $this->ctx->db, $org);
        if ($this->beforeSave) {
            $data = ($this->beforeSave)($data);
        }
        $data['organisme_id'] = $org;
        $id = $this->ctx->db->insert($this->table, $data);
        $this->ctx->audit($req, 'create', $this->table, $id);
        return $this->get($id);
    }

    /** @return array<string,mixed> */
    public function update(Request $req): array
    {
        $this->ctx->auth->require(...$this->writeRoles);
        $id = $req->param('id');
        $this->get($id);
        $data = Validator::clean($req->body, $this->spec, true, $this->ctx->db, $this->ctx->auth->orgId());
        if ($this->beforeSave) {
            $data = ($this->beforeSave)($data);
        }
        if ($this->hasUpdatedAt) {
            $data['updated_at'] = Util::now();
        }
        $this->ctx->db->update($this->table, $data, ['id' => $id, 'organisme_id' => $this->ctx->auth->orgId()]);
        $this->ctx->audit($req, 'update', $this->table, $id);
        return $this->get($id);
    }

    /** @return array{ok:bool} */
    public function delete(Request $req): array
    {
        $this->ctx->auth->require(...$this->writeRoles);
        $id = $req->param('id');
        $this->get($id);
        try {
            $this->ctx->db->exec("DELETE FROM `{$this->table}` WHERE id = ? AND organisme_id = ?", [$id, $this->ctx->auth->orgId()]);
        } catch (\PDOException $e) {
            if (($e->errorInfo[1] ?? 0) === 1451) {
                throw new HttpError(409, "Impossible de supprimer : {$this->label} utilisé(e) ailleurs (sessions…). Archivez-le plutôt.");
            }
            throw $e;
        }
        $this->ctx->audit($req, 'delete', $this->table, $id);
        return ['ok' => true];
    }
}
