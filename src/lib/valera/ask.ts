import { rateLimit } from "../login-guard";
import { allowedPaths, introAnswer, rankCards, VALERA_NONE, visibleCards, type ValeraCard } from "./cards";

export const VALERA_BUSY = "Валера занят, повтори через минуту.";
export const VALERA_LATER = "Развёрнутый ответ придёт позже.";
const VALERA_LOOK = "Смотрю по разделам, которые у тебя открыты.";
const VALERA_LIMIT = "На этот час вопросов хватит. Повтори позже.";

type HistoryItem = { role?: string; text?: string };

type AskUser = { id: string; roleCode: string; permissions: string[] };

function gate() {
  const g = globalThis as { __valeraBusy?: boolean };
  return g;
}

export function buildPrompt(cards: ValeraCard[]) {
  const blocks = cards
    .map((card) => `Раздел: ${card.title}\nКуда: ${card.href}\n${card.body}`)
    .join("\n\n");
  return [
    "Ты Валера AI, помощник сайта Видеал.Док.",
    "Выбери один раздел, который отвечает на вопрос.",
    "В ответе напиши только его ссылку из поля «Куда» и больше ничего.",
    "Не добавляй другие разделы, людей, суммы, пароли и адреса.",
    "",
    blocks,
  ].join("\n");
}

export function buildTalkPrompt(cards: ValeraCard[]) {
  const lines = cards
    .filter((card) => card.id !== "start")
    .map((card) => `${card.href} — ${card.title}. ${card.body}`)
    .join("\n");
  return [
    "Ты Валера AI, помощник сотрудника на сайте Видеал.Док. Отвечай по-русски, обычным текстом, без звёздочек.",
    "Если просят текст, первая строка ответа — сам текст в кавычках «». Потом одна строка, куда его вставить.",
    "Отвечай на сам вопрос. Не подменяй просьбу написать текст объяснением, куда нажать.",
    "Если просят придумать, написать или сформулировать текст — дай готовый текст, который можно скопировать.",
    "Если просят куда нажать и что заполнить — назови только поля и кнопки из описаний ниже и подставь детали из вопроса.",
    "Предыдущие реплики — это продолжение разговора. Слова «там» и «это» относятся к ним.",
    "Ты не видишь базу, чужие чаты, документы, суммы и события на сегодня. Не выдумывай встречи, время, проекты и имена. Если факта нет, черновик — короткое приветствие и просьба коллегам дописать, что у них сегодня.",
    "Других разделов нет. Если вопрос про закрытую возможность, ответь ровно: В твоём меню этого нет. Спроси про раздел, который у тебя открыт: куда нажать и что заполнить.",
    "Не выдумывай кнопки. Не пиши пароли и личные данные.",
    "",
    lines,
  ].join("\n");
}

export function buildUnknownPrompt(cards: ValeraCard[]) {
  const lines = cards
    .filter((card) => card.id !== "start")
    .map((card) => `${card.href} — ${card.title}. ${card.body}`)
    .join("\n");
  return [
    "Ты Валера AI, помощник сайта Видеал.Док.",
    "Готовой подсказки нет. Ниже только разделы этого человека. Других разделов не существует.",
    "Если вопрос прямо про один раздел, ответь только его ссылкой.",
    "Не угадывай похожий раздел. Если сомневаешься, ответь ровно: НЕТ",
    "Не выдумывай разделы, людей, суммы и пароли.",
    "",
    lines,
  ].join("\n");
}

