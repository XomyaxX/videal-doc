import { createHash, randomUUID } from "crypto";
import { spawn } from "child_process";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { tmpdir } from "os";
import { prisma } from "./prisma";
import { fileRoot } from "./files";
import { deliverMeetingSummary } from "./meet-deliver";
import { applyMeetGlossary, lineLooksBroken } from "./meet-glossary";
import { llmFetch } from "./llm-proxy";

function groqBase() {
  return (process.env.GROQ_STT_BASE || "https://api.groq.com/openai/v1").replace(/\/$/, "");
}

const CHUNK = 24 * 1024 * 1024;

const running = new Set<string>();

function groqKey() {
  return process.env.GROQ_API_KEY || "";
}

export async function saveMeetingRecording(opts: {
  buffer: Buffer;
  originalName: string;
  mime: string;
  userId: string;
  maxBytes: number;
}) {
  if (!opts.buffer.length) throw new Error("Пустой файл");
  if (opts.buffer.length > opts.maxBytes) throw new Error("Файл слишком большой");
  const ext = path.extname(opts.originalName).toLowerCase();
  const ok = [".mp3", ".m4a", ".wav", ".ogg", ".webm", ".mp4", ".mpeg", ".mpga"].includes(ext);
  if (!ok) throw new Error("Нужен звук или видео: mp3, m4a, wav, webm, mp4");
  const id = randomUUID();
  const rel = `${id}${ext || ".mp3"}`;
  const dir = fileRoot();
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(/* turbopackIgnore: true */ dir, rel), opts.buffer);
  return prisma.storedFile.create({
    data: {
      id,
      originalName: path.basename(opts.originalName).slice(0, 200),
      mimeType: opts.mime || "audio/mpeg",
      size: opts.buffer.length,
      path: rel,
      sha256: createHash("sha256").update(opts.buffer).digest("hex"),
      createdById: opts.userId,
    },
  });
}

export function kickMeetingJob(id: string) {
  if (running.has(id)) return;
  running.add(id);
  void processMeeting(id).finally(() => running.delete(id));
}

export async function tickMeetJobs() {
  if (running.size) return;
  const rows = await prisma.meeting.findMany({
    where: { deletedAt: null, summaryStatus: { in: ["recording_uploaded", "transcribing", "summarizing"] } },
    select: { id: true },
    take: 1,
  });
  for (const r of rows) kickMeetingJob(r.id);
}

async function setJob(
  id: string,
  data: { summaryStatus?: string; summaryError?: string; summaryProgress?: number; transcript?: string },
) {
  await prisma.meeting.update({ where: { id }, data });
}

