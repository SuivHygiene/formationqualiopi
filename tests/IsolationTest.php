<?php
declare(strict_types=1);

namespace Tests;

/** Un organisme ne doit jamais voir ni modifier les données d'un autre. */
final class IsolationTest extends ApiTestCase
{
    public function testCloisonnementComplet(): void
    {
        $a = $this->newOrg('OF A');
        $b = $this->newOrg('OF B');

        $f = $a->ok('POST', '/formations', ['titre' => 'Formation A', 'duree_heures' => 14]);
        $cl = $a->ok('POST', '/clients', ['raison_sociale' => 'Client A']);
        $st = $a->ok('POST', '/stagiaires', ['prenom' => 'Jean', 'nom' => 'Dupont', 'client_id' => $cl['id']]);
        $s = $a->ok('POST', '/sessions', ['formation_id' => $f['id'], 'client_id' => $cl['id']]);
        $reg = $a->ok('POST', '/registre', ['type' => 'reclamation', 'date' => '2026-01-10', 'titre' => 'Réclamation A']);

        foreach (['/formations/' . $f['id'], '/clients/' . $cl['id'], '/stagiaires/' . $st['id'], '/sessions/' . $s['id'], '/registre/' . $reg['id']] as $url) {
            $this->assertSame(404, $b->call('GET', $url)->status, "GET $url");
            $this->assertSame(404, $b->call('PUT', $url, ['titre' => 'pirate', 'nom' => 'pirate', 'raison_sociale' => 'pirate'])->status, "PUT $url");
            $this->assertSame(404, $b->call('DELETE', $url)->status, "DELETE $url");
        }
        $this->assertSame([], $b->ok('GET', '/formations'));
        $this->assertSame([], $b->ok('GET', '/sessions'));
        $this->assertSame([], $b->ok('GET', '/clients'));

        // B ne peut pas référencer les objets de A
        $r = $b->call('POST', '/sessions', ['formation_id' => $f['id']]);
        $this->assertSame(422, $r->status);
        $r = $b->call('POST', '/stagiaires', ['prenom' => 'X', 'nom' => 'Y', 'client_id' => $cl['id']]);
        $this->assertSame(422, $r->status);
        $fb = $b->ok('POST', '/formations', ['titre' => 'Formation B']);
        $sb = $b->ok('POST', '/sessions', ['formation_id' => $fb['id']]);
        $r = $b->call('POST', '/sessions/' . $sb['id'] . '/inscriptions', ['stagiaire_id' => $st['id']]);
        $this->assertSame(422, $r->status);

        // Créneaux / inscriptions / documents de A inaccessibles
        $a->ok('PUT', '/sessions/' . $s['id'] . '/creneaux', ['creneaux' => [['date' => '2026-03-02', 'heure_debut' => '09:00', 'heure_fin' => '12:30']]]);
        $det = $a->ok('POST', '/sessions/' . $s['id'] . '/inscriptions', ['stagiaire_id' => $st['id']]);
        $creneauId = $det['creneaux'][0]['id'];
        $inscId = $det['inscriptions'][0]['id'];
        $this->assertSame(404, $b->call('POST', "/creneaux/$creneauId/emargements", ['inscription_id' => $inscId, 'statut' => 'present', 'mode' => 'manuel'])->status);
        $this->assertSame(404, $b->call('DELETE', "/inscriptions/$inscId")->status);
        $doc = $a->ok('POST', '/sessions/' . $s['id'] . '/documents', ['type' => 'convocation']);
        $this->assertSame(404, $b->call('GET', '/documents/' . $doc['documents'][0])->status);

        // Utilisateurs
        $this->assertCount(1, $b->ok('GET', '/users'));
        $usersA = $a->ok('GET', '/users');
        $this->assertSame(404, $b->call('PUT', '/users/' . $usersA[0]['id'], ['actif' => false])->status);
    }
}
