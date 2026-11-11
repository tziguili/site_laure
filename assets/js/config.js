// Adresse de l'API de réservation (Cloudflare Worker, dossier api/).
// En local, ajouter ?api=prod à l'adresse pour utiliser l'API déployée (mémorisé pour l'onglet).
const PROD_API = "https://laure-yoga-api.laure-yoga-api.workers.dev/api";
const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
try {
  const q = new URLSearchParams(location.search).get("api");
  if (isLocal && q) sessionStorage.setItem("lyc-api", q);
} catch {}
const useProd = (() => { try { return sessionStorage.getItem("lyc-api") === "prod"; } catch { return false; } })();
window.API_BASE = isLocal && !useProd ? "http://localhost:8787/api" : PROD_API;

window.api = async function api(path, { method = "GET", body, token } = {}) {
  const headers = {};
  if (body) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(window.API_BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw Object.assign(new Error("Connexion impossible. Vérifiez votre connexion internet et réessayez."), { status: 0 });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || "Une erreur est survenue."), { status: res.status });
  return data;
};

const tz = { timeZone: "Europe/Paris" };
window.fmt = {
  day: (iso) => new Intl.DateTimeFormat("fr-FR", { ...tz, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso)),
  dayShort: (iso) => new Intl.DateTimeFormat("fr-FR", { ...tz, weekday: "short" }).format(new Date(iso)).replace(".", ""),
  dayNum: (iso) => new Intl.DateTimeFormat("fr-FR", { ...tz, day: "numeric" }).format(new Date(iso)),
  month: (iso) => new Intl.DateTimeFormat("fr-FR", { ...tz, month: "short" }).format(new Date(iso)).replace(".", ""),
  time: (iso) => new Intl.DateTimeFormat("fr-FR", { ...tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso)).replace(":00", "h").replace(":", "h"),
  euros: (cents) => (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 ? 2 : 0 }),
};

window.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
