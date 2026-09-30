# Suiv'Formation

Logiciel de gestion de formation orienté Qualiopi, **multi-organismes** : chaque organisme de formation a son espace, ses utilisateurs et ses données, cloisonnés.

## Ce que fait la V1

| Domaine | Contenu |
|---|---|
| Catalogue | Programmes complets (objectifs, prérequis, public, durée, méthodes, moyens, évaluation, accessibilité, délais, tarifs) |
| Sessions | Intra / inter, client, formateur, lieu, prix, financement, statut |
| Planning | Créneaux par demi-journée, générateur « du … au … » |
| Stagiaires | Inscription (nouveau ou existant), besoins spécifiques, lien et code d'accès personnels |
| Émargement | Signature par le stagiaire sur son téléphone (QR de salle + code personnel, ou lien) dans la fenêtre du créneau ; mode tablette ; saisie manuelle (papier / absences) ; signature formateur |
| Évaluations | Questionnaires modèles (positionnement, QCM noté, satisfaction à chaud / à froid, client) ; progression début → fin ; résultats et synthèses |
| Documents | Convention, convocation (avec QR), attestation de fin de formation, certificat de réalisation, feuille d'émargement — numérotés, données figées, QR de vérification publique |
| Qualiopi | Tableau des preuves par critère (R6316-1), alertes (émargements manquants, satisfaction absente, attestations non émises, CV formateurs, veille) |
| Registres | Veille, réclamations, amélioration continue, partenaires, handicap, incidents |
| Comptes | Rôles administrateur / gestionnaire / formateur (le formateur ne voit que ses sessions) |

## Architecture

```
public/            ← racine web (document root)
  api/index.php    ← API JSON (PHP 8.2+, sans framework)
  *.html, assets/  ← interface compilée (générée par `npm run build`, non versionnée)
src/               ← code PHP (Core = socle, Controllers = métier)
migrations/        ← schéma SQL (MySQL 8 / MariaDB 10.6+)
frontend/          ← sources de l'interface (Vanilla JS + Vite)
bin/               ← scripts : migrate.php, create-organisme.php, dev-router.php
tests/             ← tests PHPUnit (intégration sur vraie base)
config.php         ← configuration locale (NON versionnée, hors racine web)
```

Sécurité : sessions PHP (cookie HttpOnly, SameSite=Lax) + jeton CSRF ; mots de passe `password_hash` ; limitation des tentatives (connexion, portail, vérification) ; cloisonnement par `organisme_id` sur chaque requête, testé ; portail stagiaire par jeton aléatoire de 256 bits ; les bonnes réponses des QCM ne sont jamais envoyées au stagiaire ; la vérification publique n'affiche que le prénom et l'initiale du nom.

## Installation (hébergement mutualisé type o2switch)

1. **Base de données** : cPanel → Bases MySQL : créer une base + un utilisateur avec tous les droits.
2. **Fichiers** : déposer le projet (sans `frontend/node_modules`) dans un dossier, par ex. `~/suivformation/`, et faire pointer le domaine / sous-domaine sur `~/suivformation/public`.
3. **Configuration** : copier `config.example.php` en `config.php` (à la racine du projet, donc **hors** de `public/`) et renseigner la base.
4. **Tables** : en SSH, `php bin/migrate.php` (à relancer après chaque mise à jour).
5. **Premier compte** : `php bin/create-organisme.php "Nom de l'organisme" vous@exemple.fr "MotDePasseSolide"`.
6. **Interface** : sur votre poste, `cd frontend && npm install && npm run build`, puis déposer le contenu généré de `public/` (fichiers `.html` + dossier `assets/`).
7. **HTTPS obligatoire** (Let's Encrypt dans cPanel) : le cookie de session est marqué `Secure`.

Pour ouvrir l'inscription libre de nouveaux organismes (vente en libre-service) : `'signup_enabled' => true` dans `config.php`.

## Développement

```bash
composer install && cd frontend && npm install && cd ..
cp config.example.php config.php        # base locale, 'cookie_secure' => false
php bin/migrate.php
php -S 127.0.0.1:8080 -t public bin/dev-router.php   # API + pages compilées
cd frontend && npm run dev                            # interface en rechargement à chaud (proxy /api)
```

Tests : `vendor/bin/phpunit` (base MySQL/MariaDB de test, voir `phpunit.xml`, **elle est vidée à chaque lancement**) et `cd frontend && npx vitest run`.

## Points à faire valider (non juridiques de ma part)

- Textes de la convention et du certificat de réalisation (modèle ministériel de juin 2020 repris : à comparer à la version officielle en vigueur).
- Correspondance critères ↔ indicateurs Qualiopi affichée « à titre indicatif ».
- Valeur probante de l'émargement électronique : exigences variables selon les financeurs.
