import fs from "fs";
import path from "path";

const root = "C:/Users/Bonnie/videal-edo";
const write = (rel, content) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, "utf8");
  console.log("wrote", rel);
};

write(
  "src/lib/public-url.ts",
  `import { readFile } from "fs/promises";
import path from "path";

function candidates(): string[] {
  const env = process.env.PUBLIC_URL_FILE?.trim();
  const list = [
    env || "/var/lib/videal-edo/public-url.txt",
    path.join(process.cwd(), "data", "public-url.txt"),
  ];
  return [...new Set(list)];
}

export async function readPublicUrl(): Promise<string | null> {
  for (const file of candidates()) {
    try {
      const raw = (await readFile(file, "utf8")).trim();
      const m = raw.match(/^https:\\/\\/[a-z0-9-]+\\.trycloudflare\\.com\\/?$/i);
      if (m) return m[0].replace(/\\/$/, "");
    } catch {
      // missing file is expected before the tunnel is up
    }
  }
  return null;
}
`
);

write(
  "src/app/api/admin/public-url/route.ts",
  `import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { userCan } from "@/lib/types";
import { readPublicUrl } from "@/lib/public-url";

export async function GET() {
  const session = await getSession();
  if (!session || !userCan(session.user, "admin.settings")) {
    return NextResponse.json({ error: "Нет права" }, { status: 403 });
  }
  const url = await readPublicUrl();
  return NextResponse.json({ url });
}
`
);

write(
  "src/app/(office)/admin/settings/PublicUrlBlock.tsx",
  `"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

export function PublicUrlBlock({ initialUrl }: { initialUrl: string | null }) {
  const [url, setUrl] = useState<string | null>(initialUrl);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const res = await fetch("/api/admin/public-url");
        if (!res.ok) return;
        const data = await res.json();
        if (!stop && (data.url === null || typeof data.url === "string")) {
          setUrl(data.url);
        }
      } catch {
        // keep last known value
      }
    }
    load();
    const t = setInterval(load, 15000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  return (
    <Card className="mb-6 max-w-lg">
      <h2 className="font-serif text-xl text-navy">Ссылка из интернета</h2>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 block break-all font-serif text-2xl text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold"
        >
          {url}
        </a>
      ) : (
        <p className="mt-3 text-[15px] text-muted">Туннель ещё не выдал адрес, подождите минуту.</p>
      )}
      <p className="mt-3 text-[15px] text-muted">
        С телефона и из дома открывать это. После перезагрузки сервера ссылка может смениться — зайдите сюда с офисного ПК.
      </p>
    </Card>
  );
}
`
);

write(
  "src/app/(office)/admin/settings/page.tsx",
  `import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readPublicUrl } from "@/lib/public-url";
import { PageHeader } from "@/components/ui";
import { SettingsForm } from "./SettingsForm";
import { PublicUrlBlock } from "./PublicUrlBlock";

export default async function SettingsPage() {
  await requirePermission("admin.settings");
  const [s, publicUrl] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: "default" } }),
    readPublicUrl(),
  ]);
  return (
    <div>
      <PageHeader title="Настройки системы" />
      <PublicUrlBlock initialUrl={publicUrl} />
      <SettingsForm settings={s || { maxUploadMb: 32, sessionDays: 30, fnsEnabled: false, fnsLogin: "", fnsPassword: "" }} />
    </div>
  );
}
`
);

write(
  "deploy/nginx.conf",
  `server {
  listen 80 default_server;
  listen [::]:80 default_server;
  server_name _;
  client_max_body_size 32m;
  set_real_ip_from 127.0.0.1;
  real_ip_header CF-Connecting-IP;
  # LAN stays http (non-Secure cookie). Cloudflared sends CF-Visitor / X-Forwarded-Proto https.
  set $fwd_proto $scheme;
  if ($http_x_forwarded_proto = "https") { set $fwd_proto https; }
  if ($http_cf_visitor ~* "https") { set $fwd_proto https; }
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $fwd_proto;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 120s;
  }
}
`
);

write(
  "deploy/videal-edo-tunnel.sh",
  `#!/bin/bash
# Quick Tunnel (trycloudflare.com) — no Cloudflare account / login / named tunnel.
set -u
URL_FILE=/var/lib/videal-edo/public-url.txt
CF=/usr/bin/cloudflared
if [ ! -x "$CF" ]; then
  CF=/usr/local/bin/cloudflared
fi

mkdir -p /var/lib/videal-edo
chown v:v /var/lib/videal-edo

write_url() {
  local url="$1"
  local tmp
  tmp=$(mktemp /var/lib/videal-edo/public-url.XXXXXX)
  printf '%s\\n' "$url" > "$tmp"
  chmod 644 "$tmp"
  chown v:v "$tmp"
  mv -f "$tmp" "$URL_FILE"
}

set -o pipefail
# Main process is this script (Type=simple). Pipe logs, persist URL, wait on cloudflared.
stdbuf -oL -eL "$CF" tunnel --no-autoupdate --url http://127.0.0.1:80 2>&1 | while IFS= read -r line; do
  printf '%s\\n' "$line"
  if [[ "$line" =~ https://[a-z0-9-]+\\.trycloudflare\\.com ]]; then
    write_url "\${BASH_REMATCH[0]}"
  fi
done
exit \${PIPESTATUS[0]:-1}
`
);

write(
  "deploy/videal-edo-tunnel.service",
  `[Unit]
Description=Videal.Doc public Quick Tunnel (trycloudflare, no account)
After=network-online.target videal-edo.service nginx.service
Wants=network-online.target
Requires=videal-edo.service
[Service]
Type=simple
ExecStart=/usr/local/bin/videal-edo-tunnel.sh
Restart=on-failure
RestartSec=10
User=root
[Install]
WantedBy=multi-user.target
`
);

console.log("all files written");
