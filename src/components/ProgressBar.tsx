import { cn } from "./ui";

export function ProgressBar({
  value,
  label,
  hint,
  size = "md",
}: {
  value: number;
  label?: string;
  hint?: string;
  size?: "lg" | "md" | "sm";
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const fill = v >= 80 ? "bg-[var(--ok)]" : v >= 35 ? "bg-gold" : "bg-navy-2";
  const h = size === "lg" ? "h-3" : size === "sm" ? "h-1.5" : "h-2.5";
  return (
    <div>
      {label || hint ? (
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          {label ? (
            <span className={cn("font-semibold text-navy", size === "lg" ? "text-lg" : "text-sm")}>{label}</span>
          ) : (
            <span />
          )}
          <span className="text-sm tabular-nums text-muted">
            {v}%{hint ? ` · ${hint}` : ""}
          </span>
        </div>
      ) : null}
      <div className={cn("overflow-hidden rounded-full bg-[#ddd6c8]", h)}>
        <div className={cn("h-full rounded-full transition-[width]", fill)} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}
