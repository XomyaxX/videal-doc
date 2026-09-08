"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";

type Role = {
  id: string;
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
};

export function RolesEditor({
  roles,
  permissions,
}: {
  roles: Role[];
  permissions: { code: string; name: string }[];
}) {
  const [rows, setRows] = useState(roles);
  const [msg, setMsg] = useState("");

  function toggle(roleId: string, code: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== roleId) return r;
        const on = r.permissions.includes(code);
        return {
          ...r,
          permissions: on ? r.permissions.filter((p) => p !== code) : [...r.permissions, code],
        };
      }),
    );
  }

  async function save(role: Role) {
    await fetch(`/api/admin/roles/${role.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(role),
    });
    setMsg(`Сохранено: ${role.name}`);
  }

  return (
    <div className="space-y-4">
      {msg ? <p className="text-ok">{msg}</p> : null}
      {rows.map((role) => (
        <Card key={role.id}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl text-navy">{role.name}</h2>
              <p className="text-sm text-muted">{role.description}</p>
            </div>
            <Button onClick={() => save(role)}>Сохранить</Button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {permissions.map((p) => (
              <label key={p.code} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={role.code === "superadmin" || role.permissions.includes(p.code)}
                  disabled={role.code === "superadmin"}
                  onChange={() => toggle(role.id, p.code)}
                />
                {p.name}
              </label>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
