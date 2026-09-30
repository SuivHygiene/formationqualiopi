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
 * Portail stagiaire (sans compte) : accès par lien personnel (jeton)
 * ou par code session + code personnel à 6 chiffres.
 */
final class PortailController
{
    /** Ouverture de la signature : 30 min avant le début du créneau, jusqu'à la fin de la journée. */
    private const OUVERTURE_AVANCE_MIN = 30;

    public function __construct(private readonly Context $ctx)
    {
    }

    public function register(Router $r): void
    {
        $r->add('POST', '/portail/connexion', fn (Request $q) => $this->connexion($q));
        $r->add('GET', '/portail/moi', fn (Request $q) => $this->moi($q));
        $r->add('POST', '/portail/emargement', fn (Request $q) => $this->emarger($q));
        $r->add('GET', '/portail/questionnaires/{id}', fn (Request $q) => $this->questionnaire($q));
        $r->add('POST', '/portail/questionnaires/{id}', fn (Request $q) => $this->repondre($q));
    }

    private function connexion(Request $req): array
    {
        $this->ctx->rateLimit->hit('portail:' . $req->ip, 15, 900);
        $in = Validator::clean($req->body, ['code_session' => 'str:10|req', 'code_acces' => 'str:10|req']);
        $row = $this->ctx->db->one(
            "SELECT i.acces_token FROM inscriptions i JOIN sessions s ON s.id = i.session_id
             WHERE s.code_public = ? AND i.code_acces = ? AND i.statut = 'inscrit' AND s.statut <> 'annulee'",
            [strtoupper(trim($in['code_session'])), trim($in['code_acces'])],
        );
        if (!$row) {
            throw new HttpError(401, 'Codes incorrects');
        }
        return ['token' => $row['acces_token']];
    }

    /** @return array<string,mixed> */
    private function inscription(Request $req): array
    {
        $token = $req->header('x-access-token');
        if (!preg_match('/^[a-f0-9]{64}$/', $token)) {
            throw new HttpError(401, 'Lien invalide');
        }
        $i = $this->ctx->db->one(
            "SELECT i.*, st.prenom, st.nom, st.civilite FROM inscriptions i JOIN stagiaires st ON st.id = i.stagiaire_id
             JOIN organismes o ON o.id = i.organisme_id
             WHERE i.acces_token = ? AND i.statut = 'inscrit' AND o.actif = 1",
            [$token],
        );
        if (!$i) {
            throw new HttpError(401, 'Lien invalide ou expiré');
        }
        return $i;
    }

    private function now(): \DateTimeImmutable
    {
        $fixed = $this->ctx->config['now'] ?? null; // tests
        return new \DateTimeImmutable(is_string($fixed) ? $fixed : 'now', $this->ctx->timezone());
    }

    /** @param array<string,mixed> $c */
    private function signable(array $c): bool
    {
        $now = $this->now();
        $tz = $this->ctx->timezone();
        $start = new \DateTimeImmutable($c['date'] . ' ' . $c['heure_debut'], $tz);
        $endOfDay = new \DateTimeImmutable($c['date'] . ' 23:59:59', $tz);
        return $now >= $start->modify('-' . self::OUVERTURE_AVANCE_MIN . ' minutes') && $now <= $endOfDay;
    }

