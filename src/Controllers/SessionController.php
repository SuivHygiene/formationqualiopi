<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Context;
use App\Core\HttpError;
use App\Core\Request;
use App\Core\Router;
use App\Core\Util;
use App\Core\Validator;

/** Sessions, planning (créneaux), inscriptions, émargement, questionnaires rattachés. */
final class SessionController
{
    private const SPEC = [
        'formation_id' => 'fk:formations|req', 'client_id' => 'fk:clients', 'formateur_id' => 'fk:formateurs',
        'reference' => 'str:40', 'intitule' => 'str:255', 'type' => 'enum:inter,intra',
        'modalite' => 'enum:presentiel,distanciel,mixte', 'lieu' => 'str:255', 'date_debut' => 'date', 'date_fin' => 'date',
        'duree_heures' => 'dec', 'prix_ht' => 'dec', 'financement' => 'str:120',
        'statut' => 'enum:brouillon,planifiee,en_cours,terminee,annulee', 'notes' => 'text',
    ];

    public function __construct(private readonly Context $ctx)
    {
    }

    public function register(Router $r): void
    {
        $r->add('GET', '/sessions', fn (Request $q) => $this->list($q));
        $r->add('POST', '/sessions', fn (Request $q) => $this->create($q));
        $r->add('GET', '/sessions/{id}', fn (Request $q) => $this->detail($q->param('id')));
        $r->add('PUT', '/sessions/{id}', fn (Request $q) => $this->update($q));
        $r->add('DELETE', '/sessions/{id}', fn (Request $q) => $this->delete($q));

        $r->add('PUT', '/sessions/{id}/creneaux', fn (Request $q) => $this->saveCreneaux($q));
        $r->add('POST', '/sessions/{id}/inscriptions', fn (Request $q) => $this->addInscription($q));
        $r->add('PUT', '/inscriptions/{id}', fn (Request $q) => $this->updateInscription($q));
        $r->add('DELETE', '/inscriptions/{id}', fn (Request $q) => $this->deleteInscription($q));
        $r->add('POST', '/inscriptions/{id}/nouvel-acces', fn (Request $q) => $this->resetAcces($q));

        $r->add('POST', '/creneaux/{id}/emargements', fn (Request $q) => $this->emarger($q));
        $r->add('DELETE', '/emargements/{id}', fn (Request $q) => $this->deleteEmargement($q));
        $r->add('POST', '/creneaux/{id}/signature-formateur', fn (Request $q) => $this->signatureFormateur($q));

        $r->add('POST', '/sessions/{id}/questionnaires', fn (Request $q) => $this->attachQuestionnaire($q));
        $r->add('PUT', '/session-questionnaires/{id}', fn (Request $q) => $this->updateSessionQuestionnaire($q));
        $r->add('DELETE', '/session-questionnaires/{id}', fn (Request $q) => $this->detachQuestionnaire($q));
        $r->add('GET', '/session-questionnaires/{id}/resultats', fn (Request $q) => $this->resultats($q->param('id')));
    }

    private function org(): int
    {
        return $this->ctx->auth->orgId();
    }

    private function write(): array
    {
        return $this->ctx->auth->require('admin', 'gestionnaire');
    }

    /** Un formateur connecté ne voit que ses sessions. */
    private function scope(): array
    {
        $u = $this->ctx->auth->require();
        if ($u['role'] === 'formateur') {
            return [' AND s.formateur_id = ?', [(int) ($u['formateur_id'] ?? 0)]];
        }
        return ['', []];
    }

    /** @return array<string,mixed> */
    public function session(int $id): array
    {
        [$sql, $p] = $this->scope();
        $s = $this->ctx->db->one("SELECT s.* FROM sessions s WHERE s.id = ? AND s.organisme_id = ?$sql", array_merge([$id, $this->org()], $p));
        if (!$s) {
            throw HttpError::notFound('Session');
        }
        return $s;
    }

