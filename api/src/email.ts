// Emails transactionnels via Resend (https://resend.com).
// Sans RESEND_API_KEY (en local), les emails sont simplement affichés dans la console.
import type { Env } from "./env";
import { escapeHtml as e, euros, formatClassDate } from "./util";

interface Mail {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(env: Env, mail: Mail): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email non envoyé — pas de RESEND_API_KEY] à ${mail.to} : ${mail.subject}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [mail.to],
      reply_to: env.EMAIL_REPLY_TO || undefined,
      subject: mail.subject,
      html: mail.html,
    }),
  });
  if (!res.ok) console.error("Resend error", res.status, await res.text());
}

const layout = (title: string, body: string) => `<!doctype html>
<html lang="fr"><body style="margin:0;background:#f6f0e6;font-family:Helvetica,Arial,sans-serif;color:#2b2a35">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
  <p style="font-family:Georgia,serif;font-size:22px;color:#1d2550;margin:0 0 24px">☾ Laure <em style="color:#c98f45">Yoga Club</em></p>
  <div style="background:#fffdf9;border-radius:16px;padding:28px">
    <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:24px;color:#1d2550;margin:0 0 16px">${title}</h1>
    ${body}
  </div>
  <p style="font-size:12px;color:#6b6878;margin-top:24px">Maison Né — 25 rue Beccaria, 75012 Paris · laureyogaclub@gmail.com</p>
</div></body></html>`;

const p = (s: string) => `<p style="margin:0 0 14px;line-height:1.6">${s}</p>`;
const btn = (href: string, label: string) =>
  `<p style="margin:22px 0 6px"><a href="${e(href)}" style="display:inline-block;background:#1d2550;color:#f6f0e6;padding:12px 22px;border-radius:999px;text-decoration:none;font-size:14px">${label}</a></p>`;

export interface BookingInfo {
  name: string;
  email: string;
  payment: string;
  amount_cents: number;
  token: string;
  starts_at: string;
  title: string;
  location: string;
  credits_left?: number | null;
}

const paymentLine = (b: BookingInfo) => {
  if (b.payment === "online") return `Payé en ligne : <b>${euros(b.amount_cents)}</b>.`;
  if (b.payment === "card")
    return `Réglé avec votre carte${b.credits_left != null ? ` (il vous reste <b>${b.credits_left}</b> cours)` : ""}.`;
  return `À régler sur place (carte bancaire ou espèces) : <b>${euros(b.amount_cents)}</b>.`;
};

export function bookingConfirmedEmail(env: Env, b: BookingInfo, cancelHours: number): Mail {
  return {
    to: b.email,
    subject: `Votre cours est réservé — ${formatClassDate(b.starts_at)}`,
    html: layout(
      `C'est noté, ${e(b.name.split(" ")[0])} !`,
      p(`Votre place est réservée pour le <b>${e(b.title)}</b> du <b>${formatClassDate(b.starts_at)}</b>.`) +
        p(`📍 ${e(b.location)}<br>Pensez à arriver 5 minutes avant le début du cours. Les tapis sont fournis.`) +
        p(paymentLine(b)) +
        p(`Un empêchement ? Vous pouvez annuler jusqu'à ${cancelHours} h avant le cours :`) +
        btn(`${env.SITE_URL}/annulation.html?t=${encodeURIComponent(b.token)}`, "Gérer ma réservation") +
        p(`À très vite sur le tapis,<br>Laure`),
    ),
  };
}

export function bookingCancelledEmail(b: BookingInfo, refundNote: string): Mail {
  return {
    to: b.email,
    subject: `Réservation annulée — ${formatClassDate(b.starts_at)}`,
    html: layout(
      "Votre réservation est annulée",
      p(`Votre réservation pour le cours du <b>${formatClassDate(b.starts_at)}</b> a bien été annulée.`) +
        (refundNote ? p(refundNote) : "") +
        p(`À bientôt,<br>Laure`),
    ),
  };
}

export function classCancelledEmail(b: BookingInfo, refundNote: string): Mail {
  return {
    to: b.email,
    subject: `Cours annulé — ${formatClassDate(b.starts_at)}`,
    html: layout(
      "Le cours est annulé",
      p(`Je suis désolée, le cours du <b>${formatClassDate(b.starts_at)}</b> est annulé.`) +
        (refundNote ? p(refundNote) : "") +
        p(`J'espère vous retrouver très vite sur un prochain cours.<br>Laure`),
    ),
  };
}

export function cardActivatedEmail(env: Env, c: { name: string; email: string; credits_total: number; amount_cents: number }): Mail {
  return {
    to: c.email,
    subject: `Votre carte ${c.credits_total} cours est active`,
    html: layout(
      `Merci ${e(c.name.split(" ")[0])} !`,
      p(`Votre carte <b>${c.credits_total} cours</b> (${euros(c.amount_cents)}) est active.`) +
        p(`Pour l'utiliser, réservez un cours sur le site en choisissant « Carte ${c.credits_total} cours » et en indiquant cette adresse email : <b>${e(c.email)}</b>.`) +
        btn(`${env.SITE_URL}/reserver.html`, "Réserver un cours") +
        p(`À très vite,<br>Laure`),
    ),
  };
}

export function adminNotificationEmail(env: Env, b: BookingInfo, placesLeft: number): Mail {
  const how = b.payment === "online" ? "payé en ligne" : b.payment === "card" ? "carte" : `sur place (${euros(b.amount_cents)})`;
  return {
    to: env.ADMIN_EMAIL,
    subject: `Nouvelle réservation : ${b.name} — ${formatClassDate(b.starts_at)}`,
    html: layout(
      "Nouvelle réservation",
      p(`<b>${e(b.name)}</b> (${e(b.email)}) a réservé le cours du <b>${formatClassDate(b.starts_at)}</b>.`) +
        p(`Paiement : ${how}.<br>Places restantes : ${placesLeft}.`) +
        btn(`${env.SITE_URL}/admin.html`, "Voir le planning"),
    ),
  };
}
