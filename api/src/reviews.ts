// Demande d'avis Google, envoyée par la tâche planifiée quotidienne (cron dans wrangler.toml).
// Règles : réservation confirmée, cours non annulé, terminé depuis au moins MIN_HOURS_AFTER et au plus
// MAX_DAYS_AFTER jours ; une seule demande par adresse email, pour toujours.
import type { Env } from "./env";
import { reviewRequestEmail, sendEmail } from "./email";
import { nowIso } from "./util";

const MIN_HOURS_AFTER = 6;
const MAX_DAYS_AFTER = 3;

export async function sendReviewRequests(env: Env): Promise<number> {
  if (!env.GOOGLE_REVIEW_URL) return 0;
  const now = Date.now();
  const latestEnd = new Date(now - MIN_HOURS_AFTER * 3_600_000).toISOString();
  const earliestEnd = new Date(now - MAX_DAYS_AFTER * 86_400_000).toISOString();
  // Fin du cours = début + durée (dates ISO UTC : comparaison sur le texte après calcul SQLite)
  const { results } = await env.DB.prepare(
    `SELECT b.email, MIN(b.name) AS name, MAX(c.starts_at) AS starts_at
     FROM bookings b JOIN classes c ON c.id = b.class_id
     WHERE b.status = 'confirmed' AND c.cancelled = 0
       AND strftime('%Y-%m-%dT%H:%M:%fZ', c.starts_at, '+' || c.duration_min || ' minutes') BETWEEN ? AND ?
       AND NOT EXISTS (SELECT 1 FROM bookings b2 WHERE b2.email = b.email AND b2.review_sent_at IS NOT NULL)
     GROUP BY b.email
     LIMIT 50`,
  )
    .bind(earliestEnd, latestEnd)
    .all<{ email: string; name: string; starts_at: string }>();

  let sent = 0;
  for (const r of results) {
    if (!(await sendEmail(env, reviewRequestEmail(env, r)))) continue;
    // marque toutes les réservations de cette adresse : plus jamais de nouvelle demande
    await env.DB.prepare("UPDATE bookings SET review_sent_at = ? WHERE email = ?").bind(nowIso(), r.email).run();
    sent++;
  }
  if (results.length) console.log(`Demandes d'avis : ${sent}/${results.length} envoyée(s)`);
  return sent;
}
