"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorText, Field, Input, Pill, Select, Textarea } from "@/components/ui";
import {
  CLEARANCE_REASON,
  CLEARANCE_STATUS,
  defaultClearancePrint,
  type ClearancePrint,
} from "@/lib/clearance";

type Line = { id: string; title: string; invNo: string; qty: number; returned: boolean; note: string };
type Sheet = {
  id: string;
  number: string;
  status: string;
  reason: string;
  note: string;
  createdAt: string;
  employee: { name: string; dept: string; position: string };
  author: string;
  lines: Line[];
  print: ClearancePrint;
};

export function ClearanceCard({ initial, manage }: { initial: Sheet; manage: boolean }) {
  const router = useRouter();
  const [sheet, setSheet] = useState(initial);
  const [lines, setLines] = useState(initial.lines);
  const [note, setNote] = useState(initial.note);
  const [reason, setReason] = useState(initial.reason);
  const [extra, setExtra] = useState("");
  const [unassign, setUnassign] = useState(true);
  const [print, setPrint] = useState<ClearancePrint>(initial.print);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const open = sheet.status === "open" && manage;
  const st = CLEARANCE_STATUS[sheet.status] || CLEARANCE_STATUS.open;

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setErr("");
    const res = await fetch(`/api/inventory/clearance/${sheet.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setErr(data.error || "Не сохранилось");
      return false;
    }
    router.refresh();
    return true;
  }

  async function save() {
    await patch({ lines, note, reason, print });
  }

  function fillFromCard() {
    setPrint(
      defaultClearancePrint({
        fullName: sheet.employee.name,
        workplace: sheet.employee.dept,
        position: sheet.employee.position,
        dismissedAt: print.dismissedAt || sheet.createdAt.slice(0, 10),
        equipment: lines,
      }),
    );
  }

  return (
    <div>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted">
              {sheet.employee.name}
              {sheet.employee.position ? ` · ${sheet.employee.position}` : ""}
              {sheet.employee.dept ? ` · ${sheet.employee.dept}` : ""}
            </p>
            <p className="text-sm text-muted">Составил: {sheet.author}</p>
          </div>
          <Pill tone={st.tone}>{st.label}</Pill>
        </div>
        {open ? (
          <Field label="Основание">
            <Select value={reason} onChange={(e) => setReason(e.target.value)}>
              {Object.entries(CLEARANCE_REASON).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <p className="mt-3">Основание: {CLEARANCE_REASON[sheet.reason] || sheet.reason}</p>
        )}
        {open ? (
          <Field label="Примечание">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        ) : sheet.note ? (
          <p className="mt-2 text-sm">{sheet.note}</p>
        ) : null}
      </Card>

      <Card className="mt-4">
        <h2 className="font-serif text-xl text-navy">Имущество</h2>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1">Наименование</th>
              <th>Инв. №</th>
              <th>Кол.</th>
              <th>Сдано</th>
              <th>Отметка</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className="py-2">{l.title}</td>
                <td>{l.invNo}</td>
                <td>{l.qty}</td>
                <td>
                  {open ? (
                    <input
                      type="checkbox"
                      checked={l.returned}
                      onChange={(e) => setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, returned: e.target.checked } : x)))}
                    />
                  ) : l.returned ? (
                    "да"
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {open ? (
                    <Input
                      value={l.note}
                      onChange={(e) => setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, note: e.target.value } : x)))}
                    />
                  ) : (
                    l.note
                  )}
                </td>
              </tr>
            ))}
            {!lines.length ? (
              <tr>
                <td colSpan={5} className="py-3 text-muted">
                  Закреплённого имущества нет. Добавьте ключи, пропуск или иное вручную.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {open ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <Input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Ключи, пропуск…" />
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !extra.trim()}
              onClick={async () => {
                const ok = await patch({ addLine: true, title: extra.trim() });
                if (ok) {
                  setExtra("");
                  window.location.reload();
                }
              }}
            >
              Добавить строку
            </Button>
          </div>
        ) : null}
      </Card>

      <Card className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-xl text-navy">Данные для печати</h2>
          {manage ? (
            <Button type="button" variant="ghost" disabled={busy} onClick={fillFromCard}>
              Подставить из карточки
            </Button>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted">Форма как в бланке. Поправьте поля и сохраните — потом печать.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Ф.И.О. увольняющегося работника">
            <Input value={print.fullName} onChange={(e) => setPrint({ ...print, fullName: e.target.value })} disabled={!manage} />
          </Field>
          <Field label="Место работы">
            <Input value={print.workplace} onChange={(e) => setPrint({ ...print, workplace: e.target.value })} disabled={!manage} />
          </Field>
          <Field label="Должность">
            <Input value={print.position} onChange={(e) => setPrint({ ...print, position: e.target.value })} disabled={!manage} />
          </Field>
          <Field label="Дата увольнения" hint="По умолчанию — день заполнения листа. Можно выбрать другую.">
            <Input
              type="date"
              value={print.dismissedAt}
              onChange={(e) => setPrint({ ...print, dismissedAt: e.target.value })}
              disabled={!manage}
            />
          </Field>
        </div>
        <div className="mt-4 space-y-4">
          {print.blocks.map((b, i) => (
            <div key={b.id} className="rounded-xl border border-line p-3">
              <p className="font-semibold text-navy">{b.title}</p>
              <Field label="Отметка / примечание">
                <Textarea
                  value={b.note}
                  disabled={!manage}
                  onChange={(e) =>
                    setPrint({
                      ...print,
                      blocks: print.blocks.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)),
                    })
                  }
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Должность лица, проставившего отметку">
                  <Input
                    value={b.signerRole}
                    disabled={!manage}
                    onChange={(e) =>
                      setPrint({
                        ...print,
                        blocks: print.blocks.map((x, j) => (j === i ? { ...x, signerRole: e.target.value } : x)),
                      })
                    }
                  />
                </Field>
                <Field label="Ф.И.О. лица, проставившего отметку">
                  <Input
                    value={b.signerName}
                    disabled={!manage}
                    onChange={(e) =>
                      setPrint({
                        ...print,
                        blocks: print.blocks.map((x, j) => (j === i ? { ...x, signerName: e.target.value } : x)),
                      })
                    }
                  />
                </Field>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          disabled={busy}
          onClick={async () => {
            if (manage) {
              const ok = await patch({ print, lines, note, reason });
              if (!ok) return;
            }
            window.open(`/api/inventory/clearance/${sheet.id}/pdf`, "_blank");
          }}
        >
          Распечатать PDF
        </Button>
        {open ? (
          <>
            <Button variant="secondary" disabled={busy} onClick={() => void save()}>
              Сохранить
            </Button>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={unassign} onChange={(e) => setUnassign(e.target.checked)} />
              При закрытии снять сданные позиции с сотрудника
            </label>
            <Button
              disabled={busy}
              onClick={async () => {
                await save();
                if (confirm("Закрыть обходной лист?")) await patch({ status: "done", unassign, lines, note, reason });
              }}
            >
              Закрыть лист
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => void patch({ status: "cancelled" })}>
              Отменить
            </Button>
          </>
        ) : null}
      </div>
      <ErrorText>{err}</ErrorText>
    </div>
  );
}
