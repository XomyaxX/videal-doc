"use client";

import { useState } from "react";
import { Button, Card, Field, Input } from "@/components/ui";

export type SettingsPayload = {
  maxUploadMb: number;
  sessionDays: number;
  fnsEnabled: boolean;
  fnsLogin: string;
  hasFnsPassword: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  hasSmtpPassword: boolean;
  smtpFrom: string;
  mailAutoSend: boolean;
  accountantEmail: string;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  hasImapPassword: boolean;
  imapFolder: string;
};

export function SettingsForm({ settings }: { settings: SettingsPayload }) {
  const [msg, setMsg] = useState("");
  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const res = await fetch("/api/admin/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            maxUploadMb: Number(fd.get("maxUploadMb")),
            sessionDays: Number(fd.get("sessionDays")),
            fnsEnabled: fd.get("fnsEnabled") === "on",
            fnsLogin: fd.get("fnsLogin"),
            fnsPassword: fd.get("fnsPassword"),
            smtpHost: fd.get("smtpHost"),
            smtpPort: Number(fd.get("smtpPort")),
            smtpUser: fd.get("smtpUser"),
            smtpPassword: fd.get("smtpPassword"),
            smtpFrom: fd.get("smtpFrom"),
            mailAutoSend: fd.get("mailAutoSend") === "on",
            accountantEmail: fd.get("accountantEmail"),
            imapHost: fd.get("imapHost"),
            imapPort: Number(fd.get("imapPort")),
            imapUser: fd.get("imapUser"),
            imapPassword: fd.get("imapPassword"),
            imapFolder: fd.get("imapFolder"),
          }),
        });
        setMsg(res.ok ? "Сохранено" : "Не удалось сохранить");
      }}
    >
      <Card className="max-w-lg space-y-4">
        <h2 className="font-serif text-xl text-navy">Система</h2>
        <Field label="Максимальный размер файла, МБ">
          <Input name="maxUploadMb" type="number" defaultValue={settings.maxUploadMb} />
        </Field>
        <Field label="Сессия, дней">
          <Input name="sessionDays" type="number" defaultValue={settings.sessionDays} />
        </Field>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="fnsEnabled" defaultChecked={settings.fnsEnabled} />
          Подтягивать состав чека из ФНС (если есть логин «Проверка чека»)
        </label>
        <Field label="Логин ФНС">
          <Input name="fnsLogin" defaultValue={settings.fnsLogin} />
        </Field>
        <Field label="Пароль ФНС" hint={settings.hasFnsPassword ? "задан, оставьте пустым чтобы не менять" : undefined}>
          <Input name="fnsPassword" type="password" placeholder={settings.hasFnsPassword ? "••••••" : ""} autoComplete="new-password" />
        </Field>
      </Card>

      <Card className="max-w-lg space-y-4">
        <h2 className="font-serif text-xl text-navy">Исходящая почта студии (SMTP)</h2>
        {!settings.smtpHost ? (
          <p className="rounded-xl bg-[var(--warn-bg)] px-3 py-2 text-sm text-warn">
            Сервер не задан. Письма сотрудника уйдут с его ящика, если он подключил почту в профиле. Иначе письма
            никуда не уходят — только уведомления в Доке.
          </p>
        ) : null}
        <p className="text-sm text-muted">
          Это запасной ящик студии. Рассылка, заявления и запросы средств уходят с почты того, кто действует — если
          в его профиле указан пароль приложения. Сюда письма падают, только если у сотрудника почта не подключена.
        </p>
        <Field label="SMTP-сервер">
          <Input name="smtpHost" defaultValue={settings.smtpHost} placeholder="smtp.example.ru" />
        </Field>
        <Field label="Порт">
          <Input name="smtpPort" type="number" defaultValue={settings.smtpPort || 587} />
        </Field>
        <Field label="Логин">
          <Input name="smtpUser" defaultValue={settings.smtpUser} />
        </Field>
        <Field label="Пароль" hint={settings.hasSmtpPassword ? "задан, оставьте пустым чтобы не менять" : undefined}>
          <Input name="smtpPassword" type="password" placeholder={settings.hasSmtpPassword ? "••••••" : ""} autoComplete="new-password" />
        </Field>
        <Field label="От кого (From)">
          <Input name="smtpFrom" defaultValue={settings.smtpFrom} placeholder="Документы Видеал <doc@videal-media.ru>" />
        </Field>
        <Field label="Почта бухгалтера" hint="Сюда уходит авансовый отчёт с кнопки «на почту»">
          <Input name="accountantEmail" type="email" defaultValue={settings.accountantEmail || "vidial_kiv@mail.ru"} />
        </Field>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="mailAutoSend" defaultChecked={settings.mailAutoSend} />
          Автоматически отправлять письма при рассылке и сдаче заявлений
        </label>
      </Card>

      <Card className="max-w-lg space-y-4">
        <h2 className="font-serif text-xl text-navy">Входящая почта — не подключена</h2>
        <p className="rounded-xl bg-[var(--wait-bg)] px-3 py-2 text-sm">
          Ящик не читаем. Поля ниже только заготовка: скан на почту сам в Доку не попадёт, пока это не включим отдельно.
        </p>
        <Field label="IMAP-сервер">
          <Input name="imapHost" defaultValue={settings.imapHost} placeholder="imap.example.ru" />
        </Field>
        <Field label="Порт">
          <Input name="imapPort" type="number" defaultValue={settings.imapPort || 993} />
        </Field>
        <Field label="Логин">
          <Input name="imapUser" defaultValue={settings.imapUser} />
        </Field>
        <Field label="Пароль" hint={settings.hasImapPassword ? "задан, оставьте пустым чтобы не менять" : undefined}>
          <Input name="imapPassword" type="password" placeholder={settings.hasImapPassword ? "••••••" : ""} autoComplete="new-password" />
        </Field>
        <Field label="Папка">
          <Input name="imapFolder" defaultValue={settings.imapFolder || "INBOX"} />
        </Field>
      </Card>

      <div>
        <Button type="submit">Сохранить</Button>
        {msg ? <span className="ml-2 text-ok">{msg}</span> : null}
      </div>
    </form>
  );
}
