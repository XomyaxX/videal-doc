"use client";

export function IdentifySplash({ code, onHide }: { code: string; onHide?: () => void }) {
  if (!code) return null;
  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-navy px-6 text-center text-white">
      <p className="text-sm font-semibold uppercase tracking-[0.3em] text-gold">Этот компьютер</p>
      <p className="mt-4 font-serif leading-none text-gold" style={{ fontSize: "clamp(5rem, 28vw, 14rem)" }}>
        {code}
      </p>
      <p className="mt-8 max-w-lg text-lg text-white/80">
        Админ ходит по офису и отмечает столы. Не сворачивайте и не закрывайте эту страницу.
      </p>
      {onHide ? (
        <button type="button" className="mt-8 text-sm text-white/50 underline" onClick={onHide}>
          Это мой экран, скрыть
        </button>
      ) : null}
    </div>
  );
}
