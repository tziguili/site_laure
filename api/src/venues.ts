// Lieux des cours : liste publique (page Planning), gestion par Laure (admin), photo d'ambiance.
import type { Env } from "./env";
import { areaOf } from "./public";
import { HttpError, cleanInt, cleanText, json, nowIso, readJson } from "./util";

const PHOTO_TYPES = ["image/jpeg", "image/webp", "image/png"];
const PHOTO_MAX_BYTES = 1_500_000;

interface VenueRow {
  id: number;
  name: string;
  address: string;
  info: string;
  maps_url: string;
  position: number;
  photo_at: string | null;
}

/** Lien « Itinéraire » : celui saisi par Laure, sinon une recherche Google Maps sur l'adresse. */
const mapsLink = (v: VenueRow) =>
  v.maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.address)}`;

function present(v: VenueRow, apiBase: string) {
  return {
    id: v.id,
    name: v.name,
    address: v.address,
    info: v.info,
    maps_url: mapsLink(v),
    maps_url_raw: v.maps_url,
    position: v.position,
    area: areaOf(v.address),
    // La date de la photo dans l'URL : une nouvelle photo change l'adresse, le cache navigateur reste sûr.
    photo_url: v.photo_at ? `${apiBase}/api/venues/${v.id}/photo?v=${encodeURIComponent(v.photo_at)}` : null,
  };
}

async function allVenues(env: Env): Promise<VenueRow[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, name, address, info, maps_url, position, photo_at FROM venues ORDER BY position, id",
  ).all<VenueRow>();
  return results;
}

/** GET /api/venues — lieux affichés sur la page Planning. */
export async function listVenues(req: Request, env: Env): Promise<Response> {
  const base = new URL(req.url).origin;
  return json({ venues: (await allVenues(env)).map((v) => present(v, base)) }, 200, { "cache-control": "public, max-age=60" });
}

/** GET /api/venues/:id/photo */
export async function getPhoto(env: Env, id: number): Promise<Response> {
  const row = await env.DB.prepare("SELECT type, data FROM venue_photos WHERE venue_id = ?").bind(id).first<{ type: string; data: ArrayBuffer | number[] }>();
  if (!row) throw new HttpError(404, "Photo introuvable.");
  const bytes = row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : new Uint8Array(row.data);
  return new Response(bytes, {
    headers: { "content-type": row.type, "cache-control": "public, max-age=31536000, immutable" },
  });
}

function cleanMapsUrl(v: unknown): string {
  const s = cleanText(v, "lien Google Maps", 500, false);
  if (!s) return "";
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    throw new HttpError(400, "Le lien Google Maps n'est pas une adresse web valide.");
  }
  if (u.protocol !== "https:") throw new HttpError(400, "Le lien Google Maps doit commencer par https://");
  return u.toString();
}

function cleanVenue(body: Record<string, unknown>) {
  return {
    name: cleanText(body.name, "nom du lieu", 80),
    address: cleanText(body.address, "adresse", 160),
    info: cleanText(body.info, "infos", 400, false),
    maps_url: cleanMapsUrl(body.maps_url),
    position: body.position !== undefined && body.position !== "" ? cleanInt(body.position, "ordre", 0, 999) : 0,
  };
}

/** GET /api/admin/venues */
export async function adminListVenues(req: Request, env: Env): Promise<Response> {
  const base = new URL(req.url).origin;
  return json({ venues: (await allVenues(env)).map((v) => present(v, base)) });
}

/** POST /api/admin/venues — { name, address, info?, maps_url?, position? } */
export async function createVenue(req: Request, env: Env): Promise<Response> {
  const v = cleanVenue(await readJson(req));
  const r = await env.DB.prepare(
    "INSERT INTO venues (name, address, info, maps_url, position, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(v.name, v.address, v.info, v.maps_url, v.position, nowIso())
    .run();
  return json({ id: r.meta.last_row_id }, 201);
}

/** PATCH /api/admin/venues/:id — mêmes champs */
export async function updateVenue(req: Request, env: Env, id: number): Promise<Response> {
  const v = cleanVenue(await readJson(req));
  const r = await env.DB.prepare("UPDATE venues SET name = ?, address = ?, info = ?, maps_url = ?, position = ? WHERE id = ?")
    .bind(v.name, v.address, v.info, v.maps_url, v.position, id)
    .run();
  if (!r.meta.changes) throw new HttpError(404, "Lieu introuvable.");
  return json({ ok: true });
}

/** DELETE /api/admin/venues/:id — les cours déjà créés gardent leur adresse (texte). */
export async function deleteVenue(env: Env, id: number): Promise<Response> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM venue_photos WHERE venue_id = ?").bind(id),
    env.DB.prepare("DELETE FROM venues WHERE id = ?").bind(id),
  ]);
  return json({ ok: true });
}

/** PUT /api/admin/venues/:id/photo — corps = l'image (redimensionnée par l'admin). */
export async function putPhoto(req: Request, env: Env, id: number): Promise<Response> {
  const type = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!PHOTO_TYPES.includes(type)) throw new HttpError(400, "Format de photo non pris en charge (JPEG, WebP ou PNG).");
  const data = await req.arrayBuffer();
  if (!data.byteLength) throw new HttpError(400, "Photo vide.");
  if (data.byteLength > PHOTO_MAX_BYTES) throw new HttpError(413, "Photo trop lourde (1,5 Mo maximum).");
  const exists = await env.DB.prepare("SELECT 1 FROM venues WHERE id = ?").bind(id).first();
  if (!exists) throw new HttpError(404, "Lieu introuvable.");
  await env.DB.batch([
    env.DB.prepare("INSERT OR REPLACE INTO venue_photos (venue_id, type, data) VALUES (?, ?, ?)").bind(id, type, data),
    env.DB.prepare("UPDATE venues SET photo_at = ? WHERE id = ?").bind(nowIso(), id),
  ]);
  return json({ ok: true });
}

/** DELETE /api/admin/venues/:id/photo */
export async function deletePhoto(env: Env, id: number): Promise<Response> {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM venue_photos WHERE venue_id = ?").bind(id),
    env.DB.prepare("UPDATE venues SET photo_at = NULL WHERE id = ?").bind(id),
  ]);
  return json({ ok: true });
}
