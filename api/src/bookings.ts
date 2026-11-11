// Logique métier des réservations, partagée entre le site public et l'admin.
import { config, type Env } from "./env";
import {
  adminNotificationEmail,
  bookingCancelledEmail,
  bookingConfirmedEmail,
  classCancelledEmail,
  sendEmail,
  type BookingInfo,
} from "./email";
import { createCheckoutSession, expireCheckoutSession, refund } from "./stripe";
import { HttpError, addMinutes, euros, formatClassDate, nowIso, randomToken } from "./util";

export type Payment = "online" | "on_site" | "card";

export interface ClassRow {
  id: number;
  starts_at: string;
  duration_min: number;
  title: string;
  location: string;
  capacity: number;
  cancelled: number;
}

export interface BookingRow {
  id: number;
  class_id: number;
  name: string;
  email: string;
  phone: string | null;
  payment: Payment;
  amount_cents: number;
  status: "pending" | "confirmed" | "cancelled";
  paid: number;
  card_id: number | null;
  token: string;
  stripe_session_id: string | null;
  payment_intent: string | null;
  expires_at: string | null;
  created_at: string;
  cancelled_at: string | null;
}

/** Une réservation occupe une place si elle est confirmée, ou en attente de paiement non expirée. */
export const ACTIVE_BOOKING = `(status = 'confirmed' OR (status = 'pending' AND expires_at > ?))`;

export async function getClass(db: D1Database, id: number): Promise<ClassRow | null> {
  return db.prepare("SELECT * FROM classes WHERE id = ?").bind(id).first<ClassRow>();
}

export async function placesTaken(db: D1Database, classId: number, now = nowIso()): Promise<number> {
  const r = await db
    .prepare(`SELECT COUNT(*) AS n FROM bookings WHERE class_id = ? AND ${ACTIVE_BOOKING}`)
    .bind(classId, now)
    .first<{ n: number }>();
  return r?.n ?? 0;
}

async function isFirstClass(db: D1Database, email: string): Promise<boolean> {
  const r = await db
    .prepare("SELECT COUNT(*) AS n FROM bookings WHERE email = ? AND status = 'confirmed'")
    .bind(email)
    .first<{ n: number }>();
  return (r?.n ?? 0) === 0;
}

export async function bookingInfo(db: D1Database, bookingId: number): Promise<(BookingInfo & BookingRow) | null> {
  return db
    .prepare(
      `SELECT b.*, c.starts_at, c.title, c.location, cards.credits_left
       FROM bookings b JOIN classes c ON c.id = b.class_id
       LEFT JOIN cards ON cards.id = b.card_id
       WHERE b.id = ?`,
    )
    .bind(bookingId)
    .first();
}

export interface NewBooking {
  classId: number;
  name: string;
  email: string;
  phone: string;
  payment: Payment;
  /** Ajout manuel par Laure : ignore la limite de places et le délai. */
  byAdmin?: boolean;
}

export interface BookingResult {
  id: number;
  status: "pending" | "confirmed";
  checkoutUrl?: string;
  amountCents: number;
  creditsLeft?: number;
}

