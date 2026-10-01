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

## Installation (hébergement mutualisé type o2switch), sans SSH

1. **Paquet** : `bin/package.sh` produit `build/suivformation-….zip` et affiche une **clé d'installation** (à usage unique).
2. **Base de données** : cPanel → *Bases de données MySQL* : créer une base, un utilisateur, lui donner **tous les privilèges** sur la base.
3. **Version PHP** : cPanel → *Sélecteur de version PHP* : 8.2 ou plus, extensions `pdo_mysql` et `mbstring` cochées.
4. **Dépôt des fichiers** : décompresser le zip et envoyer le dossier (FileZilla) dans votre espace, ex. `~/suivformation-test/` — **pas** dans `public_html`.
5. **Racine du sous-domaine** : cPanel → *Domaines* → le sous-domaine → racine du document = `suivformation-test/public`.
   (Le `.htaccess` à la racine du projet bloque tout si la racine pointe par erreur au mauvais endroit.)
6. **HTTPS** : cPanel → *SSL/TLS Status* (AutoSSL) : certificat actif sur le sous-domaine.
7. **Installation** : ouvrir `https://votre-sous-domaine/install.php`, saisir la clé, les accès à la base et le premier compte. La page crée `config.php` (hors web), les tables et l'administrateur, puis se supprime et se verrouille.

Mises à jour : redéposer `public/`, `src/`, `migrations/` (sans toucher à `config.php`), puis appliquer les nouvelles migrations (`php bin/migrate.php` en SSH ; une page de mise à jour sans SSH viendra avec la première migration).

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
