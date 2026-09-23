# Videal.Doc — полная справка (секреты)

Срез: 2026-09-23. Положено в git по запросу владельца. Если репозиторий публичный — сразу сделать private и сменить ключи.

---

## Что это

Студийная CRM/ЭДО **Videal.Doc** (`videal-doc.ru`) для ООО «Видиал Медиа» (Омск, TZ `Asia/Omsk`).

Стек: **Next.js 16.3.3 + React 19 + Prisma 6 + SQLite**. Цвета: navy / paper / gold. Не трогать маппинг сцен **E02 Superглазка**.

---

## Пути

| Что | Где |
|---|---|
| Исходники Windows | `C:\Users\LENOVO\Desktop\grok-build-videal-2026-09-04\project\videal-edo` |
| Боевой код | `/srv/videal-edo` на офисном Ubuntu |
| БД | `/srv/videal-edo/data/videal.db` (`DATABASE_URL=file:../data/videal.db`) |
| Файлы | `FILE_ROOT=./data/files` → `/srv/videal-edo/data/files` |
| Шара Samba | `/srv/samba/share` |
| Старый handoff в репо (без свежих ключей) | `GROK-HANDOFF.md` |

---

## SSH — офис

| | |
|---|---|
| Хост | `192.168.1.51` |
| Пользователь | `v` |
| Пароль | `v` (и для sudo) |
| LAN сайт | `http://192.168.1.51` — **не 301** на https://www |

С Windows (OpenSSH):

```
%TEMP%\vd_askpass.cmd  →  @echo off + echo v
SSH_ASKPASS=%TEMP%\vd_askpass.cmd
SSH_ASKPASS_REQUIRE=force
DISPLAY=localhost:0
ssh -o PreferredAuthentications=password -o PubkeyAuthentication=no v@192.168.1.51
```

PowerShell: нет `&&`; `$` в SSH-кавычках съедается — скрипты класть в файлы и `scp`. CRLF с Windows: `sed -i 's/\r$//'`.

Node-хелперы: `scripts/ssh.mjs`, `sshrun.mjs`, `ssh-env.mjs` — нужен `SSH_PASS`.

---

## SSH — Timeweb (публичный край)

| | |
|---|---|
| IP | `83.217.203.41` |
| Hostname | `7343125-jd379060.twc1.net` |
| Пользователь | `root` |
| С внешнего Windows | порт 22 часто timeout |
| Прыжок | офис → `sshpass -e ssh root@83.217.203.41` (`SSHPASS` задать на офисе) |

На VPS также Superглазка, videal.media, YouTrack — **не ломать**. Пароль root Timeweb в этом срезе **не найден** в `.env` приложения (только hop с офиса).

WireGuard: офис `10.8.0.2` ↔ VPS `10.8.0.1`, UDP **51820**, `wg-quick@wg0`. Ключи WG уже есть, не пересоздавать без нужды. Конфиги: `/etc/wireguard/wg0.conf` на обоих.

---

## Как открывается сайт

```
Интернет
  → DNS A videal-doc.ru / www = 83.217.203.41  (Cloudflare DNS only, серое облако)
  → nginx TLS на Timeweb (Let's Encrypt)
  → WireGuard 10.8.0.1 → 10.8.0.2
  → офисный nginx :80 → next 127.0.0.1:3000 (systemd videal-edo)

Офис Wi‑Fi: http://192.168.1.51
```

NS `videal-doc.ru`: Cloudflare. AAAA быть не должно.

Офис nginx: `/etc/nginx/sites-available/videal-edo` — не затирать слепым `cp` из репо.

VPS nginx: `/etc/nginx/conf.d/videal-doc.ru.conf` → `http://10.8.0.2:80`.

---

## Железо офиса

Intel Xeon E5-2670 v3, ~16 ГБ RAM, диск `/` ~28 ГБ (тесно), `/srv` ~3.7 Т. GPU бесполезен для нейросетей. TZ Asia/Omsk.

systemd:

- `videal-edo` — Next.js
- `videal-proxy` — mihomo HexVPN, `127.0.0.1:7890`
- `videal-proxy-refresh.timer` — узлы раз в час
- `coturn`
- `ollama` (модели `/srv/ollama`, `qwen2.5:3b`)
- `wg-quick@wg0`
- nginx, samba

Не рестартить Cloudflare tunnel вместе с приложением (named tunnel выключен).

---

## Деплой (только videal-edo)

Из корня исходников на Windows:

1. `tar -czf %TEMP%\videal-edo-deploy.tgz --exclude=node_modules --exclude=.next --exclude=data --exclude=.git --exclude=.env .`
2. `scp` → `v@192.168.1.51:/home/v/videal-edo-deploy.tgz`
3. На офисе: `bash /tmp/vd-prod-fix.sh` (= `deploy/remote-prod-fix.sh`: extract, `prisma generate`, `db push`, `npm run build`, **restart только videal-edo**)
4. Проверка: `curl -s http://127.0.0.1:3000/api/health` → `{"ok":true}`

Не делать `npm install`, если зависает. Не использовать `scripts/redeploy.mjs` (копирует nginx, трогает туннель).

---

## Ключи и env на сервере

