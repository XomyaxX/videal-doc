"use client";

export function WriteChatButton({ userId, className }: { userId: string; className?: string }) {
  async function go(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const res = await fetch("/api/chat/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.id) window.location.href = `/chat/${data.id}`;
    else alert(data.error || "Не открылось");
  }
  return (
    <button type="button" onClick={(e) => void go(e)} className={className || "text-sm font-semibold text-navy underline"}>
      Написать
    </button>
  );
}
