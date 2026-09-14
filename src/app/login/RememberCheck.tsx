"use client";

import { useId } from "react";

export function RememberCheck({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2 text-sm text-navy">
      <input
        id={id}
        name="rememberDevice"
        type="checkbox"
        className="mt-1 h-4 w-4 accent-[var(--navy)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        Запомнить это устройство
        <span className="mt-0.5 block text-xs font-normal text-muted">
          На этом компьютере код и квадрат не спрашиваем 90 дней. На общем ПК снимите галочку.
        </span>
      </span>
    </label>
  );
}
