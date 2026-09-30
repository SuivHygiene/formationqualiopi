<?php
declare(strict_types=1);

namespace Tests;

/** Parcours complet : formation → session → inscription → émargement → questionnaires → documents. */
final class SessionFlowTest extends ApiTestCase
{
    public function testParcoursComplet(): void
    {
        $this->config['now'] = '2026-03-02 09:10:00';
        $a = $this->newOrg('OF Parcours');
        $f = $a->ok('POST', '/formations', [
            'titre' => 'Management d\'équipe', 'duree_heures' => '7', 'objectifs' => 'Savoir animer une réunion', 'modalite' => 'presentiel',
        ]);
        $fo = $a->ok('POST', '/formateurs', ['prenom' => 'Marie', 'nom' => 'Curie', 'date_maj_cv' => '2026-01-01']);
        $s = $a->ok('POST', '/sessions', ['formation_id' => $f['id'], 'formateur_id' => $fo['id'], 'lieu' => 'Nice']);
        $this->assertSame('Management d\'équipe', $s['intitule']);
        $this->assertMatchesRegularExpression('/^[A-Z2-9]{6}$/', $s['code_public']);
        $sid = $s['id'];

        // Planning : fin avant début refusé
        $r = $a->call('PUT', "/sessions/$sid/creneaux", ['creneaux' => [['date' => '2026-03-02', 'heure_debut' => '12:00', 'heure_fin' => '09:00']]]);
        $this->assertSame(422, $r->status);
        $s = $a->ok('PUT', "/sessions/$sid/creneaux", ['creneaux' => [
            ['date' => '2026-03-02', 'heure_debut' => '09:00', 'heure_fin' => '12:30'],
            ['date' => '2026-03-02', 'heure_debut' => '13:30', 'heure_fin' => '17:00'],
            ['date' => '2026-03-03', 'heure_debut' => '09:00', 'heure_fin' => '12:30'],
        ]]);
        $this->assertSame(10.5, (float) $s['heures_planifiees']);
        $this->assertSame('2026-03-02', $s['date_debut']);
        $this->assertSame('2026-03-03', $s['date_fin']);

        // Inscription d'un nouveau stagiaire
        $s = $a->ok('POST', "/sessions/$sid/inscriptions", ['stagiaire' => ['prenom' => 'Léa', 'nom' => 'Martin', 'email' => 'lea@test.fr']]);
        $insc = $s['inscriptions'][0];
        $this->assertSame(409, $a->call('POST', "/sessions/$sid/inscriptions", ['stagiaire_id' => $insc['stagiaire_id']])->status);

        // Questionnaires : QCM noté (début + fin) et satisfaction
        $qcm = $a->ok('POST', '/questionnaires', [
            'titre' => 'Quiz management', 'type' => 'evaluation_acquis',
            'questions' => [
                ['id' => 'q1', 'type' => 'choix_unique', 'libelle' => 'Question 1', 'options' => ['A', 'B'], 'correct' => [1], 'obligatoire' => true],
                ['id' => 'q2', 'type' => 'choix_unique', 'libelle' => 'Question 2', 'options' => ['A', 'B'], 'correct' => [0], 'obligatoire' => true],
            ],
        ]);
        $sat = array_values(array_filter($a->ok('GET', '/questionnaires'), static fn ($q) => $q['type'] === 'satisfaction_chaud'))[0];
        $a->ok('POST', "/sessions/$sid/questionnaires", ['questionnaire_id' => $qcm['id'], 'moment' => 'debut']);
        $a->ok('POST', "/sessions/$sid/questionnaires", ['questionnaire_id' => $qcm['id'], 'moment' => 'fin']);
        $s = $a->ok('POST', "/sessions/$sid/questionnaires", ['questionnaire_id' => $sat['id'], 'moment' => 'fin']);
        $this->assertCount(3, $s['questionnaires']);

        // Portail stagiaire : connexion par codes
        $p = $this->client();
        $this->assertSame(401, $p->call('POST', '/portail/connexion', ['code_session' => $s['code_public'], 'code_acces' => '000000x'])->status);
        $tok = $p->ok('POST', '/portail/connexion', ['code_session' => strtolower($s['code_public']), 'code_acces' => $insc['code_acces']]);
        $this->assertSame($insc['acces_token'], $tok['token']);
        $p->token = $tok['token'];
        $moi = $p->ok('GET', '/portail/moi');
        $this->assertSame('Léa', $moi['stagiaire']['prenom']);
        $this->assertTrue($moi['creneaux'][0]['signable']);
        $this->assertFalse($moi['creneaux'][1]['signable'], 'créneau de l\'après-midi pas encore ouvert à 9h10');
        $this->assertFalse($moi['creneaux'][2]['signable'], 'lendemain non signable');

        $sig = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
        $p->ok('POST', '/portail/emargement', ['creneau_id' => $moi['creneaux'][0]['id'], 'signature' => $sig]);
        $this->assertSame(409, $p->call('POST', '/portail/emargement', ['creneau_id' => $moi['creneaux'][0]['id'], 'signature' => $sig])->status);
        $this->assertSame(422, $p->call('POST', '/portail/emargement', ['creneau_id' => $moi['creneaux'][2]['id'], 'signature' => $sig])->status);
        $this->assertSame(422, $p->call('POST', '/portail/emargement', ['creneau_id' => $moi['creneaux'][1]['id'], 'signature' => 'data:text/html;base64,PHNjcmlwdD4='])->status);

        // Le formateur ne peut pas écraser une signature faite par le stagiaire
        $this->assertSame(409, $a->call('POST', '/creneaux/' . $moi['creneaux'][0]['id'] . '/emargements', [
            'inscription_id' => $insc['id'], 'statut' => 'absent', 'mode' => 'manuel',
        ])->status);
        // Saisie tablette de l'après-midi (sans signature → refus)
        $this->assertSame(422, $a->call('POST', '/creneaux/' . $moi['creneaux'][1]['id'] . '/emargements', [
            'inscription_id' => $insc['id'], 'statut' => 'present', 'mode' => 'tablette',
        ])->status);
        $a->ok('POST', '/creneaux/' . $moi['creneaux'][1]['id'] . '/emargements', [
            'inscription_id' => $insc['id'], 'statut' => 'present', 'mode' => 'tablette', 'signature' => $sig,
        ]);
        $a->ok('POST', '/creneaux/' . $moi['creneaux'][2]['id'] . '/emargements', [
            'inscription_id' => $insc['id'], 'statut' => 'absent', 'mode' => 'manuel',
        ]);

        // Questionnaire : les bonnes réponses ne fuient pas
        $sqDebut = $moi['questionnaires'][0];
        $this->assertSame('debut', $sqDebut['moment']);
        $q = $p->ok('GET', '/portail/questionnaires/' . $sqDebut['id']);
        $this->assertArrayNotHasKey('correct', $q['questions'][0]);
        $this->assertSame(422, $p->call('POST', '/portail/questionnaires/' . $sqDebut['id'], ['answers' => ['q1' => 1]])->status);
        $rep = $p->ok('POST', '/portail/questionnaires/' . $sqDebut['id'], ['answers' => ['q1' => 0, 'q2' => 0]]);
        $this->assertSame(1.0, (float) $rep['reponse']['score']);
        $this->assertSame(409, $p->call('POST', '/portail/questionnaires/' . $sqDebut['id'], ['answers' => ['q1' => 1, 'q2' => 0]])->status);
        $sqFin = $moi['questionnaires'][1];
        $p->ok('POST', '/portail/questionnaires/' . $sqFin['id'], ['answers' => ['q1' => 1, 'q2' => 0]]);
        $sqSat = $moi['questionnaires'][2];
        $satQ = $p->ok('GET', '/portail/questionnaires/' . $sqSat['id']);
        $answers = [];
        foreach ($satQ['questions'] as $qq) {
            $answers[$qq['id']] = match ($qq['type']) { 'echelle' => 4, 'oui_non' => true, default => 'RAS' };
        }
        $p->ok('POST', '/portail/questionnaires/' . $sqSat['id'], ['answers' => $answers]);

        // Fermeture d'un questionnaire
        $a->ok('PUT', '/session-questionnaires/' . $sqFin['id'], ['ouvert' => false]);
        $res = $a->ok('GET', '/session-questionnaires/' . $sqSat['id'] . '/resultats');
        $this->assertSame(4.0, (float) $res['synthese']['objectifs']['moyenne']);
        $this->assertSame(1, $res['synthese']['recommande']['oui']);
        // Retrait impossible une fois des réponses reçues
        $this->assertSame(409, $a->call('DELETE', '/session-questionnaires/' . $sqSat['id'])->status);

        // Documents : attestation avec heures réellement réalisées (7 h sur 10,5)
        $docs = $a->ok('POST', "/sessions/$sid/documents", ['type' => 'attestation']);
        $doc = $a->ok('GET', '/documents/' . $docs['documents'][0]);
        $this->assertSame(7.0, (float) $doc['snapshot']['heures_realisees']);
        $this->assertSame(['2026-03-02'], $doc['snapshot']['dates_presence']);
        $this->assertCount(2, $doc['snapshot']['evaluations']);
        $this->assertMatchesRegularExpression('/^ATT-\d{4}-0001$/', $doc['numero']);
        $docs2 = $a->ok('POST', "/sessions/$sid/documents", ['type' => 'attestation']);
        $this->assertStringEndsWith('-0002', $a->ok('GET', '/documents/' . $docs2['documents'][0])['numero']);

        // Vérification publique : données minimales
        $v = $this->client()->ok('GET', '/verification/' . $doc['code_verif']);
        $this->assertTrue($v['valide']);
        $this->assertSame('Léa M.', $v['stagiaire']);
        $this->assertArrayNotHasKey('snapshot', $v);
        $this->assertSame(404, $this->client()->call('GET', '/verification/0000000000000000')->status);

        // Le stagiaire voit son attestation
        $moi = $p->ok('GET', '/portail/moi');
        $this->assertCount(2, $moi['documents']);

        // Feuille d'émargement : pas de jetons d'accès exposés
        $fe = $a->ok('GET', "/sessions/$sid/feuille-emargement");
        $this->assertArrayNotHasKey('acces_token', $fe['session']['inscriptions'][0]);
        $this->assertCount(3, $fe['signatures']);

        // Suppression protégée (preuves Qualiopi) + créneau émargé non supprimable
        $this->assertSame(409, $a->call('DELETE', "/sessions/$sid")->status);
        $this->assertSame(409, $a->call('PUT', "/sessions/$sid/creneaux", ['creneaux' => []])->status);

        // Nouvel accès : l'ancien lien ne fonctionne plus
        $a->ok('POST', '/inscriptions/' . $insc['id'] . '/nouvel-acces');
        $this->assertSame(401, $p->call('GET', '/portail/moi')->status);

        // Tableau de bord et Qualiopi
        $this->config['now'] = null;
        $dash = $a->ok('GET', '/dashboard');
        $this->assertArrayHasKey('alertes', $dash);
        $ql = $a->ok('GET', '/qualiopi?depuis=2026-01-01');
        $this->assertCount(7, $ql['criteres']);
    }