    private function list(Request $req): array
    {
        [$sql, $p] = $this->scope();
        $where = 's.organisme_id = ?' . $sql;
        $params = array_merge([$this->org()], $p);
        if (!empty($req->query['statut'])) {
            $where .= ' AND s.statut = ?';
            $params[] = (string) $req->query['statut'];
        }
        if (!empty($req->query['formation_id'])) {
            $where .= ' AND s.formation_id = ?';
            $params[] = (int) $req->query['formation_id'];
        }
        if (!empty($req->query['client_id'])) {
            $where .= ' AND s.client_id = ?';
            $params[] = (int) $req->query['client_id'];
        }
        if (!empty($req->query['annee'])) {
            $where .= ' AND YEAR(s.date_debut) = ?';
            $params[] = (int) $req->query['annee'];
        }
        if (!empty($req->query['q'])) {
            $where .= ' AND (s.intitule LIKE ? OR s.reference LIKE ? OR c.raison_sociale LIKE ?)';
            $like = '%' . addcslashes((string) $req->query['q'], '%_\\') . '%';
            array_push($params, $like, $like, $like);
        }
        return $this->ctx->db->all(
            "SELECT s.id, s.reference, s.intitule, s.type, s.modalite, s.lieu, s.date_debut, s.date_fin, s.statut,
                    s.duree_heures, s.formation_id, s.client_id, s.formateur_id,
                    c.raison_sociale AS client_nom, CONCAT(f.prenom, ' ', f.nom) AS formateur_nom,
                    (SELECT COUNT(*) FROM inscriptions i WHERE i.session_id = s.id AND i.statut <> 'annule') AS nb_inscrits
             FROM sessions s
             LEFT JOIN clients c ON c.id = s.client_id
             LEFT JOIN formateurs f ON f.id = s.formateur_id
             WHERE $where
             ORDER BY (s.date_debut IS NULL) DESC, s.date_debut DESC, s.id DESC
             LIMIT 1000",
            $params,
        );
    }

    private function create(Request $req): array
    {
        $this->write();
        $org = $this->org();
        $d = Validator::clean($req->body, self::SPEC, false, $this->ctx->db, $org);
        $f = $this->ctx->db->one('SELECT titre, duree_heures, modalite FROM formations WHERE id = ?', [$d['formation_id']]);
        $d['intitule'] = ($d['intitule'] ?? '') !== '' ? $d['intitule'] : $f['titre'];
        $d['duree_heures'] ??= $f['duree_heures'];
        $d['modalite'] ??= $f['modalite'];
        $this->checkDates($d);
        $d['organisme_id'] = $org;
        $d['code_public'] = $this->uniqueCode();
        $d['created_at'] = Util::now();
        $id = $this->ctx->db->insert('sessions', $d);
        if (empty($d['reference'])) {
            $this->ctx->db->update('sessions', ['reference' => sprintf('S%s-%04d', date('Y'), $id)], ['id' => $id]);
        }
        $this->ctx->audit($req, 'create', 'sessions', $id);
        return $this->detail($id);
    }

    private function update(Request $req): array
    {
        $this->write();
        $id = $req->param('id');
        $cur = $this->session($id);
        $d = Validator::clean($req->body, self::SPEC, true, $this->ctx->db, $this->org());
        if (array_key_exists('intitule', $d) && ($d['intitule'] ?? '') === '') {
            unset($d['intitule']);
        }
        $this->checkDates($d + $cur);
        $d['updated_at'] = Util::now();
        $this->ctx->db->update('sessions', $d, ['id' => $id, 'organisme_id' => $this->org()]);
        $this->ctx->audit($req, 'update', 'sessions', $id);
        return $this->detail($id);
    }

    private function checkDates(array $d): void
    {
        if (!empty($d['date_debut']) && !empty($d['date_fin']) && $d['date_fin'] < $d['date_debut']) {
            throw HttpError::bad('La date de fin précède la date de début', ['date_fin' => 'Avant la date de début']);
        }
    }

