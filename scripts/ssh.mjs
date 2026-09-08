import { Client } from "ssh2";
import { requireSsh } from "./ssh-env.mjs";

const { host, username, password } = requireSsh();
const command = process.argv.slice(2).join(" ") || "uname -a; echo ---; command -v node; command -v nginx; command -v docker; echo ---; ls -la ~; echo ---; df -h";

const conn = new Client();
conn
  .on("ready", () => {
    conn.exec(command, (err, stream) => {
      if (err) {
        console.error(err);
        conn.end();
        process.exit(1);
      }
      stream.on("data", (d) => process.stdout.write(d));
      stream.stderr.on("data", (d) => process.stderr.write(d));
      stream.on("close", (code) => {
        conn.end();
        process.exit(code ?? 0);
      });
    });
  })
  .on("keyboard-interactive", (_n, _i, _l, prompts, finish) => {
    finish(prompts.map(() => password));
  })
  .on("error", (e) => {
    console.error(e.message);
    process.exit(1);
  })
  .connect({
    host,
    port: 22,
    username,
    password,
    tryKeyboard: true,
    readyTimeout: 15000,
  });
