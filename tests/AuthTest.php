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
}
