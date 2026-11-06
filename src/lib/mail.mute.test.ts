/**
 * Mocked nodemailer and Prisma only. No network and no database.
 * Keep this file beside mail.ts so ./prisma resolves to the same module.
 *
 * node --experimental-test-module-mocks --test-concurrency=1 --import tsx --test src/lib/mail.mute.test.ts
 */
import assert from "node:assert/strict";
import { mock, test, before, beforeEach } from "node:test";

delete process.env.DATABASE_URL;
delete process.env.MAIL_MUTE_EMAILS;
delete process.env.MAIL_MUTE_USER_IDS;

const TARGET_ID = "cmtcvx67o000212mfy0mscbpc";
const TARGET_EMAIL = "l.zalutskaya@list.ru";

type SentMessage = {
  from?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  text?: string;
  attachments?: { filename?: string }[];
};

const sent: SentMessage[] = [];
const transports: { host?: string; port?: number }[] = [];
const userLookups: string[] = [];
const documentUpdates: { where?: { id?: string }; data?: { mailedAt?: Date } }[] = [];
const state = { mailAutoSend: true, settingsReads: 0 };
const errors: unknown[][] = [];

mock.module("nodemailer", {
  namedExports: {
    createTransport(opts: { host?: string; port?: number }) {
      transports.push({ host: opts?.host, port: opts?.port });
      return {
        async sendMail(msg: SentMessage) {
          sent.push(msg);
          return { messageId: "mock" };
        },
      };
    },
  },
});

mock.module("./prisma", {
  namedExports: {
    prisma: {
      appSettings: {
        async findUnique() {
          state.settingsReads += 1;
          return {
            id: "default",
            smtpHost: "127.0.0.1",
            smtpPort: 1,
            smtpUser: "studio@example.test",
            smtpPassword: "secret",
            smtpFrom: "Студия <studio@example.test>",
            imapPassword: "",
            fnsPassword: "",
            mailAutoSend: state.mailAutoSend,
          };
        },
      },
      user: {
        async findUnique(args: { where: { id: string } }) {
          const id = args.where.id;
          userLookups.push(id);
          if (id === TARGET_ID) {
            return {
              email: "renamed@example.com",
              smtpPassword: "app-pass",
              lastName: "Залуцкая",
              firstName: "Людмила",
              middleName: "Игоревна",
            };
          }
          if (id === "copied-address") return { email: "  L.Zalutskaya@List.Ru " };
          if (id === "no-mail") return { email: "" };
          return { email: "other@example.com" };
        },
      },
      personDocument: {
        async update(args: { where?: { id?: string }; data?: { mailedAt?: Date } }) {
          documentUpdates.push(args);
          return {};
        },
      },
    },
    async tuneSqlite() {},
  },
});

let sendMail!: (typeof import("./mail"))["sendMail"];
let sendMailToUser!: (typeof import("./mail"))["sendMailToUser"];

before(async () => {
  const mail = await import("./mail");
  sendMail = mail.sendMail;
  sendMailToUser = mail.sendMailToUser;
});

const base = { subject: "Тема", text: "Текст" };

function reset() {
  sent.length = 0;
  transports.length = 0;
  userLookups.length = 0;
  documentUpdates.length = 0;
  errors.length = 0;
  state.mailAutoSend = true;
  state.settingsReads = 0;
  delete process.env.MAIL_MUTE_EMAILS;
  delete process.env.MAIL_MUTE_USER_IDS;
  delete process.env.DATABASE_URL;
}

beforeEach(reset);

function assertMuted(result: { ok: boolean; muted?: boolean; error?: string; from?: string }) {
  assert.equal(result.ok, false);
  assert.equal(result.muted, true);
  assert.equal(result.from, undefined);
  assert.match(result.error || "", /отключён от исходящей рассылки/);
  assert.equal(sent.length, 0);
  assert.equal(transports.length, 0);
  assert.equal(documentUpdates.length, 0);
  assert.equal(errors.length, 0);
}

test("target address variants never reach the transport", async () => {
  const samples = [
    TARGET_EMAIL,
    "  L.Zalutskaya@LIST.ru  ",
    "Людмила Залуцкая <l.zalutskaya@list.ru>",
    '"Залуцкая, Людмила" <L.ZALUTSKAYA@list.ru>',
    "Залуцкая, Людмила <l.zalutskaya@list.ru>",
    { name: "Людмила Залуцкая", address: "l.zalutskaya@list.ru" },
  ];
  for (const to of samples) {
    reset();
    const result = await sendMail({ ...base, to });
    assertMuted(result);
    assert.equal(state.settingsReads, 0, String(to));
    assert.equal(userLookups.length, 0);
  }
});

test("sendMailToUser stays muted after the user email changes and does not mark mailedAt", async () => {
  const result = await sendMailToUser({
    ...base,
    userId: TARGET_ID,
    personDocumentId: "doc-lyudmila",
  });
  assertMuted(result);
  assert.equal(userLookups.length, 0);
  assert.equal(state.settingsReads, 0);
});

