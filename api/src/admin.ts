// Routes d'administration (Laure) — protégées par mot de passe.
import { ACTIVE_BOOKING, cancelBooking, createBooking, getClass, type Payment } from "./bookings";
import { config, type Env } from "./env";
import { HttpError, cleanEmail, cleanInt, cleanIsoDate, cleanText, hmacHex, json, nowIso, readJson, safeEqual } from "./util";

const SESSION_DAYS = 30;

async function sign(env: Env, payload: string) {
  return hmacHex(`admin-session:${env.ADMIN_PASSWORD}`, payload);
}

/** POST /api/admin/login — { password } → { token } */
export async function login(req: Request, env: Env): Promise<Response> {
  const { password } = await readJson<{ password?: string }>(req);
  if (!env.ADMIN_PASSWORD || !safeEqual(String(password ?? ""), env.ADMIN_PASSWORD)) {
    await new Promise((r) => setTimeout(r, 800)); // ralentit les essais
    throw new HttpError(401, "Mot de passe incorrect.");
  }
  const exp = String(Date.now() + SESSION_DAYS * 86_400_000);
  return json({ token: `${exp}.${await sign(env, exp)}` });
}

export async function requireAdmin(req: Request, env: Env): Promise<void> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const [exp, sig] = token.split(".");
  if (!exp || !sig || !env.ADMIN_PASSWORD || Number(exp) < Date.now() || !safeEqual(sig, await sign(env, exp)))
    throw new HttpError(401, "Session expirée, reconnectez-vous.");
}

/** GET /api/admin/classes?from=&to= — cours avec la liste des inscrits. */
export async function listClasses(url: URL, env: Env): Promise<Response> {
  const from = url.searchParams.get("from") ? cleanIsoDate(url.searchParams.get("from"), "from") : new Date(Date.now() - 86_400_000).toISOString();
  const to = url.searchParams.get("to") ? cleanIsoDate(url.searchParams.get("to"), "to") : new Date(Date.now() + 70 * 86_400_000).toISOString();
  const now = nowIso();
  const [classes, bookings] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM classes WHERE starts_at >= ? AND starts_at < ? ORDER BY starts_at").bind(from, to),
    env.DB.prepare(
      `SELECT b.id, b.class_id, b.name, b.email, b.phone, b.payment, b.amount_cents, b.status, b.paid, b.created_at
       FROM bookings b JOIN classes c ON c.id = b.class_id
       WHERE c.starts_at >= ? AND c.starts_at < ? AND ${ACTIVE_BOOKING.replace(/status|expires_at/g, "b.$&")}
       ORDER BY b.created_at`,
    ).bind(from, to, now),
  ]);
  const byClass = new Map<number, unknown[]>();
  for (const b of bookings.results as { class_id: number }[]) {
    byClass.set(b.class_id, [...(byClass.get(b.class_id) ?? []), b]);
  }
  return json({
    default_capacity: config(env).defaultCapacity,
    classes: (classes.results as { id: number }[]).map((c) => ({ ...c, bookings: byClass.get(c.id) ?? [] })),
  });
}

/** POST /api/admin/classes — { starts_at, duration_min?, capacity?, title?, location?, repeat_weeks? } */
export async function createClasses(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const start = new Date(cleanIsoDate(body.starts_at, "date"));
  const weeks = body.repeat_weeks ? cleanInt(body.repeat_weeks, "répétition", 1, 52) : 1;
  const capacity = body.capacity ? cleanInt(body.capacity, "places", 1, 100) : config(env).defaultCapacity;
  const duration = body.duration_min ? cleanInt(body.duration_min, "durée", 15, 300) : 60;
  const title = cleanText(body.title, "titre", 80, false) || "Cours de yoga";
  const location = cleanText(body.location, "lieu", 160, false) || "Maison Né, 25 rue Beccaria, 75012 Paris";
  const now = nowIso();

  const stmts = [];
  for (let i = 0; i < weeks; i++) {
    // Même heure locale chaque semaine (gère le changement d'heure été/hiver côté Paris).
    const d = addWeeksParis(start, i);
    stmts.push(
      env.DB.prepare(
        "INSERT INTO classes (starts_at, duration_min, title, location, capacity, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(d.toISOString(), duration, title, location, capacity, now),
    );
  }
  await env.DB.batch(stmts);
  return json({ created: weeks }, 201);
}

/** Ajoute n semaines en conservant l'heure murale de Paris. */
function addWeeksParis(start: Date, weeks: number): Date {
  const naive = new Date(start.getTime() + weeks * 7 * 86_400_000);
  const offset = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", timeZoneName: "shortOffset" }).formatToParts(d);
    const m = parts.find((p) => p.type === "timeZoneName")?.value.match(/GMT([+-]\d+)?/);
    return Number(m?.[1] ?? 0);
  };
  return new Date(naive.getTime() + (offset(start) - offset(naive)) * 3_600_000);
}