async function processMeeting(id: string) {
  const meet = await prisma.meeting.findUnique({ where: { id } });
  if (!meet || !meet.recordingFileId) return;
  try {
    if (!meet.transcript) {
      await setJob(id, { summaryStatus: "transcribing", summaryError: "расшифровка…", summaryProgress: 8 });
      const rec = await prisma.storedFile.findUnique({ where: { id: meet.recordingFileId } });
      if (!rec) throw new Error("Файл записи не найден");
      const { readStoredFile } = await import("./files");
      let tracks: { fileId: string; name: string }[] = [];
      try {
        tracks = JSON.parse(meet.recordingTracks || "[]");
      } catch {
        tracks = [];
      }
      let text = "";
      if (Array.isArray(tracks) && tracks.length >= 2) {
        await setJob(id, { summaryError: "расшифровка по дорожкам…", summaryProgress: 15 });
        text = await transcribeTracks(tracks);
      } else {
        const packed = await readStoredFile(rec.id);
        if (!packed) throw new Error("Не прочитать запись");
        if (meet.recordingStereo) {
          await setJob(id, { summaryError: "расшифровка…", summaryProgress: 15 });
          text = await transcribe(packed.buffer, rec.originalName, rec.mimeType, groqKey(), {
            stereo: true,
            left: meet.speakerLeft || "Организатор",
            right: meet.speakerRight || "Участники",
          });
        } else {
          await setJob(id, { summaryError: "расшифровка и разметка голосов…", summaryProgress: 20 });
          const dia = await transcribeDiarized(packed.buffer, rec.originalName);
          text = dia.text;
        }
      }
      if (!text.trim()) throw new Error("Пустая расшифровка");
      await setJob(id, { summaryProgress: 52 });
      const people = await prisma.meeting.findUnique({
        where: { id },
        include: {
          author: { select: { lastName: true, firstName: true } },
          participants: { include: { user: { select: { lastName: true, firstName: true } } } },
          guests: { select: { name: true } },
        },
      });
      const names = [
        people?.author ? `${people.author.lastName} ${people.author.firstName}`.trim() : "",
        ...(people?.participants || []).map((p) => `${p.user.lastName} ${p.user.firstName}`.trim()),
        ...(people?.guests || []).map((g) => g.name),
      ].filter(Boolean);
      if (names.length && /Спикер\s+\d/.test(text)) {
        await setJob(id, { summaryError: "подписываем реплики (Gemini)…", summaryProgress: 58 });
        text = await mapSpeakerNames(text, names);
      }
      await setJob(id, { summaryError: "правим расшифровку (Gemini)…", summaryProgress: 62 });
      text = await polishTranscript(text, (p) => setJob(id, { summaryError: "правим расшифровку (Gemini)…", summaryProgress: p }));
      await setJob(id, { transcript: text, summaryStatus: "summarizing", summaryError: "собираем сводку (Gemini)…", summaryProgress: 88 });
    } else {
      await setJob(id, { summaryStatus: "summarizing", summaryError: "собираем сводку (Gemini)…", summaryProgress: 88 });
    }
    const row = await prisma.meeting.findUnique({ where: { id } });
    if (!row?.transcript) throw new Error("Пустой транскрипт");
    const { json, md } = await summarize(row.transcript, row.title, (p, label) =>
      setJob(id, { summaryError: label, summaryProgress: p }),
    );
    await prisma.meeting.update({
      where: { id },
      data: {
        summaryJson: JSON.stringify(json),
        summaryMarkdown: md,
        summaryStatus: "ready",
        summaryError: "",
        summaryProgress: 100,
      },
    });
    await deliverMeetingSummary(id);
  } catch (e) {
    await prisma.meeting.update({
      where: { id },
      data: { summaryStatus: "failed", summaryError: e instanceof Error ? e.message.slice(0, 500) : "Ошибка" },
    });
  }
}

async function transcribe(
  buf: Buffer,
  name: string,
  mime: string,
  key: string,
  speakers?: { stereo?: boolean; left?: string; right?: string },
) {
  if (process.env.GROQ_STT === "1" && key) {
    try {
      return await transcribeGroq(buf, name, mime, key);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (!/403|forbidden|401|unavailable|region/i.test(msg)) throw e;
    }
  }
  return transcribeLocal(buf, name, speakers);
}

async function transcribeDiarized(buf: Buffer, name: string) {
  const ext = path.extname(name || ".mp3") || ".mp3";
  const tmp = path.join(/* turbopackIgnore: true */ tmpdir(), `vd-dia-${randomUUID()}${ext}`);
  await writeFile(tmp, buf);
  const py = process.env.WHISPER_PY || "python3";
  const script = path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "diarize-merge.py");
  const lang = process.env.GROQ_STT_LANGUAGE || "ru";
  const size = process.env.WHISPER_MODEL || "small";
  const env = { ...process.env };
  const r = await new Promise<{ code: number; out: string; err: string }>((resolve) => {
    const p = spawn(py, [script, tmp, lang, size], { env });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => {
      out += String(d);
    });
    p.stderr.on("data", (d) => {
      err += String(d);
    });
    p.on("error", (e) => resolve({ code: 1, out, err: e.message }));
    p.on("close", (code) => resolve({ code: code || 0, out, err }));
  });
  await unlink(tmp).catch(() => {});
  if (r.code !== 0) throw new Error(r.err.slice(0, 300) || "Диаризация не запустилась");
  return { text: r.out.trim(), log: r.err };
}

