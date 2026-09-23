/** Studio terms Whisper often mangles. Applied before the LLM polish pass. */

const PAIRS: [RegExp, string][] = [
  [/видео\s*медиа/gi, "Видиал Медиа"],
  [/видеаль[\s\-]*медиа/gi, "Видиал Медиа"],
  [/видиал[\s\-]*медиа/gi, "Видиал Медиа"],
  [/videal[\s\-]*media/gi, "Видиал Медиа"],
  [/\bв костях\b/gi, "в гостях"],
];

export function applyMeetGlossary(text: string) {
  let out = text;
  for (const [re, to] of PAIRS) out = out.replace(re, to);
  return out;
}

const BROKEN = /видео\s*медиа|видеаль|в костях|videal\s*media/i;

export function lineLooksBroken(line: string) {
  const body = line.replace(/^\[[^\]]+\]\s*/, "").replace(/^[^:]{1,80}:\s*/, "");
  return BROKEN.test(body);
}
