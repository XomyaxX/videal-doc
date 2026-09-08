import { Client } from "ssh2";
import fs from "fs";
import path from "path";

import { requireSsh } from "./ssh-env.mjs";

const { host, username, password } = requireSsh();
const root = process.cwd();

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
    const puts = [
      [path.join(root, "deploy", "videal-edo-tunnel.sh"), "/tmp/videal-edo-tunnel.sh"],
      [path.join(root, "deploy", "videal-edo-tunnel.service"), "/tmp/videal-edo-tunnel.service"],
      [path.join(root, "deploy", "nginx.conf"), "/tmp/videal-edo-nginx.conf"],
    ];
    let i = 0;
    const next = () => {
      if (i >= puts.length) return resolve();
      const [local, remote] = puts[i++];
      sftp.fastPut(local, remote, (e) => (e ? reject(e) : next()));
    };
    next();
  });
});

await sshRun(
  conn,
  `echo ${password} | sudo -S -p '' bash -lc 'set -e
mkdir -p /var/lib/videal-edo
chown v:v /var/lib/videal-edo
install -m 755 /tmp/videal-edo-tunnel.sh /usr/local/bin/videal-edo-tunnel.sh
install -m 644 /tmp/videal-edo-tunnel.service /etc/systemd/system/videal-edo-tunnel.service
cp /tmp/videal-edo-nginx.conf /etc/nginx/sites-available/videal-edo
ln -sfn /etc/nginx/sites-available/videal-edo /etc/nginx/sites-enabled/videal-edo
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl daemon-reload
systemctl enable --now videal-edo-tunnel
systemctl restart videal-edo-tunnel
systemctl reload nginx
echo TUNNEL_STATE=$(systemctl is-active videal-edo-tunnel)
echo NGINX_STATE=$(systemctl is-active nginx)
'`
);

console.log("tunnel unit installed");
conn.end();