export async function createBooking(env: Env, ctx: ExecutionContext, input: NewBooking): Promise<BookingResult> {
  const cfg = config(env);
  const db = env.DB;
  const now = nowIso();

  const cls = await getClass(db, input.classId);
  if (!cls || cls.cancelled) throw new HttpError(404, "Ce cours n'existe pas ou a été annulé.");
  if (!input.byAdmin && cls.starts_at <= now) throw new HttpError(409, "Ce cours a déjà commencé.");

  const dup = await db
    .prepare(`SELECT id FROM bookings WHERE class_id = ? AND email = ? AND ${ACTIVE_BOOKING}`)
    .bind(cls.id, input.email, now)
    .first();
  if (dup) throw new HttpError(409, "Vous avez déjà une réservation pour ce cours avec cette adresse email.");

  // Montant dû
  let amount = 0;
  if (input.payment === "online") amount = cfg.priceOnline;
  else if (input.payment === "on_site") amount = (await isFirstClass(db, input.email)) ? cfg.priceDiscovery : cfg.priceOnSite;

  // Carte : on débite un crédit d'abord (atomique), on le rendra si le cours est complet.
  let cardId: number | null = null;
  let creditsLeft: number | undefined;
  if (input.payment === "card") {
    const card = await db
      .prepare(
        `UPDATE cards SET credits_left = credits_left - 1
         WHERE id = (SELECT id FROM cards WHERE email = ? AND status = 'active' AND credits_left > 0 ORDER BY id LIMIT 1)
           AND credits_left > 0
         RETURNING id, credits_left`,
      )
      .bind(input.email)
      .first<{ id: number; credits_left: number }>();
    if (!card) throw new HttpError(402, "Aucune carte avec des cours restants n'est associée à cette adresse email.");
    cardId = card.id;
    creditsLeft = card.credits_left;
  }

  const status = input.payment === "online" ? "pending" : "confirmed";
  const expiresAt = input.payment === "online" ? addMinutes(now, cfg.holdMinutes) : null;
  const token = randomToken();

  // Insertion conditionnelle : échoue (0 ligne) si le cours est complet. Une seule requête = pas de surréservation.
  const capacityGuard = input.byAdmin
    ? "1"
    : `(SELECT capacity FROM classes WHERE id = ?1) > (SELECT COUNT(*) FROM bookings WHERE class_id = ?1 AND ${ACTIVE_BOOKING.replace("?", "?12")})`;
  const inserted = await db
    .prepare(
      `INSERT INTO bookings (class_id, name, email, phone, payment, amount_cents, status, paid, card_id, token, expires_at, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12
       WHERE ${capacityGuard}
       RETURNING id`,
    )
    .bind(cls.id, input.name, input.email, input.phone || null, input.payment, amount, status, input.payment === "card" ? 1 : 0, cardId, token, expiresAt, now)
    .first<{ id: number }>();

  if (!inserted) {
    if (cardId) await db.prepare("UPDATE cards SET credits_left = credits_left + 1 WHERE id = ?").bind(cardId).run();
    throw new HttpError(409, "Désolée, ce cours est complet.");
  }

  if (input.payment === "online") {
    try {
      const session = await createCheckoutSession(
        env,
        {
          name: `${cls.title} — ${formatClassDate(cls.starts_at)}`,
          description: cls.location,
          amountCents: amount,
          email: input.email,
          metadata: { kind: "booking", booking_id: String(inserted.id) },
          successUrl: `${env.SITE_URL}/merci.html?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${env.SITE_URL}/reserver.html?paiement=annule`,
          expiresInMinutes: cfg.holdMinutes - 1,
        },
        `booking-${inserted.id}`,
      );
      await db.prepare("UPDATE bookings SET stripe_session_id = ? WHERE id = ?").bind(session.id, inserted.id).run();
      return { id: inserted.id, status: "pending", checkoutUrl: session.url, amountCents: amount };
    } catch (err) {
      await db.prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = ? WHERE id = ?").bind(nowIso(), inserted.id).run();
      throw err;
    }
  }

  ctx.waitUntil(notifyConfirmed(env, inserted.id));
  return { id: inserted.id, status: "confirmed", amountCents: amount, creditsLeft };
}

/** Emails envoyés quand une réservation devient confirmée. */
export async function notifyConfirmed(env: Env, bookingId: number): Promise<void> {
  const b = await bookingInfo(env.DB, bookingId);
  if (!b) return;
  const cfg = config(env);
  await sendEmail(env, bookingConfirmedEmail(env, b, cfg.cancelHours));
  if (env.ADMIN_EMAIL) {
    const cls = await getClass(env.DB, b.class_id);
    const left = cls ? cls.capacity - (await placesTaken(env.DB, cls.id)) : 0;
    await sendEmail(env, adminNotificationEmail(env, b, left));
  }
}

export type CancelReason = "customer" | "admin" | "class";

/**
 * Annule une réservation : libère la place, rembourse le paiement en ligne,
 * rend le crédit de carte. Renvoie la phrase expliquant le remboursement.
 */
export async function cancelBooking(env: Env, bookingId: number, reason: CancelReason, notify = true): Promise<string> {
  const db = env.DB;
  const b = await bookingInfo(db, bookingId);
  if (!b) throw new HttpError(404, "Réservation introuvable.");

  const res = await db
    .prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = ? WHERE id = ? AND status IN ('pending', 'confirmed')")
    .bind(nowIso(), bookingId)
    .run();
  if (!res.meta.changes) return ""; // déjà annulée

  let note = "";
  if (b.status === "pending" && b.stripe_session_id) {
    await expireCheckoutSession(env, b.stripe_session_id);
  }
  if (b.payment === "card" && b.card_id) {
    const card = await db
      .prepare("UPDATE cards SET credits_left = MIN(credits_total, credits_left + 1) WHERE id = ? RETURNING credits_left")
      .bind(b.card_id)
      .first<{ credits_left: number }>();
    note = `Le cours a été recrédité sur votre carte (il vous reste ${card?.credits_left ?? "?"} cours).`;
  }
  if (b.payment === "online" && b.status === "confirmed" && b.payment_intent) {
    try {
      await refund(env, b.payment_intent, `annulation (${reason})`);
      note = `Vous allez être remboursé·e de ${euros(b.amount_cents)} sur votre moyen de paiement (sous 5 à 10 jours).`;
    } catch (err) {
      console.error("Refund failed for booking", bookingId, err);
      note = "Laure va procéder à votre remboursement très prochainement.";
    }
  }

  if (notify && b.status === "confirmed") {
    await sendEmail(env, reason === "class" ? classCancelledEmail(b, note) : bookingCancelledEmail(b, note));
  }
  return note;
}

/** Le client peut-il encore annuler lui-même ? */
export function cancelDeadline(env: Env, startsAt: string): string {
  return new Date(new Date(startsAt).getTime() - config(env).cancelHours * 3_600_000).toISOString();
}
