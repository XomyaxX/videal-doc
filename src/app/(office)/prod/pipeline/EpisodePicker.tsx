"use client";

export function EpisodePicker({
  episodes,
  currentId,
}: {
  episodes: { id: string; label: string }[];
  currentId: string;
}) {
  return (
    <select
      defaultValue={currentId}
      className="rounded-xl border border-line bg-white px-3 py-2.5 text-sm font-semibold text-navy"
      onChange={async (e) => {
        await fetch("/api/prod/episode", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: e.target.value }),
        });
        window.location.reload();
      }}
    >
      {episodes.map((e) => (
        <option key={e.id} value={e.id}>
          {e.label}
        </option>
      ))}
    </select>
  );
}
