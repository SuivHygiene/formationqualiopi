<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Context;
use App\Core\Request;
use App\Core\Router;

/** Tableau de bord et suivi des preuves Qualiopi. */
final class DashboardController
{
    public function __construct(private readonly Context $ctx)
    {
    }

    public function register(Router $r): void
    {
        $r->add('GET', '/dashboard', fn () => $this->dashboard());
        $r->add('GET', '/qualiopi', fn (Request $q) => $this->qualiopi($q));
    }

    private function dashboard(): array
    {
        $u = $this->ctx->auth->require();
        $org = (int) $u['organisme_id'];
        $db = $this->ctx->db;
        $scope = $u['role'] === 'formateur' ? ' AND s.formateur_id = ' . (int) ($u['formateur_id'] ?? 0) : '';
        $today = (new \DateTimeImmutable('now', $this->ctx->timezone()))->format('Y-m-d');
        $year = substr($today, 0, 4);

        $prochaines = $db->all(
            "SELECT s.id, s.intitule, s.date_debut, s.date_fin, s.lieu, s.statut, c.raison_sociale AS client_nom,
                    (SELECT COUNT(*) FROM inscriptions i WHERE i.session_id = s.id AND i.statut = 'inscrit') AS nb_inscrits
             FROM sessions s LEFT JOIN clients c ON c.id = s.client_id
             WHERE s.organisme_id = ? AND s.statut NOT IN ('annulee','brouillon') AND s.date_fin >= ?$scope
             ORDER BY s.date_debut LIMIT 8",
            [$org, $today],
        );
        $stats = $db->one(
            "SELECT COUNT(DISTINCT s.id) AS sessions, COUNT(DISTINCT i.stagiaire_id) AS stagiaires
             FROM sessions s LEFT JOIN inscriptions i ON i.session_id = s.id AND i.statut = 'inscrit'
             WHERE s.organisme_id = ? AND YEAR(s.date_debut) = ? AND s.statut <> 'annulee'$scope",
            [$org, $year],
        );
        $heures = (float) $db->value(
            "SELECT COALESCE(SUM(TIME_TO_SEC(TIMEDIFF(c.heure_fin, c.heure_debut))) / 3600, 0)
             FROM emargements e JOIN creneaux c ON c.id = e.creneau_id JOIN sessions s ON s.id = c.session_id
             WHERE e.organisme_id = ? AND e.statut = 'present' AND YEAR(c.date) = ?$scope",
            [$org, $year],
        );
        $sat = $this->satisfaction($org, $year);
        $ouverts = $db->one(
            "SELECT SUM(type = 'reclamation') AS reclamations, SUM(type = 'amelioration') AS ameliorations
             FROM registre WHERE organisme_id = ? AND statut <> 'clos'",
            [$org],
        );
        return [
            'prochaines_sessions' => $prochaines,
            'annee' => (int) $year,
            'stats' => [
                'sessions' => (int) $stats['sessions'],
                'stagiaires' => (int) $stats['stagiaires'],
                'heures_stagiaires' => round($heures, 1),
                'satisfaction' => $sat,
                'reclamations_ouvertes' => (int) ($ouverts['reclamations'] ?? 0),
                'ameliorations_ouvertes' => (int) ($ouverts['ameliorations'] ?? 0),
            ],
            'alertes' => $this->alertes($org, $today, $scope),
        ];
    }

    /** Moyenne des notes (1-5) des questionnaires de satisfaction à chaud de l'année. */
    private function satisfaction(int $org, string $year): ?float
    {
        $rows = $this->ctx->db->all(
            "SELECT r.answers, sq.questions_snapshot FROM reponses r
             JOIN session_questionnaires sq ON sq.id = r.session_questionnaire_id
             WHERE r.organisme_id = ? AND sq.type = 'satisfaction_chaud' AND YEAR(r.submitted_at) = ?",
            [$org, $year],
        );
        $sum = 0;
        $n = 0;
        foreach ($rows as $r) {
            $answers = json_decode($r['answers'], true);
            foreach (json_decode($r['questions_snapshot'], true) as $q) {
                if ($q['type'] === 'echelle' && isset($answers[$q['id']])) {
                    $sum += (int) $answers[$q['id']];
                    $n++;
                }
            }
        }
        return $n ? round($sum / $n, 2) : null;
    }

