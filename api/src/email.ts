// Emails transactionnels via Resend (https://resend.com).
// Sans RESEND_API_KEY (en local), les emails sont simplement affichés dans la console.
import type { Env } from "./env";
import { escapeHtml as e, euros, formatClassDate } from "./util";

interface Mail {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

/** Envoie un email ; renvoie false en cas d'échec (sans lever d'erreur). */
export async function sendEmail(env: Env, mail: Mail): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email non envoyé — pas de RESEND_API_KEY] à ${mail.to} : ${mail.subject}`);
    return true;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [mail.to],
      reply_to: mail.replyTo || env.EMAIL_REPLY_TO || undefined,
      subject: mail.subject,
      html: mail.html,
    }),
  });
  if (!res.ok) {
    console.error("Resend error", res.status, await res.text());
    return false;
  }
  return true;
}

const layout = (title: string, body: string) => `<!doctype html>
<html lang="fr"><body style="margin:0;background:#f6f0e6;font-family:Lora,Georgia,'Times New Roman',serif;color:#2b2a35">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
  <p style="margin:0 0 24px;text-align:center;color:#484d75;line-height:1"><span style="font-family:Montserrat,Helvetica,Arial,sans-serif;font-weight:700;font-size:22px;letter-spacing:1px">LAURE</span><br><span style="font-family:Georgia,serif;font-size:20px">Yoga Club</span></p>
  <div style="background:#fffdf9;border-radius:16px;padding:28px">
    <h1 style="font-family:Fraunces,Georgia,serif;font-weight:bold;font-size:24px;color:#484d75;margin:0 0 16px">${title}</h1>
    ${body}
  </div>
  <p style="font-size:12px;color:#6b6878;margin-top:24px">Laure Yoga Club · laureyogaclub.fr · contact@laureyogaclub.fr</p>
</div></body></html>`;

const p = (s: string) => `<p style="margin:0 0 14px;line-height:1.6">${s}</p>`;
const btn = (href: string, label: string) =>
  `<p style="margin:22px 0 6px"><a href="${e(href)}" style="display:inline-block;background:#484d75;color:#f6f0e6;padding:12px 22px;border-radius:999px;text-decoration:none;font-size:14px">${label}</a></p>`;

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
  discount?: string | null;
  referral_name?: string | null;
}

const discountNote = (b: BookingInfo) =>
  b.discount === "first" ? " (tarif découverte, premier cours)" : b.discount === "referral" ? ` (tarif parrainage : ${e(b.referral_name ?? "")})` : "";

const paymentLine = (b: BookingInfo) => {
  if (b.payment === "online") return `Payé en ligne : <b>${euros(b.amount_cents)}</b>${discountNote(b)}.`;
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
        (b.discount === "first"
          ? p(`Vous venez avec la personne qui vous a fait découvrir les cours ? Elle peut maintenant réserver sa place au <b>tarif parrainage</b> pour ce même cours, en indiquant votre adresse email : <b>${e(b.email)}</b>.`)
          : "") +
        p(`Un empêchement ? Vous pouvez annuler ou reporter votre réservation sur un autre cours jusqu'à ${cancelHours} h avant :`) +
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

export function cardActivatedEmail(env: Env, c: { name: string; email: string; credits_total: number; amount_cents: number; created_at: string }, validityDays: number): Mail {
  const until = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" }).format(new Date(new Date(c.created_at).getTime() + validityDays * 86_400_000));
  return {
    to: c.email,
    subject: `Votre carte ${c.credits_total} cours est active`,
    html: layout(
      `Merci ${e(c.name.split(" ")[0])} !`,
      p(`Votre carte <b>${c.credits_total} cours</b> (${euros(c.amount_cents)}) est active. Elle est valable jusqu'au <b>${until}</b>.`) +
        p(`Pour l'utiliser, réservez un cours sur le site en choisissant « J'ai déjà une carte ${c.credits_total} cours » et en indiquant cette adresse email : <b>${e(c.email)}</b>.`) +
        btn(`${env.SITE_URL}/reserver.html`, "Réserver un cours") +
        p(`À très vite,<br>Laure`),
    ),
  };
}