export function sanitizeAnswer(text: string, cards: ValeraCard[]) {
  const allowed = allowedPaths(cards);
  let next = text.replace(/https?:\/\/\S+/gi, "");
  next = next.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_all, label: string, href: string) => {
    return pathAllowed(href, allowed) ? `${label} ${href}` : label;
  });
  next = next.replace(/(^|[\s(«"])(\/[a-z][a-z0-9\-/_]*)/gi, (all, lead: string, path: string) => {
    return pathAllowed(path, allowed) ? `${lead}${path}` : lead;
  });
  next = next.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (!next) return VALERA_NONE;
  return next.slice(0, 1200);
}

function pathAllowed(raw: string, allowed: Set<string>) {
  const path = raw.split("?")[0].replace(/\/$/, "") || "/";
  if (allowed.has(path)) return true;
  for (const item of allowed) {
    if (item !== "/" && path.startsWith(`${item}/`)) return true;
  }
  return false;
}

function cleanHistory(history: HistoryItem[]) {
  return history
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .slice(-4)
    .map((item) => ({
      role: item.role as "user" | "assistant",
      content: String(item.text || "").slice(0, 500),
    }))
    .filter((item) => item.content.trim());
}

async function askModel(
  cards: ValeraCard[],
  question: string,
  history: HistoryItem[],
  prompt = buildPrompt(cards),
  numPredict = 60,
) {
  const base = (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL || "qwen2.5:3b";
  const res = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(90000),
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: "system", content: prompt },
        ...cleanHistory(history),
        { role: "user", content: question },
      ],
      options: { temperature: 0.1, num_predict: numPredict },
    }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  return sanitizeAnswer(String(data.message?.content || ""), cards);
}

const ADVANCE_DROP = new Set([
  "как", "мне", "меня", "мой", "моя", "мое", "мои", "свой", "своя", "свое", "свои",
  "заполнить", "оформить", "сдать", "сделать", "создать", "написать", "открыть",
  "подскажи", "подскажите", "нужно", "надо", "хочу", "пожалуйста", "можно",
  "что", "куда", "где", "это", "эта", "этот", "эту", "эти", "того", "чтобы",
  "про", "для", "под", "над", "при", "без", "от", "до", "из", "со", "ко", "об", "за", "на", "по", "в", "и", "или", "ли",
  "рублей", "рубля", "рубль", "руб", "сумму", "сумма", "сумме", "отчет",
]);

function isAdvanceFiller(word: string) {
  if (ADVANCE_DROP.has(word)) return true;
  if (word.startsWith("авансов")) return true;
  if (word.startsWith("отчет")) return true;
  if (word.startsWith("заполн")) return true;
  return false;
}

export function extractAdvanceAmount(question: string) {
  const text = question.toLowerCase().replace(/ё/g, "е");
  const withUnit = text.match(/(\d[\d\s]*(?:[.,]\d{1,2})?)\s*(?:руб(?:л(?:ей|я|ь))?|₽)/);
  const withNa = text.match(/(?:^|\s)на\s+(\d[\d\s]*(?:[.,]\d{1,2})?)/);
  const raw = (withUnit || withNa)?.[1];
  if (!raw) return "";
  return raw.replace(/\s+/g, "");
}

export function extractAdvancePurpose(question: string) {
  const text = question
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\d[\d\s]*(?:[.,]\d{1,2})?\s*(?:руб(?:л(?:ей|я|ь))?|₽)?/g, " ")
    .replace(/[^a-zа-я0-9]+/gi, " ");
  const words = text.split(" ").filter((word) => word.length > 1 && !isAdvanceFiller(word));
  return words.join(" ").replace(/^закупку(?=\s|$)/, "закупка").replace(/^покупку(?=\s|$)/, "покупка").trim();
}

function nominativeGoods(purpose: string) {
  const rest = purpose.replace(/^(?:закупка|покупка)\s+/, "").trim();
  const parts = rest.split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  if (parts.length === 1) {
    const word = parts[0];
    if (/[^аеёиоуыэюя]у$/.test(word)) return word.slice(0, -1) + "а";
    return word;
  }
  let changed = false;
  const adjectives = parts.slice(0, -1).map((word) => {
    if (/[бвгджзклмнпрстфхцчшщ]ой$/.test(word) || /[жшчщ]ей$/.test(word) || /ую$/.test(word)) {
      changed = true;
      return word.slice(0, -2) + "ая";
    }
    return word;
  });
  let noun = parts[parts.length - 1];
  if (changed && /[гкхжчшщ]и$/.test(noun)) noun = noun.slice(0, -1) + "а";
  else if (changed && /[^аеёиоуыэюя]ы$/.test(noun)) noun = noun.slice(0, -1) + "а";
  else if (changed && /[^аеёиоуыэюя]у$/.test(noun)) noun = noun.slice(0, -1) + "а";
  return [...adjectives, noun].join(" ");
}

