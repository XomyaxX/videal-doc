export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { tuneSqlite } = await import("./lib/prisma");
  const { tickReminders } = await import("./lib/reminders");
  const { tickPresence } = await import("./lib/presence");
  tuneSqlite().catch((e) => console.error("sqlite", e));
  const hour = 60 * 60 * 1000;
  tickReminders().catch((e) => console.error("reminders", e));
  tickPresence().catch((e) => console.error("presence", e));
  setInterval(() => {
    tickReminders().catch((e) => console.error("reminders", e));
  }, hour);
  setInterval(() => {
    tickPresence().catch((e) => console.error("presence", e));
  }, 5 * 60 * 1000);
}