    /** @return list<array{niveau:string,message:string,session_id?:int}> */
    private function alertes(int $org, string $today, string $scope): array
    {
        $db = $this->ctx->db;
        $out = [];
        $rows = $db->all(
            "SELECT s.id, s.intitule,
                (SELECT COUNT(*) FROM session_questionnaires sq WHERE sq.session_id = s.id AND sq.type = 'satisfaction_chaud') AS nb_sat,
                (SELECT COUNT(*) FROM creneaux c WHERE c.session_id = s.id AND c.date < ? AND c.formateur_signature IS NULL) AS non_signes,
                (SELECT COUNT(*) FROM creneaux c JOIN inscriptions i ON i.session_id = c.session_id AND i.statut = 'inscrit'
                   LEFT JOIN emargements e ON e.creneau_id = c.id AND e.inscription_id = i.id
                   WHERE c.session_id = s.id AND c.date < ? AND e.id IS NULL) AS emarg_manquants,
                (SELECT COUNT(*) FROM documents_emis d WHERE d.session_id = s.id AND d.type IN ('attestation','certificat_realisation')) AS nb_attest
             FROM sessions s
             WHERE s.organisme_id = ? AND s.statut NOT IN ('annulee','brouillon') AND s.date_debut <= ?$scope
               AND s.date_debut >= DATE_SUB(?, INTERVAL 12 MONTH)
             ORDER BY s.date_debut DESC",
            [$today, $today, $org, $today, $today],
        );
        foreach ($rows as $r) {
            $id = (int) $r['id'];
            if ((int) $r['emarg_manquants'] > 0) {
                $out[] = ['niveau' => 'rouge', 'message' => "{$r['intitule']} : {$r['emarg_manquants']} émargement(s) manquant(s) sur des créneaux passés", 'session_id' => $id];
            }
            if ((int) $r['non_signes'] > 0) {
                $out[] = ['niveau' => 'orange', 'message' => "{$r['intitule']} : signature formateur manquante sur {$r['non_signes']} créneau(x)", 'session_id' => $id];
            }
            if ((int) $r['nb_sat'] === 0) {
                $out[] = ['niveau' => 'orange', 'message' => "{$r['intitule']} : aucun questionnaire de satisfaction rattaché", 'session_id' => $id];
            }
        }
        $sansAttest = $db->all(
            "SELECT s.id, s.intitule FROM sessions s WHERE s.organisme_id = ? AND s.date_fin < ? AND s.statut <> 'annulee'$scope
               AND s.date_fin >= DATE_SUB(?, INTERVAL 6 MONTH)
               AND EXISTS (SELECT 1 FROM inscriptions i WHERE i.session_id = s.id AND i.statut = 'inscrit')
               AND NOT EXISTS (SELECT 1 FROM documents_emis d WHERE d.session_id = s.id AND d.type IN ('attestation','certificat_realisation'))",
            [$org, $today, $today],
        );
        foreach ($sansAttest as $r) {
            $out[] = ['niveau' => 'orange', 'message' => "{$r['intitule']} : session terminée sans attestation / certificat émis", 'session_id' => (int) $r['id']];
        }
        $cv = (int) $db->value(
            'SELECT COUNT(*) FROM formateurs WHERE organisme_id = ? AND actif = 1 AND (date_maj_cv IS NULL OR date_maj_cv < DATE_SUB(?, INTERVAL 12 MONTH))',
            [$org, $today],
        );
        if ($cv > 0) {
            $out[] = ['niveau' => 'orange', 'message' => "$cv formateur(s) sans CV / dossier mis à jour depuis plus d'un an"];
        }
        $veille = (int) $db->value("SELECT COUNT(*) FROM registre WHERE organisme_id = ? AND type = 'veille' AND date >= DATE_SUB(?, INTERVAL 3 MONTH)", [$org, $today]);
        if ($veille === 0) {
            $out[] = ['niveau' => 'orange', 'message' => 'Aucune entrée de veille depuis 3 mois'];
        }
        return $out;
    }

