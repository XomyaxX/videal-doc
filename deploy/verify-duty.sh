#!/bin/bash
set -euo pipefail
echo "== health =="
curl -s http://127.0.0.1:3000/api/health
echo
echo "== /duty headers =="
curl -sI http://127.0.0.1:3000/duty | tr -d '\r' | sed -n '1,12p'
echo "== /api/duty/pdf headers =="
curl -sI 'http://127.0.0.1:3000/api/duty/pdf?kind=trash' | tr -d '\r' | sed -n '1,12p'
echo "== lastDutyYmd column =="
sqlite3 /srv/videal-edo/data/videal.db "PRAGMA table_info(AppSettings);" | grep -i duty || true
echo "== staff =="
sqlite3 -header -column /srv/videal-edo/data/videal.db <<'SQL'
SELECT u.lastName, u.firstName, u.gender, r.code AS role,
       COALESCE(d.name,'') AS dept, COALESCE(p.name,'') AS pos
FROM User u
LEFT JOIN Role r ON r.id=u.roleId
LEFT JOIN Department d ON d.id=u.departmentId
LEFT JOIN Position p ON p.id=u.positionId
WHERE u.deletedAt IS NULL AND u.status='active'
ORDER BY u.lastName;
SQL
echo DONE
