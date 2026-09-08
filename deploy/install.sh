#!/usr/bin/env bash
set -euo pipefail
# Запускать на Ubuntu 22.04 от пользователя с sudo.
APP=/opt/videal-edo
DATA=/var/lib/videal-edo

sudo mkdir -p "$APP" "$DATA/files" "$DATA/backups"
sudo apt-get update
sudo apt-get install -y nginx curl build-essential

if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

cd "$APP"
sudo npm install --omit=dev
sudo npx prisma generate
sudo mkdir -p data/files
if [ ! -f data/videal.db ]; then
  sudo npx prisma db push
  sudo npx tsx prisma/seed.ts
fi

sudo tee /etc/systemd/system/videal-edo.service >/dev/null <<'UNIT'
[Unit]
Description=Videal.Doc EDO
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/videal-edo
Environment=NODE_ENV=production
Environment=DATABASE_URL=file:../data/videal.db
Environment=FILE_ROOT=/var/lib/videal-edo/files
Environment=SESSION_SECRET=change-this-secret
ExecStart=/usr/bin/npm start -- -p 3000
Restart=on-failure
User=v

[Install]
WantedBy=multi-user.target
UNIT

sudo tee /etc/nginx/sites-available/videal-edo >/dev/null <<'NGX'
server {
  listen 80 default_server;
  server_name 192.168.1.51;
  client_max_body_size 32m;
  allow 192.168.1.0/24;
  allow 127.0.0.1;
  deny all;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_read_timeout 120s;
  }
}
NGX

sudo ln -sfn /etc/nginx/sites-available/videal-edo /etc/nginx/sites-enabled/videal-edo
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now videal-edo
sudo systemctl reload nginx
echo "Готово: http://192.168.1.51"