export function advanceAnswer(question: string) {
  const amount = extractAdvanceAmount(question);
  const purpose = extractAdvancePurpose(question);
  const item = purpose ? nominativeGoods(purpose) : "";
  return [
    "Авансовый отчёт: меню «Финансы» (/finance), новый отчёт /advances/new.",
    "",
    "Шаг 1. Если на странице есть выплаченный запрос на эту покупку — отметь его галочкой. «Получено под отчёт» станет суммой запроса, «Назначение отчёта» подставится из запроса.",
    "Если такого запроса нет, заполни сам:",
    `«Получено под отчёт, ₽» — ${amount || "сумма, которую выдали"}`,
    `«Назначение отчёта» — ${purpose || "на что потрачены деньги"}`,
    "Кнопка «Создать черновик и продолжить». В подтверждении нажми «Создать черновик отчёта и перейти к чекам?».",
    "",
    "Шаг 2. Чек.",
    "Есть QR из банка — плитка «Чек по QR»: камера, фото или PDF, сумму подставит код.",
    "Нет QR — плитка «Составить с нуля»:",
    `«Что купили / документ» — ${item || "что куплено, как в чеке"}`,
    `«Сумма, ₽» — ${amount || "сумма чека"}`,
    "«Дата» — дата покупки",
    "«Номер документа» — номер с чека, если он есть",
    "«Документы» — фото, PDF или Word чека. Без файла кнопка не нажмётся.",
    "Кнопка «Добавить расход».",
    "",
    "Шаг 3. Кнопка «Отправить бухгалтеру». Бланк АО-1: «Скачать PDF (АО-1)» и «Скачать Excel (АО-1)».",
    "Поправить черновик можно полями «Назначение» и «Получено под отчёт, ₽» и кнопкой «Сохранить».",
  ].join("\n");
}

function answerText(card: ValeraCard, question: string) {
  if (card.id === "advances") return advanceAnswer(question);
  return card.body;
}

const CONCRETE_SKIP = new Set([
  "как", "мне", "меня", "мой", "моя", "мое", "мои", "свой", "своя", "свое", "свои",
  "заполнить", "оформить", "сдать", "сделать", "создать", "написать", "открыть", "показать",
  "подскажи", "подскажите", "подсказать", "нужно", "надо", "хочу", "пожалуйста", "можно",
  "что", "куда", "где", "когда", "это", "эта", "этот", "эту", "эти", "того", "чтобы",
  "про", "для", "под", "над", "при", "без", "от", "до", "из", "со", "об", "за", "на", "по", "во",
  "или", "сайт", "раздел", "меню", "кнопка", "кнопку", "поле", "поля", "там", "ещё", "еще",
]);

function loose(value: string) {
  return value.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/gi, " ").replace(/\s+/g, " ").trim();
}

export function isConcreteQuestion(question: string, card?: ValeraCard) {
  let text = loose(question);
  if (/\d/.test(text)) return true;
  if (card) {
    const keys = [...card.keywords, card.title].map(loose).filter((key) => key.length >= 3);
    keys.sort((a, b) => b.length - a.length);
    for (const key of keys) text = text.split(key).join(" ");
  }
  const words = text.split(" ").filter((word) => word.length >= 4 && !CONCRETE_SKIP.has(word));
  return words.length >= 2;
}

function advanceFieldScript() {
  return [
    "Меню «Финансы» (/finance), новый отчёт /advances/new.",
    "Если на странице есть выплаченный запрос на эту покупку — отметь его галочкой. «Получено под отчёт» станет суммой запроса, «Назначение отчёта» подставится из запроса.",
    "Если запроса нет: поле «Получено под отчёт, ₽» и поле «Назначение отчёта».",
    "Кнопка «Создать черновик и продолжить». Подтверждение «Создать черновик отчёта и перейти к чекам?».",
    "Чек: плитка «Чек по QR» или плитка «Составить с нуля».",
    "В «Составить с нуля» поля: «Что купили / документ», «Сумма, ₽», «Дата», «Номер документа», «Документы». Кнопка «Добавить расход».",
    "Дальше кнопка «Отправить бухгалтеру». Ещё есть «Скачать PDF (АО-1)» и «Скачать Excel (АО-1)».",
    "Поправить черновик: поля «Назначение» и «Получено под отчёт, ₽», кнопка «Сохранить».",
  ].join("\n");
}