    /**
     * Synthèse des preuves par critère du Référentiel national qualité (art. R6316-1 du code du travail).
     * La correspondance avec les indicateurs est indicative : l'auditeur apprécie les preuves.
     */
    private function qualiopi(Request $req): array
    {
        $u = $this->ctx->auth->require('admin', 'gestionnaire');
        $org = (int) $u['organisme_id'];
        $db = $this->ctx->db;
        $today = (new \DateTimeImmutable('now', $this->ctx->timezone()))->format('Y-m-d');
        $since = (string) ($req->query['depuis'] ?? date('Y-m-d', strtotime("$today -12 months")));
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $since)) {
            $since = date('Y-m-d', strtotime("$today -12 months"));
        }
        $o = $db->one('SELECT * FROM organismes WHERE id = ?', [$org]);

        $formations = $db->all('SELECT * FROM formations WHERE organisme_id = ? AND actif = 1', [$org]);
        $programmeChamps = ['objectifs', 'prerequis', 'public_vise', 'duree_heures', 'modalites_evaluation', 'accessibilite', 'delai_acces', 'methodes_pedagogiques'];
        $complets = count(array_filter($formations, static function ($f) use ($programmeChamps) {
            foreach ($programmeChamps as $c) {
                if ($f[$c] === null || $f[$c] === '') {
                    return false;
                }
            }
            return $f['tarif_inter'] !== null || $f['tarif_intra'] !== null;
        }));
        $moyens = count(array_filter($formations, static fn ($f) => !empty($f['moyens_techniques']) && !empty($f['methodes_pedagogiques'])));

        $sessions = $db->all(
            "SELECT s.id,
               (SELECT COUNT(*) FROM session_questionnaires sq WHERE sq.session_id = s.id AND sq.type = 'positionnement') AS pos,
               (SELECT COUNT(*) FROM session_questionnaires sq WHERE sq.session_id = s.id AND sq.type = 'evaluation_acquis') AS acquis,
               (SELECT COUNT(*) FROM session_questionnaires sq WHERE sq.session_id = s.id AND sq.type = 'satisfaction_chaud') AS chaud,
               (SELECT COUNT(*) FROM session_questionnaires sq WHERE sq.session_id = s.id AND sq.type = 'satisfaction_froid') AS froid,
               (SELECT COUNT(*) FROM documents_emis d WHERE d.session_id = s.id AND d.type = 'convocation') AS convoc,
               (SELECT COUNT(*) FROM documents_emis d WHERE d.session_id = s.id AND d.type IN ('attestation','certificat_realisation')) AS attest
             FROM sessions s WHERE s.organisme_id = ? AND s.statut <> 'annulee' AND s.date_debut >= ? AND s.date_debut <= ?",
            [$org, $since, $today],
        );
        $nS = count($sessions);
        $pct = static fn (string $k) => $nS ? (int) round(100 * count(array_filter($sessions, static fn ($s) => (int) $s[$k] > 0)) / $nS) : null;

        $emarg = $db->one(
            "SELECT COUNT(*) AS attendus, COUNT(e.id) AS saisis FROM creneaux c
             JOIN sessions s ON s.id = c.session_id AND s.statut <> 'annulee'
             JOIN inscriptions i ON i.session_id = c.session_id AND i.statut = 'inscrit'
             LEFT JOIN emargements e ON e.creneau_id = c.id AND e.inscription_id = i.id
             WHERE c.organisme_id = ? AND c.date >= ? AND c.date < ?",
            [$org, $since, $today],
        );
        $tauxRep = function (string $type) use ($db, $org, $since) {
            $r = $db->one(
                "SELECT COUNT(DISTINCT CONCAT(sq.id, '-', i.id)) AS attendus, COUNT(DISTINCT r.id) AS recues
                 FROM session_questionnaires sq
                 JOIN sessions s ON s.id = sq.session_id AND s.statut <> 'annulee' AND s.date_debut >= ?
                 JOIN inscriptions i ON i.session_id = sq.session_id AND i.statut = 'inscrit'
                 LEFT JOIN reponses r ON r.session_questionnaire_id = sq.id AND r.inscription_id = i.id
                 WHERE sq.organisme_id = ? AND sq.type = ?",
                [$since, $org, $type],
            );
            return (int) $r['attendus'] ? (int) round(100 * $r['recues'] / $r['attendus']) : null;
        };
        $reg = static fn (string $type, bool $ouverts = false) => (int) $db->value(
            'SELECT COUNT(*) FROM registre WHERE organisme_id = ? AND type = ? AND date >= ?' . ($ouverts ? " AND statut <> 'clos'" : ''),
            [$org, $type, $since],
        );
        $formateurs = $db->all('SELECT date_maj_cv, formations_suivies, diplomes FROM formateurs WHERE organisme_id = ? AND actif = 1', [$org]);
        $cvAJour = count(array_filter($formateurs, static fn ($f) => $f['date_maj_cv'] && $f['date_maj_cv'] >= date('Y-m-d', strtotime("$today -12 months"))));
        $devComp = count(array_filter($formateurs, static fn ($f) => !empty($f['formations_suivies'])));
        $besoins = (int) $db->value("SELECT COUNT(*) FROM stagiaires WHERE organisme_id = ? AND besoins_specifiques IS NOT NULL AND besoins_specifiques <> ''", [$org]);

        $item = static fn (string $label, $valeur, ?string $statut, string $indicateurs, string $conseil = '') => compact('label', 'valeur', 'statut', 'indicateurs', 'conseil');
        $seuil = static fn (?int $v, int $ok = 90, int $warn = 50) => $v === null ? null : ($v >= $ok ? 'ok' : ($v >= $warn ? 'warn' : 'ko'));
        $nF = count($formations);
        $nFo = count($formateurs);

        return [
            'depuis' => $since,
            'nb_sessions' => $nS,
            'criteres' => [
                ['numero' => 1, 'titre' => 'Information du public sur les prestations, délais d\'accès et résultats obtenus', 'indicateurs' => '1 à 3', 'items' => [
                    $item('Programmes complets (objectifs, prérequis, durée, modalités, accessibilité, délais, tarifs)', "$complets / $nF", $nF ? ($complets === $nF ? 'ok' : 'warn') : 'ko', '1', 'Complétez chaque fiche formation.'),
                    $item('Taux de satisfaction à chaud publiable', $this->satisfaction($org, substr($today, 0, 4)) !== null ? $this->satisfaction($org, substr($today, 0, 4)) . ' / 5' : '—', null, '2'),
                ]],
                ['numero' => 2, 'titre' => 'Identification des objectifs et adaptation des prestations aux publics', 'indicateurs' => '4 à 8', 'items' => [
                    $item('Sessions avec recueil des besoins / positionnement', $pct('pos') === null ? '—' : $pct('pos') . ' %', $seuil($pct('pos')), '4, 8'),
                    $item('Sessions avec évaluation des acquis', $pct('acquis') === null ? '—' : $pct('acquis') . ' %', $seuil($pct('acquis')), '11'),
                ]],
                ['numero' => 3, 'titre' => 'Adaptation de l\'accueil, de l\'accompagnement, du suivi et de l\'évaluation', 'indicateurs' => '9 à 16', 'items' => [
                    $item('Sessions avec convocations émises', $pct('convoc') === null ? '—' : $pct('convoc') . ' %', $seuil($pct('convoc')), '9'),
                    $item('Émargements saisis (créneaux passés)', (int) $emarg['attendus'] ? round(100 * $emarg['saisis'] / $emarg['attendus']) . ' %' : '—',
                        (int) $emarg['attendus'] ? $seuil((int) round(100 * $emarg['saisis'] / $emarg['attendus']), 98, 80) : null, '10, 12'),
                    $item('Sessions avec attestation / certificat émis', $pct('attest') === null ? '—' : $pct('attest') . ' %', $seuil($pct('attest')), '11'),
                ]],
                ['numero' => 4, 'titre' => 'Adéquation des moyens pédagogiques, techniques et d\'encadrement', 'indicateurs' => '17 à 20', 'items' => [
                    $item('Formations décrivant méthodes et moyens techniques', "$moyens / $nF", $nF ? ($moyens === $nF ? 'ok' : 'warn') : 'ko', '17'),
                    $item('Référent handicap désigné', $o['referent_handicap_nom'] ?: 'Non renseigné', $o['referent_handicap_nom'] ? 'ok' : 'ko', '20, 26', 'Paramètres > Organisme.'),
                    $item('Stagiaires avec besoins spécifiques documentés', (string) $besoins, null, '26'),
                ]],
                ['numero' => 5, 'titre' => 'Qualification et développement des compétences des personnels', 'indicateurs' => '21 et 22', 'items' => [
                    $item('Dossiers formateurs à jour (< 12 mois)', "$cvAJour / $nFo", $nFo ? ($cvAJour === $nFo ? 'ok' : 'warn') : 'ko', '21'),
                    $item('Formateurs avec formations suivies renseignées', "$devComp / $nFo", $nFo ? ($devComp === $nFo ? 'ok' : 'warn') : 'ko', '22'),
                ]],
                ['numero' => 6, 'titre' => 'Inscription et investissement dans l\'environnement professionnel', 'indicateurs' => '23 à 29', 'items' => [
                    $item('Entrées de veille (légale, métier, pédagogique…)', (string) $reg('veille'), $reg('veille') >= 4 ? 'ok' : ($reg('veille') > 0 ? 'warn' : 'ko'), '23 à 25'),
                    $item('Partenaires / réseau handicap', (string) ($reg('partenaire') + $reg('handicap')), ($reg('partenaire') + $reg('handicap')) > 0 ? 'ok' : 'warn', '26, 27'),
                ]],
                ['numero' => 7, 'titre' => 'Recueil et prise en compte des appréciations et réclamations', 'indicateurs' => '30 à 32', 'items' => [
                    $item('Taux de réponse satisfaction à chaud', $tauxRep('satisfaction_chaud') === null ? '—' : $tauxRep('satisfaction_chaud') . ' %', $seuil($tauxRep('satisfaction_chaud'), 80, 50), '30'),
                    $item('Taux de réponse évaluation à froid', $tauxRep('satisfaction_froid') === null ? '—' : $tauxRep('satisfaction_froid') . ' %', $seuil($tauxRep('satisfaction_froid'), 50, 20), '30'),
                    $item('Réclamations (dont non closes)', $reg('reclamation') . ' (' . $reg('reclamation', true) . ')', $reg('reclamation', true) > 0 ? 'warn' : 'ok', '31'),
                    $item('Actions d\'amélioration', (string) $reg('amelioration'), $reg('amelioration') > 0 ? 'ok' : 'warn', '32'),
                ]],
            ],
        ];
    }
}
