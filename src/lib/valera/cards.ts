import { userCan } from "../types";
import type { PermissionCode } from "../permissions";

export type ValeraCard = {
  id: string;
  title: string;
  href: string;
  links: string[];
  keywords: string[];
  body: string;
  example?: string;
  perm?: PermissionCode;
  hideRemote?: boolean;
};

export const VALERA_NONE =
  "В твоём меню этого нет. Спроси про раздел, который у тебя открыт: куда нажать и что заполнить.";

const CARDS: ValeraCard[] = [
  {
    id: "start",
    title: "Валера AI",
    href: "/",
    links: ["/"],
    keywords: ["привет", "здравствуй", "что умеешь", "кто ты", "валера", "помощь", "с чего начать"],
    body: "Коротко представься и предложи спросить про один открытый раздел. Разделы сам не перечисляй.",
  },
  {
    id: "home",
    title: "Мне нужно",
    href: "/",
    links: ["/"],
    keywords: ["мне нужно", "главная", "что сделать сегодня", "с чего начать день"],
    body: "Стартовая страница «Мне нужно» (/). Там собрано, что ждёт лично сегодня.",
  },
  {
    id: "chat",
    title: "Чаты",
    href: "/chat",
    links: ["/chat"],
    keywords: ["чат", "написать коллеге", "сообщение", "переписка", "личка"],
    example: "как написать коллеге",
    body: "Чаты — пункт меню «Чаты» (/chat). Личное сообщение открывается из списка людей. В общий канал пароли и личные данные не пишут.",
  },
  {
    id: "gate",
    title: "Отметка у входа",
    href: "/",
    links: ["/"],
    hideRemote: true,
    keywords: ["отметить приход", "отметить уход", "qr на входе", "телевизор у входа", "забыл отметиться"],
    body: "У входа в офис на телевизоре QR. Отсканируй его телефоном, на котором ты уже вошёл в Видеал.Док. На странице две кнопки: «Отметить приход» и «Отметить уход». Если к 20:00 по Омску отметки нет, система сама пишет, что ты забыл отметиться.",
  },
  {
    id: "calendar",
    title: "Календарь",
    href: "/calendar",
    links: ["/calendar"],
    keywords: ["календарь", "событие в календаре", "дни студии"],
    body: "Календарь — пункт меню «Календарь» (/calendar). Там дни студии.",
  },
  {
    id: "meet",
    title: "Совещания",
    href: "/meet",
    links: ["/meet"],
    keywords: ["совещание", "встреча", "видеозвонок", "планерка", "планёрка"],
    body: "Совещания — пункт меню «Совещания» (/meet). Открой карточку, куда тебя позвали.",
  },
  {
    id: "meet-new",
    title: "Созвать совещание",
    href: "/meet/new",
    links: ["/meet/new", "/meet"],
    perm: "prod.lead",
    keywords: ["созвать совещание", "новое совещание", "создать встречу"],
    body: "Новое совещание: /meet/new. Поля: тема, место, начало, длительность, повестка. Материалы прикладываются файлами ниже.",
  },
  {
    id: "documents",
    title: "Документы",
    href: "/documents",
    links: ["/documents"],
    keywords: ["документ", "ознакомление", "я ознакомился", "подписать документ", "рассылка мне"],
    example: "где документы на подпись",
    body: "Документы — пункт меню «Документы» (/documents). Открой карточку. Если просят ознакомиться — кнопка «Я ознакомился». Если просят подпись — распечатай, подпиши и приложи скан кнопкой «Отправить подписанный».",
  },
  {
    id: "documents-send",
    title: "Разослать документ",
    href: "/documents/send",
    links: ["/documents/send", "/documents"],
    perm: "docs.send",
    keywords: ["разослать документ", "отправить документ", "рассылка документа", "новый документ сотрудникам"],
    body: "Новая рассылка: /documents/send. Поля: название, комментарий для сотрудников, файл (PDF, Word, Excel или картинка), кому (отдел или люди), срок. После отправки людям придёт уведомление.",
  },
  {
    id: "registry",
    title: "Журнал",
    href: "/registry",
    links: ["/registry", "/registry/new"],
    keywords: ["журнал писем", "входящее письмо", "исходящее письмо", "регистрация письма", "журнал"],
    body: "Журнал внешних писем — пункт меню «Журнал» (/registry). Новая запись: /registry/new. Поля: направление, дата письма, от кого или кому, тема. Файл не обязателен. Это не рассылка сотрудникам.",
  },
  {
    id: "profile",
    title: "Профиль",
    href: "/profile",
    links: ["/profile"],
    keywords: ["профиль", "фото", "рабочий email", "пароль приложения", "почта в профиле"],
    body: "Профиль — пункт меню «Профиль» (/profile). Там фото, рабочий email и пароль приложения почты. Пароль почты вводится только в этом поле. В чат его не отправляют.",
  },
  {
    id: "password",
    title: "Сменить пароль",
    href: "/change-password",
    links: ["/change-password", "/profile"],
    keywords: ["сменить пароль", "временный пароль", "пароль входа", "новый пароль"],
    body: "Пароль входа на сайт меняется на /change-password. Кнопка есть и в профиле. Это не пароль почты.",
  },
  {
    id: "notifications",
    title: "Уведомления",
    href: "/notifications",
    links: ["/notifications"],
    keywords: ["уведомления", "колокольчик", "напоминания"],
    body: "Уведомления — колокольчик внизу меню или страница /notifications.",
  },
  {
    id: "prod",
    title: "Производство",
    href: "/prod",
    links: ["/prod"],
    perm: "prod.view",
    keywords: ["производство", "доска", "серия", "пайплайн", "мои задачи", "моя задача", "тз", "производственная задача"],
    example: "где мои задачи",
    body: "Производство — пункт меню «Производство» (/prod). Своя задача открывается оттуда. В карточке написаны ТЗ, срок и исполнитель. Уточнения пишут в чат задачи, постановку ТЗ им не заменяют.",
  },
  {
    id: "prod-new",
    title: "Новая задача",
    href: "/prod/new",
    links: ["/prod/new", "/prod"],
    perm: "prod.lead",
    keywords: ["поставить задачу", "новая задача", "назначить исполнителя", "создать задачу"],
    body: "Новая производственная задача: /prod/new. Поля: шаблон или название, сцена, шот или ассет, этап, исполнитель, начало, окончание, ТЗ. Суб-исполнитель не обязателен. Материалы можно взять из хранилища.",
  },
  {
    id: "library",
    title: "Хранилище",
    href: "/library",
    links: ["/library", "/library/new"],
    perm: "prod.work",
    hideRemote: true,
    keywords: ["хранилище", "библиотека", "загрузить в хранилище", "карточка файла"],
    body: "Хранилище — пункт меню «Хранилище» (/library). Файл перетаскивается в папку. Новая карточка: /library/new, поля название, тип (это ярлык, не фильтр формата) и описание. Пустой и слишком большой файл сайт не примет.",
  },
  {
    id: "data",
    title: "Data",
    href: "/data",
    links: ["/data", "/data/trash"],
    perm: "data.view",
    keywords: ["раздел data", "папка data", "файлы data", "data"],
    example: "где раздел data",
    body: "Data — пункт меню «Data» (/data). Это живая папка студии: открой нужную папку по цепочке сверху. Удалённые на сайте файлы лежат в корзине /data/trash.",
  },
  {
    id: "data-work",
    title: "Запись в Data",
    href: "/data",
    links: ["/data"],
    perm: "data.work",
    keywords: ["загрузить в data", "залить в data", "скопировать в data", "переместить в data", "заменить файл data"],
    body: "Чтобы положить файл в Data, открой /data и кинь файл в окно загрузки. Можно заменить уже лежащий файл. Копирование и перенос — через меню файла в нужную папку.",
  },
  {
    id: "requests",
    title: "Запросы",
    href: "/requests",
    links: ["/requests", "/requests/new"],
    perm: "requests.create",
    keywords: ["закупка", "запрос на закупку", "купить", "новый запрос", "заявка"],
    body: "Запросы — пункт меню «Запросы» (/requests). Новый: /requests/new. Поля: кратко, категория, зачем, позиции (название, штук, единица, ссылка, заметка). К запросу и к позиции можно приложить фото и счёт. Сумму считает АХО.",
  },
  {
    id: "requests-aho",
    title: "Очередь АХО",
    href: "/requests",
    links: ["/requests"],
    perm: "requests.aho",
    keywords: ["очередь ахо", "обработать закупку", "запросы ахо"],
    body: "Очередь АХО на странице /requests. Открой карточку запроса и обработай её там. Суммы Валера не называет.",
  },
  {
    id: "statements",
    title: "Заявления",
    href: "/statements",
    links: ["/statements", "/statements/new"],
    perm: "hrdocs.create",
    keywords: [
      "заявление",
      "отгул",
      "отпуск",
      "больничный",
      "объяснительная",
      "служебная записка",
      "работа вне офиса",
      "замена рабочего дня",
      "учебный отпуск",
    ],
    example: "как написать заявление",
    body: "Заявления — пункт меню «Заявления» (/statements). Новое: /statements/new. Выбери тип и руководителя. Отгул: дата, основание, причина. Замена дня: даты «с» и «по» и причина. Отпуск без содержания, ежегодный отпуск и учебный отпуск: даты «с» и «по». Больничный и работа вне офиса: даты и причина. Объяснительная: дата и текст. Служебная записка: тема и текст.",
  },
  {
    id: "statements-review",
    title: "Входящие заявления",
    href: "/statements",
    links: ["/statements"],
    perm: "hrdocs.review",
    keywords: ["входящие заявления", "согласовать заявление", "заявление сотрудника"],
    body: "Входящие заявления на странице /statements. Открой карточку и реши её там. Текст чужого заявления Валера не читает.",
  },
  {
    id: "advances",
    title: "Авансовый отчёт",
    href: "/finance",
    links: ["/finance", "/advances", "/advances/new"],
    perm: "finance.create",
    keywords: ["авансовый", "авансовый отчет", "авансовый отчёт", "отчитаться", "чек", "финансы"],
    example: "как сдать авансовый",
    body: "Финансы — пункт меню «Финансы» (/finance). Свой авансовый отчёт: /advances/new. Поля: получено под отчёт и назначение. Чеки добавляются в самом отчёте. Выплаченный запрос без отчёта виден на /finance.",
  },
  {
    id: "funds",
    title: "Запрос средств",
    href: "/funds/new",
    links: ["/funds/new", "/funds", "/finance"],
    perm: "finance.create",
    keywords: ["запрос средств", "попросить деньги", "перечислить", "нужны деньги"],
    body: "Запрос средств: /funds/new. Поля: на что нужны деньги, сумма, обоснование, кому перечислить, дата не раньше сегодня, руководитель для согласования, вложения.",
  },
  {
    id: "finance-approve",
    title: "Согласовать деньги",
    href: "/funds",
    links: ["/funds", "/finance"],
    perm: "finance.approve",
    keywords: ["согласовать деньги", "согласовать запрос", "утвердить авансовый", "согласование финансов"],
    body: "Согласование запроса средств — в его карточке со страницы /funds. Открой карточку, которая ждёт согласования. Суммы Валера не называет.",
  },
  {
    id: "finance-all",
    title: "Все финансы",
    href: "/finance",
    links: ["/finance", "/advances", "/funds"],
    perm: "finance.view_all",
    keywords: ["все авансовые", "все финансы", "чужой авансовый", "все запросы средств"],
    body: "Все финансовые документы, которые тебе видны, открываются в «Финансы» (/finance), авансовые в /advances, запросы средств в /funds. Суммы и чужие отчёты Валера не пересказывает.",
  },
  {
    id: "employees",
    title: "Сотрудники",
    href: "/employees",
    links: ["/employees"],
    perm: "users.view",
    keywords: ["список сотрудников", "найти сотрудника", "справочник сотрудников", "сотрудники"],
    body: "Сотрудники — пункт меню «Сотрудники» (/employees). Поиск по фамилии, логину, телефону и должности, сверху фильтр отдела. Телефоны и даты рождения Валера не называет.",
  },
  {
    id: "employees-new",
    title: "Новый сотрудник",
    href: "/employees/new",
    links: ["/employees/new", "/employees"],
    perm: "users.manage",
    keywords: ["новый сотрудник", "создать сотрудника", "добавить сотрудника", "nda", "соглашение о неразглашении", "собрать nda", "временный пароль сотрудника"],
    body: "Новый сотрудник: /employees/new. Обязательны фамилия, имя и уровень доступа. Логин собирается из фамилии сам и показывается вместе с временным паролем. Ещё есть отчество, пол, телефон, email, должность, отдел, руководитель, табельный номер, ИНН, дата приёма, дата рождения. Паспорт и адрес прописки заполняются отдельно: на карточке кнопка «Соглашение». Там дата рождения, серия, номер, кем выдан, дата выдачи, город, улица, дом и квартира. Реквизиты компании уже в документе. Пароль и паспорт передай человеку лично, в общий чат не пиши.",
  },
  {
    id: "inventory",
    title: "Инвентарь",
    href: "/inventory",
    links: ["/inventory"],
    hideRemote: true,
    keywords: ["инвентарь", "моя техника", "что закреплено", "мебель"],
    body: "Инвентарь — пункт меню «Инвентарь» (/inventory). Там техника и мебель, закреплённые за тобой. «б/н» значит без инвентарного номера.",
  },
  {
    id: "inventory-manage",
    title: "Правка инвентаря",
    href: "/inventory",
    links: ["/inventory", "/inventory/tmc/new", "/inventory/clearance/new"],
    perm: "inventory.manage",
    hideRemote: true,
    keywords: ["закрепить технику", "карточка тмц", "обходной", "править инвентарь"],
    body: "Правка инвентаря на /inventory. Новая карточка ТМЦ: /inventory/tmc/new, выбирается сотрудник. Обходной лист: /inventory/clearance/new — сотрудник, основание, примечание.",
  },
  {
    id: "duty",
    title: "Графики",
    href: "/duty",
    links: ["/duty"],
    hideRemote: true,
    keywords: ["дежурство", "дежурств", "график уборки", "график мусора", "кто дежурит", "графики"],
    body: "Графики уборки и выноса мусора — пункт меню «Графики» (/duty). Свой день смотри на этой странице.",
  },
  {
    id: "control",
    title: "Контроль",
    href: "/control",
    links: ["/control"],
    perm: "presence.review",
    keywords: ["контроль", "опоздание", "приход", "уход", "явка"],
    body: "Контроль прихода и ухода — пункт меню «Контроль» (/control). Чужое время Валера не называет.",
  },
  {
    id: "archive",
    title: "Мой архив",
    href: "/archive",
    links: ["/archive", "/profile"],
    perm: "archive.view",
    keywords: ["мой архив", "личный архив", "мои документы в архиве"],
    body: "Свой архив — /archive. Кнопка «Личный архив» есть в профиле. Там твои кадровые файлы.",
  },
  {
    id: "archive-all",
    title: "Архив сотрудника",
    href: "/employees",
    links: ["/employees", "/archive"],
    perm: "archive.view_all",
    keywords: ["архив сотрудника", "чужой архив", "документы человека"],
    body: "Архив другого сотрудника открывается из его карточки в /employees, если эта кнопка у тебя есть. Содержимое архива Валера не перечисляет.",
  },
  {
    id: "scan",
    title: "SCAN",
    href: "/scan",
    links: ["/scan"],
    perm: "scan.use",
    keywords: ["скан", "окно scan", "сканер"],
    body: "Окно сканера — /scan. С него скан уходит в документ.",
  },
  {
    id: "audit",
    title: "Журнал действий",
    href: "/admin/audit",
    links: ["/admin/audit", "/admin"],
    perm: "admin.audit",
    keywords: ["журнал действий", "кто менял", "аудит"],
    body: "Журнал действий: /admin/audit. Там видно, кто что менял. Через меню «Админка».",
  },
  {
    id: "remote-log",
    title: "Журнал дистанционных",
    href: "/admin/remote-log",
    links: ["/admin/remote-log", "/admin"],
    perm: "admin.audit",
    keywords: ["журнал дистанционных", "удаленный сотрудник журнал", "удалённый сотрудник журнал"],
    body: "Журнал дистанционных: /admin/remote-log. Входы и действия с файлами сотрудников вне офиса.",
  },
  {
    id: "roles",
    title: "Роли",
    href: "/admin/roles",
    links: ["/admin/roles", "/admin"],
    perm: "roles.manage",
    keywords: ["роли", "уровень доступа", "права должности"],
    body: "Роли и доступ: /admin/roles. Там набор прав должности. Список чужих прав Валера не зачитывает.",
  },
  {
    id: "catalogs",
    title: "Отделы и должности",
    href: "/admin/catalogs",
    links: ["/admin/catalogs", "/admin"],
    perm: "catalogs.manage",
    keywords: ["справочник отделов", "должности", "отделы и должности"],
    body: "Отделы и должности: /admin/catalogs.",
  },
  {
    id: "org",
    title: "Реквизиты",
    href: "/admin/organization",
    links: ["/admin/organization", "/admin"],
    perm: "org.edit",
    keywords: ["реквизиты", "организация", "карточка организации"],
    body: "Реквизиты организации: /admin/organization.",
  },
  {
    id: "settings",
    title: "Настройки",
    href: "/admin/settings",
    links: ["/admin/settings", "/admin"],
    perm: "admin.settings",
    keywords: ["настройки системы", "smtp", "почта сервера", "фнс", "размер файла", "срок сессии", "фон экрана на входе"],
    body: "Настройки: /admin/settings. Там размер файла, срок сессии, проверка чеков и почта сервера. Фон телевизора у входа загружается там же: видео, картинка или GIF. Пароли Валера не называет. Пустое поле пароля значит не менять.",
  },
  {
    id: "templates",
    title: "Финансовые шаблоны",
    href: "/admin/templates",
    links: ["/admin/templates", "/admin"],
    perm: "admin.settings",
    keywords: ["финансовый шаблон", "бланк", "ао-1"],
    body: "Финансовые шаблоны: /admin/templates.",
  },
  {
    id: "backup",
    title: "Резервная копия",
    href: "/admin/backup",
    links: ["/admin/backup", "/admin"],
    perm: "admin.backup",
    keywords: ["резервная копия", "снимок базы", "бэкап", "backup"],
    body: "Снимок базы на сервер: /admin/backup. Это не ночная копия файлов студии.",
  },
  {
    id: "docs-manage",
    title: "Все документы",
    href: "/admin/documents",
    links: ["/admin/documents", "/admin"],
    perm: "docs.manage",
    keywords: ["все документы", "любые рассылки", "чужие рассылки"],
    body: "Все рассылки документов: /admin/documents.",
  },
];