export function buildWritePrompt(card: ValeraCard) {
  const script = card.id === "advances" ? advanceFieldScript() : card.body;
  return [
    "Ты Валера AI, помощник сайта Видеал.Док.",
    "Человек спрашивает конкретно. Напиши, какие поля заполнить и что вписать из его вопроса.",
    "Других разделов нет. Не называй их.",
    "Названия полей и кнопок копируй из текста ниже. Не выдумывай кнопки.",
    "Суммы, товары и даты бери только из вопроса. Не выдумывай то, чего он не написал.",
    "Пиши обычным текстом, без звёздочек. Пройди все шаги из текста ниже до последней кнопки.",
    "Не пиши пароли и чужие данные.",
    `Ссылки можно только такие: ${card.links.join(" ")}`,
    "",
    `${card.title}. ${script}`,
  ].join("\n");
}

function cardScript(card: ValeraCard) {
  return card.id === "advances" ? advanceFieldScript() : card.body;
}

function writerAnswerOk(text: string, card: ValeraCard, question: string) {
  const norm = text.toLowerCase().replace(/ё/g, "е");
  if (norm.length < 80) return false;
  if (norm.includes("сохранить и сдать")) return false;
  const digits = question.match(/\d[\d\s]{1,14}/);
  if (digits) {
    const compact = digits[0].replace(/\s+/g, "");
    if (compact.length >= 2 && !norm.replace(/\s+/g, "").includes(compact)) return false;
  }
  const script = cardScript(card).toLowerCase().replace(/ё/g, "е");
  const buttonWord = /сохран|отправ|созда|добав|скача|сдать|сдайте|продолж|подпис|ознаком/;
  for (const quote of text.match(/«[^»]{2,80}»/g) || []) {
    const inner = quote.slice(1, -1).toLowerCase().replace(/ё/g, "е");
    if (script.includes(inner)) continue;
    if (buttonWord.test(inner)) return false;
  }
  if (card.id === "advances") {
    if (!norm.includes("получено под отч") && !norm.includes("назначение")) return false;
    if (!norm.includes("добавить расход") || !norm.includes("отправить бухгалтеру")) return false;
  }
  return true;
}

function cardFromChoice(cards: ValeraCard[], choice: string) {
  const text = choice.trim();
  if (/^нет\b/i.test(text)) return null;
  const hits = cards.filter((card) => {
    if (card.id === "start") return false;
    return [card.href, ...card.links].some((href) => {
      const path = href.split("?")[0].replace(/\/$/, "") || "/";
      return path !== "/" && text.includes(path);
    });
  });
  hits.sort((a, b) => b.href.length - a.href.length);
  return hits[0] || null;
}

function isGreeting(question: string) {
  const text = question.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/gi, " ").replace(/\s+/g, " ").trim();
  return /^(привет|здравствуй|здравствуйте|добрый день|доброе утро|кто ты|что умеешь|помощь|с чего начать)$/.test(text);
}

function leaksHidden(text: string, cards: ValeraCard[]) {
  const blob = cards.map((card) => `${card.href} ${card.links.join(" ")} ${card.title} ${card.body}`).join("\n").toLowerCase();
  const norm = text.toLowerCase();
  const needles = ["/employees/new", "/admin", "соглашение о неразглашении"];
  if (needles.some((needle) => norm.includes(needle) && !blob.includes(needle))) return true;
  return /\bnda\b/i.test(text) && !/\bnda\b/i.test(blob);
}

