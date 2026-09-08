#!/usr/bin/env bash
# Постоянный внешний HTTPS через Cloudflare Tunnel.
# 1. Зайдите на https://one.dash.cloudflare.com → Zero Trust → Networks → Tunnels
# 2. Create a tunnel (Cloudflared), скопируйте токен
# 3. На сервере: echo 'ТОКЕН' | sudo tee /etc/videal-edo/cloudflared.token
# 4. sudo bash /srv/videal-edo/deploy/setup-public.sh
set -euo pipefail
TOKEN_FILE=/etc/videal-edo/cloudflared.token
if [ ! -s "$TOKEN_FILE" ]; then
  echo "Нет токена $TOKEN_FILE"
  echo "Создайте туннель в Cloudflare Zero Trust (бесплатно) и положите токен в этот файл."
  exit 1
fi
if ! command -v cloudflared >/dev/null; then
  curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
  dpkg -i /tmp/cloudflared.deb || apt-get install -y -f
fi
chmod 600 "$TOKEN_FILE"
cp /srv/videal-edo/deploy/cloudflared.service /etc/systemd/system/videal-edo-tunnel.service
# token-file may not exist on older cloudflared — fallback to EnvironmentFile
if ! cloudflared tunnel run --help 2>/dev/null | grep -q token-file; then
  TOKEN=$(cat "$TOKEN_FILE")
  cat >/etc/systemd/system/videal-edo-tunnel.service <<UNIT
[Unit]
Description=Cloudflare Tunnel for Videal.Doc
After=network-online.target videal-edo.service
Wants=network-online.target
[Service]
Type=notify
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate run --token ${TOKEN}
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT
fi
systemctl daemon-reload
systemctl enable --now videal-edo-tunnel
systemctl restart videal-edo-tunnel
systemctl is-active videal-edo-tunnel
echo "Туннель запущен. В Cloudflare укажите Public Hostname → http://127.0.0.1:80"
