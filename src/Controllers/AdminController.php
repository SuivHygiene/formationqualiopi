<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Context;
use App\Core\HttpError;
use App\Core\Request;
use App\Core\Router;
use App\Core\Util;
use App\Core\Validator;

/** Paramètres de l'organisme et gestion des utilisateurs. */
final class AdminController
{
    private const ORG_SPEC = [
        'nom' => 'str:190|req', 'siret' => 'str:20', 'nda' => 'str:40', 'qualiopi_numero' => 'str:80',
        'qualiopi_certificateur' => 'str:120', 'adresse' => 'str:255', 'code_postal' => 'str:10', 'ville' => 'str:120',
        'email' => 'email', 'telephone' => 'str:40', 'site_web' => 'str:190', 'representant_nom' => 'str:160',
        'representant_qualite' => 'str:120', 'referent_handicap_nom' => 'str:160', 'referent_handicap_email' => 'email',
        'referent_handicap_tel' => 'str:40', 'couleur' => 'str:9', 'logo' => 'dataurl:600000',
        'signature_cachet' => 'dataurl:600000', 'conditions_generales' => 'text:60000', 'mentions_documents' => 'text:4000',
    ];

    public function __construct(private readonly Context $ctx)
    {
    }

    public function register(Router $r): void
    {
        $r->add('GET', '/organisme', fn () => $this->getOrg());
        $r->add('PUT', '/organisme', fn (Request $q) => $this->updateOrg($q));
        $r->add('GET', '/users', fn () => $this->listUsers());
        $r->add('POST', '/users', fn (Request $q) => $this->createUser($q));
        $r->add('PUT', '/users/{id}', fn (Request $q) => $this->updateUser($q));
    }

    private function getOrg(): array
    {
        return $this->ctx->db->one('SELECT * FROM organismes WHERE id = ?', [$this->ctx->auth->orgId()]) ?? [];
    }

    private function updateOrg(Request $req): array
    {
        $this->ctx->auth->require('admin');
        $data = Validator::clean($req->body, self::ORG_SPEC, true);
        if (isset($data['couleur']) && $data['couleur'] !== null && !preg_match('/^#[0-9a-fA-F]{6}$/', $data['couleur'])) {
            throw HttpError::bad('Couleur invalide', ['couleur' => 'Format #RRGGBB']);
        }
        $this->ctx->db->update('organismes', $data, ['id' => $this->ctx->auth->orgId()]);
        $this->ctx->audit($req, 'update', 'organismes', $this->ctx->auth->orgId());
        return $this->getOrg();
    }

    private function listUsers(): array
    {
        $this->ctx->auth->require('admin');
        return $this->ctx->db->all(
            'SELECT id, email, prenom, nom, role, formateur_id, actif, last_login_at, created_at FROM users WHERE organisme_id = ? ORDER BY nom, prenom',
            [$this->ctx->auth->orgId()],
        );
    }

    private function createUser(Request $req): array
    {
        $this->ctx->auth->require('admin');
        $org = $this->ctx->auth->orgId();
        $in = Validator::clean($req->body, [
            'email' => 'email|req', 'prenom' => 'str:100|req', 'nom' => 'str:100|req',
            'role' => 'enum:admin,gestionnaire,formateur|req', 'formateur_id' => 'fk:formateurs', 'password' => 'str:200|req',
        ], false, $this->ctx->db, $org);
        AuthController::assertStrong($in['password']);
        if ($this->ctx->db->value('SELECT id FROM users WHERE email = ?', [$in['email']]) !== null) {
            throw new HttpError(409, 'E-mail déjà utilisé', ['email' => 'Déjà utilisé']);
        }
        $in['password_hash'] = password_hash($in['password'], PASSWORD_DEFAULT);
        unset($in['password']);
        $id = $this->ctx->db->insert('users', $in + ['organisme_id' => $org, 'created_at' => Util::now()]);
        $this->ctx->audit($req, 'create', 'users', $id);
        return ['id' => $id];
    }

    private function updateUser(Request $req): array
    {
        $me = $this->ctx->auth->require('admin');
        $org = $this->ctx->auth->orgId();
        $id = $req->param('id');
        if ($this->ctx->db->value('SELECT id FROM users WHERE id = ? AND organisme_id = ?', [$id, $org]) === null) {
            throw HttpError::notFound('Utilisateur');
        }
        $in = Validator::clean($req->body, [
            'email' => 'email', 'prenom' => 'str:100|notnull', 'nom' => 'str:100|notnull', 'role' => 'enum:admin,gestionnaire,formateur',
            'formateur_id' => 'fk:formateurs', 'actif' => 'bool', 'password' => 'str:200',
        ], true, $this->ctx->db, $org);
        if ($id === (int) $me['id'] && ((isset($in['actif']) && !$in['actif']) || (isset($in['role']) && $in['role'] !== 'admin'))) {
            throw HttpError::bad('Vous ne pouvez pas retirer vos propres droits administrateur');
        }
        if (array_key_exists('email', $in)) {
            if ($in['email'] === null) {
                unset($in['email']);
            } else {
                AuthController::assertEmailFree($this->ctx->db, $in['email'], $id);
            }
        }
        if (!empty($in['password'])) {
            AuthController::assertStrong($in['password']);
            $in['password_hash'] = password_hash($in['password'], PASSWORD_DEFAULT);
        }
        unset($in['password']);
        $this->ctx->db->update('users', $in, ['id' => $id, 'organisme_id' => $org]);
        $this->ctx->audit($req, 'update', 'users', $id);
        return ['ok' => true];
    }
}
