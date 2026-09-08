#!/bin/bash
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
  printf '%s\n' "$url" > "$tmp"
  chmod 644 "$tmp"
  chown v:v "$tmp"
  mv -f "$tmp" "$URL_FILE"
}

fifo=/tmp/videal-edo-tunnel.fifo
rm -f "$fifo"
mkfifo "$fifo"
cf_pid=""
reader_pid=""
cleanup() {
  if [ -n "$cf_pid" ]; then kill "$cf_pid" 2>/dev/null || true; fi
  if [ -n "$reader_pid" ]; then kill "$reader_pid" 2>/dev/null || true; fi
  rm -f "$fifo"
}
trap cleanup EXIT INT TERM

if command -v stdbuf >/dev/null 2>&1; then
  stdbuf -oL -eL "$CF" tunnel --no-autoupdate --url http://127.0.0.1:80 >"$fifo" 2>&1 &
else
  "$CF" tunnel --no-autoupdate --url http://127.0.0.1:80 >"$fifo" 2>&1 &
fi
cf_pid=$!

while IFS= read -r line; do
  printf '%s\n' "$line"
  if [[ "$line" =~ https://[a-z0-9-]+\.trycloudflare\.com ]]; then
    write_url "${BASH_REMATCH[0]}"
  fi
done < "$fifo" &
reader_pid=$!

wait "$cf_pid"
exit $?