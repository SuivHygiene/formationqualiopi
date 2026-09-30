<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Context;
use App\Core\Crud;
use App\Core\Router;

/** Ressources simples (CRUD cloisonné). */
final class Resources
{
    public static function register(Context $ctx, Router $r): void
    {
        (new Crud($ctx, 'formations', 'Formation', [
            'code' => 'str:40', 'titre' => 'str:255|req', 'sous_titre' => 'str:255', 'domaine' => 'str:120',
            'objectifs' => 'text', 'prerequis' => 'text', 'public_vise' => 'text', 'duree_heures' => 'dec',
            'duree_jours' => 'dec', 'modalite' => 'enum:presentiel,distanciel,mixte', 'contenu' => 'text:200000',
            'methodes_pedagogiques' => 'text', 'moyens_techniques' => 'text', 'modalites_evaluation' => 'text',
            'accessibilite' => 'text', 'delai_acces' => 'str:255', 'tarif_inter' => 'dec', 'tarif_intra' => 'dec',
            'indicateurs_resultats' => 'text', 'version' => 'int', 'actif' => 'bool',
        ], search: ['titre', 'code', 'domaine'], filters: ['actif', 'domaine'], order: 'actif DESC, titre'))
            ->register($r, '/formations');

        (new Crud($ctx, 'clients', 'Client', [
            'raison_sociale' => 'str:190|req', 'siret' => 'str:20', 'adresse' => 'str:255', 'code_postal' => 'str:10',
            'ville' => 'str:120', 'contact_nom' => 'str:160', 'contact_fonction' => 'str:120', 'contact_email' => 'email',
            'contact_tel' => 'str:40', 'notes' => 'text',
        ], search: ['raison_sociale', 'ville', 'contact_nom', 'siret'], order: 'raison_sociale'))
            ->register($r, '/clients');

        (new Crud($ctx, 'stagiaires', 'Stagiaire', [
            'client_id' => 'fk:clients', 'civilite' => 'enum:,M.,Mme', 'prenom' => 'str:100|req', 'nom' => 'str:100|req',
            'email' => 'email', 'telephone' => 'str:40', 'fonction' => 'str:120', 'besoins_specifiques' => 'text',
        ], search: ['nom', 'prenom', 'email'], filters: ['client_id'], order: 'nom, prenom'))
            ->register($r, '/stagiaires');

        (new Crud($ctx, 'formateurs', 'Formateur', [
            'prenom' => 'str:100|req', 'nom' => 'str:100|req', 'email' => 'email', 'telephone' => 'str:40',
            'statut' => 'enum:interne,sous_traitant,benevole', 'specialites' => 'text', 'diplomes' => 'text',
            'experience' => 'text', 'formations_suivies' => 'text', 'date_maj_cv' => 'date',
            'signature' => 'dataurl:300000', 'actif' => 'bool',
        ], search: ['nom', 'prenom', 'specialites'], filters: ['actif'], order: 'actif DESC, nom, prenom'))
            ->register($r, '/formateurs');

        (new Crud($ctx, 'registre', 'Entrée de registre', [
            'type' => 'enum:veille,reclamation,amelioration,partenaire,handicap,incident|req', 'date' => 'date|req',
            'titre' => 'str:255|req', 'description' => 'text', 'source' => 'str:255', 'actions' => 'text',
            'responsable' => 'str:160', 'echeance' => 'date', 'statut' => 'enum:ouvert,en_cours,clos',
            'session_id' => 'fk:sessions',
        ], search: ['titre', 'description', 'source'], filters: ['type', 'statut', 'session_id'], order: 'date DESC, id DESC'))
            ->register($r, '/registre');

        (new Crud($ctx, 'questionnaires', 'Questionnaire', [
            'formation_id' => 'fk:formations', 'titre' => 'str:255|req',
            'type' => 'enum:positionnement,evaluation_acquis,satisfaction_chaud,satisfaction_froid,satisfaction_client,autre|req',
            'description' => 'text', 'questions' => 'json|req', 'actif' => 'bool',
        ], search: ['titre'], filters: ['type', 'formation_id', 'actif'], order: 'actif DESC, type, titre', json: ['questions'],
            beforeSave: static function (array $d): array {
                if (array_key_exists('questions', $d)) {
                    $d['questions'] = json_encode(Questions::normalize(json_decode((string) $d['questions'], true)), JSON_UNESCAPED_UNICODE);
                }
                return $d;
            }))
            ->register($r, '/questionnaires');
    }
}