test("another user still gets exactly one mocked delivery and a mailedAt marker", async () => {
  const result = await sendMailToUser({
    ...base,
    userId: "other-user",
    personDocumentId: "doc-other",
    attachments: [{ filename: "note.txt", content: Buffer.from("x"), contentType: "text/plain" }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.muted, undefined);
  assert.equal(sent.length, 1);
  assert.equal(transports.length, 1);
  assert.equal(transports[0].host, "127.0.0.1");
  assert.equal(transports[0].port, 1);
  assert.equal(sent[0].to, "other@example.com");
  assert.equal(sent[0].subject, "Тема");
  assert.equal(sent[0].attachments?.[0]?.filename, "note.txt");
  assert.equal(documentUpdates.length, 1);
  assert.equal(documentUpdates[0].where?.id, "doc-other");
  assert.ok(documentUpdates[0].data?.mailedAt instanceof Date);
});

test("a direct copy of her address on another user is muted and not marked mailed", async () => {
  const result = await sendMailToUser({
    ...base,
    userId: "copied-address",
    personDocumentId: "doc-copy",
  });
  assertMuted(result);
  assert.equal(userLookups.length, 1);
});

test("mixed recipients keep everyone except the muted address", async () => {
  const result = await sendMail({
    ...base,
    to: 'Бухгалтер <other@example.com>, "Залуцкая, Людмила" <L.Zalutskaya@list.ru>, second@example.com',
    cc: "Людмила <l.zalutskaya@list.ru>; cc@example.com",
    bcc: ["bcc@example.com", "  l.zalutskaya@list.ru  "],
  });
  assert.equal(result.ok, true);
  assert.equal(result.muted, undefined);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "Бухгалтер <other@example.com>, second@example.com");
  assert.equal(sent[0].cc, "cc@example.com");
  assert.equal(sent[0].bcc, "bcc@example.com");
  const blob = `${sent[0].to} ${sent[0].cc} ${sent[0].bcc}`.toLowerCase();
  assert.equal(blob.includes(TARGET_EMAIL), false);
});

test("array and semicolon lists drop only the muted recipient", async () => {
  const result = await sendMail({
    ...base,
    to: ["keep@example.com", "l.zalutskaya@list.ru", "also@example.com"],
  });
  assert.equal(result.ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "keep@example.com, also@example.com");
  assert.equal(sent[0].cc, undefined);
  assert.equal(sent[0].bcc, undefined);

  reset();
  const semi = await sendMail({ ...base, to: "keep@example.com; L.Zalutskaya@list.ru" });
  assert.equal(semi.ok, true);
  assert.equal(sent[0].to, "keep@example.com");
});

test("her user id as the sender still delivers to other recipients", async () => {
  const result = await sendMail({
    ...base,
    to: "other@example.com",
    fromUserId: TARGET_ID,
  });
  assert.equal(result.ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "other@example.com");
  assert.match(sent[0].from || "", /Залуцкая/);
  assert.match(sent[0].from || "", /renamed@example.com/);
  assert.equal(transports[0].host, "127.0.0.1");
});

test("mailAutoSend still blocks other users and still allows a manual document send", async () => {
  state.mailAutoSend = false;
  const blocked = await sendMailToUser({ ...base, userId: "other-user" });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.muted, undefined);
  assert.equal(blocked.error, "Автоотправка писем выключена");
  assert.equal(sent.length, 0);

  const manual = await sendMailToUser({
    ...base,
    userId: "other-user",
    personDocumentId: "doc-manual",
  });
  assert.equal(manual.ok, true);
  assert.equal(sent.length, 1);
  assert.equal(documentUpdates.length, 1);
});

test("mute does not depend on mailAutoSend and does not log an SMTP error", async () => {
  const original = console.error;
  console.error = (...args: unknown[]) => {
    errors.push(args);
  };
  try {
    state.mailAutoSend = false;
    const result = await sendMailToUser({ ...base, userId: TARGET_ID, personDocumentId: "doc-lyudmila" });
    assertMuted(result);
    assert.notEqual(result.error, "Автоотправка писем выключена");
  } finally {
    console.error = original;
  }
});

test("builtin mute survives an empty env list and an extra address is additive", async () => {
  process.env.MAIL_MUTE_EMAILS = "";
  process.env.MAIL_MUTE_USER_IDS = "";
  const still = await sendMail({ ...base, to: TARGET_EMAIL });
  assertMuted(still);

  process.env.MAIL_MUTE_EMAILS = "extra@example.com";
  process.env.MAIL_MUTE_USER_IDS = "extra-user";
  reset();
  process.env.MAIL_MUTE_EMAILS = "extra@example.com";
  process.env.MAIL_MUTE_USER_IDS = "extra-user";

  const extra = await sendMail({ ...base, to: "Extra <EXTRA@example.com>" });
  assertMuted(extra);

  const builtin = await sendMail({ ...base, to: "Людмила <l.zalutskaya@list.ru>" });
  assertMuted(builtin);

  const byId = await sendMailToUser({ ...base, userId: "extra-user", personDocumentId: "doc-extra" });
  assertMuted(byId);
  assert.equal(userLookups.length, 0);

  const kept = await sendMail({ ...base, to: "other@example.com, extra@example.com" });
  assert.equal(kept.ok, true);
  assert.equal(sent[0].to, "other@example.com");
});

test("a quoted display name for someone else is preserved whole", async () => {
  const result = await sendMail({ ...base, to: '"Петров, Иван" <other@example.com>' });
  assert.equal(result.ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, '"Петров, Иван" <other@example.com>');
  assert.equal(documentUpdates.length, 0);
});

test("missing and foreign addresses keep the previous results", async () => {
  const missing = await sendMail({ ...base, to: "   " });
  assert.deepEqual(missing, { ok: false, error: "Нет email" });
  assert.equal(sent.length, 0);
  assert.equal(state.settingsReads, 0);

  const none = await sendMailToUser({ ...base, userId: "no-mail" });
  assert.equal(none.ok, false);
  assert.equal(none.error, "У сотрудника не указан email");
  assert.equal(sent.length, 0);
  assert.equal(documentUpdates.length, 0);
});
