#!/bin/bash
set -e
echo "=== Archive dir ==="
ls -la /srv/samba/share/Archive || true
echo "=== files ==="
find /srv/samba/share/Archive -type f | head -40
echo "=== nodemailer ==="
ls /srv/videal-edo/node_modules/nodemailer/package.json
echo "=== health ==="
curl -sS http://127.0.0.1:3000/api/health
echo
curl -sS -o /dev/null -w "archive:%{http_code}\n" http://127.0.0.1:3000/archive
sqlite3 /srv/videal-edo/data/videal.db "SELECT kind, count(*) FROM PersonDocument GROUP BY kind;"
sqlite3 /srv/videal-edo/data/videal.db "SELECT count(*) FROM PersonDocument;"
