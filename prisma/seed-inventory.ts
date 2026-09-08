import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Row = {
  invNo: string;
  name: string;
  qty?: number;
  login?: string | null;
  lastName?: string;
  holderName?: string;
  note?: string;
  pc?: { host: string; cpu: string; gpu: string; ram: string; disk: string; mb: string };
};

const ROWS: Row[] = [
  { invNo: "1207", name: "КАМЕРА видеонаблюдения", login: "lyudmila" },
  { invNo: "1206", name: "Кондиционер", login: "lyudmila" },
  { invNo: "1206", name: "Кондиционер Ball", login: "lyudmila" },
  { invNo: "1205", name: "Кресло офисное", login: "lyudmila" },
  { invNo: "1203", name: "Кулер чайник", login: "lyudmila" },
  { invNo: "1204", name: "Ноутбук Dell", login: "lyudmila" },
  { invNo: "1200", name: "Ноутбук Tecno", login: "lyudmila" },
  { invNo: "1201", name: "Принтер Pantum", login: "lyudmila" },
  { invNo: "1202", name: "Телефон Yealink", login: "lyudmila" },

  { invNo: "1224", name: "Клавиатура проводная", login: "ermilov" },
  { invNo: "1103", name: "Коврик для мыши", login: "ermilov" },
  { invNo: "1165", name: "Кресло экокожа", login: "ermilov", note: "на скане 1164" },
  { invNo: "1223", name: "Моноблок CHUWI 27", login: "ermilov" },
  { invNo: "1226", name: "МФУ лазерный Pantum", login: "ermilov" },
  { invNo: "1225", name: "Мышь беспроводная", login: "ermilov" },
  { invNo: "1222", name: "Стол компьютерный", login: "ermilov", note: "на скане 1158" },

  { invNo: "1152", name: "Коврик ARDOR", lastName: "Кромск", holderName: "Александр К." },
  { invNo: "1119", name: "ИПБ Ippon 1050", lastName: "Кромск", holderName: "Александр К." },
  { invNo: "1154", name: "Клавиатура проводная", lastName: "Кромск", holderName: "Александр К." },
  {
    invNo: "1151",
    name: "Компьютер Core Ultra 5",
    lastName: "Кромск",
    holderName: "Александр К.",
    pc: {
      host: "VALERA-PC",
      cpu: "Intel Core Ultra 5 245KF",
      gpu: "NVIDIA GeForce RTX 5060",
      ram: "64 ГБ Kingston 5200",
      disk: "ADATA LEGEND 900 954 ГБ",
      mb: "B860M GAMING X WIFI6E",
    },
  },
  { invNo: "1252", name: "Кресло офисное", lastName: "Кромск", holderName: "Александр К.", note: "на скане 1276" },
  { invNo: "1150", name: "МОНИТОР 27\" Redmi", lastName: "Кромск", holderName: "Александр К." },
  { invNo: "1253", name: "Мышь беспроводная/проводная", lastName: "Кромск", holderName: "Александр К." },
  { invNo: "1194", name: "Наушники проводные", lastName: "Кромск", holderName: "Александр К." },
  { invNo: "1149", name: "Телевизор Samsung LED", lastName: "Кромск", holderName: "Александр К." },
  { invNo: "1156", name: "Сетевой фильтр", lastName: "Кромск", holderName: "Александр К." },

  { invNo: "1116", name: "ИБП DEXP CEE-E1500VA (литейно-интерактивный, 1500 ВА)", login: "laptev" },
  { invNo: "1035", name: "Клавиатура проводная + беспроводная AULA", login: "laptev" },
  { invNo: "1051", name: "Лампа настольная", login: "laptev" },
  { invNo: "1108", name: "МОНИТОР SAMSUNG 27\"", login: "laptev" },
  { invNo: "1125", name: "МОНИТОР SAMSUNG 27\"", login: "laptev" },
  {
    invNo: "1106",
    name: "ПРОЦЕССОР CORE ULTRA 9 285K",
    login: "laptev",
    pc: {
      host: "ALEKSANDR",
      cpu: "Intel Core Ultra 9 285K",
      gpu: "NVIDIA GeForce RTX 5070",
      ram: "96 ГБ (4×24 ГБ 4800)",
      disk: "DGSM3001TM23T 954 ГБ; AGI2T0GIMAI298 1908 ГБ",
      mb: "B860M GAMING X WIFI6E",
    },
  },
  { invNo: "1130", name: "Сетевой фильтр (5 розеток, 5 м)", login: "laptev" },
  { invNo: "1071", name: "Стол", login: "laptev" },
  { invNo: "1233", name: "Стул", login: "laptev" },

  { invNo: "1063", name: "Клавиатура беспроводная A4Tech Fstyler", holderName: "", note: "18 стол, место пустует" },
  {
    invNo: "1067",
    name: "Компьютер R 5 5600 / A520",
    holderName: "",
    note: "18 стол, место пустует",
    pc: {
      host: "GUGUGAGA",
      cpu: "AMD Ryzen 5 5500",
      gpu: "NVIDIA GeForce RTX 5050",
      ram: "32 ГБ Kingston 3200",
      disk: "DGSM3512GM23T 477 ГБ",
      mb: "A520M K V2",
    },
  },
  { invNo: "1120", name: "Наушники проводные", holderName: "", note: "18 стол; на скане «в офисе»" },
  { invNo: "1069", name: "Монитор", holderName: "", note: "18 стол, место пустует" },
  { invNo: "1188", name: "Монитор", holderName: "", note: "18 стол, место пустует" },
  { invNo: "1274", name: "Стул/кресло", holderName: "", note: "18 стол; на скане 1277" },

  { invNo: "1257", name: "Кресло офисное", login: "zimareva" },
  { invNo: "1160", name: "Мышь беспроводная", login: "zimareva" },
  { invNo: "1191", name: "Наушники проводные", login: "zimareva" },
  { invNo: "1030", name: "Ноутбук Tecno", login: "zimareva" },
  { invNo: "1259", name: "Сетевой фильтр 1,8 м 5 р", login: "zimareva" },
  { invNo: "1258", name: "Стол", login: "zimareva" },

  { invNo: "1107", name: "Клавиатура", login: "girsov.va" },
  { invNo: "1109", name: "МОНИТОР RAZZ MT-27VA75HFHD", login: "girsov.va" },
  { invNo: "1105", name: "Мышь проводная GMNG XM007", login: "girsov.va", note: "на скане 1102" },
  { invNo: "1058", name: "Ноутбук Tecno", login: "girsov.va" },
  { invNo: "1015", name: "Сетевой фильтр (6 розеток, 5 м)", login: "girsov.va" },
  { invNo: "1056", name: "Сетевой фильтр Harper", login: "girsov.va" },
  { invNo: "1264", name: "Стол", login: "girsov.va" },
  { invNo: "1265", name: "Стул", login: "girsov.va" },

  { invNo: "1174", name: "Коврик ARDOR", login: "rulko" },
  { invNo: "1068", name: "Адаптер Bluetooth Buro", login: "rulko" },
  { invNo: "1038", name: "ИБП Ippon Back Basic 1500 Euro", login: "rulko" },
  { invNo: "1101", name: "Клавиатура беспроводная A4Tech Fstyler", login: "rulko" },
  {
    invNo: "1273",
    name: "Компьютер Ryzen 5 5600",
    login: "rulko",
    note: "инв. 1088 по отчёту ПК",
    pc: {
      host: "PC",
      cpu: "AMD Ryzen 5 7500F",
      gpu: "NVIDIA GeForce RTX 5060",
      ram: "32 ГБ A-DATA 5600",
      disk: "DGSM3512GM23T 477 ГБ",
      mb: "B650M D3HP AX",
    },
  },
  { invNo: "1097", name: "Кресло офисное", login: "rulko" },
  { invNo: "1138", name: "МОНИТОР 27\" Xiaomi A27i", login: "rulko" },
  { invNo: "1271", name: "Мышь проводная DEXP Anger", login: "rulko" },
  { invNo: "1069", name: "Сетевой фильтр (5 розеток, 5 м)", login: "rulko" },
  { invNo: "1272", name: "МОНИТОР 22\" графический HUION", login: "rulko" },

  { invNo: "1060", name: "Коврик ARDOR", login: "novikova" },
  { invNo: "1148", name: "Адаптер, внешняя антенна", login: "novikova" },
  { invNo: "1042/1", name: "ИБП Ippon Back Basic 1500 Euro", login: "novikova" },
  { invNo: "1190", name: "Клавиатура проводная DEXP", login: "novikova" },
  {
    invNo: "1187",
    name: "Компьютер 7500F B650M",
    login: "novikova",
    pc: {
      host: "DARIA",
      cpu: "AMD Ryzen 5 7500F",
      gpu: "NVIDIA GeForce RTX 5060",
      ram: "32 ГБ A-DATA 6000",
      disk: "Patriot M.2 P310 480GB 447 ГБ",
      mb: "A620M DS3H",
    },
  },
  { invNo: "1054", name: "МОНИТОР 27\" Xiaomi A27i", login: "novikova" },
  { invNo: "1090", name: "Мышь беспроводная", login: "novikova" },
  { invNo: "1049", name: "Сетевой фильтр (6 розеток, 5 м)", login: "novikova" },
  { invNo: "1269", name: "МОНИТОР 22\" графический HUION", login: "novikova" },
  { invNo: "1186", name: "Стул", login: "novikova" },
  { invNo: "1270", name: "Шкаф пенал", login: "novikova" },

  { invNo: "1046", name: "Коврик ARDOR", login: "rebro", note: "на скане DEXP" },
  { invNo: "1234", name: "Клавиатура проводная DEXP", login: "rebro" },
  {
    invNo: "1144",
    name: "Компьютер 7500F B650M",
    login: "rebro",
    pc: {
      host: "EVASLITTLERENDE",
      cpu: "AMD Ryzen 5 7500F",
      gpu: "NVIDIA GeForce RTX 5060",
      ram: "32 ГБ G.SKILL 5600",
      disk: "Patriot M.2 P310 480GB 447 ГБ",
      mb: "A620M H",
    },
  },
  { invNo: "1135", name: "Лампа настольная", login: "rebro" },
  { invNo: "1124", name: "МОНИТОР 27\" RAZZ", login: "rebro" },
  { invNo: "1052", name: "МОНИТОР 27\" Xiaomi A27i (SN 51062)", login: "rebro" },
  { invNo: "1095", name: "Стол", login: "rebro" },
  { invNo: "1239", name: "Стул", login: "rebro" },

  {
    invNo: "1050",
    name: "Компьютер R 5 5600 / A520",
    login: "boyarenok",
    pc: {
      host: "EUGENE",
      cpu: "AMD Ryzen 5 5600",
      gpu: "NVIDIA GeForce RTX 5050",
      ram: "32 ГБ Kingston 3200",
      disk: "Reletech P400 EVO PCIE4.0 1TB 954 ГБ",
      mb: "A520M PRO (MS-7D14)",
    },
  },
  { invNo: "1086", name: "МОНИТОР 22\" графический HUION", login: "boyarenok" },
  { invNo: "1037", name: "МОНИТОР 27\" Xiaomi A27i (SN 51061)", login: "boyarenok" },
  { invNo: "1141", name: "Коврик ARDOR", login: "boyarenok" },
  { invNo: "1055", name: "Клавиатура проводная DEXP", login: "boyarenok" },
  { invNo: "1062", name: "Стол компьютерный", login: "boyarenok" },
  { invNo: "1185", name: "Мышь проводная", login: "boyarenok" },
  { invNo: "1275", name: "Стул/кресло", login: "boyarenok" },

  { invNo: "1024", name: "Мышь беспроводная/проводная", login: "koropets" },
  { invNo: "1231", name: "Стол компьютерный", login: "koropets" },
  { invNo: "1230", name: "Стул", login: "koropets", note: "на скане 1279" },
  { invNo: "1159", name: "Ноутбук Tecno", login: "koropets" },

  { invNo: "1242", name: "Монитор", login: "chetverikova" },
  { invNo: "1241", name: "Монитор", login: "chetverikova" },
  { invNo: "1243", name: "Клавиатура", login: "chetverikova" },
  { invNo: "1245", name: "Коврик DEXP Black", login: "chetverikova" },
  { invNo: "1048", name: "Кресло офисное", login: "chetverikova" },
  { invNo: "1244", name: "Мышь беспроводная", login: "chetverikova" },
  {
    invNo: "1246",
    name: "Компьютер 7500F B650M",
    login: "chetverikova",
    pc: {
      host: "DESKTOP-NOJQ4P4",
      cpu: "AMD Ryzen 5 7500F",
      gpu: "NVIDIA GeForce RTX 5060",
      ram: "32 ГБ Kingston 4800",
      disk: "ADATA LEGEND 710 477 ГБ",
      mb: "B650M GAMING WIFI6E",
    },
  },
  { invNo: "1240", name: "Стол", login: "chetverikova" },

  { invNo: "1057", name: "Коврик ARDOR", login: "radle" },
  { invNo: "1184", name: "Клавиатура", login: "radle" },
  {
    invNo: "1123",
    name: "Компьютер R5 5500/A520",
    login: "radle",
    pc: {
      host: "YAR",
      cpu: "AMD Ryzen 5 7500F",
      gpu: "NVIDIA GeForce RTX 5050",
      ram: "32 ГБ 6000",
      disk: "ADATA LEGEND 900 954 ГБ",
      mb: "B650M D3HP AX",
    },
  },
  { invNo: "1115", name: "Лампа настольная", login: "radle" },
  { invNo: "1098", name: "МОНИТОР 27\" Xiaomi A27Qi (SN 48212)", login: "radle" },
  { invNo: "1132", name: "МОНИТОР 27\" Xiaomi A27Qi (SN 48214)", login: "radle" },
  { invNo: "1128", name: "Мышь проводная DEXP", login: "radle" },
  { invNo: "1114", name: "Наушники JBL Tune 520BT", login: "radle" },
  { invNo: "1180", name: "Планшет графический HUION", login: "radle" },
  { invNo: "1250", name: "Стол", login: "radle" },
  { invNo: "1249", name: "Стул", login: "radle" },

  {
    invNo: "1039",
    name: "Компьютер R7",
    login: "khozyainov",
    pc: {
      host: "DESKTOP-H704RI5",
      cpu: "AMD Ryzen 7 7800X3D",
      gpu: "NVIDIA GeForce RTX 5060 Ti",
      ram: "64 ГБ Kingston 5600",
      disk: "AGI2T0GIMAI298 1908 ГБ",
      mb: "B650M D3HP AX",
    },
  },
  { invNo: "1232", name: "Кресло офисное", login: "khozyainov" },
  { invNo: "1043", name: "МОНИТОР 27\" Xiaomi A27i", login: "khozyainov" },
  { invNo: "1087", name: "МОНИТОР 27\" Xiaomi A27Qi (SN 48211)", login: "khozyainov" },
  { invNo: "1176", name: "Мышь проводная A4Tech OP-330 USB", login: "khozyainov" },
  { invNo: "1193", name: "Наушники проводные", login: "khozyainov" },
  { invNo: "1183", name: "Стол", login: "khozyainov" },
  { invNo: "1089", name: "Клавиатура проводная", login: "khozyainov", note: "на скане приписано" },

  { invNo: "1045", name: "Коврик ARDOR", login: "demidovich" },
  { invNo: "1139", name: "ИБП Ippon Back Basic 1500 Euro", login: "demidovich" },
  {
    invNo: "1040",
    name: "Компьютер Intel Core i5-12400F",
    login: "demidovich",
    pc: {
      host: "KSENIA",
      cpu: "AMD Ryzen 5 8400F",
      gpu: "NVIDIA GeForce RTX 4060",
      ram: "32 ГБ 4800",
      disk: "ADATA LEGEND 710 954 ГБ",
      mb: "PRO B650M-P (MS-7E27)",
    },
  },
  { invNo: "1247", name: "Кресло офисное", login: "demidovich" },
  { invNo: "1047", name: "Лампа настольная", login: "demidovich" },
  { invNo: "1036", name: "МОНИТОР 27\" Xiaomi A27i", login: "demidovich" },
  { invNo: "1044", name: "МОНИТОР 27\" Xiaomi A27i (SN 51063)", login: "demidovich" },
  { invNo: "1041", name: "Наушники проводные", login: "demidovich" },
  { invNo: "1140", name: "Сетевой фильтр (6 розеток, 5 м)", login: "demidovich" },
  { invNo: "1033", name: "Стол компьютерный", login: "demidovich" },
  { invNo: "1248", name: "Стул", login: "demidovich" },

  { invNo: "1104", name: "Коврик Red Square", holderName: "Маша" },
  { invNo: "1261", name: "Кресло офисное", holderName: "Маша" },
  { invNo: "1065", name: "Лампа настольная", holderName: "Маша" },
  { invNo: "1260", name: "Стол", holderName: "Маша" },

  { invNo: "1195", name: "Внешний аудиоинтерфейс", login: "kozlov" },
  { invNo: "1178", name: "Wi-Fi адаптер TP-LINK TL-WN722N USB 2.0", login: "kozlov" },
  { invNo: "1162", name: "Клавиатура", login: "kozlov" },
  { invNo: "MT-006", name: "Монитор 24 Samsung", login: "kozlov" },
  { invNo: "1256", name: "МОНИТОР 27\" Xiaomi", login: "kozlov" },
  { invNo: "1153", name: "Мышь проводная DEXP Anger", login: "kozlov" },
  { invNo: "1190/1", name: "Наушники проводные", login: "kozlov" },
  {
    invNo: "C-00013",
    name: "ПК с магазина",
    login: "kozlov",
    pc: {
      host: "VIDIAL",
      cpu: "12th Gen Intel Core i7-12700",
      gpu: "Intel UHD Graphics 770",
      ram: "16 ГБ Apacer 2667",
      disk: "Apacer AS2280P4 512GB 477 ГБ",
      mb: "H610MHP",
    },
  },
  { invNo: "1255", name: "Стул", login: "kozlov" },

  { invNo: "1093", name: "ИБП Ippon Back Basic 1500 Euro", login: "propastina" },
  { invNo: "1177", name: "ИПБ Ippon 1050", login: "propastina" },
  { invNo: "1235", name: "Коврик DEXP Black ARDOR", login: "propastina" },
  {
    invNo: "1096",
    name: "Компьютер R 5 5600 / B550",
    login: "propastina",
    pc: {
      host: "MAXIMBLYADESLAV",
      cpu: "AMD Ryzen 5 7500F",
      gpu: "NVIDIA GeForce RTX 5060",
      ram: "32 ГБ Kingston 5600",
      disk: "MSI M461 1TB 932 ГБ",
      mb: "A620M H",
    },
  },
  { invNo: "1228", name: "Кресло офисное", login: "propastina" },
  { invNo: "1155", name: "Микрофон Fifine", login: "propastina" },
  { invNo: "1131", name: "МОНИТОР 27\" Xiaomi A27i", login: "propastina" },
  { invNo: "1056", name: "МОНИТОР графический HUION Kamvas 22", login: "propastina" },
  { invNo: "1163", name: "Мышь беспроводная/проводная", login: "propastina" },
  { invNo: "1080", name: "Сетевой фильтр (6 розеток, 1,8 м)", login: "propastina" },
  { invNo: "1092", name: "Сетевой фильтр Harper", login: "propastina" },
  { invNo: "1061", name: "Стол компьютерный", login: "propastina" },
  { invNo: "1229", name: "Тумба 4 ящика", login: "propastina" },

  { invNo: "1173", name: "Коврик ARDOR", login: "mitrofanov" },
  { invNo: "1070", name: "ИБП Ippon Back Basic 1500 Euro", login: "mitrofanov" },
  { invNo: "1133", name: "Клавиатура проводная DEXP", login: "mitrofanov" },
  {
    invNo: "1129",
    name: "Компьютер Intel I5-12400F",
    login: "mitrofanov",
    pc: {
      host: "DESKTOP-GA5DIVD",
      cpu: "AMD Ryzen 5 7500F",
      gpu: "NVIDIA GeForce RTX 5050",
      ram: "32 ГБ 5200",
      disk: "Reletech P600 M.2 PCIE3.0 512GB 477 ГБ",
      mb: "B650M D3HP AX",
    },
  },
  { invNo: "1136", name: "Кресло офисное", login: "mitrofanov" },
  { invNo: "1137", name: "МОНИТОР 27\" Xiaomi A27i", login: "mitrofanov" },
  { invNo: "1099", name: "МОНИТОР 27\" Xiaomi A27Qi (SN 48213)", login: "mitrofanov" },
  { invNo: "1134", name: "Мышь беспроводная/проводная", login: "mitrofanov" },
  { invNo: "1042", name: "Планшет графический Wacom", login: "mitrofanov" },
  { invNo: "1066", name: "Сетевой фильтр Harper", login: "mitrofanov" },
  { invNo: "1094", name: "Стол", login: "mitrofanov" },
  { invNo: "1251", name: "Стол тумба", login: "mitrofanov" },
];

async function main() {
  const n = await prisma.inventoryItem.count({ where: { deletedAt: null } });
  if (n > 0) {
    console.log("inventory already", n);
    return;
  }
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, login: true, lastName: true },
  });
  const byLogin = new Map(users.map((u) => [u.login, u.id]));
  function uid(row: Row) {
    if (row.login && byLogin.has(row.login)) return byLogin.get(row.login)!;
    if (row.lastName) {
      const u = users.find((x) => x.lastName.toLowerCase().startsWith(row.lastName!.toLowerCase()));
      if (u) return u.id;
    }
    return null;
  }
  for (const r of ROWS) {
    const userId = uid(r);
    await prisma.inventoryItem.create({
      data: {
        invNo: r.invNo,
        name: r.name,
        qty: r.qty || 1,
        userId,
        holderName: r.holderName || "",
        kind: r.pc ? "pc" : "item",
        pcHost: r.pc?.host || "",
        pcCpu: r.pc?.cpu || "",
        pcGpu: r.pc?.gpu || "",
        pcRam: r.pc?.ram || "",
        pcDisk: r.pc?.disk || "",
        pcMb: r.pc?.mb || "",
        note: r.note || "",
      },
    });
  }
  console.log("inventory seeded", ROWS.length);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
