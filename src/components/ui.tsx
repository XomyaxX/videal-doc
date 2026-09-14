import Link from "next/link";
import { useId, type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-serif text-3xl tracking-tight text-navy">{title}</h1>
        {subtitle ? <p className="mt-1 text-[15px] text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({
  children,
  className,
  style,
  id,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  id?: string;
}) {
  return (
    <div id={id} className={cn("scroll-mt-6 rounded-2xl border border-line bg-card p-5 shadow-[var(--shadow)]", className)} style={style}>
      {children}
    </div>
  );
}

type Btn = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "gold";
  href?: string;
};

export function Button({ variant = "primary", className, href, children, ...props }: Btn) {
  const styles: Record<string, string> = {
    primary: "bg-navy !text-white hover:bg-navy-2",
    gold: "bg-gold !text-white hover:brightness-110",
    secondary: "bg-white text-navy border border-line hover:bg-paper",
    ghost: "bg-transparent text-navy hover:bg-white/60",
    danger: "bg-bad !text-white hover:brightness-110",
  };
  const cls = cn(
    "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[15px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:cursor-not-allowed disabled:opacity-70",
    styles[variant],
    className,
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button className={cls} {...props}>
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-navy">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

const fieldCls =
  "w-full rounded-xl border border-line bg-white px-3 py-2.5 text-[15px] outline-none focus:border-gold";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const uid = useId();
  const id = props.id ?? uid;
  const name = props.name ?? id;
  return <input {...props} id={id} name={name} className={cn(fieldCls, props.className)} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const uid = useId();
  const id = props.id ?? uid;
  const name = props.name ?? id;
  return <textarea {...props} id={id} name={name} className={cn(fieldCls, "min-h-[96px]", props.className)} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const uid = useId();
  const id = props.id ?? uid;
  const name = props.name ?? id;
  return <select {...props} id={id} name={name} className={cn(fieldCls, props.className)} />;
}

export function Empty({ title, text }: { title: string; text?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white/60 px-6 py-12 text-center">
      <p className="font-serif text-xl text-navy">{title}</p>
      {text ? <p className="mt-2 text-muted">{text}</p> : null}
    </div>
  );
}

export function Pill({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={cn("pill", `pill-${tone}`)}>{children}</span>;
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-xl bg-[var(--bad-bg)] px-3 py-2 text-sm text-bad">{children}</p>;
}
