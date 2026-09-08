"use client";

import { useState } from "react";
import { Button, Card, ErrorText, Field, Input, Select } from "@/components/ui";

type Opt = { id: string; name: string };
type SkillOpt = { id: string; code: string; name: string; body: string };

export function EmployeeForm({
  roles,
  departments,
  positions,
  managers,
  skills,
  initial,
  initialSkillIds,
}: {
  roles: Opt[];
  departments: Opt[];
  positions: Opt[];
  managers: Opt[];
  skills?: SkillOpt[];
  initial?: Record<string, string>;
  initialSkillIds?: string[];
}) {
  const [error, setError] = useState("");
  const [temp, setTemp] = useState("");
  const [busy, setBusy] = useState(false);
  const isEdit = Boolean(initial?.id);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    const skillIds = fd.getAll("skillIds").map(String);
    const res = await fetch(isEdit ? `/api/users/${initial!.id}` : "/api/users", {
      method: isEdit ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, skillIds }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Ошибка");
      return;
    }
    if (data.tempPassword) {
      setTemp(data.tempPassword);
      return;
    }
    window.location.href = `/employees/${initial?.id || data.id}`;
  }

  if (temp) {
    return (
      <Card>
        <h2 className="font-serif text-2xl text-navy">Сотрудник создан</h2>
        <p className="mt-2">Отдайте ему логин и временный пароль. При входе система попросит сменить пароль.</p>
        <p className="mt-4 rounded-xl bg-paper p-4 font-mono text-lg">Пароль: {temp}</p>
        <Button href="/employees" className="mt-4">
          К списку
        </Button>
      </Card>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
      <ErrorText>{error}</ErrorText>
      <div className="md:col-span-2" />
      <Field label="Фамилия">
        <Input name="lastName" defaultValue={initial?.lastName} required />
      </Field>
      <Field label="Имя">
        <Input name="firstName" defaultValue={initial?.firstName} required />
      </Field>
      <Field label="Отчество">
        <Input name="middleName" defaultValue={initial?.middleName} />
      </Field>
      <Field label="Телефон">
        <Input name="phone" defaultValue={initial?.phone} />
      </Field>
      <Field label="Email" hint="Рабочий ящик сотрудника. Письма, которые он рассылает из Дока, уходят с него">
        <Input name="email" type="email" defaultValue={initial?.email} />
      </Field>
      <Field
        label="Пароль приложения почты"
        hint={
          initial?.hasSmtpPassword === "1"
            ? "уже сохранён, оставьте пустым чтобы не менять"
            : "пароль приложения Mail.ru / Яндекса / Google, не пароль входа в почту"
        }
      >
        <Input name="smtpPassword" type="password" placeholder={initial?.hasSmtpPassword === "1" ? "••••••" : ""} autoComplete="new-password" />
      </Field>
      <Field label="Логин">
        <Input name="login" defaultValue={initial?.login} required />
      </Field>
      <Field label="Должность">
        <Select name="positionId" defaultValue={initial?.positionId || ""}>
          <option value="">—</option>
          {positions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Отдел">
        <Select name="departmentId" defaultValue={initial?.departmentId || ""}>
          <option value="">—</option>
          {departments.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Уровень доступа">
        <Select name="roleId" defaultValue={initial?.roleId} required>
          {roles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Руководитель">
        <Select name="managerId" defaultValue={initial?.managerId || ""}>
          <option value="">—</option>
          {managers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Табельный номер">
        <Input name="personnelNumber" defaultValue={initial?.personnelNumber} />
      </Field>
      <Field label="ИНН">
        <Input name="inn" defaultValue={initial?.inn} />
      </Field>
      <Field label="Дата приёма">
        <Input name="hiredAt" type="date" defaultValue={initial?.hiredAt} />
      </Field>
      <Field label="Дата рождения" hint="В день рождения отдел получит уведомление, именинник — поздравление">
        <Input name="birthDate" type="date" defaultValue={initial?.birthDate} />
      </Field>
      {isEdit ? (
        <Field label="Статус">
          <Select name="status" defaultValue={initial?.status}>
            <option value="active">Работает</option>
            <option value="dismissed">Уволен</option>
          </Select>
        </Field>
      ) : null}
      {skills && skills.length > 0 ? (
        <div className="md:col-span-2">
          <Field label="Скилы производства" hint="Можно несколько. Риг могут делать и скульптор, и 3D-аниматор.">
            <div className="grid gap-2 sm:grid-cols-2">
              {skills.map((s) => (
                <label key={s.id} className="flex items-start gap-2 rounded-xl border border-line bg-white px-3 py-2">
                  <input
                    type="checkbox"
                    name="skillIds"
                    value={s.id}
                    defaultChecked={(initialSkillIds || []).includes(s.id)}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-semibold text-navy">{s.name}</span>
                    <span className="mt-0.5 block text-xs text-muted">{s.body}</span>
                  </span>
                </label>
              ))}
            </div>
          </Field>
        </div>
      ) : null}
      <div className="md:col-span-2">
        <Button type="submit" disabled={busy}>
          {isEdit ? "Сохранить" : "Создать сотрудника"}
        </Button>
      </div>
    </form>
  );
}
