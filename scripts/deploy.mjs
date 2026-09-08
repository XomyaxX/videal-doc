import { Client } from "ssh2";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

import { requireSsh } from "./ssh-env.mjs";

const { host, username, password } = requireSsh();
const remoteDir = "/srv/videal-edo";
const archive = path.join(process.cwd(), "data", "videal-edo-src.tgz");

function sshRun(conn, cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, { pty: true }, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      stream.on("data", (d) => {
        const s = d.toString();
        out += s;
        process.stdout.write(s);
      });
      stream.stderr.on("data", (d) => process.stderr.write(d));
      stream.on("close", (code) => {
        if (code) reject(new Error(`exit ${code}\n${out.slice(-500)}`));
        else resolve(out);
      });
    });
  });
}

function sudo(cmd) {
  const wrapped = cmd.replace(/'/g, `'\\''`);
  return `echo ${password} | sudo -S -p '' bash -lc '${wrapped}'`;
}

fs.mkdirSync("data", { recursive: true });
console.log("Packing…");
execSync(
  `tar -czf "${archive}" --exclude=node_modules --exclude=.next --exclude=data --exclude=.git --exclude=data/cookies.txt .`,
  { stdio: "inherit", shell: true },
);

const conn = new Client();
await new Promise((resolve, reject) => {
  conn
    .on("ready", resolve)
    .on("error", reject)
    .connect({ host, username, password, tryKeyboard: true, readyTimeout: 20000 });
  conn.on("keyboard-interactive", (_n, _i, _l, prompts, finish) => finish(prompts.map(() => password)));
});

console.log("\nUploading…");
await new Promise((resolve, reject) => {
  conn.sftp((err, sftp) => {
    if (err) return reject(err);
    sftp.fastPut(archive, "/home/v/videal-edo-src.tgz", (e) => (e ? reject(e) : resolve()));
  });
});

console.log("Installing runtime…");
await sshRun(
  conn,
  sudo(
    "export DEBIAN_FRONTEND=noninteractive; apt-get update -y; apt-get install -y nginx curl ca-certificates build-essential; if ! command -v node >/dev/null; then curl -fsSL https://deb.nodesource.com/setup_20.x | bash -; apt-get install -y nodejs; fi; mkdir -p /srv/videal-edo /srv/videal-edo/data/files; chown -R v:v /srv/videal-edo",
  ),
);

console.log("Extracting app…");
await sshRun(
  conn,
  "mkdir -p /srv/videal-edo /srv/videal-edo/data/files && tar -xzf /home/v/videal-edo-src.tgz -C /srv/videal-edo",
);

const secret = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
await sshRun(
  conn,
  `printf '%s\\n' 'DATABASE_URL="file:../data/videal.db"' 'FILE_ROOT="./data/files"' 'SESSION_SECRET="${secret}"' > /srv/videal-edo/.env`,
);

console.log("npm install + build…");
await sshRun(
  conn,
  "cd /srv/videal-edo && npm install && npx prisma generate && npx prisma db push && npx tsx prisma/seed.ts && npm run build",
);

await sshRun(
  conn,
  sudo(
    "cp /srv/videal-edo/deploy/videal-edo.service /etc/systemd/system/videal-edo.service && cp /srv/videal-edo/deploy/nginx.conf /etc/nginx/sites-available/videal-edo && ln -sfn /etc/nginx/sites-available/videal-edo /etc/nginx/sites-enabled/videal-edo && rm -f /etc/nginx/sites-enabled/default && nginx -t && systemctl daemon-reload && systemctl enable --now videal-edo && systemctl restart videal-edo && systemctl reload nginx",
  ),
);

console.log("\nDone. Open the office URL (see README).");
conn.end();
