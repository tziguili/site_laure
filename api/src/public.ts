// Routes publiques : liste des cours, réservation, carte, annulation, retour de paiement.
import { ACTIVE_BOOKING, bookingInfo, cancelBooking, cancelDeadline, createBooking, moveBooking, type Discount, type Payment } from "./bookings";
import { config, type Env } from "./env";
import { createCheckoutSession } from "./stripe";
import { quoteAckEmail, quoteRequestEmail, sendEmail } from "./email";
import { HttpError, cleanEmail, cleanInt, cleanText, json, nowIso, readJson } from "./util";

// Site public : paiement en ligne uniquement (ou carte 3 cours déjà achetée). « Sur place » reste possible via l'admin.
const PAYMENTS: Payment[] = ["online", "card"];

/** « Paris 12 » à partir de l'adresse (code postal 750XX), sinon la ville. Sert au filtre par lieu. */
export function areaOf(location: string): string {
  const m = location.match(/\b750(\d{2})\b/);
  if (m) return `Paris ${Number(m[1])}`;
  const city = location.split(",").pop()?.replace(/\d{5}/, "").trim();
  return city || "Paris";
}

/** Retours Stripe vers l'aperçu local quand la réservation vient de localhost (origine autorisée), sinon vers le site public. */
function siteBase(req: Request, env: Env): string {
  const origin = req.headers.get("origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) && allowed.includes(origin) ? origin : env.SITE_URL;
}

/** GET /api/classes?from=&to= — cours à venir avec places restantes (par défaut : 4 mois ; fenêtre max 100 jours). */
export async function listClasses(url: URL, env: Env): Promise<Response> {
  const now = nowIso();
  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const from = fromParam && !Number.isNaN(Date.parse(fromParam)) ? new Date(Math.max(Date.parse(fromParam), Date.now())).toISOString() : now;
  const maxSpan = (toParam ? 100 : 122) * 86_400_000;
  const toWanted = toParam && !Number.isNaN(Date.parse(toParam)) ? Date.parse(toParam) : Date.parse(from) + maxSpan;
  const until = new Date(Math.min(toWanted, Date.parse(from) + maxSpan)).toISOString();
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.starts_at, c.duration_min, c.title, c.location, c.capacity,
            (SELECT COUNT(*) FROM bookings b WHERE b.class_id = c.id AND ${ACTIVE_BOOKING.replace(/status|expires_at/g, "b.$&")}) AS taken
     FROM classes c
     WHERE c.cancelled = 0 AND c.starts_at > ? AND c.starts_at < ?
     ORDER BY c.starts_at`,
  )
    .bind(now, from, until)
    .all<{ id: number; starts_at: string; duration_min: number; title: string; location: string; capacity: number; taken: number }>();

  const cfg = config(env);
  return json({
    prices: {
      online: cfg.priceOnline,
      on_site: cfg.priceOnSite,
      discovery: cfg.priceDiscovery,
      card: cfg.cardPrice,
      card_credits: cfg.cardCredits,
      card_validity_days: cfg.cardValidityDays,
      gift_validity_days: cfg.giftValidityDays,
    },
    cancel_hours: cfg.cancelHours,
    classes: results.map(({ taken, capacity, ...c }) => ({ ...c, area: areaOf(c.location), places_left: Math.max(0, capacity - taken) })),
  });
}

/** POST /api/bookings — { class_id, name, email, phone?, payment, discount?: "first" | "referral", referral_email? } */
export async function postBooking(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = await readJson(req);
  // Champ piège anti-robots, invisible (l'ancien champ « website » est ignoré : la saisie automatique des navigateurs le remplissait).
  if (body.hp_check) throw new HttpError(400, "Requête invalide.");
  const payment = String(body.payment) as Payment;
  if (!PAYMENTS.includes(payment)) throw new HttpError(400, "Mode de paiement invalide.");
  const discount = body.discount === "first" || body.discount === "referral" ? (body.discount as Discount) : null;
  const result = await createBooking(env, ctx, {
    classId: cleanInt(body.class_id, "cours", 1, Number.MAX_SAFE_INTEGER),
    name: cleanText(body.name, "nom"),
    email: cleanEmail(body.email),
    phone: cleanText(body.phone, "téléphone", 30, false),
    payment,
    discount,
    referralEmail: discount === "referral" && body.referral_email ? cleanEmail(body.referral_email) : "",
    siteUrl: siteBase(req, env),
  });
  return json(result, 201);
}

/** POST /api/cards — achat d'une carte en ligne : { name, email } */
export async function postCard(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  if (body.hp_check) throw new HttpError(400, "Requête invalide."); // champ piège anti-robots
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
  const c = await env.DB.prepare("SELECT status, amount_cents, name, credits_total, gift_from_name, gift_send_to FROM cards WHERE stripe_session_id = ?")
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
    class_id: b.class_id,
    cancel_deadline: deadline,
    can_cancel: b.status === "confirmed" && nowIso() < deadline,
    can_move: b.status === "confirmed" && nowIso() < deadline,
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

/** POST /api/contact — demande de cours particulier ou de devis entreprise ({ kind: "particulier" | "entreprise", … }). */
export async function postContact(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = await readJson(req);
  if (body.hp_check) return json({ ok: true }); // champ piège : on fait comme si tout allait bien
  const kind: "particulier" | "entreprise" = body.kind === "particulier" ? "particulier" : "entreprise";
  const q = {
    kind,
    name: cleanText(body.name, "nom"),
    company: cleanText(body.company, "entreprise", 120, kind === "entreprise"),
    email: cleanEmail(body.email),
    phone: cleanText(body.phone, "téléphone", 30, false),
    participants: cleanText(body.participants, "participants", 40, false),
    place: cleanText(body.place, "lieu", 60, false),
    format: cleanText(body.format, "type d'intervention", 60, false),
    message: String(body.message ?? "").trim().slice(0, 3000),
  };
  if (!env.ADMIN_EMAIL) throw new HttpError(500, "Formulaire indisponible, écrivez à contact@laureyogaclub.fr.");
  if (!(await sendEmail(env, quoteRequestEmail(env, q))))
    throw new HttpError(502, "L'envoi a échoué. Réessayez, ou écrivez directement à contact@laureyogaclub.fr.");
  ctx.waitUntil(sendEmail(env, quoteAckEmail(q)));
  return json({ ok: true }, 201);
}

/** POST /api/bookings/:token/move — { class_id } : report sur un autre cours (mêmes délais que l'annulation). */
export async function postMove(req: Request, env: Env, ctx: ExecutionContext, token: string): Promise<Response> {
  const b = await findByToken(env, token);
  if (b.status !== "confirmed") throw new HttpError(409, "Cette réservation n'est plus active.");
  if (nowIso() >= cancelDeadline(env, b.starts_at))
    throw new HttpError(403, `Le délai pour reporter en ligne (${config(env).cancelHours} h avant le cours) est dépassé. Contactez Laure directement.`);
  const body = await readJson(req);
  await moveBooking(env, ctx, b.id, cleanInt(body.class_id, "cours", 1, Number.MAX_SAFE_INTEGER));
  const moved = await bookingInfo(env.DB, b.id);
  return json({ ok: true, starts_at: moved?.starts_at, title: moved?.title, location: moved?.location });
}

/**
 * POST /api/gifts — carte cadeau payée en ligne :
 * { formula: "single" | "card", from_name, from_email, to_name, to_email, message?, send_to: "recipient" | "buyer" }
 */
export async function postGift(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  if (body.hp_check) throw new HttpError(400, "Requête invalide.");
  const cfg = config(env);
  const formula = body.formula === "single" ? "single" : "card";
  const credits = formula === "single" ? 1 : cfg.cardCredits;
  const amount = formula === "single" ? cfg.priceOnline : cfg.cardPrice;
  const fromName = cleanText(body.from_name, "votre nom");
  const fromEmail = cleanEmail(body.from_email);
  const toName = cleanText(body.to_name, "prénom et nom de la personne");
  const toEmail = cleanEmail(body.to_email);
  const message = String(body.message ?? "").trim().slice(0, 500) || null;
  const sendTo = body.send_to === "buyer" ? "buyer" : "recipient";
  const site = siteBase(req, env);
  const card = await env.DB.prepare(
    `INSERT INTO cards (name, email, credits_total, credits_left, amount_cents, payment, status, created_at,
                        gift_from_name, gift_from_email, gift_message, gift_send_to)
     VALUES (?, ?, ?, ?, ?, 'online', 'pending', ?, ?, ?, ?, ?) RETURNING id`,
  )
    .bind(toName, toEmail, credits, credits, amount, nowIso(), fromName, fromEmail, message, sendTo)
    .first<{ id: number }>();
  if (!card) throw new HttpError(500, "Erreur interne.");
  const session = await createCheckoutSession(
    env,
    {
      name: formula === "single" ? "Carte cadeau — 1 cours de yoga" : `Carte cadeau — ${credits} cours de yoga`,
      description: `Pour ${toName}, valable 2 mois · Laure Yoga Club`,
      amountCents: amount,
      email: fromEmail,
      metadata: { kind: "card", card_id: String(card.id), gift: "1" },
      successUrl: `${site}/merci.html?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${site}/reserver.html#cadeau`,
      expiresInMinutes: 60,
    },
    `gift-${card.id}`,
  );
  await env.DB.prepare("UPDATE cards SET stripe_session_id = ? WHERE id = ?").bind(session.id, card.id).run();
  return json({ checkoutUrl: session.url }, 201);
}
