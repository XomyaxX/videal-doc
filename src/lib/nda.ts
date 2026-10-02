import { readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { prisma } from "./prisma";
import { saveUpload } from "./files";
import { indexPersonDocument } from "./archive";
import { inferGender } from "./gender";
import { fullName, shortName } from "./names";
import { OFFICE_TZ } from "./dates";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

const INTRO =
  ", __.__._____ года рождения, действующая на основании паспорта серии _____ № ______ выданного ______________ __.__.____ г., именуемая в дальнейшем ";
const REQUISITES =
  ", __.__.____ года рождения, паспорт серии _____ № ______ выдан ___________ __.__.______ ";
const ADDRESS = " по адресу: г. ______, ул. _______, д. ___, кв. ____";

export type NdaPassport = {
  series: string;
  number: string;
  issuedBy: string;
  issuedAt: string;
  city: string;
  street: string;
  house: string;
  flat: string;
};

type NdaPerson = {
  lastName: string;
  firstName: string;
  middleName?: string | null;
  gender?: string | null;
  login?: string | null;
  birthDate?: Date | null;
  hiredAt?: Date | null;
  createdAt?: Date | null;
  passport?: NdaPassport | null;
};

const EMPTY_PASSPORT: NdaPassport = {
  series: "",
  number: "",
  issuedBy: "",
  issuedAt: "",
  city: "",
  street: "",
  house: "",
  flat: "",
};

function clip(value: unknown, max: number) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isoDate(value: unknown) {
  const s = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

export function cleanNdaPassport(raw: unknown): NdaPassport {
  const obj =
    raw && typeof raw === "object"
      ? (raw as Record<string, unknown>)
      : {};
  return {
    series: clip(obj.series, 12).replace(/\s/g, ""),
    number: clip(obj.number, 12).replace(/\s/g, ""),
    issuedBy: clip(obj.issuedBy, 180),
    issuedAt: isoDate(obj.issuedAt),
    city: clip(obj.city, 80),
    street: clip(obj.street, 80),
    house: clip(obj.house, 24),
    flat: clip(obj.flat, 24),
  };
}

export function parseNdaPassport(raw: string | null | undefined): NdaPassport {
  if (!raw) return { ...EMPTY_PASSPORT };
  try {
    return cleanNdaPassport(JSON.parse(raw));
  } catch {
    return { ...EMPTY_PASSPORT };
  }
}

export function ndaPassportMissing(passport: NdaPassport) {
  if (!passport.series || !passport.number || !passport.issuedBy || !passport.issuedAt) {
    return "Нужны серия и номер паспорта, кем выдан и дата выдачи";
  }
  if (!passport.city || !passport.street || !passport.house) {
    return "Нужны город, улица и дом регистрации";
  }
  return "";
}

function xmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function once(xml: string, from: string, to: string) {
  const count = xml.split(from).length - 1;
  if (count !== 1) throw new Error(`Шаблон NDA: «${from.slice(0, 40)}» встретилось ${count} раз`);
  return xml.replace(from, to);
}

function birthDots(d: Date | null | undefined) {
  if (!d || Number.isNaN(d.getTime())) return "";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}.${month}.${d.getUTCFullYear()}`;
}

function dotsFromIso(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

function slot(value: string, blank: string) {
  const v = value.trim();
  return v ? xmlEscape(v) : blank;
}

function officeParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: OFFICE_TZ,
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(d);
  const day = parts.find((p) => p.type === "day")?.value || "";
  const month = Number(parts.find((p) => p.type === "month")?.value || "1");
  const year = parts.find((p) => p.type === "year")?.value || "";
  return { day, monthName: MONTHS[month - 1] || "января", year };
}

export function fillNdaXml(xml: string, person: NdaPerson) {
  const gender =
    person.gender === "m" || person.gender === "f" ? person.gender : inferGender(person);
  const female = gender !== "m";
  const name = xmlEscape(fullName(person));
  const sign = xmlEscape(shortName(person));
  const born = birthDots(person.birthDate);
  const when = person.hiredAt && !Number.isNaN(person.hiredAt.getTime()) ? person.hiredAt : person.createdAt || new Date();
  const date = officeParts(when);
  const who = female ? "действующая" : "действующий";
  const named = female ? "именуемая" : "именуемый";
  const pass = person.passport || EMPTY_PASSPORT;
  const issued = dotsFromIso(pass.issuedAt);
  const intro = `, ${born || "__.__._____"} года рождения, ${who} на основании паспорта серии ${slot(pass.series, "_____")} № ${slot(pass.number, "______")} выданного ${slot(pass.issuedBy, "______________")} ${issued || "__.__.____"} г., ${named} в дальнейшем `;
  const requisites = `, ${born || "__.__.____"} года рождения, паспорт серии ${slot(pass.series, "_____")} № ${slot(pass.number, "______")} выдан ${slot(pass.issuedBy, "___________")} ${issued || "__.__.______"} `;
  const address = ` по адресу: г. ${slot(pass.city, "______")}, ул. ${slot(pass.street, "_______")}, д. ${slot(pass.house, "___")}, кв. ${slot(pass.flat, "____")}`;

  let next = xml;
  next = once(next, "____ФИО__________", name);
  next = once(next, "___ФИО", name);
  next = once(next, "_____________/ФИО/", `_____________/${sign}/`);
  next = once(next, INTRO, intro);
  next = once(next, REQUISITES, requisites);
  next = once(next, ADDRESS, address);
  next = once(next, "«__»", `«${date.day}»`);
  next = once(next, "августа ", `${date.monthName} `);
  next = once(next, "2026 г.", `${date.year} г.`);
  if (female) next = once(next, ">Зарегистрирован</w:t>", ">Зарегистрирована</w:t>");
  return next;
}

export async function fillNdaDocx(person: NdaPerson, template?: Buffer) {
  const raw = template || (await readFile(path.join(process.cwd(), "templates", "nda.docx")));
  const zip = await JSZip.loadAsync(raw);
  const file = zip.file("word/document.xml");
  if (!file) throw new Error("В шаблоне NDA нет текста");
  const xml = fillNdaXml(await file.async("string"), person);
  zip.file("word/document.xml", xml);
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

export async function issueEmployeeNda(userId: string, patch?: NdaPassport | null) {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      login: true,
      lastName: true,
      firstName: true,
      middleName: true,
      gender: true,
      birthDate: true,
      hiredAt: true,
      createdAt: true,
    },
  });
  if (!user) return null;
  const stored = await prisma.personDocument.findUnique({
    where: {
      userId_kind_source_sourceId: {
        userId: user.id,
        kind: "nda",
        source: "hire",
        sourceId: user.id,
      },
    },
    select: { metaJson: true },
  });
  const passport = patch || parseNdaPassport(stored?.metaJson);
  const buffer = await fillNdaDocx({ ...user, passport });
  const originalName = `Соглашение о неразглашении — ${shortName(user)}.docx`;
  const saved = await saveUpload({
    buffer,
    originalName,
    declaredMime: DOCX_MIME,
    userId: user.id,
    maxBytes: 20 * 1024 * 1024,
  });
  const when = user.hiredAt && !Number.isNaN(user.hiredAt.getTime()) ? user.hiredAt : new Date();
  await indexPersonDocument({
    userId: user.id,
    kind: "nda",
    title: `Соглашение о неразглашении — ${shortName(user)}`,
    occurredAt: when,
    source: "hire",
    sourceId: user.id,
    fileId: saved.id,
    buffer,
    originalName,
    mimeType: DOCX_MIME,
    link: `/employees/${user.id}/nda`,
    replaceFile: true,
    meta: {
      series: passport.series,
      number: passport.number,
      issuedBy: passport.issuedBy,
      issuedAt: passport.issuedAt,
      city: passport.city,
      street: passport.street,
      house: passport.house,
      flat: passport.flat,
    },
  });
  return { fileId: saved.id };
}
