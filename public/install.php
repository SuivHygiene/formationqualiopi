<?php
declare(strict_types=1);

// Page d'installation (hébergement sans SSH). Se verrouille après usage. Supprimez-la ensuite.
use App\Installer;

require dirname(__DIR__) . '/src/bootstrap.php';

header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex');
header('Cache-Control: no-store');

$inst = new Installer(dirname(__DIR__));
$e = static fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');
$message = '';
$error = '';
$done = false;

if ($inst->isLocked()) {
    $done = true;
    $message = 'L\'installation est déjà faite (ou la clé d\'installation est absente). Supprimez le fichier install.php du serveur.';
} elseif ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Frein simple contre l'essai de clés : 1 seconde par tentative.
    sleep(1);
    if (!$inst->checkKey((string) ($_POST['cle'] ?? ''))) {
        $error = 'Clé d\'installation incorrecte.';
    } else {
        try {
            $message = $inst->run(array_map('strval', $_POST));
            $done = true;
            @unlink(__FILE__);
        } catch (\PDOException $ex) {
            $error = 'Base de données : ' . $ex->getMessage();
        } catch (\Throwable $ex) {
            $error = $ex->getMessage();
        }
    }
}
$v = static fn (string $k, string $d = '') => $e($_POST[$k] ?? $d);
?><!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Installation</title>
<style>
body{font-family:system-ui,sans-serif;background:#f4f6fa;color:#1c2333;margin:0;padding:24px 16px}
main{max-width:620px;margin:auto;background:#fff;border:1px solid #dde3ec;border-radius:12px;padding:24px}
h1{margin-top:0;font-size:1.4rem}label{display:block;font-weight:600;margin:12px 0 4px;font-size:.9rem}
input{width:100%;box-sizing:border-box;padding:9px;border:1px solid #cfd6e2;border-radius:8px;font:inherit}
button{margin-top:18px;background:#1f3a68;color:#fff;border:0;padding:11px 18px;border-radius:8px;font:inherit;font-weight:600;cursor:pointer}
.ok{background:#e3f4ea;color:#1f7a4d;padding:12px;border-radius:8px}.ko{background:#fbe5e3;color:#b3261e;padding:12px;border-radius:8px}
fieldset{border:1px solid #dde3ec;border-radius:8px;margin-top:16px}legend{font-weight:700;padding:0 6px}
li{margin:4px 0}small{color:#5f6b80}
</style></head><body><main>
<h1>Installation de Suiv'Formation</h1>
<?php if ($message): ?><p class="ok"><?= $e($message) ?></p><?php endif ?>
<?php if ($error): ?><p class="ko"><?= $e($error) ?></p><?php endif ?>
<?php if ($done): ?>
  <p><a href="/">Ouvrir l'application</a></p>
  <p><small>Par sécurité, vérifiez que <code>install.php</code> a bien disparu du dossier <code>public</code> (supprimez-le sinon).</small></p>
<?php else: ?>
  <h2 style="font-size:1rem">Vérifications</h2>
  <ul><?php foreach ($inst->prerequisites() as [$label, $ok, $detail]): ?>
    <li><?= $ok ? '✅' : '❌' ?> <?= $e($label) ?> <small><?= $e($detail) ?></small></li>
  <?php endforeach ?></ul>
  <form method="post" autocomplete="off">
    <label for="cle">Clé d'installation</label><input id="cle" name="cle" required>
    <fieldset><legend>Base de données (cPanel → Bases de données MySQL)</legend>
      <label for="db_host">Serveur</label><input id="db_host" name="db_host" value="<?= $v('db_host', 'localhost') ?>" required>
      <label for="db_name">Nom de la base</label><input id="db_name" name="db_name" value="<?= $v('db_name') ?>" required>
      <label for="db_user">Utilisateur</label><input id="db_user" name="db_user" value="<?= $v('db_user') ?>" required>
      <label for="db_password">Mot de passe</label><input id="db_password" name="db_password" type="password" required>
    </fieldset>
    <fieldset><legend>Premier compte administrateur</legend>
      <label for="organisme">Nom de l'organisme de formation</label><input id="organisme" name="organisme" value="<?= $v('organisme') ?>" required>
      <label for="prenom">Prénom</label><input id="prenom" name="prenom" value="<?= $v('prenom') ?>">
      <label for="nom">Nom</label><input id="nom" name="nom" value="<?= $v('nom') ?>">
      <label for="email">E-mail de connexion</label><input id="email" name="email" type="email" value="<?= $v('email') ?>" required>
      <label for="password">Mot de passe (10 caractères minimum)</label><input id="password" name="password" type="password" minlength="10" required>
    </fieldset>
    <button type="submit">Installer</button>
  </form>
<?php endif ?>
</main></body></html>
