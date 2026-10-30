import { notify } from "./notify";
import { mailSettings, sendMailToUser, siteUrl } from "./mail";

export async function notifyHrSubmitted(
  row: { id: string; number: string; title: string; managerId: string; authorId: string },
  fromUserId: string,
) {
  await notify({
    userId: row.managerId,
    title: "Заявление на рассмотрении",
    body: `${row.number} · ${row.title}`,
    link: `/statements/${row.id}`,
    urgency: "normal",
  });
  void (async () => {
    const s = await mailSettings();
    if (s?.mailAutoSend === false) return;
    const text = `Заявление ${row.number} «${row.title}» отправлено на рассмотрение.\n${siteUrl(`/statements/${row.id}`)}`;
    await sendMailToUser({
      userId: row.authorId,
      fromUserId,
      subject: `Заявление ${row.number} отправлено`,
      text,
    });
  })().catch((e) => console.error("mail.hr", e));
}
