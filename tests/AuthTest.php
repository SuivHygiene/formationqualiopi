<?php
declare(strict_types=1);

namespace Tests;

final class AuthTest extends ApiTestCase
{
    public function testLoginEtMe(): void
    {
        $c = $this->newOrg('Auth OF');
        $me = $c->ok('GET', '/auth/me');
        $this->assertSame('admin', $me['user']['role']);
        $this->assertSame('Auth OF', $me['organisme']['nom']);
    }

    public function testMauvaisMotDePasse(): void
    {
        $c = $this->newOrg();
        $anon = $this->client();
        $r = $anon->call('POST', '/auth/login', ['email' => $c->email, 'password' => 'faux-mot-de-passe']);
        $this->assertSame(401, $r->status);
    }

    public function testLimitationDesTentatives(): void
    {
        $c = $this->newOrg();
        $anon = $this->client();
        $statuses = [];
        for ($i = 0; $i < 8; $i++) {
            $statuses[] = $anon->call('POST', '/auth/login', ['email' => $c->email, 'password' => 'mauvais' . $i])->status;
        }
        $this->assertContains(429, $statuses);
    }

    public function testEcritureSansCsrfRefusee(): void
    {
        $c = $this->newOrg();
        $r = $c->call('POST', '/clients', ['raison_sociale' => 'X'], ['x-csrf-token' => 'mauvais']);
        $this->assertSame(419, $r->status);
    }

    public function testNonConnecte(): void
    {
        $r = $this->client()->call('GET', '/sessions');
        $this->assertSame(401, $r->status);
    }

    public function testDeconnexion(): void
    {
        $c = $this->newOrg();
        $c->ok('POST', '/auth/logout');
        $this->assertSame(401, $c->call('GET', '/formations')->status);
    }

    public function testMotDePasseTropCourt(): void
    {
        $r = $this->client()->call('POST', '/auth/signup', [
            'organisme' => 'OF', 'prenom' => 'A', 'nom' => 'B', 'email' => 'court@test.fr', 'password' => 'court',
        ]);
        $this->assertSame(422, $r->status);
    }

    public function testNouvelOrganismeRecoitLesModeles(): void
    {
        $c = $this->newOrg();
        $q = $c->ok('GET', '/questionnaires');
        $this->assertCount(4, $q);
        $this->assertContains('satisfaction_chaud', array_column($q, 'type'));
    }

    public function testChangementEmail(): void
    {
        $a = $this->newOrg('OF Email');
        $b = $this->newOrg('OF Email B');
        $this->assertSame(422, $a->call('POST', '/auth/email', ['email' => 'nouveau@of.test', 'current' => 'faux'])->status);
        $this->assertSame(409, $a->call('POST', '/auth/email', ['email' => $b->email, 'current' => 'MotDePasse123'])->status);
        $me = $a->ok('POST', '/auth/email', ['email' => 'Nouveau@OF.test', 'current' => 'MotDePasse123']);
        $this->assertSame('nouveau@of.test', $me['user']['email']);

        $anon = $this->client();
        $this->assertSame(401, $anon->call('POST', '/auth/login', ['email' => $a->email, 'password' => 'MotDePasse123'])->status);
        $this->assertSame(200, $anon->call('POST', '/auth/login', ['email' => 'nouveau@of.test', 'password' => 'MotDePasse123'])->status);
    }

    public function testAdminChangeEmailUtilisateur(): void
    {
        $a = $this->newOrg('OF Email Admin');
        $other = $this->newOrg('OF Autre');
        $u = $a->ok('POST', '/users', ['email' => 'gest' . bin2hex(random_bytes(3)) . '@of.test', 'prenom' => 'G', 'nom' => 'E', 'role' => 'gestionnaire', 'password' => 'MotDePasse123']);
        $this->assertSame(409, $a->call('PUT', '/users/' . $u['id'], ['email' => $other->email])->status);
        $a->ok('PUT', '/users/' . $u['id'], ['email' => 'corrige' . $u['id'] . '@of.test', 'email_vide_ignore' => 1]);
        $a->ok('PUT', '/users/' . $u['id'], ['email' => '', 'prenom' => 'G2']);
        $emails = array_column($a->ok('GET', '/users'), 'email', 'id');
        $this->assertSame('corrige' . $u['id'] . '@of.test', $emails[$u['id']]);
    }
}
