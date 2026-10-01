#!/usr/bin/env bash
# Répare un ancien dossier Git uploadé. À lancer après avoir arrêté le bot.
set -euo pipefail
cd /home/container
test -f index.js
test -f package.json
git --version >/dev/null
umask 077
backup_dir=".protect-backups/avant-update-$(date +%s)"
mkdir -p "$backup_dir"
# Inclut les sources, .git, config.json et les données privées ; pas les caches.
tar --exclude='./.protect-backups' --exclude='./node_modules' --exclude='./.npm' --exclude='*.zip' -czf "$backup_dir/bot.tar.gz" .
printf 'Sauvegarde créée : /home/container/%s/bot.tar.gz\n' "$backup_dir"
git config remote.origin.url https://github.com/iambilliiies/ajkhdfjolsadfjolsdh.git
git config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
git fetch origin
# Réinstalle les sources publiées. Les modifications locales sont dans la sauvegarde.
# config.json et les données runtime ne sont pas suivis dans origin/main.
git reset --hard origin/main
git branch -M main
git branch --set-upstream-to=origin/main main
npm ci
git status --short
printf 'Réparation terminée. Redémarre Protect, puis utilise +updatebot.\n'