async function transcribeTracks(tracks: { fileId: string; name: string }[]) {
  const { readStoredFile } = await import("./files");
  const dir = path.join(/* turbopackIgnore: true */ tmpdir(), `vd-tracks-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  const args = ["--tracks", process.env.GROQ_STT_LANGUAGE || "ru", process.env.WHISPER_MODEL || "small"];
  const temps: string[] = [];
  try {
    for (const t of tracks) {
      const packed = await readStoredFile(t.fileId);
      if (!packed) continue;
      const ext = path.extname(packed.rec.originalName || ".webm") || ".webm";
      const p = path.join(/* turbopackIgnore: true */ dir, `${temps.length}${ext}`);
      await writeFile(p, packed.buffer);
      temps.push(p);
      args.push(p, (t.name || "Участник").slice(0, 80));
    }
    if (temps.length < 1) throw new Error("Нет дорожек записи");
    const py = process.env.WHISPER_PY || "python3";
    const script = path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "whisper-local.py");
    const r = await runCmd(py, [script, ...args]);
    if (r.code !== 0) throw new Error(r.err.slice(0, 240) || "Whisper по дорожкам не запустился");
    const text = r.out.trim();
    if (!text) throw new Error("Пустая расшифровка дорожек");
    return text;
  } finally {
    for (const p of temps) await unlink(p).catch(() => {});
  }
}

async function transcribeGroq(buf: Buffer, name: string, mime: string, key: string) {
  const parts = splitBuf(buf, CHUNK);
  const texts: string[] = [];
  for (const part of parts) {
    const fd = new FormData();
    fd.set("file", new Blob([new Uint8Array(part)], { type: mime || "audio/mpeg" }), name || "audio.mp3");
    fd.set("model", process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo");
    fd.set("language", process.env.GROQ_STT_LANGUAGE || "ru");
    fd.set("response_format", "text");
    const res = await llmFetch(`${groqBase()}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: fd,
    });
    const t = await res.text();
    if (!res.ok) throw new Error(parseGroqErr(t, res.status));
    texts.push(t.trim());
  }
  return texts.join("\n").trim();
}

function runCmd(cmd: string, args: string[], cwd?: string) {
  return new Promise<{ code: number; out: string; err: string }>((resolve) => {
    const p = spawn(cmd, args, { cwd });
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => {
      out += String(d);
    });
    p.stderr.on("data", (d) => {
      err += String(d);
    });
    p.on("error", (e) => resolve({ code: 1, out, err: e.message }));
    p.on("close", (code) => resolve({ code: code || 0, out, err }));
  });
}

async function transcribeLocal(buf: Buffer, name: string, speakers?: { stereo?: boolean; left?: string; right?: string }) {
  const ext = path.extname(name || ".mp3") || ".mp3";
  const tmp = path.join(/* turbopackIgnore: true */ tmpdir(), `vd-stt-${randomUUID()}${ext}`);
  await writeFile(tmp, buf);
  const py = process.env.WHISPER_PY || "python3";
  const script = path.join(/* turbopackIgnore: true */ process.cwd(), "scripts", "whisper-local.py");
  const lang = process.env.GROQ_STT_LANGUAGE || "ru";
  const size = process.env.WHISPER_MODEL || "small";
  const left = (speakers?.left || "Организатор").slice(0, 80);
  const right = (speakers?.right || "Участники").slice(0, 80);
  const stereo = speakers?.stereo ? "1" : "0";
  const r = await runCmd(py, [script, tmp, lang, size, left, right, stereo]);
  await unlink(tmp).catch(() => {});
  if (r.code !== 0) {
    throw new Error(
      `Локальный Whisper: ${r.err.slice(0, 240) || r.out.slice(0, 240) || "не запустился"}. Groq из РФ отвечает Forbidden.`,
    );
  }
  const text = r.out.trim();
  if (!text) throw new Error("Локальный Whisper вернул пустой текст");
  return text;
}

function splitBuf(buf: Buffer, size: number) {
  if (buf.length <= size) return [buf];
  const out: Buffer[] = [];
  for (let i = 0; i < buf.length; i += size) out.push(buf.subarray(i, i + size));
  return out;
}