export function previewValera(user: AskUser, questionRaw: string) {
  const question = String(questionRaw || "").trim().slice(0, 500);
  if (!question) return { error: "Напиши вопрос.", status: 400 };
  if (!rateLimit(`valera:${user.id}`, 12, 60 * 60 * 1000)) {
    return { error: VALERA_LIMIT, status: 429 };
  }
  const ranked = rankCards(user, question);
  const body = isGreeting(question)
    ? introAnswer(user)
    : ranked.length
      ? answerText(ranked[0].card, question)
      : VALERA_LOOK;
  return { answer: `${body}\n\n${VALERA_LATER}` };
}

function withoutLater(text: string) {
  return text.replace(/\n*Развёрнутый ответ придёт позже\.?/g, "").trim();
}

export async function askValera(user: AskUser, questionRaw: string, history: HistoryItem[] = [], skipLimit = false) {
  const question = String(questionRaw || "").trim().slice(0, 500);
  if (!question) return { error: "Напиши вопрос.", status: 400 };
  if (!skipLimit && !rateLimit(`valera:${user.id}`, 12, 60 * 60 * 1000)) {
    return { error: VALERA_LIMIT, status: 429 };
  }
  const open = visibleCards(user).filter((card) => card.id !== "start");
  history = history.map((item) => ({ ...item, text: withoutLater(String(item.text || "")) })).filter((item) => item.text);
  const asked = composeQuestion(question);
  const held = await withModel(() => askModel(open, asked, history, buildTalkPrompt(open), 480));
  if (!held.ok) return { error: held.error, status: held.status };
  let text = cleanTalk(held.value);
  if (isCompose(question) && !hasDraft(text)) {
    const again = await withModel(() =>
      askModel(open, `${asked}\nВ ответе обязательно есть текст в кавычках «».`, history, buildTalkPrompt(open), 480),
    );
    if (again.ok) text = cleanTalk(again.value);
  }
  if (!text || leaksHidden(text, open)) return { answer: VALERA_NONE };
  return { answer: text };
}

function isCompose(question: string) {
  const text = question.toLowerCase().replace(/ё/g, "е");
  return /что .{0,24}написать|придумай|сочини|сформулируй|напиши текст|напиши сообщение|черновик/.test(text);
}

function composeQuestion(question: string) {
  if (!isCompose(question)) return question;
  return [
    "Сначала готовый текст в кавычках «». Не объясняй меню, пока текста нет.",
    "Не выдумывай встречи, время, проекты и имена. Если не знаешь факты на сегодня, напиши короткое приветствие и попроси коллег дописать их.",
    "",
    question,
  ].join("\n");
}

function hasDraft(text: string) {
  return /«[^»]{8,}»|"[^"]{8,}"/.test(text);
}

function cleanTalk(text: string) {
  return text.replace(/\*\*/g, "").replace(/сохранить и сдать/gi, "").trim();
}

async function finish(card: ValeraCard, question: string, history: HistoryItem[]) {
  const fallback = answerText(card, question);
  if (!isConcreteQuestion(question, card)) return { answer: fallback };
  const written = await writeConcrete(card, question, history);
  if (!written || !writerAnswerOk(written, card, question)) return { answer: fallback };
  return { answer: written };
}

async function chooseCard(
  cards: ValeraCard[],
  question: string,
  history: HistoryItem[],
  prompt?: string,
): Promise<{ ok: true; card: ValeraCard | null } | { ok: false; error: string; status: number }> {
  const held = await withModel(() => askModel(cards, question, history, prompt, 60));
  if (!held.ok) return held;
  return { ok: true, card: cardFromChoice(cards, held.value) };
}

async function writeConcrete(card: ValeraCard, question: string, history: HistoryItem[]) {
  const held = await withModel(() => askModel([card], question, history, buildWritePrompt(card), 480));
  if (!held.ok) return "";
  return held.value.replace(/\*\*/g, "");
}

async function withModel<T>(run: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string; status: number }> {
  const gateState = gate();
  if (gateState.__valeraBusy) return { ok: false, error: VALERA_BUSY, status: 429 };
  gateState.__valeraBusy = true;
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    console.error("valera", error instanceof Error ? error.message : error);
    return { ok: false, error: "Валера сейчас не отвечает. Повтори чуть позже.", status: 503 };
  } finally {
    gateState.__valeraBusy = false;
  }
}
