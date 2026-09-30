<?php
declare(strict_types=1);

namespace App\Core;

/** Utilisateur connecté (back-office organisme). */
final class Auth
{
    /** @var array<string,mixed>|null */
    private ?array $user = null;
    private bool $loaded = false;

    public function __construct(private readonly Db $db, private readonly SessionStore $session)
    {
    }

    /** @return array<string,mixed>|null */
    public function user(): ?array
    {
        if (!$this->loaded) {
            $this->loaded = true;
            $id = $this->session->get('uid');
            if ($id) {
                $u = $this->db->one(
                    'SELECT u.id, u.organisme_id, u.email, u.prenom, u.nom, u.role, u.formateur_id
                     FROM users u JOIN organismes o ON o.id = u.organisme_id
                     WHERE u.id = ? AND u.actif = 1 AND o.actif = 1',
                    [$id],
                );
                $this->user = $u;
            }
        }
        return $this->user;
    }

    /** @return array<string,mixed> */
    public function require(string ...$roles): array
    {
        $u = $this->user();
        if (!$u) {
            throw new HttpError(401, 'Connexion requise');
        }
        if ($roles && !in_array($u['role'], $roles, true)) {
            throw HttpError::forbidden();
        }
        return $u;
    }

    public function orgId(): int
    {
        return (int) $this->require()['organisme_id'];
    }

    public function login(int $userId): void
    {
        $this->session->regenerate();
        $this->session->set('uid', $userId);
        $this->session->set('csrf', bin2hex(random_bytes(32)));
        $this->loaded = false;
    }

    public function logout(): void
    {
        $this->session->destroy();
        $this->user = null;
    }

    public function csrfToken(): string
    {
        $t = $this->session->get('csrf');
        if (!$t) {
            $t = bin2hex(random_bytes(32));
            $this->session->set('csrf', $t);
        }
        return (string) $t;
    }

    public function checkCsrf(Request $req): void
    {
        $t = (string) $this->session->get('csrf');
        if ($t === '' || !hash_equals($t, $req->header('x-csrf-token'))) {
            throw new HttpError(419, 'Session expirée, rechargez la page');
        }
    }
}
