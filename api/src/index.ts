// API Laure Yoga Club — Cloudflare Worker
import * as admin from "./admin";
import type { Env } from "./env";
import * as pub from "./public";
import { HttpError, json } from "./util";
import { sendReviewRequests } from "./reviews";
import { stripeWebhook } from "./webhook";
import * as venues from "./venues";

function corsHeaders(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS.split(",").map((s) => s.trim());
  if (!allowed.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace(/\/+$/, "");
  const m = req.method;
  let p: RegExpMatchArray | null;

  // --- Public ---
  if (m === "GET" && path === "/api/classes") return pub.listClasses(url, env);
  if (m === "GET" && path === "/api/venues") return venues.listVenues(req, env);
  if (m === "GET" && (p = path.match(/^\/api\/venues\/(\d+)\/photo$/))) return venues.getPhoto(env, Number(p[1]));
  if (m === "POST" && path === "/api/bookings") return pub.postBooking(req, env, ctx);
  if (m === "POST" && path === "/api/cards") return pub.postCard(req, env);
  if (m === "POST" && path === "/api/contact") return pub.postContact(req, env, ctx);
  if (m === "GET" && (p = path.match(/^\/api\/checkout\/([\w-]+)$/))) return pub.getCheckoutStatus(env, p[1]!);
  if (m === "GET" && (p = path.match(/^\/api\/bookings\/([\w-]+)$/))) return pub.getBooking(env, p[1]!);
  if (m === "POST" && (p = path.match(/^\/api\/bookings\/([\w-]+)\/cancel$/))) return pub.postCancel(env, p[1]!);
  if (m === "POST" && path === "/api/stripe/webhook") return stripeWebhook(req, env, ctx);

  // --- Admin ---
  if (m === "POST" && path === "/api/admin/login") return admin.login(req, env);
  if (path.startsWith("/api/admin/")) {
    await admin.requireAdmin(req, env);
    if (m === "GET" && path === "/api/admin/classes") return admin.listClasses(url, env);
    if (m === "POST" && path === "/api/admin/classes") return admin.createClasses(req, env);
    if ((p = path.match(/^\/api\/admin\/classes\/(\d+)$/))) {
      if (m === "PATCH") return admin.updateClass(req, env, Number(p[1]));
      if (m === "DELETE") return admin.deleteClass(env, Number(p[1]));
    }
    if (m === "POST" && (p = path.match(/^\/api\/admin\/classes\/(\d+)\/cancel$/))) return admin.cancelClass(env, Number(p[1]));
    if (m === "POST" && path === "/api/admin/bookings") return admin.addBooking(req, env, ctx);
    if (m === "PATCH" && (p = path.match(/^\/api\/admin\/bookings\/(\d+)$/))) return admin.updateBooking(req, env, Number(p[1]));
    if (m === "POST" && (p = path.match(/^\/api\/admin\/bookings\/(\d+)\/cancel$/))) return admin.adminCancelBooking(env, Number(p[1]));
    if (m === "GET" && path === "/api/admin/venues") return venues.adminListVenues(req, env);
    if (m === "POST" && path === "/api/admin/venues") return venues.createVenue(req, env);
    if ((p = path.match(/^\/api\/admin\/venues\/(\d+)$/))) {
      if (m === "PATCH") return venues.updateVenue(req, env, Number(p[1]));
      if (m === "DELETE") return venues.deleteVenue(env, Number(p[1]));
    }
    if ((p = path.match(/^\/api\/admin\/venues\/(\d+)\/photo$/))) {
      if (m === "PUT") return venues.putPhoto(req, env, Number(p[1]));
      if (m === "DELETE") return venues.deletePhoto(env, Number(p[1]));
    }
    if (m === "GET" && path === "/api/admin/cards") return admin.listCards(env);
    if (m === "POST" && path === "/api/admin/cards") return admin.addCard(req, env);
    if (m === "PATCH" && (p = path.match(/^\/api\/admin\/cards\/(\d+)$/))) return admin.updateCard(req, env, Number(p[1]));
  }

  throw new HttpError(404, "Introuvable.");
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const cors = corsHeaders(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    let res: Response;
    try {
      res = await route(req, env, ctx);
    } catch (err) {
      if (err instanceof HttpError) res = json({ error: err.message }, err.status);
      else {
        console.error(err);
        res = json({ error: "Erreur interne. Réessayez dans un instant." }, 500);
      }
    }
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  },

  /** Tâche quotidienne (cron, wrangler.toml) : demandes d'avis Google le lendemain des cours. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(sendReviewRequests(env).then(() => undefined));
  },
} satisfies ExportedHandler<Env>;
