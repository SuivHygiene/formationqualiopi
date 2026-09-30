<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Db;
use App\Core\Util;

/** Modèles fournis à chaque nouvel organisme (modifiables ensuite). */
final class SeedData
{
    public static function install(Db $db, int $orgId): void
    {
        foreach (self::questionnaires() as $q) {
            $db->insert('questionnaires', [
                'organisme_id' => $orgId,
                'titre' => $q['titre'],
                'type' => $q['type'],
                'description' => $q['description'],
                'questions' => json_encode($q['questions'], JSON_UNESCAPED_UNICODE),
                'created_at' => Util::now(),
            ]);
        }
    }

    /** @return list<array<string,mixed>> */
    public static function questionnaires(): array
    {
        $echelle = static fn (string $id, string $libelle) => ['id' => $id, 'type' => 'echelle', 'libelle' => $libelle, 'obligatoire' => true];
        return [
            [
                'titre' => 'Satisfaction à chaud (modèle)',
                'type' => 'satisfaction_chaud',
                'description' => 'À faire remplir en fin de formation. Note de 1 (pas du tout satisfait) à 5 (très satisfait).',
                'questions' => [
                    $echelle('objectifs', 'Les objectifs de la formation ont été atteints'),
                    $echelle('contenu', 'Le contenu correspondait à vos attentes'),
                    $echelle('formateur', 'La pédagogie du formateur'),
                    $echelle('rythme', 'Le rythme et la durée'),
                    $echelle('supports', 'La qualité des supports'),
                    $echelle('organisation', 'L\'organisation (accueil, salle, horaires)'),
                    $echelle('utilite', 'L\'utilité pour votre pratique professionnelle'),
                    ['id' => 'recommande', 'type' => 'oui_non', 'libelle' => 'Recommanderiez-vous cette formation ?', 'obligatoire' => true],
                    ['id' => 'points_forts', 'type' => 'texte', 'libelle' => 'Points forts', 'obligatoire' => false],
                    ['id' => 'ameliorations', 'type' => 'texte', 'libelle' => 'Points à améliorer', 'obligatoire' => false],
                ],
            ],
            [
                'titre' => 'Évaluation à froid (modèle)',
                'type' => 'satisfaction_froid',
                'description' => 'À envoyer quelques semaines après la formation pour mesurer la mise en pratique.',
                'questions' => [
                    $echelle('application', 'Vous appliquez ce que vous avez appris dans votre travail'),
                    $echelle('impact', 'La formation a amélioré vos pratiques'),
                    ['id' => 'exemples', 'type' => 'texte', 'libelle' => 'Donnez un exemple de mise en application', 'obligatoire' => false],
                    ['id' => 'besoins', 'type' => 'texte', 'libelle' => 'Avez-vous de nouveaux besoins de formation ?', 'obligatoire' => false],
                ],
            ],
            [
                'titre' => 'Recueil des besoins et positionnement (modèle)',
                'type' => 'positionnement',
                'description' => 'À remplir avant la formation : attentes, niveau, besoins d\'adaptation.',
                'questions' => [
                    ['id' => 'attentes', 'type' => 'texte', 'libelle' => 'Qu\'attendez-vous de cette formation ?', 'obligatoire' => true],
                    ['id' => 'niveau', 'type' => 'choix_unique', 'libelle' => 'Votre niveau actuel sur le sujet', 'options' => ['Débutant', 'Notions', 'Intermédiaire', 'Confirmé'], 'obligatoire' => true],
                    ['id' => 'experience', 'type' => 'texte', 'libelle' => 'Votre expérience en lien avec le sujet', 'obligatoire' => false],
                    ['id' => 'adaptation', 'type' => 'oui_non', 'libelle' => 'Avez-vous besoin d\'un aménagement (handicap, contraintes particulières) ?', 'obligatoire' => true],
                    ['id' => 'adaptation_detail', 'type' => 'texte', 'libelle' => 'Si oui, précisez (information transmise au référent handicap)', 'obligatoire' => false],
                ],
            ],
            [
                'titre' => 'Satisfaction entreprise cliente (modèle)',
                'type' => 'satisfaction_client',
                'description' => 'À adresser au commanditaire (employeur, financeur).',
                'questions' => [
                    $echelle('echanges', 'Qualité des échanges avant la formation'),
                    $echelle('adequation', 'Adéquation de la formation à vos besoins'),
                    $echelle('resultats', 'Résultats observés chez vos salariés'),
                    ['id' => 'commentaire', 'type' => 'texte', 'libelle' => 'Commentaire', 'obligatoire' => false],
                ],
            ],
        ];
    }
}