function lineSec(line: string) {
  const m = line.match(/^\[(\d{1,2}):(\d{2})\]/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
}

function transcriptWindows(transcript: string) {
  const lines = transcript.split(/\r?\n/).filter((l) => l.trim());
  const buckets: string[] = [];
  let cur: string[] = [];
  let start = 0;
  for (const line of lines) {
    const sec = lineSec(line);
    if (!cur.length) start = sec;
    const tooLong = cur.join("\n").length > 7000 || (sec - start >= 12 * 60 && cur.length >= 4);
    if (tooLong) {
      buckets.push(cur.join("\n"));
      cur = [line];
      start = sec;
    } else cur.push(line);
  }
  if (cur.length) buckets.push(cur.join("\n"));
  return buckets.length ? buckets : [transcript];
}

async function summarizeWindow(clip: string, title: string, part: string) {
  const body = clip.replace(/\[\d{1,2}:\d{2}\]\s*/g, "").slice(0, 9000);
  const prompt = `По куску расшифровки студии «Видиал Медиа» заполни JSON. Только то, что сказано в этом куске. Не выдумывай факты, имена, решения.
Тема встречи: ${title}
${part}

Формат:
{"title":"короткий заголовок куска","theses":["тезис"],"decisions":[],"actions":[{"title":"только явное поручение","brief":"","ownerHint":"","due":""}],"open_questions":[],"risks":[],"summaryMarkdown":"2-5 предложений по этому куску"}

theses: о чём говорили в куске (1-6 пунктов). Пустые массивы — нормально, если решений или поручений не было.
actions: только «сделайте / поручаем / нужно к сроку». Интервью и мнения — не задачи.

Кусок:
${body}`;
  const raw = await chatComplete(prompt, "json");
  try {
    if (raw) return extractJson(raw);
  } catch {
    /* fallback below */
  }
  return {
    ...emptySummary(title),
    theses: fallbackTheses(clip).slice(0, 4),
    summaryMarkdown: fallbackParagraph(clip),
  };
}

async function summarize(transcript: string, title: string, onProgress?: (pct: number, label: string) => Promise<void>) {
  const windows = transcriptWindows(transcript);
  const parts: ReturnType<typeof extractJson>[] = [];
  for (let i = 0; i < windows.length; i++) {
    const pct = 88 + Math.round(((i + 1) / windows.length) * 8);
    if (onProgress) await onProgress(pct, `сводка ${i + 1} из ${windows.length}…`).catch(() => {});
    parts.push(await summarizeWindow(windows[i], title, windows.length > 1 ? `Это часть ${i + 1} из ${windows.length}.` : ""));
  }
  let json = parts[0] || emptySummary(title);
  if (parts.length > 1) {
    if (onProgress) await onProgress(97, "склеиваем сводку…").catch(() => {});
    const prompt = `Склей JSON-сводки окон одного совещания студии «Видиал Медиа» в один JSON. Не добавляй факты, которых нет во входных объектах. theses 4-10 уникальных. actions только явные поручения.
Формат тот же: title, theses, decisions, actions[{title,brief,ownerHint,due}], open_questions, risks, summaryMarkdown (абзац на всю встречу).

Окна:
${JSON.stringify(parts.map((p) => ({ title: p.title, theses: p.theses, decisions: p.decisions, actions: p.actions, open_questions: p.open_questions, risks: p.risks }))).slice(0, 14000)}`;
    const raw = await chatComplete(prompt, "json");
    try {
      if (raw) json = extractJson(raw);
    } catch {
      json = {
        title: title || parts[0].title,
        theses: parts.flatMap((p) => p.theses).slice(0, 10),
        decisions: parts.flatMap((p) => p.decisions).slice(0, 8),
        actions: parts.flatMap((p) => p.actions).slice(0, 8),
        open_questions: parts.flatMap((p) => p.open_questions).slice(0, 8),
        risks: parts.flatMap((p) => p.risks).slice(0, 6),
        summaryMarkdown: parts.map((p) => p.summaryMarkdown).filter(Boolean).join("\n\n"),
      };
    }
  }
  if (!json.theses.length) {
    json.theses = fallbackTheses(transcript);
    json.title = json.title || title || "Сводка разговора";
    json.summaryMarkdown = json.summaryMarkdown || fallbackParagraph(transcript);
  }
  const md = String(json.summaryMarkdown || "") || defaultMd(json);
  json.summaryMarkdown = md;
  return { json, md };
}

function emptySummary(title: string) {
  return {
    title: title || "Сводка",
    theses: [] as string[],
    decisions: [] as string[],
    actions: [] as { task: string; brief: string; owner: string; due: string }[],
    open_questions: [] as string[],
    risks: [] as string[],
    summaryMarkdown: "",
  };
}

function fallbackTheses(transcript: string) {
  const parts = transcript
    .replace(/\[\d{1,2}:\d{2}\]\s*/g, "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 50 && s.length <= 260)
    .filter((s) => !/^(так|ну|ладно|подожди)\b/i.test(s));
  const uniq: string[] = [];
  for (const p of parts) {
    if (!uniq.some((u) => u.slice(0, 40) === p.slice(0, 40))) uniq.push(p);
    if (uniq.length >= 8) break;
  }
  return uniq;
}

function fallbackParagraph(transcript: string) {
  const t = transcript.replace(/\s+/g, " ").trim();
  if (t.length <= 900) return t;
  return t.slice(0, 880).replace(/\s+\S*$/, "") + "…";
}

function stampCount(s: string) {
  return (s.match(/\[\d{1,2}:\d{2}\]/g) || []).length;
}

function polishLooksSafe(src: string, got: string) {
  const a = src.trim();
  const b = got.trim().split(/\n/)[0]?.trim() || "";
  if (!b) return false;
  if (b.length < a.length * 0.4 || b.length > a.length * 1.8) return false;
  if (stampCount(a) && !stampCount(b)) return false;
  return true;
}

const POLISH_CAP = 12;

async function polishTranscript(text: string, onProgress?: (pct: number) => Promise<void>) {
  const lines = applyMeetGlossary(text).split(/\r?\n/);
  const hits = lines.map((line, i) => ({ i, line })).filter((x) => lineLooksBroken(x.line)).slice(0, POLISH_CAP);
  if (!hits.length) {
    if (onProgress) await onProgress(84).catch(() => {});
    return lines.join("\n");
  }
  for (let n = 0; n < hits.length; n++) {
    const { i, line } = hits[n];
    const pct = 62 + Math.round(((n + 1) / hits.length) * 22);
    if (onProgress) await onProgress(pct).catch(() => {});
    const prompt = `Исправь одну строку расшифровки студии «Видиал Медиа». Компания — «Видиал Медиа». «в костях» в смысле гостей → «в гостях».
Сохрани таймкод [мм:сс] и имя до двоеточия. Не добавляй слов от себя. Если не уверен — верни строку как есть. Только одна строка, без кавычек и JSON.

${line}`;
    let got = "";
    try {
      got = (await chatComplete(prompt, "text")).trim();
    } catch (e) {
      throw new Error(`правка не прошла: ${e instanceof Error ? e.message : "Gemini"}`);
    }
    if (got.startsWith("```")) got = got.replace(/^```[a-z]*\s*/i, "").replace(/\s*```$/, "").trim();
    lines[i] = polishLooksSafe(line, got) ? applyMeetGlossary(got.split(/\n/)[0] || line) : line;
  }
  return lines.join("\n");
}

async function mapSpeakerNames(transcript: string, names: string[]) {
  const prompt = `В расшифровке реплики подписаны «Спикер 1», «Спикер 2» и т.д. Возможные имена: ${names.join(", ")}.
Верни JSON без markdown: {"Спикер 1":"Фамилия Имя или пусто","Спикер 2":""}
Подставляй имя ТОЛЬКО если из текста ясно (представились, к человеку обратились по имени). Иначе пустая строка. Не выдумывай.

Расшифровка:
${transcript.slice(0, 12000)}`;
  const raw = await chatComplete(prompt);
  if (!raw) return transcript;
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const map = JSON.parse(start >= 0 ? raw.slice(start, end + 1) : raw) as Record<string, string>;
    let out = transcript;
    for (const [k, v] of Object.entries(map)) {
      const name = String(v || "").trim();
      if (!name || !/^Спикер\s+\d+$/.test(k)) continue;
      out = out.split(`${k}:`).join(`${name}:`);
    }
    return out;
  } catch {
    return transcript;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function chatComplete(prompt: string, mode: "json" | "text" = "json") {
  const g = await geminiChat(prompt, mode);
  if (g) return g;
  throw new Error("Gemini не ответил. Проверьте videal-proxy и ключ.");
}

async function geminiChat(prompt: string, mode: "json" | "text" = "json") {
  const key = process.env.GEMINI_API_KEY || "";
  if (!key) throw new Error("Нет GEMINI_API_KEY");
  const models = [...new Set([process.env.GEMINI_MODEL || "gemini-3.6-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"])];
  let last = "";
  for (const model of models) {
    for (const jsonMime of mode === "json" ? [true, false] : [false]) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
          const res = await llmFetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.2,
                maxOutputTokens: 8192,
                ...(jsonMime ? { responseMimeType: "application/json" } : {}),
              },
            }),
          });
          const data = await res.json().catch(() => ({}));
          const msg = String(data.error?.message || "");
          if (res.status === 429) {
            last = "лимит Gemini 429";
            await sleep(800 * (attempt + 1));
            continue;
          }
          if (!res.ok) {
            last = msg || `Gemini ${res.status}`;
            break;
          }
          const text = String(data.candidates?.[0]?.content?.parts?.[0]?.text || "");
          if (text) return text;
          last = "пустой ответ Gemini";
        } catch (e) {
          last = e instanceof Error ? e.message : "сеть Gemini";
          await sleep(400 * (attempt + 1));
        }
      }
    }
  }
  throw new Error(last || "Gemini не ответил");
}

