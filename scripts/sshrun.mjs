import { Client } from "ssh2";
import { requireSsh } from "./ssh-env.mjs";

const { host, username, password } = requireSsh();
const cmds = process.argv.slice(2).join(" ") || "uname -a";
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
  conn.exec(cmds, { pty: true }, (err, stream) => {
    if (err) return reject(err);
    stream.on("data", (d) => process.stdout.write(d));
    stream.stderr.on("data", (d) => process.stderr.write(d));
    stream.on("close", (code) => (code ? reject(new Error("exit " + code)) : resolve()));
  });
});
conn.end();
