// Libellés affichés pour les valeurs techniques.
export const STATUT_SESSION = {
  brouillon: ['Brouillon', 'grey'],
  planifiee: ['Planifiée', 'blue'],
  en_cours: ['En cours', 'orange'],
  terminee: ['Terminée', 'green'],
  annulee: ['Annulée', 'red'],
};
export const MODALITE = { presentiel: 'Présentiel', distanciel: 'Distanciel', mixte: 'Mixte' };
export const TYPE_SESSION = { intra: 'Intra-entreprise', inter: 'Inter-entreprises' };
export const TYPE_QUESTIONNAIRE = {
  positionnement: 'Recueil des besoins / positionnement',
  evaluation_acquis: 'Évaluation des acquis (QCM)',
  satisfaction_chaud: 'Satisfaction à chaud',
  satisfaction_froid: 'Évaluation à froid',
  satisfaction_client: 'Satisfaction entreprise / financeur',
  autre: 'Autre',
};
export const MOMENT = { avant: 'Avant la formation', debut: 'Début de formation', fin: 'Fin de formation', a_froid: 'À froid (après)' };
export const TYPE_QUESTION = {
  choix_unique: 'Choix unique',
  choix_multiple: 'Choix multiples',
  echelle: 'Note de 1 à 5',
  oui_non: 'Oui / Non',
  texte: 'Réponse libre',
};
export const TYPE_REGISTRE = {
  veille: 'Veille',
  reclamation: 'Réclamations',
  amelioration: 'Amélioration continue',
  partenaire: 'Partenaires & réseau',
  handicap: 'Handicap',
  incident: 'Incidents / aléas',
};
export const STATUT_REGISTRE = { ouvert: ['Ouvert', 'orange'], en_cours: ['En cours', 'blue'], clos: ['Clos', 'green'] };
export const TYPE_DOCUMENT = {
  convention: 'Convention de formation',
  convocation: 'Convocation',
  attestation: 'Attestation de fin de formation',
  certificat_realisation: 'Certificat de réalisation',
  feuille_emargement: "Feuille d'émargement",
};
export const STATUT_FORMATEUR = { interne: 'Interne / salarié', sous_traitant: 'Sous-traitant / indépendant', benevole: 'Bénévole' };
export const ROLE = { admin: 'Administrateur', gestionnaire: 'Gestionnaire', formateur: 'Formateur' };
export const STATUT_INSCRIPTION = { inscrit: ['Inscrit', 'green'], abandon: ['Abandon', 'orange'], annule: ['Annulé', 'red'] };

export const opts = (map) => Object.entries(map).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]);