function extractJson(raw: string) {
  const t = raw.trim().replace(/^```json\s*|\s*```$/g, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  const parsed = JSON.parse(start >= 0 ? t.slice(start, end + 1) : t);
  return {
    title: String(parsed.title || ""),
    theses: arr(parsed.theses),
    decisions: arr(parsed.decisions),
    actions: Array.isArray(parsed.actions)
      ? parsed.actions.map((a: { task?: string; title?: string; brief?: string; owner?: string; ownerHint?: string; due?: string }) => ({
          task: String(a?.title || a?.task || ""),
          brief: String(a?.brief || ""),
          owner: String(a?.ownerHint || a?.owner || ""),
          due: String(a?.due || ""),
        }))
      : [],
    open_questions: arr(parsed.open_questions),
    risks: arr(parsed.risks),
    summaryMarkdown: String(parsed.summaryMarkdown || ""),
  };
}

function arr(v: unknown) {
  return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
}

function defaultMd(j: ReturnType<typeof extractJson>) {
  const lines = [`# ${j.title || "Сводка совещания"}`, ""];
  if (j.theses.length) lines.push("## Тезисы", ...j.theses.map((x) => `- ${x}`), "");
  if (j.decisions.length) lines.push("## Решения", ...j.decisions.map((x) => `- ${x}`), "");
  if (j.actions.length) {
    lines.push(
      "## Задачи",
      ...j.actions.map((a: { task: string; owner: string; due: string }) => `- ${a.task}${a.owner ? ` (${a.owner})` : ""}${a.due ? ` · ${a.due}` : ""}`),
      "",
    );
  }
  if (j.open_questions.length) lines.push("## Открытые вопросы", ...j.open_questions.map((x) => `- ${x}`), "");
  if (j.risks.length) lines.push("## Риски", ...j.risks.map((x) => `- ${x}`), "");
  return lines.join("\n");
}

function parseGroqErr(t: string, status: number) {
  try {
    const j = JSON.parse(t);
    return j.error?.message || `Groq ${status}`;
  } catch {
    return t.slice(0, 200) || `Groq ${status}`;
  }
}