/** PATCH /api/admin/classes/:id — { capacity?, title?, location?, starts_at?, duration_min? } */
export async function updateClass(req: Request, env: Env, id: number): Promise<Response> {
  const cls = await getClass(env.DB, id);
  if (!cls) throw new HttpError(404, "Cours introuvable.");
  const body = await readJson(req);
  const next = {
    capacity: body.capacity !== undefined ? cleanInt(body.capacity, "places", 1, 100) : cls.capacity,
    title: body.title !== undefined ? cleanText(body.title, "titre", 80) : cls.title,
    location: body.location !== undefined ? cleanText(body.location, "lieu", 160) : cls.location,
    starts_at: body.starts_at !== undefined ? cleanIsoDate(body.starts_at, "date") : cls.starts_at,
    duration_min: body.duration_min !== undefined ? cleanInt(body.duration_min, "durée", 15, 300) : cls.duration_min,
  };
  await env.DB.prepare("UPDATE classes SET capacity = ?, title = ?, location = ?, starts_at = ?, duration_min = ? WHERE id = ?")
    .bind(next.capacity, next.title, next.location, next.starts_at, next.duration_min, id)
    .run();
  return json({ ok: true });
}

/** POST /api/admin/classes/:id/cancel — annule le cours, rembourse et prévient les inscrits. */
export async function cancelClass(env: Env, id: number): Promise<Response> {
  const cls = await getClass(env.DB, id);
  if (!cls) throw new HttpError(404, "Cours introuvable.");
  await env.DB.prepare("UPDATE classes SET cancelled = 1 WHERE id = ?").bind(id).run();
  const { results } = await env.DB.prepare("SELECT id FROM bookings WHERE class_id = ? AND status IN ('pending', 'confirmed')")
    .bind(id)
    .all<{ id: number }>();
  for (const b of results) await cancelBooking(env, b.id, "class");
  return json({ ok: true, cancelled_bookings: results.length });
}

/** DELETE /api/admin/classes/:id — supprime un cours sans aucune réservation (erreur de saisie). */
export async function deleteClass(env: Env, id: number): Promise<Response> {
  const any = await env.DB.prepare("SELECT 1 FROM bookings WHERE class_id = ? LIMIT 1").bind(id).first();
  if (any) throw new HttpError(409, "Ce cours a des réservations : annulez-le plutôt que de le supprimer.");
  await env.DB.prepare("DELETE FROM classes WHERE id = ?").bind(id).run();
  return json({ ok: true });
}

/** POST /api/admin/bookings — ajout manuel : { class_id, name, email, phone?, payment: 'on_site' | 'card' } */
export async function addBooking(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = await readJson(req);
  const payment = String(body.payment) as Payment;
  if (payment !== "on_site" && payment !== "card") throw new HttpError(400, "Mode de paiement invalide.");
  const result = await createBooking(env, ctx, {
    classId: cleanInt(body.class_id, "cours", 1, Number.MAX_SAFE_INTEGER),
    name: cleanText(body.name, "nom"),
    email: cleanEmail(body.email),
    phone: cleanText(body.phone, "téléphone", 30, false),
    payment,
    byAdmin: true,
  });
  return json(result, 201);
}

/** PATCH /api/admin/bookings/:id — { paid: boolean } (paiement sur place reçu) */
export async function updateBooking(req: Request, env: Env, id: number): Promise<Response> {
  const body = await readJson<{ paid?: boolean }>(req);
  await env.DB.prepare("UPDATE bookings SET paid = ? WHERE id = ?").bind(body.paid ? 1 : 0, id).run();
  return json({ ok: true });
}

/** POST /api/admin/bookings/:id/cancel — annulation par Laure (sans délai). */
export async function adminCancelBooking(env: Env, id: number): Promise<Response> {
  const note = await cancelBooking(env, id, "admin");
  return json({ ok: true, note });
}

/** GET /api/admin/cards */
export async function listCards(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    "SELECT id, name, email, credits_total, credits_left, amount_cents, payment, status, created_at FROM cards WHERE status = 'active' ORDER BY created_at DESC",
  ).all();
  return json({ cards: results });
}

/** POST /api/admin/cards — carte vendue sur place : { name, email, credits?, amount_cents? } */
export async function addCard(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  const cfg = config(env);
  const credits = body.credits ? cleanInt(body.credits, "cours", 1, 50) : cfg.cardCredits;
  const amount = body.amount_cents !== undefined ? cleanInt(body.amount_cents, "montant", 0, 100_000) : cfg.cardPrice;
  await env.DB.prepare(
    `INSERT INTO cards (name, email, credits_total, credits_left, amount_cents, payment, status, created_at)
     VALUES (?, ?, ?, ?, ?, 'on_site', 'active', ?)`,
  )
    .bind(cleanText(body.name, "nom"), cleanEmail(body.email), credits, credits, amount, nowIso())
    .run();
  return json({ ok: true }, 201);
}

/** PATCH /api/admin/cards/:id — { credits_left } */
export async function updateCard(req: Request, env: Env, id: number): Promise<Response> {
  const body = await readJson(req);
  const left = cleanInt(body.credits_left, "cours restants", 0, 50);
  await env.DB.prepare("UPDATE cards SET credits_left = ?, credits_total = MAX(credits_total, ?) WHERE id = ?").bind(left, left, id).run();
  return json({ ok: true });
}
