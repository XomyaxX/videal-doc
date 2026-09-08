const ONES_M = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const TEENS = [
  "десять",
  "одиннадцать",
  "двенадцать",
  "тринадцать",
  "четырнадцать",
  "пятнадцать",
  "шестнадцать",
  "семнадцать",
  "восемнадцать",
  "девятнадцать",
];
const TENS = [
  "",
  "",
  "двадцать",
  "тридцать",
  "сорок",
  "пятьдесят",
  "шестьдесят",
  "семьдесят",
  "восемьдесят",
  "девяносто",
];
const HUNDREDS = [
  "",
  "сто",
  "двести",
  "триста",
  "четыреста",
  "пятьсот",
  "шестьсот",
  "семьсот",
  "восемьсот",
  "девятьсот",
];

function triad(n: number, female: boolean): string {
  const h = Math.floor(n / 100);
  const t = n % 100;
  const parts: string[] = [];
  if (h) parts.push(HUNDREDS[h]);
  if (t >= 10 && t < 20) {
    parts.push(TEENS[t - 10]);
  } else {
    const ten = Math.floor(t / 10);
    const one = t % 10;
    if (ten) parts.push(TENS[ten]);
    if (one) {
      if (female) parts.push(one === 1 ? "одна" : one === 2 ? "две" : ONES_M[one]);
      else parts.push(ONES_M[one]);
    }
  }
  return parts.join(" ");
}

function plural(n: number, forms: [string, string, string]) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return forms[0];
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return forms[1];
  return forms[2];
}

export function rublesDigits(kopecks: number): string {
  const { rub, kop } = splitRubKop(kopecks);
  const grouped = rub.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const core = `${grouped} ${plural(rub, ["рубль", "рубля", "рублей"])}`;
  if (kop === 0) return core;
  return `${core} ${kop.toString().padStart(2, "0")} ${plural(kop, ["копейка", "копейки", "копеек"])}`;
}

export function splitRubKop(kopecks: number) {
  const n = Math.round(kopecks);
  const abs = Math.abs(n);
  return { rub: Math.floor(abs / 100), kop: abs % 100, negative: n < 0 };
}

export function rubKopText(kopecks: number) {
  const { rub, kop } = splitRubKop(kopecks);
  return { rub: String(rub), kop: kop.toString().padStart(2, "0") };
}

export function sumInWords(kopecks: number): string {
  const { rub, kop, negative } = splitRubKop(kopecks);
  if (rub === 0 && kop === 0) return "Ноль рублей 00 копеек";
  const millions = Math.floor(rub / 1_000_000);
  const thousands = Math.floor((rub % 1_000_000) / 1000);
  const rest = rub % 1000;
  const parts: string[] = [];
  if (negative) parts.push("минус");
  if (millions) {
    parts.push(triad(millions, false));
    parts.push(plural(millions, ["миллион", "миллиона", "миллионов"]));
  }
  if (thousands) {
    parts.push(triad(thousands, true));
    parts.push(plural(thousands, ["тысяча", "тысячи", "тысяч"]));
  }
  if (rest || (!millions && !thousands)) parts.push(triad(rest, false) || "ноль");
  parts.push(plural(rub, ["рубль", "рубля", "рублей"]));
  parts.push(kop.toString().padStart(2, "0"));
  parts.push(plural(kop, ["копейка", "копейки", "копеек"]));
  const text = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