    private function delete(Request $req): array
    {
        $this->write();
        $id = $req->param('id');
        $this->session($id);
        $signed = (int) $this->ctx->db->value('SELECT COUNT(*) FROM emargements e JOIN creneaux c ON c.id = e.creneau_id WHERE c.session_id = ?', [$id]);
        $docs = (int) $this->ctx->db->value('SELECT COUNT(*) FROM documents_emis WHERE session_id = ?', [$id]);
        if (($signed > 0 || $docs > 0) && ($req->query['force'] ?? '') !== '1') {
            throw new HttpError(409, 'Cette session contient des émargements ou des documents émis (preuves Qualiopi). Passez-la plutôt au statut « annulée ».');
        }
        $this->ctx->db->exec('DELETE FROM sessions WHERE id = ? AND organisme_id = ?', [$id, $this->org()]);
        $this->ctx->audit($req, 'delete', 'sessions', $id);
        return ['ok' => true];
    }

    private function uniqueCode(): string
    {
        do {
            $code = Util::code(6);
        } while ($this->ctx->db->value('SELECT id FROM sessions WHERE code_public = ?', [$code]) !== null);
        return $code;
    }

    /** Vue complète d'une session. */
    public function detail(int $id): array
    {
        $s = $this->session($id);
        $db = $this->ctx->db;
        $s['formation'] = $db->one('SELECT * FROM formations WHERE id = ?', [$s['formation_id']]);
        $s['client'] = $s['client_id'] ? $db->one('SELECT * FROM clients WHERE id = ?', [$s['client_id']]) : null;
        $s['formateur'] = $s['formateur_id']
            ? $db->one('SELECT id, prenom, nom, email, telephone, statut, (signature IS NOT NULL) AS a_signature FROM formateurs WHERE id = ?', [$s['formateur_id']])
            : null;
        $s['creneaux'] = $db->all(
            'SELECT id, date, heure_debut, heure_fin, formateur_signed_at, (formateur_signature IS NOT NULL) AS formateur_a_signe
             FROM creneaux WHERE session_id = ? ORDER BY date, heure_debut',
            [$id],
        );
        $s['inscriptions'] = $db->all(
            "SELECT i.id, i.stagiaire_id, i.statut, i.financement, i.acces_token, i.code_acces,
                    st.civilite, st.prenom, st.nom, st.email, st.telephone, st.besoins_specifiques,
                    c.raison_sociale AS entreprise
             FROM inscriptions i JOIN stagiaires st ON st.id = i.stagiaire_id
             LEFT JOIN clients c ON c.id = st.client_id
             WHERE i.session_id = ? ORDER BY st.nom, st.prenom",
            [$id],
        );
        $s['emargements'] = $db->all(
            'SELECT e.id, e.creneau_id, e.inscription_id, e.statut, e.mode, e.signed_at, (e.signature IS NOT NULL) AS a_signature
             FROM emargements e JOIN creneaux c ON c.id = e.creneau_id WHERE c.session_id = ?',
            [$id],
        );
        $s['questionnaires'] = $db->all(
            "SELECT sq.id, sq.questionnaire_id, sq.moment, sq.titre, sq.type, sq.ouvert,
                    (SELECT COUNT(*) FROM reponses r WHERE r.session_questionnaire_id = sq.id) AS nb_reponses
             FROM session_questionnaires sq WHERE sq.session_id = ?
             ORDER BY FIELD(sq.moment, 'avant', 'debut', 'fin', 'a_froid'), sq.id",
            [$id],
        );
        $s['documents'] = $db->all(
            'SELECT id, type, numero, inscription_id, code_verif, created_at FROM documents_emis WHERE session_id = ? ORDER BY created_at DESC',
            [$id],
        );
        $s['heures_planifiees'] = self::hours($s['creneaux']);
        return $s;
    }

    /** @param list<array<string,mixed>> $creneaux */
    public static function hours(array $creneaux): float
    {
        $h = 0.0;
        foreach ($creneaux as $c) {
            $h += (strtotime('1970-01-01 ' . $c['heure_fin'] . ' UTC') - strtotime('1970-01-01 ' . $c['heure_debut'] . ' UTC')) / 3600;
        }
        return round($h, 2);
    }