function norm(value: string) {
  return value
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function visibleCards(user: { roleCode: string; permissions: string[] }) {
  return CARDS.filter((card) => {
    if (card.hideRemote && user.roleCode === "remote") return false;
    if (card.perm && !userCan(user, card.perm)) return false;
    return true;
  });
}

function scoreCard(card: ValeraCard, question: string) {
  let score = 0;
  for (const keyword of card.keywords) {
    const key = norm(keyword);
    if (key.length < 3) continue;
    if (!question.includes(key)) continue;
    score += key.includes(" ") ? 3 : 2;
  }
  return score;
}

export function rankCards(user: { roleCode: string; permissions: string[] }, question: string, limit = 3) {
  const q = norm(question);
  const ranked = visibleCards(user)
    .map((card) => ({ card, score: scoreCard(card, q) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.card.title.localeCompare(b.card.title, "ru"));
  const top = ranked.slice(0, limit);
  if (top.some((row) => row.card.id !== "start")) return top.filter((row) => row.card.id !== "start").slice(0, limit);
  return top;
}

export function pickCards(user: { roleCode: string; permissions: string[] }, question: string, limit = 3) {
  return rankCards(user, question, limit).map((row) => row.card);
}

export function introAnswer(user: { roleCode: string; permissions: string[] }) {
  const examples = visibleCards(user)
    .map((card) => card.example)
    .filter((example): example is string => Boolean(example))
    .slice(0, 3);
  if (!examples.length) return "Я Валера AI. Подскажу, куда нажать и что заполнить, и напишу текст, если попросишь.";
  return `Я Валера AI. Подскажу, куда нажать и что заполнить, и напишу текст, если попросишь. Например: ${examples.join("; ")}.`;
}

export function allowedPaths(cards: ValeraCard[]) {
  const paths = new Set<string>();
  for (const card of cards) {
    for (const raw of [card.href, ...card.links]) {
      const path = raw.split("?")[0].replace(/\/$/, "") || "/";
      paths.add(path);
    }
  }
  return paths;
}
