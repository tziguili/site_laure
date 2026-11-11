// Routes publiques : liste des cours, réservation, carte, annulation, retour de paiement.
import { ACTIVE_BOOKING, bookingInfo, cancelBooking, cancelDeadline, createBooking, type Payment } from "./bookings";
import { config, type Env } from "./env";
import { createCheckoutSession } from "./stripe";
import { HttpError, cleanEmail, cleanInt, cleanText, json, nowIso, readJson } from "./util";

const PAYMENTS: Payment[] = ["online", "on_site", "card"];

/** Retours Stripe vers l'aperçu local quand la réservation vient de localhost (origine autorisée), sinon vers le site public. */
function siteBase(req: Request, env: Env): string {
  const origin = req.headers.get("origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) && allowed.includes(origin) ? origin : env.SITE_URL;
}

/** GET /api/classes — cours à venir (8 semaines) avec places restantes. */
export async function listClasses(env: Env): Promise<Response> {
  const now = nowIso();
  const until = new Date(Date.now() + 56 * 86_400_000).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.starts_at, c.duration_min, c.title, c.location, c.capacity,
            (SELECT COUNT(*) FROM bookings b WHERE b.class_id = c.id AND ${ACTIVE_BOOKING.replace(/status|expires_at/g, "b.$&")}) AS taken
     FROM classes c
     WHERE c.cancelled = 0 AND c.starts_at > ? AND c.starts_at < ?
     ORDER BY c.starts_at`,
  )
    .bind(now, now, until)
    .all<{ id: number; starts_at: string; duration_min: number; title: string; location: string; capacity: number; taken: number }>();

  const cfg = config(env);
  return json({
    prices: {
      online: cfg.priceOnline,
      on_site: cfg.priceOnSite,
      discovery: cfg.priceDiscovery,
      card: cfg.cardPrice,
      card_credits: cfg.cardCredits,
    },
    cancel_hours: cfg.cancelHours,
    classes: results.map(({ taken, capacity, ...c }) => ({ ...c, places_left: Math.max(0, capacity - taken) })),
  });
}

/** POST /api/bookings — { class_id, name, email, phone?, payment } */
export async function postBooking(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = await readJson(req);
  if (body.website) throw new HttpError(400, "Requête invalide."); // champ piège anti-robots
  const payment = String(body.payment) as Payment;
  if (!PAYMENTS.includes(payment)) throw new HttpError(400, "Mode de paiement invalide.");
  const result = await createBooking(env, ctx, {
    classId: cleanInt(body.class_id, "cours", 1, Number.MAX_SAFE_INTEGER),
    name: cleanText(body.name, "nom"),
    email: cleanEmail(body.email),
    phone: cleanText(body.phone, "téléphone", 30, false),
    payment,
    siteUrl: siteBase(req, env),
  });
  return json(result, 201);
}

/** POST /api/cards — achat d'une carte en ligne : { name, email } */
export async function postCard(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  if (body.website) throw new HttpError(400, "Requête invalide.");
  const name = cleanText(body.name, "nom");
  const email = cleanEmail(body.email);
  const cfg = config(env);
  const now = nowIso();
  const site = siteBase(req, env);
  const card = await env.DB.prepare(
    `INSERT INTO cards (name, email, credits_total, credits_left, amount_cents, payment, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'online', 'pending', ?) RETURNING id`,
  )
    .bind(name, email, cfg.cardCredits, cfg.cardCredits, cfg.cardPrice, now)
    .first<{ id: number }>();
  if (!card) throw new HttpError(500, "Erreur interne.");

  const session = await createCheckoutSession(
    env,
    {
      name: `Carte ${cfg.cardCredits} cours — Laure Yoga Club`,
      description: "À utiliser quand vous voulez, sans engagement.",
      amountCents: cfg.cardPrice,
      email,
      metadata: { kind: "card", card_id: String(card.id) },
      successUrl: `${site}/merci.html?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${site}/tarifs.html`,
      expiresInMinutes: 60,
    },
    `card-${card.id}`,
  );
  await env.DB.prepare("UPDATE cards SET stripe_session_id = ? WHERE id = ?").bind(session.id, card.id).run();
  return json({ checkoutUrl: session.url }, 201);
}

/** GET /api/checkout/:sessionId — statut affiché sur la page « merci » (le webhook peut arriver avec un léger retard). */
export async function getCheckoutStatus(env: Env, sessionId: string): Promise<Response> {
  const b = await env.DB.prepare(
    `SELECT b.status, b.amount_cents, b.name, c.starts_at, c.title, c.location
     FROM bookings b JOIN classes c ON c.id = b.class_id WHERE b.stripe_session_id = ?`,
  )
    .bind(sessionId)
    .first();
  if (b) return json({ kind: "booking", ...b });
  const c = await env.DB.prepare("SELECT status, amount_cents, name, credits_total FROM cards WHERE stripe_session_id = ?")
    .bind(sessionId)
    .first();
  if (c) return json({ kind: "card", ...c });
  throw new HttpError(404, "Paiement introuvable.");
}

async function findByToken(env: Env, token: string) {
  const row = await env.DB.prepare("SELECT id FROM bookings WHERE token = ?").bind(token).first<{ id: number }>();
  const b = row && (await bookingInfo(env.DB, row.id));
  if (!b) throw new HttpError(404, "Réservation introuvable.");
  return b;
}

/** GET /api/bookings/:token — détail pour la page d'annulation. */
export async function getBooking(env: Env, token: string): Promise<Response> {
  const b = await findByToken(env, token);
  const deadline = cancelDeadline(env, b.starts_at);
  return json({
    name: b.name,
    status: b.status,
    payment: b.payment,
    amount_cents: b.amount_cents,
    starts_at: b.starts_at,
    title: b.title,
    location: b.location,
    cancel_deadline: deadline,
    can_cancel: b.status === "confirmed" && nowIso() < deadline,
  });
}

/** POST /api/bookings/:token/cancel */
export async function postCancel(env: Env, token: string): Promise<Response> {
  const b = await findByToken(env, token);
  if (b.status !== "confirmed") throw new HttpError(409, "Cette réservation est déjà annulée.");
  if (nowIso() >= cancelDeadline(env, b.starts_at))
    throw new HttpError(403, `Le délai d'annulation en ligne (${config(env).cancelHours} h avant le cours) est dépassé. Contactez Laure directement.`);
  const note = await cancelBooking(env, b.id, "customer");
  return json({ ok: true, note });
}