    /**
     * Remplace le planning. Les créneaux existants (avec id) sont mis à jour ;
     * ceux qui ont déjà des émargements ne peuvent pas être supprimés.
     */
    private function saveCreneaux(Request $req): array
    {
        $this->write();
        $id = $req->param('id');
        $this->session($id);
        $items = $req->body['creneaux'] ?? null;
        if (!is_array($items) || !array_is_list($items) || count($items) > 400) {
            throw HttpError::bad('Planning invalide');
        }
        $clean = [];
        foreach ($items as $i => $c) {
            $row = Validator::clean(is_array($c) ? $c : [], ['id' => 'int', 'date' => 'date|req', 'heure_debut' => 'time|req', 'heure_fin' => 'time|req']);
            if ($row['heure_fin'] <= $row['heure_debut']) {
                throw HttpError::bad('Créneau ' . ($i + 1) . ' : l\'heure de fin doit suivre l\'heure de début');
            }
            $clean[] = $row;
        }
        $db = $this->ctx->db;
        $db->transaction(function () use ($db, $clean, $id) {
            $existing = array_column($db->all('SELECT id FROM creneaux WHERE session_id = ?', [$id]), 'id');
            $kept = [];
            foreach ($clean as $c) {
                $cid = $c['id'] ?? null;
                unset($c['id']);
                if ($cid && in_array($cid, $existing, true)) {
                    $db->update('creneaux', $c, ['id' => $cid, 'session_id' => $id]);
                    $kept[] = $cid;
                } else {
                    $db->insert('creneaux', $c + ['session_id' => $id, 'organisme_id' => $this->org()]);
                }
            }
            foreach (array_diff($existing, $kept) as $old) {
                if ((int) $db->value('SELECT COUNT(*) FROM emargements WHERE creneau_id = ?', [$old]) > 0) {
                    throw new HttpError(409, 'Un créneau déjà émargé ne peut pas être supprimé');
                }
                $db->exec('DELETE FROM creneaux WHERE id = ?', [$old]);
            }
            $bounds = $db->one('SELECT MIN(date) AS d1, MAX(date) AS d2 FROM creneaux WHERE session_id = ?', [$id]);
            if ($bounds && $bounds['d1']) {
                $db->update('sessions', ['date_debut' => $bounds['d1'], 'date_fin' => $bounds['d2'], 'updated_at' => Util::now()], ['id' => $id]);
            }
        });
        $this->ctx->audit($req, 'planning', 'sessions', $id);
        return $this->detail($id);
    }

    private function addInscription(Request $req): array
    {
        $this->write();
        $id = $req->param('id');
        $this->session($id);
        $org = $this->org();
        $db = $this->ctx->db;
        $stagiaireId = null;
        if (!empty($req->body['stagiaire_id'])) {
            $stagiaireId = Validator::clean($req->body, ['stagiaire_id' => 'fk:stagiaires|req'], false, $db, $org)['stagiaire_id'];
        } elseif (is_array($req->body['stagiaire'] ?? null)) {
            $st = Validator::clean($req->body['stagiaire'], [
                'client_id' => 'fk:clients', 'civilite' => 'enum:,M.,Mme', 'prenom' => 'str:100|req', 'nom' => 'str:100|req',
                'email' => 'email', 'telephone' => 'str:40', 'fonction' => 'str:120', 'besoins_specifiques' => 'text',
            ], false, $db, $org);
            $stagiaireId = $db->insert('stagiaires', $st + ['organisme_id' => $org, 'created_at' => Util::now()]);
        } else {
            throw HttpError::bad('Stagiaire manquant');
        }
        if ($db->value('SELECT id FROM inscriptions WHERE session_id = ? AND stagiaire_id = ?', [$id, $stagiaireId]) !== null) {
            throw new HttpError(409, 'Ce stagiaire est déjà inscrit à la session');
        }
        $fin = Validator::clean($req->body, ['financement' => 'str:120']);
        $iid = $db->insert('inscriptions', [
            'organisme_id' => $org, 'session_id' => $id, 'stagiaire_id' => $stagiaireId,
            'acces_token' => bin2hex(random_bytes(32)), 'code_acces' => $this->uniqueAccessCode($id),
            'financement' => $fin['financement'] ?? null, 'created_at' => Util::now(),
        ]);
        $this->ctx->audit($req, 'create', 'inscriptions', $iid);
        return $this->detail($id);
    }

