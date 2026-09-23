# Промпт для Grok: какие API нужны Видеаль.Доку

Скопируй блок ниже в Grok и попроси помочь завести ключи (аккаунты создаёт человек, Grok — чеклист и куда вставить).

---

Нужны **три API-ключа** для студийного ЭДО Videal.Doc (совещания: расшифровка голоса + сводка + предлагаемые задачи). Ключи только server-side, в браузер не попадают. Вставляются в `/srv/videal-edo/.env` на офисном сервере `192.168.1.51`.

Сделай по шагам: ссылка регистрации, что нажать, как выглядит ключ, строка для `.env`. Не выдумывай сами ключи.

### 1. Groq — обязательно (голос → текст)

Зачем: Speech-to-Text, модель `whisper-large-v3-turbo`, язык `ru`. Без этого сводка с записи не стартует.
Сайт: https://console.groq.com → API Keys → Create API Key.
Бесплатный аккаунт, лимиты есть; если выйдем — час аудио ~$0.04.
Строка: `GROQ_API_KEY=gsk_...`

### 2. DeepSeek — основной мозг сводки и задач

Зачем: из транскрипта JSON: тезисы, решения, `actions[{title, brief, ownerHint, due}]`.
Сайт: https://platform.deepseek.com → API Keys.
Модель: `deepseek-flash`. Base URL: `https://api.deepseek.com`.
Чат на сайте бесплатный; API дешёвый, часто есть стартовый грант, вечного free-tier нет.
Строка: `DEEPSEEK_API_KEY=sk-...`

### 3. Qwen / DashScope — запас, если DeepSeek 429

Зачем: тот же JSON, OpenAI-совместимый чат.
Сайт: Alibaba Cloud Model Studio, регион **Singapore / international**.
https://modelstudio.console.alibabacloud.com или DashScope intl.
Новым часто дают ~1 млн токенов на модель на 90 дней.
Base URL: `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
Модель: `qwen-plus` или актуальный `qwen3.6-plus` / `qwen-flash` из консоли.
Строка: `DASHSCOPE_API_KEY=sk-...`

### Не нужно

- OpenAI Whisper (дорого)
- LiveKit / Jitsi
- Ключ в клиент, в Git, в чат сотрудникам

### Цепочка на сайте

аудио записи → Groq Whisper → DeepSeek (если нет/429 → Qwen → Groq Llama) → карточка совещания + предлагаемые задачи в производство.

После ключей: дописать три строки в `.env`, `systemctl restart videal-edo` (только этот юнит). Проверка: загрузить тестовый mp3 на карточке совещания.

---
