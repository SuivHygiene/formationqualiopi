#!/usr/bin/env bash
# Construit le paquet à déposer sur l'hébergement (FTP) :
#   bin/package.sh            → build/suivformation-AAAAMMJJ-<commit>.zip
# Le paquet contient une clé d'installation neuve (install.key), affichée à la fin.
set -euo pipefail
cd "$(dirname "$0")/.."

(cd frontend && npm ci --no-audit --no-fund --silent && npx vite build --logLevel error)

name="suivformation-$(date +%Y%m%d)-$(git rev-parse --short HEAD)"
stage="build/$name"
rm -rf "$stage" && mkdir -p "$stage"
cp -R public src migrations bin config.example.php README.md .htaccess "$stage/"
rm -f "$stage/bin/dev-router.php"
key="$(php -r 'echo bin2hex(random_bytes(16));')"
printf '%s\n' "$key" > "$stage/install.key"
(cd build && rm -f "$name.zip" && zip -qr "$name.zip" "$name")
rm -rf "$stage"
echo "Paquet : build/$name.zip"
echo "Clé d'installation : $key"