    public function testFenetreDeSignature(): void
    {
        $a = $this->newOrg('OF Fenetre');
        $f = $a->ok('POST', '/formations', ['titre' => 'F']);
        $s = $a->ok('POST', '/sessions', ['formation_id' => $f['id']]);
        $a->ok('PUT', '/sessions/' . $s['id'] . '/creneaux', ['creneaux' => [
            ['date' => '2026-03-02', 'heure_debut' => '09:00', 'heure_fin' => '12:30'],
            ['date' => '2026-03-02', 'heure_debut' => '13:30', 'heure_fin' => '17:00'],
        ]]);
        $s = $a->ok('POST', '/sessions/' . $s['id'] . '/inscriptions', ['stagiaire' => ['prenom' => 'A', 'nom' => 'B']]);
        $cases = [
            '2026-03-02 08:29:00' => [false, false],
            '2026-03-02 08:31:00' => [true, false],
            '2026-03-02 13:15:00' => [true, true],
            '2026-03-02 13:31:00' => [false, true],
            '2026-03-02 18:01:00' => [false, false],
            '2026-03-03 10:00:00' => [false, false],
        ];
        foreach ($cases as $now => $expected) {
            $this->config['now'] = $now;
            $p = $this->client();
            $p->token = $s['inscriptions'][0]['acces_token'];
            $moi = $p->ok('GET', '/portail/moi');
            $this->assertSame($expected, array_column($moi['creneaux'], 'signable'), $now);
            if ($now === '2026-03-02 13:31:00') {
                $this->assertSame(['passee', 'ouverte'], array_column($moi['creneaux'], 'fenetre'));
            }
        }
    }

