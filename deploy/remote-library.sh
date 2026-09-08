#!/bin/bash
set -euo pipefail
cd /srv/videal-edo
tar -xzf /home/v/videal-edo-deploy.tgz -C /srv/videal-edo
if [ -f .env ] && ! grep -q '^SESSION_SECRET=' .env; then
  echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env
fi
npm install
if [ -f .env ] && ! grep -q '^VAPID_PUBLIC=' .env; then
  npx web-push generate-vapid-keys --json > /tmp/vapid.json
  python3 -c 'import json,pathlib; d=json.loads(pathlib.Path("/tmp/vapid.json").read_text()); p=pathlib.Path(".env"); t=p.read_text();
p.write_text(t.rstrip()+"\nVAPID_PUBLIC=\""+d["publicKey"]+"\"\nVAPID_PRIVATE=\""+d["privateKey"]+"\"\nVAPID_MAIL=\"mailto:info@videal-doc.ru\"\n")'
fi
npx prisma generate
npx prisma db push
npx tsx prisma/seed-org.ts || true
npx tsx prisma/backfill-library-files.ts || true
npx tsx prisma/seed-skills.ts || true
npx tsx prisma/seed-user-skills.ts || true
npx tsx prisma/backfill-task-scope.ts || true
npx tsx prisma/encrypt-secrets.ts || true
npx tsx prisma/seed-inventory.ts || true
echo v | sudo -S -p '' mkdir -p /srv/samba/share/Library /srv/samba/share/Jobs
echo v | sudo -S -p '' chown server:server /srv/samba/share/Library /srv/samba/share/Jobs
echo v | sudo -S -p '' chmod 2770 /srv/samba/share/Library /srv/samba/share/Jobs
npm run build
echo v | sudo -S -p '' cp /srv/videal-edo/deploy/nginx.conf /etc/nginx/sites-available/videal-edo
echo v | sudo -S -p '' cp /srv/videal-edo/deploy/videal-edo.service /etc/systemd/system/videal-edo.service
echo v | sudo -S -p '' nginx -t
echo v | sudo -S -p '' systemctl daemon-reload
echo v | sudo -S -p '' systemctl reload nginx
echo v | sudo -S -p '' systemctl restart videal-edo
sleep 2
curl -sS http://127.0.0.1:3000/api/health
echo
echo v | sudo -S -p '' systemctl is-active videal-edo
echo DONE