    private function uniqueAccessCode(int $sessionId): string
    {
        do {
            $code = Util::digits(6);
        } while ($this->ctx->db->value('SELECT id FROM inscriptions WHERE session_id = ? AND code_acces = ?', [$sessionId, $code]) !== null);
        return $code;
    }

    /** @return array<string,mixed> */
    private function inscription(int $id): array
    {
        $i = $this->ctx->db->one('SELECT * FROM inscriptions WHERE id = ? AND organisme_id = ?', [$id, $this->org()]);
        if (!$i) {
            throw HttpError::notFound('Inscription');
        }
        $this->session((int) $i['session_id']);
        return $i;
    }

    private function updateInscription(Request $req): array
    {
        $this->write();
        $i = $this->inscription($req->param('id'));
        $d = Validator::clean($req->body, ['statut' => 'enum:inscrit,abandon,annule', 'financement' => 'str:120'], true);
        $this->ctx->db->update('inscriptions', $d, ['id' => $i['id']]);
        return $this->detail((int) $i['session_id']);
    }

    private function deleteInscription(Request $req): array
    {
        $this->write();
        $i = $this->inscription($req->param('id'));
        $has = (int) $this->ctx->db->value('SELECT COUNT(*) FROM emargements WHERE inscription_id = ?', [$i['id']])
            + (int) $this->ctx->db->value('SELECT COUNT(*) FROM reponses WHERE inscription_id = ?', [$i['id']]);
        if ($has > 0) {
            throw new HttpError(409, 'Ce stagiaire a déjà émargé ou répondu : passez son inscription en « abandon » ou « annulé » plutôt que de la supprimer.');
        }
        $this->ctx->db->exec('DELETE FROM inscriptions WHERE id = ?', [$i['id']]);
        $this->ctx->audit($req, 'delete', 'inscriptions', (int) $i['id']);
        return $this->detail((int) $i['session_id']);
    }

    private function resetAcces(Request $req): array
    {
        $this->write();
        $i = $this->inscription($req->param('id'));
        $this->ctx->db->update('inscriptions', [
            'acces_token' => bin2hex(random_bytes(32)),
            'code_acces' => $this->uniqueAccessCode((int) $i['session_id']),
        ], ['id' => $i['id']]);
        $this->ctx->audit($req, 'reset_acces', 'inscriptions', (int) $i['id']);
        return $this->detail((int) $i['session_id']);
    }

    /** @return array<string,mixed> */
    private function creneau(int $id): array
    {
        $c = $this->ctx->db->one('SELECT * FROM creneaux WHERE id = ? AND organisme_id = ?', [$id, $this->org()]);
        if (!$c) {
            throw HttpError::notFound('Créneau');
        }
        $this->session((int) $c['session_id']);
        return $c;
    }

