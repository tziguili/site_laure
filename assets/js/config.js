// Adresse de l'API de réservation (Cloudflare Worker, dossier api/).
// TODO : remplacer l'adresse de production après le premier `wrangler deploy`.
window.API_BASE =
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:8787/api"
    : "https://laure-yoga-api.REMPLACER.workers.dev/api";

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
  time: (iso) => new Intl.DateTimeFormat("fr-FR", { ...tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso)).replace(":00", "h").replace(":", "h"),
  euros: (cents) => (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 ? 2 : 0 }),
};

window.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
