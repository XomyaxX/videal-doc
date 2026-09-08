import { Client } from "ssh2";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

import { requireSsh } from "./ssh-env.mjs";

const { host, username, password } = requireSsh();
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
      stream.on("close", (code) => (code ? reject(new Error(`exit ${code}`)) : resolve(out)));
    });
  });
}

fs.mkdirSync("data", { recursive: true });
execSync(
  `tar -czf "${archive}" --exclude=node_modules --exclude=.next --exclude=data --exclude=.git .`,
  { stdio: "inherit", shell: true },
);

const conn = new Client();
await new Promise((resolve, reject) => {
  conn.on("ready", resolve).on("error", reject).connect({
    host,
    username,
    password,
    tryKeyboard: true,
  });
  conn.on("keyboard-interactive", (_n, _i, _l, prompts, finish) => finish(prompts.map(() => password)));
});

await new Promise((resolve, reject) => {
  conn.sftp((err, sftp) => {
    if (err) return reject(err);
    sftp.fastPut(archive, "/home/v/videal-edo-src.tgz", (e) => (e ? reject(e) : resolve()));
  });
});

await sshRun(conn, "tar -xzf /home/v/videal-edo-src.tgz -C /srv/videal-edo");
await sshRun(conn, "cd /srv/videal-edo && npm install && npx prisma generate && npx prisma db push && npm run build");
await sshRun(
  conn,
  `echo ${password} | sudo -S -p '' bash -lc 'cp /srv/videal-edo/deploy/videal-edo.service /etc/systemd/system/videal-edo.service && cp /srv/videal-edo/deploy/nginx.conf /etc/nginx/sites-available/videal-edo && ln -sfn /etc/nginx/sites-available/videal-edo /etc/nginx/sites-enabled/videal-edo && rm -f /etc/nginx/sites-enabled/default && install -m 755 /srv/videal-edo/deploy/videal-edo-tunnel.sh /usr/local/bin/videal-edo-tunnel.sh && install -m 644 /srv/videal-edo/deploy/videal-edo-tunnel.service /etc/systemd/system/videal-edo-tunnel.service && mkdir -p /var/lib/videal-edo && chown v:v /var/lib/videal-edo && nginx -t && systemctl daemon-reload && systemctl enable --now videal-edo videal-edo-tunnel && systemctl restart videal-edo && systemctl start videal-edo-tunnel && systemctl reload nginx'`,
);
console.log("\nOK http://192.168.1.51");
conn.end();
