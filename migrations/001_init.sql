-- Suiv'Formation — schéma initial (MySQL 8 / MariaDB 10.6+)
-- Toutes les tables métier portent organisme_id : c'est la clé d'isolation
-- entre clients. Aucune requête métier ne doit s'exécuter sans ce filtre.

CREATE TABLE organismes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(190) NOT NULL,
  siret VARCHAR(20) NULL,
  nda VARCHAR(40) NULL COMMENT 'Numéro de déclaration d''activité',
  qualiopi_numero VARCHAR(80) NULL,
  qualiopi_certificateur VARCHAR(120) NULL,
  adresse VARCHAR(255) NULL,
  code_postal VARCHAR(10) NULL,
  ville VARCHAR(120) NULL,
  email VARCHAR(190) NULL,
  telephone VARCHAR(40) NULL,
  site_web VARCHAR(190) NULL,
  representant_nom VARCHAR(160) NULL,
  representant_qualite VARCHAR(120) NULL,
  referent_handicap_nom VARCHAR(160) NULL,
  referent_handicap_email VARCHAR(190) NULL,
  referent_handicap_tel VARCHAR(40) NULL,
  couleur VARCHAR(9) NULL,
  logo MEDIUMTEXT NULL COMMENT 'data URL (png/jpeg/svg)',
  signature_cachet MEDIUMTEXT NULL COMMENT 'data URL',
  conditions_generales MEDIUMTEXT NULL,
  mentions_documents TEXT NULL,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisme_id INT UNSIGNED NOT NULL,
  email VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  prenom VARCHAR(100) NOT NULL DEFAULT '',
  nom VARCHAR(100) NOT NULL DEFAULT '',
  role ENUM('admin','gestionnaire','formateur') NOT NULL DEFAULT 'gestionnaire',
  formateur_id INT UNSIGNED NULL,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_org (organisme_id),
  CONSTRAINT fk_users_org FOREIGN KEY (organisme_id) REFERENCES organismes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE formateurs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisme_id INT UNSIGNED NOT NULL,
  prenom VARCHAR(100) NOT NULL,
  nom VARCHAR(100) NOT NULL,
  email VARCHAR(190) NULL,
  telephone VARCHAR(40) NULL,
  statut ENUM('interne','sous_traitant','benevole') NOT NULL DEFAULT 'interne',
  specialites TEXT NULL,
  diplomes TEXT NULL,
  experience TEXT NULL,
  formations_suivies TEXT NULL COMMENT 'Développement des compétences (Qualiopi)',
  date_maj_cv DATE NULL,
  signature MEDIUMTEXT NULL,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  KEY idx_formateurs_org (organisme_id),
  CONSTRAINT fk_formateurs_org FOREIGN KEY (organisme_id) REFERENCES organismes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE formations (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisme_id INT UNSIGNED NOT NULL,
  code VARCHAR(40) NULL,
  titre VARCHAR(255) NOT NULL,
  sous_titre VARCHAR(255) NULL,
  domaine VARCHAR(120) NULL,
  objectifs TEXT NULL,
  prerequis TEXT NULL,
  public_vise TEXT NULL,
  duree_heures DECIMAL(6,2) NULL,
  duree_jours DECIMAL(5,1) NULL,
  modalite ENUM('presentiel','distanciel','mixte') NOT NULL DEFAULT 'presentiel',
  contenu MEDIUMTEXT NULL COMMENT 'Programme détaillé',
  methodes_pedagogiques TEXT NULL,
  moyens_techniques TEXT NULL,
  modalites_evaluation TEXT NULL,
  accessibilite TEXT NULL,
  delai_acces VARCHAR(255) NULL,
  tarif_inter DECIMAL(10,2) NULL,
  tarif_intra DECIMAL(10,2) NULL,
  indicateurs_resultats TEXT NULL,
  version INT UNSIGNED NOT NULL DEFAULT 1,
  actif TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  KEY idx_formations_org (organisme_id),
  CONSTRAINT fk_formations_org FOREIGN KEY (organisme_id) REFERENCES organismes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE clients (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisme_id INT UNSIGNED NOT NULL,
  raison_sociale VARCHAR(190) NOT NULL,
  siret VARCHAR(20) NULL,
  adresse VARCHAR(255) NULL,
  code_postal VARCHAR(10) NULL,
  ville VARCHAR(120) NULL,
  contact_nom VARCHAR(160) NULL,
  contact_fonction VARCHAR(120) NULL,
  contact_email VARCHAR(190) NULL,
  contact_tel VARCHAR(40) NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  KEY idx_clients_org (organisme_id),
  CONSTRAINT fk_clients_org FOREIGN KEY (organisme_id) REFERENCES organismes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stagiaires (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisme_id INT UNSIGNED NOT NULL,
  client_id INT UNSIGNED NULL,
  civilite ENUM('','M.','Mme') NOT NULL DEFAULT '',
  prenom VARCHAR(100) NOT NULL,
  nom VARCHAR(100) NOT NULL,
  email VARCHAR(190) NULL,
  telephone VARCHAR(40) NULL,
  fonction VARCHAR(120) NULL,
  besoins_specifiques TEXT NULL COMMENT 'Situation de handicap / adaptations',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  KEY idx_stagiaires_org (organisme_id),
  KEY idx_stagiaires_client (client_id),
  CONSTRAINT fk_stagiaires_org FOREIGN KEY (organisme_id) REFERENCES organismes(id) ON DELETE CASCADE,
  CONSTRAINT fk_stagiaires_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sessions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisme_id INT UNSIGNED NOT NULL,
  formation_id INT UNSIGNED NOT NULL,
  client_id INT UNSIGNED NULL,
  formateur_id INT UNSIGNED NULL,
  reference VARCHAR(40) NULL,
  code_public CHAR(6) NOT NULL COMMENT 'Code affiché en salle pour le portail stagiaire',
  intitule VARCHAR(255) NOT NULL,
  type ENUM('inter','intra') NOT NULL DEFAULT 'intra',
  modalite ENUM('presentiel','distanciel','mixte') NOT NULL DEFAULT 'presentiel',
  lieu VARCHAR(255) NULL,
  date_debut DATE NULL,
  date_fin DATE NULL,
  duree_heures DECIMAL(6,2) NULL,
  prix_ht DECIMAL(10,2) NULL,
  financement VARCHAR(120) NULL,
  statut ENUM('brouillon','planifiee','en_cours','terminee','annulee') NOT NULL DEFAULT 'planifiee',
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  UNIQUE KEY uq_sessions_code (code_public),
  KEY idx_sessions_org (organisme_id, date_debut),
  CONSTRAINT fk_sessions_org FOREIGN KEY (organisme_id) REFERENCES organismes(id) ON DELETE CASCADE,
  CONSTRAINT fk_sessions_formation FOREIGN KEY (formation_id) REFERENCES formations(id),
  CONSTRAINT fk_sessions_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  CONSTRAINT fk_sessions_formateur FOREIGN KEY (formateur_id) REFERENCES formateurs(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Une ligne = une demi-journée (ou un créneau) à émarger.
CREATE TABLE creneaux (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisme_id INT UNSIGNED NOT NULL,
  session_id INT UNSIGNED NOT NULL,
  date DATE NOT NULL,
  heure_debut TIME NOT NULL,
  heure_fin TIME NOT NULL,
  formateur_signature MEDIUMTEXT NULL,
  formateur_signed_at DATETIME NULL,
  KEY idx_creneaux_session (session_id, date, heure_debut),
  CONSTRAINT fk_creneaux_org FOREIGN KEY (organisme_id) REFERENCES organismes(id) ON DELETE CASCADE,
  CONSTRAINT fk_creneaux_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE inscriptions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisme_id INT UNSIGNED NOT NULL,
  session_id INT UNSIGNED NOT NULL,
  stagiaire_id INT UNSIGNED NOT NULL,
  acces_token CHAR(64) NOT NULL COMMENT 'Lien personnel du portail stagiaire',
  code_acces CHAR(6) NOT NULL COMMENT 'Code personnel à saisir avec le code session',
  statut ENUM('inscrit','abandon','annule') NOT NULL DEFAULT 'inscrit',
  financement VARCHAR(120) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_inscription (session_id, stagiaire_id),
  UNIQUE KEY uq_inscription_token (acces_token),
  KEY idx_inscriptions_org (organisme_id),
  CONSTRAINT fk_inscriptions_org FOREIGN KEY (organisme_id) REFERENCES organismes(id) ON DELETE CASCADE,
  CONSTRAINT fk_inscriptions_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_inscriptions_stagiaire FOREIGN KEY (stagiaire_id) REFERENCES stagiaires(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE emargements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisme_id INT UNSIGNED NOT NULL,
  creneau_id INT UNSIGNED NOT NULL,
  inscription_id INT UNSIGNED NOT NULL,
  statut ENUM('present','absent','absent_justifie') NOT NULL DEFAULT 'present',
  signature MEDIUMTEXT NULL,
  mode ENUM('portail','tablette','manuel') NOT NULL,
  signed_at DATETIME NOT NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  saisi_par INT UNSIGNED NULL COMMENT 'users.id si saisie tablette/manuelle',
  UNIQUE KEY uq_emargement (creneau_id, inscription_id),
  CONSTRAINT fk_emarg_org FOREIGN KEY (organisme_id) REFERENCES organismes(id) ON DELETE CASCADE,
  CONSTRAINT fk_emarg_creneau FOREIGN KEY (creneau_id) REFERENCES creneaux(id) ON DELETE CASCADE,
  CONSTRAINT fk_emarg_inscription FOREIGN KEY (inscription_id) REFERENCES inscriptions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE questionnaires (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisme_id INT UNSIGNED NOT NULL,
  formation_id INT UNSIGNED NULL,
  titre VARCHAR(255) NOT NULL,
  type ENUM('positionnement','evaluation_acquis','satisfaction_chaud','satisfaction_froid','satisfaction_client','autre') NOT NULL,
  description TEXT NULL,
  questions MEDIUMTEXT NOT NULL COMMENT 'JSON',
  actif TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  KEY idx_questionnaires_org (organisme_id),
  CONSTRAINT fk_quest_org FOREIGN KEY (organisme_id) REFERENCES organismes(id) ON DELETE CASCADE,
  CONSTRAINT fk_quest_formation FOREIGN KEY (formation_id) REFERENCES formations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Questionnaire rattaché à une session à un moment donné (avant / fin / à froid…)
CREATE TABLE session_questionnaires (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisme_id INT UNSIGNED NOT NULL,
  session_id INT UNSIGNED NOT NULL,
  questionnaire_id INT UNSIGNED NOT NULL,
  moment ENUM('avant','debut','fin','a_froid') NOT NULL,
  questions_snapshot MEDIUMTEXT NOT NULL COMMENT 'Copie figée des questions au moment du rattachement',
  titre VARCHAR(255) NOT NULL,
  type VARCHAR(40) NOT NULL,
  ouvert TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sessq (session_id, questionnaire_id, moment),
  CONSTRAINT fk_sessq_org FOREIGN KEY (organisme_id) REFERENCES organismes(id) ON DELETE CASCADE,
  CONSTRAINT fk_sessq_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_sessq_quest FOREIGN KEY (questionnaire_id) REFERENCES questionnaires(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE reponses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisme_id INT UNSIGNED NOT NULL,
  session_questionnaire_id INT UNSIGNED NOT NULL,
  inscription_id INT UNSIGNED NOT NULL,
  answers MEDIUMTEXT NOT NULL COMMENT 'JSON {questionId: valeur}',
  score DECIMAL(6,2) NULL,
  score_max DECIMAL(6,2) NULL,
  submitted_at DATETIME NOT NULL,
  UNIQUE KEY uq_reponse (session_questionnaire_id, inscription_id),
  CONSTRAINT fk_rep_org FOREIGN KEY (organisme_id) REFERENCES organismes(id) ON DELETE CASCADE,
  CONSTRAINT fk_rep_sessq FOREIGN KEY (session_questionnaire_id) REFERENCES session_questionnaires(id) ON DELETE CASCADE,
  CONSTRAINT fk_rep_inscription FOREIGN KEY (inscription_id) REFERENCES inscriptions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Documents officiels émis (attestations, certificats…) : numéro + code de vérification QR.
CREATE TABLE documents_emis (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisme_id INT UNSIGNED NOT NULL,
  session_id INT UNSIGNED NOT NULL,
  inscription_id INT UNSIGNED NULL,
  type ENUM('convention','convocation','attestation','certificat_realisation','feuille_emargement') NOT NULL,
  numero VARCHAR(40) NOT NULL,
  code_verif CHAR(16) NOT NULL,
  snapshot MEDIUMTEXT NOT NULL COMMENT 'JSON des données figées à l''émission',
  emis_par INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_doc_code (code_verif),
  UNIQUE KEY uq_doc_numero (organisme_id, numero),
  KEY idx_doc_session (session_id),
  CONSTRAINT fk_doc_org FOREIGN KEY (organisme_id) REFERENCES organismes(id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_inscription FOREIGN KEY (inscription_id) REFERENCES inscriptions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Registres Qualiopi : veille, réclamations, amélioration continue, partenaires, handicap, incidents.
CREATE TABLE registre (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisme_id INT UNSIGNED NOT NULL,
  type ENUM('veille','reclamation','amelioration','partenaire','handicap','incident') NOT NULL,
  date DATE NOT NULL,
  titre VARCHAR(255) NOT NULL,
  description TEXT NULL,
  source VARCHAR(255) NULL,
  actions TEXT NULL,
  responsable VARCHAR(160) NULL,
  echeance DATE NULL,
  statut ENUM('ouvert','en_cours','clos') NOT NULL DEFAULT 'ouvert',
  session_id INT UNSIGNED NULL,
  created_by INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  KEY idx_registre_org (organisme_id, type, date),
  CONSTRAINT fk_registre_org FOREIGN KEY (organisme_id) REFERENCES organismes(id) ON DELETE CASCADE,
  CONSTRAINT fk_registre_session FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  organisme_id INT UNSIGNED NULL,
  user_id INT UNSIGNED NULL,
  action VARCHAR(40) NOT NULL,
  entity VARCHAR(40) NOT NULL,
  entity_id INT UNSIGNED NULL,
  ip VARCHAR(45) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_org (organisme_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE rate_limits (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  bucket VARCHAR(190) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_rl (bucket, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE schema_migrations (
  version VARCHAR(40) PRIMARY KEY,
  applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