    private function moi(Request $req): array
    {
        $i = $this->inscription($req);
        $db = $this->ctx->db;
        $s = $db->one(
            'SELECT s.id, s.intitule, s.lieu, s.modalite, s.date_debut, s.date_fin, s.statut,
                    CONCAT(f.prenom, \' \', f.nom) AS formateur
             FROM sessions s LEFT JOIN formateurs f ON f.id = s.formateur_id WHERE s.id = ?',
            [$i['session_id']],
        );
        $org = $db->one('SELECT nom, logo, couleur, referent_handicap_nom, referent_handicap_email, referent_handicap_tel FROM organismes WHERE id = ?', [$i['organisme_id']]);
        $creneaux = $db->all(
            'SELECT c.id, c.date, c.heure_debut, c.heure_fin, e.statut AS emargement, e.signed_at
             FROM creneaux c LEFT JOIN emargements e ON e.creneau_id = c.id AND e.inscription_id = ?
             WHERE c.session_id = ? ORDER BY c.date, c.heure_debut',
            [$i['id'], $i['session_id']],
        );
        foreach ($creneaux as &$c) {
            $c['signable'] = $c['emargement'] === null && $this->signable($c);
        }
        unset($c);
        $questionnaires = $db->all(
            "SELECT sq.id, sq.titre, sq.type, sq.moment, r.submitted_at
             FROM session_questionnaires sq
             LEFT JOIN reponses r ON r.session_questionnaire_id = sq.id AND r.inscription_id = ?
             WHERE sq.session_id = ? AND (sq.ouvert = 1 OR r.id IS NOT NULL)
             ORDER BY FIELD(sq.moment, 'avant', 'debut', 'fin', 'a_froid'), sq.id",
            [$i['id'], $i['session_id']],
        );
        $documents = $db->all(
            "SELECT type, numero, code_verif, created_at FROM documents_emis
             WHERE inscription_id = ? AND type IN ('convocation','attestation','certificat_realisation') ORDER BY created_at",
            [$i['id']],
        );
        return [
            'stagiaire' => ['prenom' => $i['prenom'], 'nom' => $i['nom']],
            'organisme' => $org,
            'session' => $s,
            'creneaux' => $creneaux,
            'questionnaires' => $questionnaires,
            'documents' => $documents,
        ];
    }

    private function emarger(Request $req): array
    {
        $i = $this->inscription($req);
        $d = Validator::clean($req->body, ['creneau_id' => 'int|req', 'signature' => 'dataurl:200000|req']);
        $c = $this->ctx->db->one('SELECT * FROM creneaux WHERE id = ? AND session_id = ?', [$d['creneau_id'], $i['session_id']]);
        if (!$c) {
            throw HttpError::notFound('Créneau');
        }
        if (!$this->signable($c)) {
            throw HttpError::bad('La signature de ce créneau n\'est pas ouverte (uniquement le jour même).');
        }
        if ($this->ctx->db->value('SELECT id FROM emargements WHERE creneau_id = ? AND inscription_id = ?', [$c['id'], $i['id']]) !== null) {
            throw new HttpError(409, 'Vous avez déjà émargé pour ce créneau');
        }
        $this->ctx->db->insert('emargements', [
            'organisme_id' => $i['organisme_id'], 'creneau_id' => $c['id'], 'inscription_id' => $i['id'],
            'statut' => 'present', 'signature' => $d['signature'], 'mode' => 'portail', 'signed_at' => Util::now(),
            'ip' => $req->ip, 'user_agent' => $req->userAgent,
        ]);
        return $this->moi($req);
    }

    /** @return array<string,mixed> */
    private function sessionQuestionnaire(Request $req, array $i): array
    {
        $sq = $this->ctx->db->one('SELECT * FROM session_questionnaires WHERE id = ? AND session_id = ?', [$req->param('id'), $i['session_id']]);
        if (!$sq) {
            throw HttpError::notFound('Questionnaire');
        }
        return $sq;
    }

    /** Les bonnes réponses ne sont jamais envoyées au stagiaire. */
    private function questionnaire(Request $req): array
    {
        $i = $this->inscription($req);
        $sq = $this->sessionQuestionnaire($req, $i);
        $questions = array_map(static function ($q) {
            unset($q['correct'], $q['explication']);
            return $q;
        }, json_decode($sq['questions_snapshot'], true));
        $rep = $this->ctx->db->one('SELECT answers, score, score_max, submitted_at FROM reponses WHERE session_questionnaire_id = ? AND inscription_id = ?', [$sq['id'], $i['id']]);
        if ($rep) {
            $rep['answers'] = json_decode($rep['answers'], true);
        }
        return [
            'id' => $sq['id'], 'titre' => $sq['titre'], 'type' => $sq['type'], 'moment' => $sq['moment'],
            'ouvert' => (bool) $sq['ouvert'], 'questions' => $questions, 'reponse' => $rep,
        ];
    }

    private function repondre(Request $req): array
    {
        $i = $this->inscription($req);
        $sq = $this->sessionQuestionnaire($req, $i);
        if (!$sq['ouvert']) {
            throw HttpError::bad('Ce questionnaire est fermé');
        }
        if ($this->ctx->db->value('SELECT id FROM reponses WHERE session_questionnaire_id = ? AND inscription_id = ?', [$sq['id'], $i['id']]) !== null) {
            throw new HttpError(409, 'Vous avez déjà répondu à ce questionnaire');
        }
        $g = Questions::grade(json_decode($sq['questions_snapshot'], true), $req->body['answers'] ?? null);
        $this->ctx->db->insert('reponses', [
            'organisme_id' => $i['organisme_id'], 'session_questionnaire_id' => $sq['id'], 'inscription_id' => $i['id'],
            'answers' => json_encode($g['answers'], JSON_UNESCAPED_UNICODE), 'score' => $g['score'], 'score_max' => $g['score_max'],
            'submitted_at' => Util::now(),
        ]);
        return $this->questionnaire($req);
    }
}
