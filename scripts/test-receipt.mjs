import { readFileSync } from "fs";

const cookie = readFileSync("data/cookies.txt", "utf8")
  .split("\n")
  .filter((l) => l && !l.startsWith("#"))
  .map((l) => l.split("\t"))
  .filter((p) => p.length >= 7)
  .map((p) => `${p[5]}=${p[6].trim()}`)
  .join("; ");

const id = "cmtcnpp6600070pzc2bsur635";
const png = readFileSync("data/pixel.png");
const blob = new Blob([png], { type: "image/png" });
const fd = new FormData();
fd.set("file", blob, "pixel.png");
fd.set("amount", "1234.50");
fd.set("merchant", "ООО Ромашка");
fd.set("fn", "7281440500321456");
fd.set("fd", "1523");
fd.set("fp", "2154789654");
fd.set("occurredAt", "2026-08-20T12:00");
fd.set("qrRaw", "t=20260820T1200&s=1234.50&fn=7281440500321456&i=1523&fp=2154789654&n=1");

const res = await fetch(`http://localhost:3000/api/advances/${id}/receipts`, {
  method: "POST",
  headers: { cookie },
  body: fd,
});
console.log(res.status, await res.text());

await fetch(`http://localhost:3000/api/advances/${id}`, {
  method: "PUT",
  headers: { cookie, "content-type": "application/json" },
  body: JSON.stringify({ purpose: "Закупка канцелярии", issuedAmount: "5000" }),
});
const pdf = await fetch(`http://localhost:3000/api/advances/${id}/pdf`, { headers: { cookie } });
const buf = Buffer.from(await pdf.arrayBuffer());
console.log("pdf", pdf.status, buf.length, buf.slice(0, 8).toString());