Файлы: `/srv/videal-edo/.env` и `/srv/videal-edo/.env.hf` (chmod 600). В git **не** коммитить.

```
DATABASE_URL=file:../data/videal.db
FILE_ROOT=./data/files
SESSION_SECRET=videal-edo-change-me-in-production
SHARE_ROOT=/srv/samba/share

TURN_USER=videal
TURN_PASS=f5254969a9d39d5cdfb40d2c
TURN_URLS=turn:83.217.203.41:3478?transport=udp,turn:83.217.203.41:3478?transport=tcp,turn:192.168.1.51:3478
TURN_REALM=videal-doc.ru

GROQ_API_KEY=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
GROQ_STT_MODEL=whisper-large-v3-turbo
GROQ_STT_LANGUAGE=ru
GROQ_STT_BASE=https://api.groq.com/openai/v1
GROQ_LLM_MODEL=llama-3.3-70b-versatile

DEEPSEEK_API_KEY=sk-53b201d1201045c5841692e4f7862396
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash

OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:3b

HF_TOKEN=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
HUGGING_FACE_HUB_TOKEN=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
WHISPER_PY=/srv/vd-stt/bin/python
HF_HOME=/srv/hf-cache
HF_HUB_CACHE=/srv/hf-cache
TRANSFORMERS_CACHE=/srv/hf-cache
TORCH_HOME=/srv/torch-cache

GEMINI_API_KEY=AQ.Ab8RN6LQYfIGELbxYtnCH_FEwWLHu1wza1M23p9unKXdlgFKLg
GEMINI_MODEL=gemini-2.0-flash

CEREBRAS_API_KEY=csk-pd34w46th3yx6d6dex9yd2y3dcm5p46x4c34rfy6cpdjwptr
CEREBRAS_MODEL=llama3.1-8b

LLM_HTTP_PROXY=http://127.0.0.1:7890
```

Код Gemini по умолчанию бьёт в **gemini-3.6-flash** (2.0-flash снят). Groq из РФ 403, DeepSeek был 402 (баланс), Cerebras через VPN — Cloudflare 1010. Тексты совещаний идут в **Gemini через VPN**. Whisper локальный.

Лицензии HF:  
https://huggingface.co/pyannote/speaker-diarization-3.1  
https://huggingface.co/pyannote/segmentation-3.0

---

## HexVPN (только для Gemini/Cerebras/Groq)

Не TUN на весь сервер.

| | |
|---|---|
| Клиент сервера | mihomo `/usr/local/bin/mihomo`, unit `videal-proxy` |
| Прокси | `http://127.0.0.1:7890` |
| Конфиг | `/etc/videal-proxy/config.yaml` (chmod 600) |
| Патч | `/etc/videal-proxy/patch-hex-config.py` |
| Хосты через VPN | `generativelanguage.googleapis.com`, `api.cerebras.ai`, `api.groq.com` |
| Код | `src/lib/llm-proxy.ts` (HTTP CONNECT, без обхода при ошибке) |

Подписки HexVPN:

- Ссылка из чата (часто заглушка «App not supported» с офисного IP):  
  `https://integrated.hexvpn.pro/zptoy2amBzobb0Mn`
- Рабочий профиль Koala Clash на этом Windows:  
  `https://integrated.hexvpn.pro/mJU458zNsuH0UCU7`  
  файл `C:\Users\LENOVO\AppData\Roaming\koala-clash\profiles\1a06b68ed0a.yaml`

User-Agent для Clash YAML: `ClashMeta/1.19`. Windows 192.168.1.116 — Koala Clash, mixed-port **7897**.

---

## STT / pyannote

venv `/srv/vd-stt`, python 3.10.

Пины: `pyannote.audio==3.3.2`, `huggingface_hub==0.26.5`, `torch==2.5.1+cpu`, `torchaudio==2.5.1+cpu`.

Кэш: `/srv/hf-cache`, `/srv/pip-cache`, `/srv/torch-cache`.

---

## Совещания

Своя комната WebRTC (не Jitsi). TURN coturn 3478 + Timeweb DNAT `83.217.203.41` → `10.8.0.2`, порты 3478 и 49152–49300.

Пайплайн: Whisper small → спикеры/pyannote на смешанный mp3 → словарь Видиал Медиа → Gemini (правка + сводка окнами). Один job за раз.

Гости: ФИО без учётки, cookie `vd_meet_guest`.

---

## Графики

`/duty` — мусор мужчины каждый рабочий день по одному; уборка женщины **вт и пт вдвоём**. Без руководства, АХО, кадров, Баловой.

---

## Чаты

`/chat` — личные/группы, голос, файлы, опросы, «нужен ответ», поручения. Точка «на месте», «печатает…», свои пузыри с золотой кромкой.

---

## Прочее

- Не удалять с диска файлы библиотеки при hide.
- Сиды merge-add, не затирать людей.
- Временный пароль новых сотрудников (из handoff): `Videal2026!`
- Гендиректор в реквизитах: Ермилов Михаил Владимирович, логин `ermilov.mv` (не путать с `ermilov` = Дмитрий Михайлович).
- ASKPASS: `%TEMP%\vd_askpass.cmd`

Логи: `journalctl -u videal-edo -f`  
Прокси: `journalctl -u videal-proxy -f`
