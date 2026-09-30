<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Context;
use App\Core\HttpError;
use App\Core\Request;
use App\Core\Router;
use App\Core\Util;
use App\Core\Validator;

/**
 * Émission des documents. Les données sont figées (snapshot) au moment de l'émission,
 * le rendu (HTML imprimable → PDF) est fait côté navigateur.
 */
final class DocumentController
{
    private const PREFIX = [
        'convention' => 'CONV', 'convocation' => 'CVC', 'attestation' => 'ATT',
        'certificat_realisation' => 'CR', 'feuille_emargement' => 'EMG',
    ];
    private const PAR_STAGIAIRE = ['convocation', 'attestation', 'certificat_realisation'];

    public function __construct(private readonly Context $ctx, private readonly SessionController $sessions)
    {
    }

    public function register(Router $r): void
    {
        $r->add('POST', '/sessions/{id}/documents', fn (Request $q) => $this->emettre($q));
        $r->add('GET', '/documents/{id}', fn (Request $q) => $this->get($q->param('id')));
        $r->add('GET', '/sessions/{id}/feuille-emargement', fn (Request $q) => $this->feuille($q->param('id')));
        $r->add('GET', '/verification/{code}', fn (Request $q) => $this->verifier($q));
    }

    private function emettre(Request $req): array
    {
        $u = $this->ctx->auth->require('admin', 'gestionnaire');
        $sid = $req->param('id');
        $s = $this->sessions->detail($sid);
        $d = Validator::clean($req->body, ['type' => 'enum:' . implode(',', array_keys(self::PREFIX)) . '|req']);
        $type = $d['type'];
        $ids = $req->body['inscription_ids'] ?? null;
        $targets = [null];
        if (in_array($type, self::PAR_STAGIAIRE, true)) {
            $actives = array_values(array_filter($s['inscriptions'], static fn ($i) => $i['statut'] !== 'annule'));
            if (is_array($ids)) {
                $wanted = array_map('intval', $ids);
                $actives = array_values(array_filter($actives, static fn ($i) => in_array((int) $i['id'], $wanted, true)));
            }
            if (!$actives) {
                throw HttpError::bad('Aucun stagiaire concerné');
            }
            $targets = $actives;
        }
        $org = $this->ctx->db->one('SELECT * FROM organismes WHERE id = ?', [$s['organisme_id']]);
        unset($org['logo'], $org['signature_cachet'], $org['conditions_generales']);
        $created = [];
        foreach ($targets as $insc) {
            $snapshot = $this->snapshot($type, $s, $org, $insc);
            $created[] = $this->ctx->db->transaction(function ($db) use ($type, $s, $insc, $snapshot, $u) {
                $year = date('Y');
                $prefix = self::PREFIX[$type] . "-$year-";
                $last = (string) $db->value(
                    'SELECT numero FROM documents_emis WHERE organisme_id = ? AND numero LIKE ? ORDER BY id DESC LIMIT 1 FOR UPDATE',
                    [$s['organisme_id'], $prefix . '%'],
                );
                $seq = $last !== '' ? ((int) substr($last, strlen($prefix))) + 1 : 1;
                $numero = $prefix . str_pad((string) $seq, 4, '0', STR_PAD_LEFT);
                $id = $db->insert('documents_emis', [
                    'organisme_id' => $s['organisme_id'], 'session_id' => $s['id'], 'inscription_id' => $insc['id'] ?? null,
                    'type' => $type, 'numero' => $numero, 'code_verif' => strtolower(Util::code(16)),
                    'snapshot' => json_encode($snapshot, JSON_UNESCAPED_UNICODE), 'emis_par' => $u['id'], 'created_at' => Util::now(),
                ]);
                return $id;
            });
        }
        $this->ctx->audit($req, 'emission_' . $type, 'sessions', $sid);
        return ['documents' => $created];
    }

    /**
     * @param array<string,mixed> $s
     * @param array<string,mixed> $org
     * @param array<string,mixed>|null $insc
     * @return array<string,mixed>
     */
    private function snapshot(string $type, array $s, array $org, ?array $insc): array
    {
        $f = $s['formation'];
        $snap = [
            'type' => $type,
            'organisme' => $org,
            'session' => array_intersect_key($s, array_flip([
                'id', 'reference', 'intitule', 'type', 'modalite', 'lieu', 'date_debut', 'date_fin', 'duree_heures', 'prix_ht', 'financement',
            ])),
            'formation' => array_intersect_key($f, array_flip([
                'titre', 'code', 'objectifs', 'prerequis', 'public_vise', 'duree_heures', 'duree_jours', 'contenu',
                'methodes_pedagogiques', 'moyens_techniques', 'modalites_evaluation', 'accessibilite', 'version',
            ])),
            'client' => $s['client'],
            'formateur' => $s['formateur'] ? ['prenom' => $s['formateur']['prenom'], 'nom' => $s['formateur']['nom']] : null,
            'creneaux' => array_map(static fn ($c) => ['date' => $c['date'], 'heure_debut' => $c['heure_debut'], 'heure_fin' => $c['heure_fin']], $s['creneaux']),
            'heures_planifiees' => $s['heures_planifiees'],
        ];
        if ($type === 'convention') {
            $snap['stagiaires'] = array_map(static fn ($i) => ['civilite' => $i['civilite'], 'prenom' => $i['prenom'], 'nom' => $i['nom']],
                array_values(array_filter($s['inscriptions'], static fn ($i) => $i['statut'] !== 'annule')));
        }
        if ($insc) {
            $snap['stagiaire'] = [
                'civilite' => $insc['civilite'], 'prenom' => $insc['prenom'], 'nom' => $insc['nom'], 'entreprise' => $insc['entreprise'],
            ];
            if ($type === 'convocation') {
                $snap['acces'] = ['code_session' => $s['code_public'], 'code_acces' => $insc['code_acces'], 'token' => $insc['acces_token']];
            }
            $present = [];
            foreach ($s['emargements'] as $e) {
                if ((int) $e['inscription_id'] === (int) $insc['id'] && $e['statut'] === 'present') {
                    $present[(int) $e['creneau_id']] = true;
                }
            }
            $done = array_values(array_filter($s['creneaux'], static fn ($c) => isset($present[(int) $c['id']])));
            $snap['heures_realisees'] = SessionController::hours($done);
            $snap['dates_presence'] = array_values(array_unique(array_column($done, 'date')));
            $snap['evaluations'] = $this->evaluations((int) $s['id'], (int) $insc['id']);
        }
        return $snap;
    }