export function adminNotificationEmail(env: Env, b: BookingInfo, placesLeft: number): Mail {
  const how = b.payment === "online" ? `payé en ligne, ${euros(b.amount_cents)}${discountNote(b)}` : b.payment === "card" ? "carte" : `sur place (${euros(b.amount_cents)})`;
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

export interface QuoteRequest {
  kind: "particulier" | "entreprise";
  name: string;
  company: string;
  email: string;
  phone: string;
  participants: string;
  place: string;
  format: string;
  message: string;
}

/** Demande de devis entreprise → Laure (répondre = répondre au demandeur). */
export function quoteRequestEmail(env: Env, q: QuoteRequest): Mail {
  const row = (label: string, value: string) =>
    value ? `<tr><td style="padding:4px 12px 4px 0;color:#6b6878">${label}</td><td style="padding:4px 0"><b>${e(value)}</b></td></tr>` : "";
  return {
    to: env.ADMIN_EMAIL,
    replyTo: q.email,
    subject: q.kind === "particulier" ? `Demande de cours particulier — ${q.name}` : `Demande de devis entreprise — ${q.company}`,
    html: layout(
      q.kind === "particulier" ? "Nouvelle demande de cours particulier" : "Nouvelle demande de devis",
      `<table style="border-collapse:collapse;margin:0 0 16px;font-size:15px">
        ${row("Entreprise", q.company)}${row("Contact", q.name)}${row("Email", q.email)}${row("Téléphone", q.phone)}
        ${row("Intervention", q.format)}${row("Participants", q.participants)}${row("Lieu souhaité", q.place)}
      </table>` + (q.message ? p(e(q.message).replace(/\n/g, "<br>")) : "") + p("Répondez simplement à cet email pour écrire directement à cette personne."),
    ),
  };
}

/** Accusé de réception envoyé au demandeur. */
export function quoteAckEmail(q: QuoteRequest): Mail {
  return {
    to: q.email,
    subject: q.kind === "particulier" ? "Votre demande de cours particulier" : "Votre demande de yoga en entreprise",
    html: layout(
      `Merci ${e(q.name.split(" ")[0])} !`,
      p(q.kind === "particulier"
        ? "J'ai bien reçu votre demande de cours particulier et je reviens vers vous très rapidement pour organiser une première séance."
        : `J'ai bien reçu votre demande pour <b>${e(q.company)}</b> et je reviens vers vous très rapidement pour organiser un premier échange.`) +
        p("À très vite,<br>Laure<br>06 64 79 11 85"),
    ),
  };
}

/** Le lendemain du cours (une seule fois par personne) : demande d'avis Google. */
export function reviewRequestEmail(env: Env, r: { name: string; email: string; starts_at: string }): Mail {
  const day = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long" }).format(new Date(r.starts_at));
  return {
    to: r.email,
    subject: "Merci pour le cours ! Un petit avis ?",
    html: layout(
      `Merci ${e(r.name.split(" ")[0])} !`,
      p(`J'espère que vous avez apprécié le cours de ${e(day)} et que vous en ressentez encore les bienfaits.`) +
        p("Laure Yoga Club est tout jeune : si le cours vous a plu, un avis sur Google m'aiderait énormément à faire connaître les cours. Cela prend une minute.") +
        btn(env.GOOGLE_REVIEW_URL!, "Laisser un avis sur Google") +
        p("Une remarque, une idée pour les prochains cours ? Répondez simplement à cet email, je le lirai avec attention.") +
        p(`À très vite sur le tapis,<br>Laure`) +
        `<p style="margin:18px 0 0;font-size:12px;color:#6b6878">Vous ne recevrez ce message qu'une seule fois.</p>`,
    ),
  };
}

const longDate = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));

