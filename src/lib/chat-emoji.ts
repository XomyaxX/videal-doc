export const CHAT_EMOJI = ["👍", "❤️", "😂", "😮", "😢", "🔥", "👏", "✅"] as const;

export const LEAD_EMOJI = ["🏆", "🎆", "🎁", "🥇", "🥈", "🥉"] as const;

export const ALL_CHAT_EMOJI = [...CHAT_EMOJI, ...LEAD_EMOJI];

export const EMOJI_ALIASES: Record<string, string[]> = {
  "👍": ["лайк", "ок", "плюс", "хорошо"],
  "❤️": ["сердце", "любовь", "нравится"],
  "😂": ["смех", "лол", "ахах"],
  "😮": ["ого", "вау", "удивление"],
  "😢": ["грусть", "печаль", "слезы", "слёзы"],
  "🔥": ["огонь", "огонёк", "огонек", "круто"],
  "👏": ["хлоп", "браво", "аплодисменты"],
  "✅": ["галочка", "готово", "ок"],
  "🏆": ["кубок", "трофей", "чаша"],
  "🎆": ["феерверк", "фейерверк", "салют"],
  "🎁": ["подарок", "дар", "бокс"],
  "🥇": ["золото", "золотой", "1", "первое", "1 место"],
  "🥈": ["серебро", "серебряный", "2", "второе", "2 место"],
  "🥉": ["бронза", "бронзовый", "3", "третье", "3 место"],
};

export function isLeadEmoji(emoji: string) {
  return (LEAD_EMOJI as readonly string[]).includes(emoji);
}

export function emojiMatchesQuery(emoji: string, raw: string) {
  const s = raw.trim().toLowerCase();
  if (!s) return false;
  if (s === emoji || raw.includes(emoji) || emoji.includes(s)) return true;
  const aliases = EMOJI_ALIASES[emoji] || [];
  return aliases.some((a) => a === s || s === a);
}

export function messageHaystack(m: {
  authorName?: string;
  payload?: { text?: string; voice?: { text?: string } } | null;
  poll?: { question?: string } | null;
  ask?: { title?: string } | null;
  task?: { title?: string } | null;
  reactions?: { emoji: string }[];
}) {
  return [
    m.payload?.text || "",
    m.payload?.voice?.text || "",
    m.authorName || "",
    m.poll?.question || "",
    m.ask?.title || "",
    m.task?.title || "",
  ]
    .join("\n")
    .toLowerCase();
}

export function messageMatchesQuery(
  m: {
    authorName?: string;
    payload?: { text?: string; voice?: { text?: string } } | null;
    poll?: { question?: string } | null;
    ask?: { title?: string } | null;
    task?: { title?: string } | null;
    reactions?: { emoji: string }[];
  },
  raw: string,
) {
  const s = raw.trim();
  if (!s) return true;
  const low = s.toLowerCase();
  if (messageHaystack(m).includes(low)) return true;
  const emojis = [...new Set((m.reactions || []).map((r) => r.emoji))];
  if (emojis.some((e) => emojiMatchesQuery(e, s) || e === s || m.payload?.text?.includes(e))) return true;
  if (ALL_CHAT_EMOJI.some((e) => (s.includes(e) || low.includes(e)) && (emojis.includes(e) || (m.payload?.text || "").includes(e)))) {
    return true;
  }
  return false;
}
