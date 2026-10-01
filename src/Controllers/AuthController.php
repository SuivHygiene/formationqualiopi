<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Context;
use App\Core\HttpError;
use App\Core\Request;
use App\Core\Router;
use App\Core\Util;
use App\Core\Validator;

final class AuthController
{
    public function __construct(private readonly Context $ctx)
    {
    }

    public function register(Router $r): void
    {
        $r->add('POST', '/auth/login', fn (Request $q) => $this->login($q));
        $r->add('POST', '/auth/logout', fn (Request $q) => $this->logout());
        $r->add('GET', '/auth/me', fn (Request $q) => $this->me());
        $r->add('POST', '/auth/password', fn (Request $q) => $this->changePassword($q));
        $r->add('POST', '/auth/email', fn (Request $q) => $this->changeEmail($q));
        $r->add('POST', '/auth/signup', fn (Request $q) => $this->signup($q));
    }

    private function login(Request $req): array
    {
        $in = Validator::clean($req->body, ['email' => 'email|req', 'password' => 'str:200|req']);
        $this->ctx->rateLimit->hit('login-ip:' . $req->ip, 20, 900);
        $this->ctx->rateLimit->hit('login:' . $in['email'], 6, 900);
        $u = $this->ctx->db->one(
            'SELECT u.id, u.password_hash FROM users u JOIN organismes o ON o.id = u.organisme_id
             WHERE u.email = ? AND u.actif = 1 AND o.actif = 1',
            [$in['email']],
        );
        // password_verify exécuté même si l'utilisateur n'existe pas (temps constant).
        $hash = $u['password_hash'] ?? password_hash('leurre', PASSWORD_DEFAULT);
        if (!password_verify($in['password'], $hash) || !$u) {
            throw new HttpError(401, 'E-mail ou mot de passe incorrect');
        }
        if (password_needs_rehash($u['password_hash'], PASSWORD_DEFAULT)) {
            $this->ctx->db->update('users', ['password_hash' => password_hash($in['password'], PASSWORD_DEFAULT)], ['id' => $u['id']]);
        }
        $this->ctx->rateLimit->clear('login:' . $in['email']);
        $this->ctx->auth->login((int) $u['id']);
        $this->ctx->db->update('users', ['last_login_at' => Util::now()], ['id' => $u['id']]);
        $this->ctx->audit($req, 'login', 'users', (int) $u['id']);
        return $this->me();
    }

    private function logout(): array
    {
        $this->ctx->auth->logout();
        return ['ok' => true];
    }

    private function me(): array
    {
        $u = $this->ctx->auth->user();
        if (!$u) {
            return ['user' => null, 'signup' => (bool) ($this->ctx->config['signup_enabled'] ?? false)];
        }
        $org = $this->ctx->db->one('SELECT id, nom, couleur, logo FROM organismes WHERE id = ?', [$u['organisme_id']]);
        return ['user' => $u, 'organisme' => $org, 'csrf' => $this->ctx->auth->csrfToken()];
    }

    private function changePassword(Request $req): array
    {
        $u = $this->ctx->auth->require();
        $in = Validator::clean($req->body, ['current' => 'str:200|req', 'password' => 'str:200|req']);
        self::assertStrong($in['password']);
        $hash = (string) $this->ctx->db->value('SELECT password_hash FROM users WHERE id = ?', [$u['id']]);
        if (!password_verify($in['current'], $hash)) {
            throw HttpError::bad('Mot de passe actuel incorrect', ['current' => 'Incorrect']);
        }
        $this->ctx->db->update('users', ['password_hash' => password_hash($in['password'], PASSWORD_DEFAULT)], ['id' => $u['id']]);
        $this->ctx->audit($req, 'password', 'users', (int) $u['id']);
        return ['ok' => true];
    }

    /** Changement de l'e-mail de connexion (mot de passe actuel exigé). */
    private function changeEmail(Request $req): array
    {
        $u = $this->ctx->auth->require();
        $in = Validator::clean($req->body, ['current' => 'str:200|req', 'email' => 'email|req']);
        $hash = (string) $this->ctx->db->value('SELECT password_hash FROM users WHERE id = ?', [$u['id']]);
        if (!password_verify($in['current'], $hash)) {
            throw HttpError::bad('Mot de passe actuel incorrect', ['current' => 'Incorrect']);
        }
        self::assertEmailFree($this->ctx->db, $in['email'], (int) $u['id']);
        $this->ctx->db->update('users', ['email' => $in['email']], ['id' => $u['id']]);
        $this->ctx->audit($req, 'email', 'users', (int) $u['id']);
        $this->ctx->auth->refresh();
        return $this->me();
    }

    public static function assertEmailFree(\App\Core\Db $db, string $email, int $exceptUserId = 0): void
    {
        if ($db->value('SELECT id FROM users WHERE email = ? AND id <> ?', [strtolower($email), $exceptUserId]) !== null) {
            throw new HttpError(409, 'Un compte existe déjà avec cet e-mail', ['email' => 'Déjà utilisé']);
        }
    }

    /** Création d'un organisme + compte admin (désactivée par défaut : config signup_enabled). */
    private function signup(Request $req): array
    {
        if (!($this->ctx->config['signup_enabled'] ?? false)) {
            throw HttpError::forbidden('Inscriptions fermées');
        }
        $this->ctx->rateLimit->hit('signup:' . $req->ip, 5, 3600);
        $in = Validator::clean($req->body, [
            'organisme' => 'str:190|req', 'prenom' => 'str:100|req', 'nom' => 'str:100|req',
            'email' => 'email|req', 'password' => 'str:200|req',
        ]);
        self::assertStrong($in['password']);
        $uid = self::createOrganisme($this->ctx->db, $in['organisme'], $in['email'], $in['password'], $in['prenom'], $in['nom']);
        $this->ctx->auth->login($uid);
        return $this->me();
    }

    public static function assertStrong(string $pwd): void
    {
        if (mb_strlen($pwd) < 10) {
            throw HttpError::bad('Mot de passe trop court (10 caractères minimum)', ['password' => '10 caractères minimum']);
        }
    }

    /** @return int id de l'utilisateur admin créé */
    public static function createOrganisme(\App\Core\Db $db, string $nom, string $email, string $password, string $prenom = '', string $nomUser = ''): int
    {
        if ($db->value('SELECT id FROM users WHERE email = ?', [strtolower($email)]) !== null) {
            throw new HttpError(409, 'Un compte existe déjà avec cet e-mail', ['email' => 'Déjà utilisé']);
        }
        return $db->transaction(static function ($db) use ($nom, $email, $password, $prenom, $nomUser) {
            $orgId = $db->insert('organismes', ['nom' => $nom, 'email' => strtolower($email), 'created_at' => Util::now()]);
            $uid = $db->insert('users', [
                'organisme_id' => $orgId, 'email' => strtolower($email),
                'password_hash' => password_hash($password, PASSWORD_DEFAULT),
                'prenom' => $prenom, 'nom' => $nomUser, 'role' => 'admin', 'created_at' => Util::now(),
            ]);
            \App\Controllers\SeedData::install($db, $orgId);
            return $uid;
        });
    }
}