    /** Émargement depuis l'appareil du formateur (tablette) ou saisie manuelle (feuille papier). */
    private function emarger(Request $req): array
    {
        $u = $this->ctx->auth->require();
        $c = $this->creneau($req->param('id'));
        $d = Validator::clean($req->body, [
            'inscription_id' => 'int|req', 'statut' => 'enum:present,absent,absent_justifie|req',
            'signature' => 'dataurl:200000', 'mode' => 'enum:tablette,manuel|req',
        ]);
        $i = $this->inscription($d['inscription_id']);
        if ((int) $i['session_id'] !== (int) $c['session_id']) {
            throw HttpError::bad('Stagiaire non inscrit à cette session');
        }
        if ($d['statut'] === 'present' && $d['mode'] === 'tablette' && empty($d['signature'])) {
            throw HttpError::bad('Signature manquante', ['signature' => 'Obligatoire']);
        }
        $db = $this->ctx->db;
        $existing = $db->one('SELECT id, mode FROM emargements WHERE creneau_id = ? AND inscription_id = ?', [$c['id'], $i['id']]);
        if ($existing && $existing['mode'] === 'portail') {
            throw new HttpError(409, 'Le stagiaire a déjà signé lui-même ce créneau');
        }
        $row = [
            'statut' => $d['statut'], 'signature' => $d['statut'] === 'present' ? ($d['signature'] ?? null) : null,
            'mode' => $d['mode'], 'signed_at' => Util::now(), 'ip' => $req->ip, 'user_agent' => $req->userAgent,
            'saisi_par' => $u['id'],
        ];
        if ($existing) {
            $db->update('emargements', $row, ['id' => $existing['id']]);
        } else {
            $db->insert('emargements', $row + ['organisme_id' => $this->org(), 'creneau_id' => $c['id'], 'inscription_id' => $i['id']]);
        }
        $this->ctx->audit($req, 'emargement', 'creneaux', (int) $c['id']);
        return $this->detail((int) $c['session_id']);
    }

    private function deleteEmargement(Request $req): array
    {
        $this->write();
        $e = $this->ctx->db->one('SELECT e.id, c.session_id FROM emargements e JOIN creneaux c ON c.id = e.creneau_id WHERE e.id = ? AND e.organisme_id = ?', [$req->param('id'), $this->org()]);
        if (!$e) {
            throw HttpError::notFound('Émargement');
        }
        $this->session((int) $e['session_id']);
        $this->ctx->db->exec('DELETE FROM emargements WHERE id = ?', [$e['id']]);
        $this->ctx->audit($req, 'delete', 'emargements', (int) $e['id']);
        return $this->detail((int) $e['session_id']);
    }

    private function signatureFormateur(Request $req): array
    {
        $this->ctx->auth->require();
        $c = $this->creneau($req->param('id'));
        $d = Validator::clean($req->body, ['signature' => 'dataurl:200000|req']);
        $this->ctx->db->update('creneaux', ['formateur_signature' => $d['signature'], 'formateur_signed_at' => Util::now()], ['id' => $c['id']]);
        $this->ctx->audit($req, 'signature_formateur', 'creneaux', (int) $c['id']);
        return $this->detail((int) $c['session_id']);
    }

    private function attachQuestionnaire(Request $req): array
    {
        $this->write();
        $id = $req->param('id');
        $this->session($id);
        $d = Validator::clean($req->body, ['questionnaire_id' => 'fk:questionnaires|req', 'moment' => 'enum:avant,debut,fin,a_froid|req'], false, $this->ctx->db, $this->org());
        $q = $this->ctx->db->one('SELECT titre, type, questions FROM questionnaires WHERE id = ?', [$d['questionnaire_id']]);
        if ($this->ctx->db->value('SELECT id FROM session_questionnaires WHERE session_id = ? AND questionnaire_id = ? AND moment = ?', [$id, $d['questionnaire_id'], $d['moment']]) !== null) {
            throw new HttpError(409, 'Ce questionnaire est déjà rattaché à ce moment');
        }
        $this->ctx->db->insert('session_questionnaires', [
            'organisme_id' => $this->org(), 'session_id' => $id, 'questionnaire_id' => $d['questionnaire_id'],
            'moment' => $d['moment'], 'questions_snapshot' => $q['questions'], 'titre' => $q['titre'], 'type' => $q['type'],
            'created_at' => Util::now(),
        ]);
        return $this->detail($id);
    }

    /** @return array<string,mixed> */
    private function sessionQuestionnaire(int $id): array
    {
        $sq = $this->ctx->db->one('SELECT * FROM session_questionnaires WHERE id = ? AND organisme_id = ?', [$id, $this->org()]);
        if (!$sq) {
            throw HttpError::notFound('Questionnaire de session');
        }
        $this->session((int) $sq['session_id']);
        return $sq;
    }