    /** Un formulaire envoie des chaînes vides pour les champs non remplis. */
    public function testFormulairesAvecChampsVides(): void
    {
        $a = $this->newOrg('OF Vides');
        $f = $a->ok('POST', '/formations', ['titre' => 'F', 'version' => '', 'modalite' => '', 'duree_heures' => '', 'actif' => true]);
        $this->assertSame(1, (int) $f['version']);
        $this->assertSame('presentiel', $f['modalite']);
        $st = $a->ok('POST', '/stagiaires', ['prenom' => 'A', 'nom' => 'B', 'civilite' => '', 'client_id' => '']);
        $this->assertSame('', $st['civilite']);
        $s = $a->ok('POST', '/sessions', ['formation_id' => $f['id'], 'type' => '', 'modalite' => '', 'statut' => '', 'client_id' => '', 'formateur_id' => '', 'prix_ht' => '']);
        $this->assertSame('planifiee', $s['statut']);
        $this->assertSame('intra', $s['type']);
        $fo = $a->ok('POST', '/formateurs', ['prenom' => 'X', 'nom' => 'Y', 'statut' => '', 'date_maj_cv' => '', 'signature' => '']);
        $this->assertSame('interne', $fo['statut']);
        $r = $a->ok('POST', '/registre', ['type' => 'veille', 'date' => '2026-01-01', 'titre' => 'T', 'statut' => '', 'echeance' => '']);
        $this->assertSame('ouvert', $r['statut']);
        $a->ok('PUT', '/sessions/' . $s['id'], ['type' => '', 'statut' => 'terminee', 'intitule' => '']);
        $a->ok('PUT', '/organisme', ['nom' => 'OF Vides', 'email' => '', 'couleur' => '', 'logo' => '']);
    }

