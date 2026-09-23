import http from "node:http";
import https from "node:https";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";

const HOSTS = ["generativelanguage.googleapis.com", "api.cerebras.ai", "api.groq.com"];

function proxyUrl() {
  return (process.env.LLM_HTTP_PROXY || "").trim();
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export function shouldProxyLlm(url: string) {
  const p = proxyUrl();
  if (!p || p === "off") return false;
  const h = hostOf(url);
  return HOSTS.some((x) => h === x || h.endsWith(`.${x}`));
}

function headerMap(init?: RequestInit) {
  const out: Record<string, string> = {};
  new Headers(init?.headers).forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

function bodyBuffer(body: BodyInit | null | undefined): Buffer | undefined {
  if (body == null) return undefined;
  if (typeof body === "string") return Buffer.from(body);
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  return undefined;
}

function fetchViaProxy(urlStr: string, init: RequestInit = {}): Promise<Response> {
  const target = new URL(urlStr);
  const proxy = new URL(proxyUrl());
  const headers = headerMap(init);
  const buf = bodyBuffer(init.body);
  if (buf && !headers["content-length"]) headers["content-length"] = String(buf.length);
  const dest = `${target.hostname}:${target.port || 443}`;
  return new Promise((resolve, reject) => {
    const connect = http.request({
      host: proxy.hostname,
      port: Number(proxy.port) || 80,
      method: "CONNECT",
      path: dest,
      headers: { Host: dest },
    });
    connect.on("connect", (res: IncomingMessage, socket: Socket) => {
      const code = res.statusCode || 0;
      if (code !== 200) {
        socket.destroy();
        reject(new Error(`VPN CONNECT ${code || "ошибка"}`));
        return;
      }
      const req = https.request(
        {
          host: target.hostname,
          servername: target.hostname,
          path: `${target.pathname}${target.search}`,
          method: init.method || "GET",
          headers,
          createConnection: () => socket,
        },
        (httpsRes) => {
          const chunks: Buffer[] = [];
          httpsRes.on("data", (c) => chunks.push(c as Buffer));
          httpsRes.on("end", () => {
            const hdrs = new Headers();
            for (const [k, v] of Object.entries(httpsRes.headers)) {
              if (v) hdrs.set(k, Array.isArray(v) ? v.join(", ") : v);
            }
            resolve(new Response(Buffer.concat(chunks), { status: httpsRes.statusCode || 502, headers: hdrs }));
          });
        },
      );
      req.on("error", reject);
      if (buf) req.write(buf);
      req.end();
    });
    connect.on("error", reject);
    connect.end();
  });
}

export async function llmFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!shouldProxyLlm(url)) return fetch(url, init);
  let last = "VPN недоступен";
  for (let i = 0; i < 2; i++) {
    try {
      return await fetchViaProxy(url, init || {});
    } catch (e) {
      last = e instanceof Error ? e.message : "VPN недоступен";
    }
  }
  throw new Error(last);
}