    /** Scores d'évaluation des acquis du stagiaire (début / fin) pour l'attestation. */
    private function evaluations(int $sessionId, int $inscriptionId): array
    {
        return $this->ctx->db->all(
            "SELECT sq.titre, sq.moment, r.score, r.score_max FROM reponses r
             JOIN session_questionnaires sq ON sq.id = r.session_questionnaire_id
             WHERE sq.session_id = ? AND r.inscription_id = ? AND sq.type = 'evaluation_acquis' AND r.score_max IS NOT NULL
             ORDER BY FIELD(sq.moment, 'avant', 'debut', 'fin', 'a_froid')",
            [$sessionId, $inscriptionId],
        );
    }

    private function get(int $id): array
    {
        $u = $this->ctx->auth->require();
        $doc = $this->ctx->db->one('SELECT * FROM documents_emis WHERE id = ? AND organisme_id = ?', [$id, $u['organisme_id']]);
        if (!$doc) {
            throw HttpError::notFound('Document');
        }
        $this->sessions->session((int) $doc['session_id']);
        $doc['snapshot'] = json_decode($doc['snapshot'], true);
        $doc['visuels'] = $this->ctx->db->one('SELECT logo, signature_cachet, couleur, conditions_generales FROM organismes WHERE id = ?', [$u['organisme_id']]);
        return $doc;
    }

    /** Feuille d'émargement avec signatures (données vivantes). */
    private function feuille(int $sid): array
    {
        $s = $this->sessions->detail($sid);
        $sigs = $this->ctx->db->all(
            'SELECT e.creneau_id, e.inscription_id, e.statut, e.signature, e.signed_at, e.mode
             FROM emargements e JOIN creneaux c ON c.id = e.creneau_id WHERE c.session_id = ?',
            [$sid],
        );
        $form = $this->ctx->db->all('SELECT id, formateur_signature, formateur_signed_at FROM creneaux WHERE session_id = ?', [$sid]);
        $visuels = $this->ctx->db->one('SELECT nom, siret, nda, adresse, code_postal, ville, logo, couleur FROM organismes WHERE id = ?', [$s['organisme_id']]);
        unset($s['emargements']);
        foreach ($s['inscriptions'] as &$i) {
            unset($i['acces_token'], $i['code_acces']);
        }
        unset($i);
        return ['session' => $s, 'signatures' => $sigs, 'formateur_signatures' => $form, 'organisme' => $visuels];
    }

    /** Vérification publique d'un document par QR code : informations minimales (RGPD). */
    private function verifier(Request $req): array
    {
        $this->ctx->rateLimit->hit('verif:' . $req->ip, 60, 600);
        $code = strtolower((string) ($req->params['code'] ?? ''));
        if (!preg_match('/^[a-z0-9]{16}$/', $code)) {
            throw HttpError::notFound('Document');
        }
        $doc = $this->ctx->db->one('SELECT type, numero, snapshot, created_at FROM documents_emis WHERE code_verif = ?', [$code]);
        if (!$doc) {
            throw HttpError::notFound('Document');
        }
        $s = json_decode($doc['snapshot'], true);
        $st = $s['stagiaire'] ?? null;
        return [
            'valide' => true,
            'type' => $doc['type'],
            'numero' => $doc['numero'],
            'emis_le' => $doc['created_at'],
            'organisme' => ['nom' => $s['organisme']['nom'] ?? '', 'nda' => $s['organisme']['nda'] ?? null],
            'formation' => $s['session']['intitule'] ?? '',
            'dates' => ['debut' => $s['session']['date_debut'] ?? null, 'fin' => $s['session']['date_fin'] ?? null],
            'stagiaire' => $st ? trim($st['prenom'] . ' ' . mb_substr((string) $st['nom'], 0, 1) . '.') : null,
            'heures_realisees' => $s['heures_realisees'] ?? null,
        ];
    }
}