    private function updateSessionQuestionnaire(Request $req): array
    {
        $this->ctx->auth->require();
        $sq = $this->sessionQuestionnaire($req->param('id'));
        $d = Validator::clean($req->body, ['ouvert' => 'bool|req']);
        $this->ctx->db->update('session_questionnaires', $d, ['id' => $sq['id']]);
        return $this->detail((int) $sq['session_id']);
    }

    private function detachQuestionnaire(Request $req): array
    {
        $this->write();
        $sq = $this->sessionQuestionnaire($req->param('id'));
        if ((int) $this->ctx->db->value('SELECT COUNT(*) FROM reponses WHERE session_questionnaire_id = ?', [$sq['id']]) > 0) {
            throw new HttpError(409, 'Des réponses existent déjà : fermez le questionnaire plutôt que de le retirer.');
        }
        $this->ctx->db->exec('DELETE FROM session_questionnaires WHERE id = ?', [$sq['id']]);
        return $this->detail((int) $sq['session_id']);
    }

    /** Résultats : réponses individuelles + synthèse par question. */
    public function resultats(int $id): array
    {
        $sq = $this->sessionQuestionnaire($id);
        $questions = json_decode($sq['questions_snapshot'], true);
        $rows = $this->ctx->db->all(
            'SELECT r.inscription_id, r.answers, r.score, r.score_max, r.submitted_at, st.prenom, st.nom
             FROM reponses r JOIN inscriptions i ON i.id = r.inscription_id JOIN stagiaires st ON st.id = i.stagiaire_id
             WHERE r.session_questionnaire_id = ? ORDER BY st.nom, st.prenom',
            [$id],
        );
        foreach ($rows as &$r) {
            $r['answers'] = json_decode($r['answers'], true);
        }
        unset($r);
        return [
            'questionnaire' => ['id' => $sq['id'], 'titre' => $sq['titre'], 'type' => $sq['type'], 'moment' => $sq['moment'], 'questions' => $questions],
            'reponses' => $rows,
            'synthese' => self::synthese($questions, array_column($rows, 'answers')),
        ];
    }

    /**
     * @param list<array<string,mixed>> $questions
     * @param list<array<string,mixed>> $answers
     * @return array<string,mixed>
     */
    public static function synthese(array $questions, array $answers): array
    {
        $out = [];
        foreach ($questions as $q) {
            $vals = array_values(array_filter(array_map(static fn ($a) => $a[$q['id']] ?? null, $answers), static fn ($v) => $v !== null && $v !== ''));
            $item = ['n' => count($vals)];
            switch ($q['type']) {
                case 'echelle':
                    $item['moyenne'] = $vals ? round(array_sum($vals) / count($vals), 2) : null;
                    $item['repartition'] = array_map(static fn ($k) => count(array_filter($vals, static fn ($v) => (int) $v === $k)), [1, 2, 3, 4, 5]);
                    break;
                case 'oui_non':
                    $item['oui'] = count(array_filter($vals, static fn ($v) => $v === true));
                    $item['non'] = count($vals) - $item['oui'];
                    break;
                case 'choix_unique':
                case 'choix_multiple':
                    $counts = array_fill(0, count($q['options']), 0);
                    foreach ($vals as $v) {
                        foreach ((array) $v as $c) {
                            if (isset($counts[$c])) {
                                $counts[$c]++;
                            }
                        }
                    }
                    $item['repartition'] = $counts;
                    if (isset($q['correct'])) {
                        $item['taux_reussite'] = $vals ? round(100 * count(array_filter($vals, static fn ($v) => (array) $v === $q['correct'])) / count($vals)) : null;
                    }
                    break;
                case 'texte':
                    $item['textes'] = $vals;
                    break;
            }
            $out[$q['id']] = $item;
        }
        return $out;
    }
}