    public function testFormateurNeVoitQueSesSessions(): void
    {
        $a = $this->newOrg('OF Roles');
        $f = $a->ok('POST', '/formations', ['titre' => 'F']);
        $fo1 = $a->ok('POST', '/formateurs', ['prenom' => 'Un', 'nom' => 'Formateur']);
        $fo2 = $a->ok('POST', '/formateurs', ['prenom' => 'Deux', 'nom' => 'Formateur']);
        $s1 = $a->ok('POST', '/sessions', ['formation_id' => $f['id'], 'formateur_id' => $fo1['id']]);
        $s2 = $a->ok('POST', '/sessions', ['formation_id' => $f['id'], 'formateur_id' => $fo2['id']]);
        $email = 'formateur' . bin2hex(random_bytes(3)) . '@test.fr';
        $a->ok('POST', '/users', ['email' => $email, 'prenom' => 'Un', 'nom' => 'Formateur', 'role' => 'formateur', 'formateur_id' => $fo1['id'], 'password' => 'MotDePasse123']);

        $u = $this->client();
        $me = $u->ok('POST', '/auth/login', ['email' => $email, 'password' => 'MotDePasse123']);
        $u->csrf = $me['csrf'];
        $list = $u->ok('GET', '/sessions');
        $this->assertSame([$s1['id']], array_column($list, 'id'));
        $this->assertSame(404, $u->call('GET', '/sessions/' . $s2['id'])->status);
        $this->assertSame(403, $u->call('POST', '/sessions', ['formation_id' => $f['id']])->status);
        $this->assertSame(403, $u->call('POST', '/formations', ['titre' => 'x'])->status);
        $this->assertSame(403, $u->call('GET', '/users')->status);
    }
}
