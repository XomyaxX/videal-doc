#!/usr/bin/env node
/** Send NAS backup status mail via studio SMTP from AppSettings. No Next.js. */
import { createDecipheriv, createHash } from "crypto";
import { readFileSync, existsSync } from "fs";
import { spawnSync } from "child_process";
import { createRequire } from "module";

const PREFIX = "enc:v1:";
const APP = process.env.VIDEAL_EDO_ROOT || "/srv/videal-edo";
const ENV_FILE = process.env.VIDEAL_EDO_ENV || `${APP}/.env`;
const DB = process.env.VIDEAL_EDO_DB || `${APP}/data/videal.db`;

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { to: "", subject: "", body: "", bodyFile: "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i] || "";
    if (a === "--to") out.to = next();
    else if (a === "--subject") out.subject = next();
    else if (a === "--body-file") out.bodyFile = next();
    else if (a === "--body") out.body = next();
  }
  return out;
}

function loadEnv(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function keysFromEnv(env) {
  const out = [];
  for (const raw of [env.SESSION_SECRET || "", env.SESSION_SECRET_PREV || ""]) {
    if (raw.length >= 16) out.push(createHash("sha256").update(raw).digest());
  }
  return out;
}

function revealSecret(stored, keyList) {
  const raw = stored || "";
  if (!raw.startsWith(PREFIX)) return raw;
  if (!keyList.length) return "";
  const parts = raw.slice(PREFIX.length).split(".");
  if (parts.length !== 3) return "";
  const [iv, tag, enc] = parts.map((p) => Buffer.from(p, "base64url"));
  for (const k of keyList) {
    try {
      const d = createDecipheriv("aes-256-gcm", k, iv);
      d.setAuthTag(tag);
      return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
    } catch {
      /* previous key */
    }
  }
  return "";
}

function sqliteJson(sql) {
  const r = spawnSync("sqlite3", ["-json", DB, sql], { encoding: "utf8" });
  if (r.status !== 0) die(`sqlite3: ${(r.stderr || r.stdout || "fail").trim()}`);
  return JSON.parse(r.stdout || "[]");
}

function domainSmtp(email) {
  const domain = String(email.split("@")[1] || "").toLowerCase();
  if (["mail.ru", "bk.ru", "list.ru", "inbox.ru", "internet.ru"].includes(domain)) {
    return { host: "smtp.mail.ru", port: 465 };
  }
  if (["yandex.ru", "yandex.com", "ya.ru"].includes(domain)) {
    return { host: "smtp.yandex.ru", port: 465 };
  }
  if (["gmail.com", "googlemail.com"].includes(domain)) {
    return { host: "smtp.gmail.com", port: 587 };
  }
  return null;
}

function accounts(env) {
  const keyList = keysFromEnv(env);
  const out = [];
  const seen = new Set();
  const add = (host, port, user, password, from, label) => {
    const u = String(user || "").trim();
    const p = revealSecret(String(password || ""), keyList);
    const f = String(from || u).trim();
    const h = String(host || "").trim();
    if (!h || !u || !p || !f) return;
    const id = `${h}|${u}|${f}`;
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ host: h, port: Number(port) || 465, user: u, password: p, from: f, label });
  };

  const settings = sqliteJson(
    "SELECT smtpHost, smtpPort, smtpUser, smtpPassword, smtpFrom FROM AppSettings WHERE id='default';",
  )[0];
  const fallbackHost = settings ? String(settings.smtpHost || "").trim() : "";
  const fallbackPort = settings ? Number(settings.smtpPort) || 465 : 465;
  const users = sqliteJson(
    "SELECT email, smtpPassword FROM User WHERE deletedAt IS NULL AND smtpPassword != '' AND email != '';",
  );
  for (const u of users) {
    const preset = domainSmtp(u.email) || (fallbackHost ? { host: fallbackHost, port: fallbackPort } : null);
    if (!preset) continue;
    add(preset.host, preset.port, u.email, u.smtpPassword, u.email, u.email);
  }
  if (settings) {
    add(
      settings.smtpHost,
      settings.smtpPort,
      settings.smtpUser,
      settings.smtpPassword,
      settings.smtpFrom || settings.smtpUser,
      "studio",
    );
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const to = (args.to || process.env.NOTIFY_EMAIL || "").trim();
  const subject = (args.subject || "").trim();
  let body = args.body || "";
  if (args.bodyFile) body = readFileSync(args.bodyFile, "utf8");
  if (!body) body = readFileSync(0, "utf8");
  if (!to.includes("@")) die("need --to");
  if (!subject) die("need --subject");
  if (!body.trim()) die("empty body");

  const env = loadEnv(ENV_FILE);
  const list = accounts(env);
  if (!list.length) die("SMTP not configured in AppSettings or user profiles");

  const require = createRequire(`${APP}/package.json`);
  const nodemailer = require("nodemailer");
  const errors = [];
  for (const acc of list) {
    try {
      const transport = nodemailer.createTransport({
        host: acc.host,
        port: acc.port,
        secure: acc.port === 465,
        auth: { user: acc.user, pass: acc.password },
      });
      await transport.sendMail({ from: acc.from, to, subject, text: body });
      console.log(`sent to ${to} via ${acc.label}`);
      return;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${acc.label}: ${msg}`);
    }
  }
  die(errors.join(" | "));
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
