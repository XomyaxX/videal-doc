#!/bin/bash
set -euo pipefail
cd /srv/videal-edo
tar -xzf /home/v/videal-edo-deploy.tgz -C /srv/videal-edo
npm install
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts
npx tsx prisma/seed-aho.ts
echo v | sudo -S -p '' mkdir -p /srv/samba/share/Archive
echo v | sudo -S -p '' chown server:server /srv/samba/share/Archive
echo v | sudo -S -p '' chmod 2770 /srv/samba/share/Archive
npm run build
echo v | sudo -S -p '' systemctl restart videal-edo
npx tsx prisma/backfill-archive.ts
sleep 2
curl -sS http://127.0.0.1:3000/api/health || true
echo v | sudo -S -p '' systemctl is-active videal-edo
echo DONE
