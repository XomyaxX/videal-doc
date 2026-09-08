import { Client } from "ssh2";
import fs from "fs";

import { requireSsh } from "./ssh-env.mjs";

const { host, username, password } = requireSsh();
const config = fs.readFileSync("deploy/cloudflared-config.yml");
const unit = fs.readFileSync("deploy/videal-edo-named-tunnel.service");

const conn = new Client();
await new Promise((resolve, reject) => {
  conn.on("ready", resolve).on("error", reject).connect({
    host,
    username,
    password,
    tryKeyboard: true,
  });
  conn.on("keyboard-interactive", (_n, _i, _l, prompts, finish) =>
    finish(prompts.map(() => password))
  );
});

function exec(cmd) {
  return new Promise((resolve, reject) => {
    conn.exec(cmd, { pty: true }, (err, stream) => {
      if (err) return reject(err);
      let out = "";
      stream.on("data", (d) => {
        out += d;
        process.stdout.write(d);
      });
      stream.stderr.on("data", (d) => {
        out += d;
        process.stderr.write(d);
      });
      stream.on("close", (code) =>
        code ? reject(new Error(out || "exit " + code)) : resolve(out)
      );
    });
  });
}

await exec("echo v | sudo -S -p '' mkdir -p /tmp/videal-named /etc/cloudflared");
const sftp = await new Promise((resolve, reject) =>
  conn.sftp((err, s) => (err ? reject(err) : resolve(s)))
);
await new Promise((resolve, reject) =>
  sftp.writeFile("/tmp/videal-named/config.yml", config, (err) =>
    err ? reject(err) : resolve()
  )
);
await new Promise((resolve, reject) =>
  sftp.writeFile("/tmp/videal-named/videal-edo-named-tunnel.service", unit, (err) =>
    err ? reject(err) : resolve()
  )
);
await exec("echo v | sudo -S -p '' cp /tmp/videal-named/config.yml /etc/cloudflared/config.yml");
await exec("echo v | sudo -S -p '' cp /tmp/videal-named/videal-edo-named-tunnel.service /etc/systemd/system/videal-edo-named-tunnel.service");
await exec("echo v | sudo -S -p '' cp /root/.cloudflared/271eef04-1b1b-4d5d-b648-d46951153ae2.json /etc/cloudflared/");
await exec("echo v | sudo -S -p '' chmod 600 /etc/cloudflared/config.yml /etc/cloudflared/271eef04-1b1b-4d5d-b648-d46951153ae2.json");
await exec("echo v | sudo -S -p '' cat /etc/cloudflared/config.yml");
conn.end();