/** Réservation reportée sur un autre cours → élève. */
export function bookingMovedEmail(env: Env, b: BookingInfo, oldStartsAt: string, cancelHours: number): Mail {
  return {
    to: b.email,
    subject: `Réservation reportée — ${formatClassDate(b.starts_at)}`,
    html: layout(
      "Votre réservation est reportée",
      p(`C'est noté : votre place du ${formatClassDate(oldStartsAt)} est reportée au <b>${e(b.title)}</b> du <b>${formatClassDate(b.starts_at)}</b>.`) +
        p(`📍 ${e(b.location)}<br>Pensez à arriver 5 minutes avant le début du cours.`) +
        p(`Votre paiement reste le même. Vous pouvez encore annuler ou reporter jusqu'à ${cancelHours} h avant le cours :`) +
        btn(`${env.SITE_URL}/annulation.html?t=${encodeURIComponent(b.token)}`, "Gérer ma réservation") +
        p(`À très vite sur le tapis,<br>Laure`),
    ),
  };
}

/** Report → notification à Laure. */
export function adminMoveEmail(env: Env, b: BookingInfo, oldStartsAt: string): Mail {
  return {
    to: env.ADMIN_EMAIL,
    subject: `Report : ${b.name} — ${formatClassDate(b.starts_at)}`,
    html: layout(
      "Réservation reportée",
      p(`<b>${e(b.name)}</b> (${e(b.email)}) a reporté sa réservation du ${formatClassDate(oldStartsAt)} au <b>${formatClassDate(b.starts_at)}</b>.`) +
        btn(`${env.SITE_URL}/admin.html`, "Voir le planning"),
    ),
  };
}

export interface GiftCard {
  name: string;               // destinataire
  email: string;
  credits_total: number;
  amount_cents: number;
  expires_at: string;
  gift_from_name: string;
  gift_from_email: string;
  gift_message: string | null;
  gift_send_to: string | null;
}

const giftWhat = (c: GiftCard) => (c.credits_total > 1 ? `une carte de ${c.credits_total} cours de yoga` : "un cours de yoga");

/** Carte cadeau → destinataire (ou acheteur, s'il préfère l'offrir lui-même). */
export function giftEmail(env: Env, c: GiftCard): Mail {
  const toBuyer = c.gift_send_to === "buyer";
  const howTo =
    p(`Pour en profiter : choisissez un cours dans le planning, puis sélectionnez « J'ai une carte » et indiquez l'adresse email <b>${e(c.email)}</b>. La carte est valable jusqu'au <b>${longDate(c.expires_at)}</b>.`) +
    btn(`${env.SITE_URL}/planning.html`, "Voir les prochains cours");
  const message = c.gift_message ? `<blockquote style="margin:0 0 14px;padding:12px 16px;border-left:3px solid #484d75;background:#f6f0e6;font-style:italic;line-height:1.6">${e(c.gift_message).replace(/\n/g, "<br>")}</blockquote>` : "";
  return {
    to: toBuyer ? c.gift_from_email : c.email,
    subject: toBuyer ? `Votre carte cadeau pour ${c.name}` : `${c.gift_from_name} vous offre ${giftWhat(c)} 🎁`,
    html: layout(
      toBuyer ? `La carte cadeau de ${e(c.name.split(" ")[0])}` : `Un cadeau pour vous, ${e(c.name.split(" ")[0])} !`,
      p(toBuyer
        ? `Voici la carte cadeau à offrir à <b>${e(c.name)}</b> : <b>${giftWhat(c)}</b> avec Laure Yoga Club, à Paris. Vous pouvez lui transférer cet email ou l'imprimer.`
        : `<b>${e(c.gift_from_name)}</b> vous offre <b>${giftWhat(c)}</b> avec Laure Yoga Club, à Paris : des cours en petit groupe, pour tous les niveaux.`) +
        message + howTo + p(`Au plaisir de vous accueillir sur le tapis,<br>Laure`),
    ),
  };
}

/** Accusé d'achat → acheteur (quand l'email cadeau part directement au destinataire). */
export function giftReceiptEmail(c: GiftCard): Mail {
  return {
    to: c.gift_from_email,
    subject: `Votre carte cadeau pour ${c.name} a été envoyée`,
    html: layout(
      `Merci ${e(c.gift_from_name.split(" ")[0])} !`,
      p(`Votre carte cadeau (<b>${giftWhat(c)}</b>, ${euros(c.amount_cents)}) vient d'être envoyée à <b>${e(c.name)}</b> (${e(c.email)}). Elle est valable jusqu'au ${longDate(c.expires_at)}.`) +
        p(`À bientôt,<br>Laure`),
    ),
  };
}
