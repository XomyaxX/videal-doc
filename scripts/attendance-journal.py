"""Printable weekly arrival/leave journal. Excludes AHO and leads."""
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.colors import Color, HexColor, white, black
import os

FONT_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "fonts")
pdfmetrics.registerFont(TTFont("DejaVu", os.path.join(FONT_DIR, "DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont("DejaVuBold", os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf")))

NAVY = HexColor("#1B3A6B")
NAVY2 = HexColor("#2A5298")
ROW_A = HexColor("#F4F7FB")
ROW_B = white
LINE = HexColor("#8AA0C0")
MUTED = HexColor("#334155")

PEOPLE = [
    "Бабкина Регина Валерьевна",
    "Бояренок Евгения Анатольевна",
    "Гирсов Валерий Александрович",
    "Козлов Венедикт Вадимович",
    "Коропец Илья Александрович",
    "Лугин Максим Васильевич",
    "Матвеева Марина Владимировна",
    "Митрофанов Тимофей Николаевич",
    "Новикова Дарья Дмитриевна",
    "Петрик Мария Викторовна",
    "Радле-Десятник Максим Константинович",
    "Ребро Ева Дмитриевна",
    "Рулько Виктория Сергеевна",
    "Урокпаев Арыстан Сабыржанович",
    "Хозяинов Максим Андреевич",
    "Четверикова Ксения Александровна",
]

OUT = r"C:\Users\LENOVO\Downloads\Журнал_прихода_ухода_21-25_сентября_2026.pdf"

W, H = landscape(A4)
ML, MR, MT, MB = 12 * mm, 12 * mm, 10 * mm, 12 * mm


def main():
    c = canvas.Canvas(OUT, pagesize=landscape(A4))
    c.setTitle("Журнал учета прихода и ухода сотрудников · 21–25 сентября 2026")

    y = H - MT
    c.setFillColor(NAVY)
    c.setFont("DejaVuBold", 16)
    c.drawCentredString(W / 2, y - 6, "Журнал учета прихода и ухода сотрудников")
    y -= 11
    c.setStrokeColor(NAVY)
    c.setLineWidth(1.6)
    c.line(ML, y, W - MR, y)
    y -= 8

    c.setFillColor(black)
    c.setFont("DejaVu", 9)
    c.drawString(ML, y, "Организация / подразделение: ООО «Видиал Медиа»")
    y -= 13
    c.setFont("DejaVuBold", 11)
    c.drawString(ML, y, "Неделя с  «21»  сентября  по  «25»  сентября  2026  г.")
    c.setFont("DejaVu", 8)
    c.drawRightString(W - MR, y, "один лист на всю рабочую неделю")
    y -= 11
    c.setFillColor(MUTED)
    c.setFont("DejaVu", 7.5)
    c.drawString(
        ML,
        y,
        "В клетке дня напишите время и поставьте подпись: утром — «Приход», вечером — «Уход». "
        "В примечании — отпуск, больничный, командировка, удалёнка.",
    )
    y -= 8

    days = ["Пн", "Вт", "Ср", "Чт", "Пт"]
    inner = W - ML - MR
    col_n = 10 * mm
    col_note = 32 * mm
    col_fio = 72 * mm
    day_w = (inner - col_n - col_fio - col_note) / 5
    half = day_w / 2
    xs = [ML]
    xs.append(xs[-1] + col_n)
    xs.append(xs[-1] + col_fio)
    for _ in days:
        xs.append(xs[-1] + half)
        xs.append(xs[-1] + half)
    xs.append(xs[-1] + col_note)

    names = PEOPLE + [""]
    n_rows = len(names)
    header_h = 16 * mm
    row_h = 8.6 * mm
    table_top = y
    table_bot = table_top - header_h - row_h * n_rows

    # header bg
    c.setFillColor(NAVY)
    c.rect(ML, table_top - header_h, inner, header_h, fill=1, stroke=0)

    c.setFillColor(white)
    c.setFont("DejaVuBold", 8)
    c.drawCentredString((xs[0] + xs[1]) / 2, table_top - 10 * mm, "№")
    c.drawCentredString((xs[1] + xs[2]) / 2, table_top - 10 * mm, "ФИО")
    for i, d in enumerate(days):
        x0 = xs[2 + i * 2]
        x1 = xs[4 + i * 2]
        c.drawCentredString((x0 + x1) / 2, table_top - 5.5 * mm, d)
        c.setFont("DejaVu", 6.5)
        c.drawCentredString((x0 + xs[3 + i * 2]) / 2, table_top - 12.2 * mm, "Приход")
        c.drawCentredString((xs[3 + i * 2] + x1) / 2, table_top - 12.2 * mm, "Уход")
        c.setFont("DejaVuBold", 8)
    c.drawCentredString((xs[-2] + xs[-1]) / 2, table_top - 10 * mm, "Примечание")

    # day subheader line
    c.setStrokeColor(white)
    c.setLineWidth(0.4)
    c.line(xs[2], table_top - 8 * mm, xs[-2], table_top - 8 * mm)

    for i in range(n_rows):
        top = table_top - header_h - i * row_h
        bot = top - row_h
        c.setFillColor(ROW_A if i % 2 == 0 else ROW_B)
        c.rect(ML, bot, inner, row_h, fill=1, stroke=0)
        c.setFillColor(black)
        c.setFont("DejaVu", 8)
        c.drawCentredString((xs[0] + xs[1]) / 2, bot + 3.4 * mm, str(i + 1))
        if i < len(names) and names[i]:
            c.setFont("DejaVu", 7.6)
            c.drawString(xs[1] + 2 * mm, bot + 3.4 * mm, names[i])

    # grid
    c.setStrokeColor(LINE)
    c.setLineWidth(0.5)
    for x in xs:
        c.line(x, table_bot, x, table_top)
    c.setStrokeColor(NAVY)
    c.setLineWidth(1)
    c.rect(ML, table_bot, inner, table_top - table_bot, fill=0, stroke=1)
    c.setLineWidth(0.6)
    c.line(xs[2], table_top - 8 * mm, xs[-2], table_top - 8 * mm)
    for i in range(n_rows):
        yline = table_top - header_h - i * row_h
        c.setStrokeColor(LINE)
        c.setLineWidth(0.4)
        c.line(ML, yline, W - MR, yline)
    c.setStrokeColor(NAVY)
    c.setLineWidth(0.8)
    c.line(ML, table_top - header_h, W - MR, table_top - header_h)

    c.setFillColor(black)
    c.setFont("DejaVu", 8)
    c.drawString(ML, MB + 2 * mm, "Ответственный: _________________ / _________________")
    c.setFont("DejaVu", 7)
    c.setFillColor(MUTED)
    c.drawRightString(W - MR, MB + 2 * mm, "Формат А4 · альбомная ориентация · 21–25 сентября 2026")

    c.save()
    print(OUT)


if __name__ == "__main__":
    main()
