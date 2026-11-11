// Webhook Stripe : confirme les paiements, libère les places des paiements abandonnés.
import { notifyConfirmed } from "./bookings";
import { cardActivatedEmail, sendEmail } from "./email";
import type { Env } from "./env";
import { verifyWebhook } from "./stripe";
import { json, nowIso } from "./util";

export async function stripeWebhook(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const event = await verifyWebhook(env, req);
  const session = event.data?.object ?? {};
  const meta = session.metadata ?? {};

  if (event.type === "checkout.session.completed" && session.payment_status === "paid") {
    if (meta.kind === "booking") {
      // Confirmé même si la place avait expiré entre-temps : le client a payé, on l'accueille.
      const res = await env.DB.prepare(
        "UPDATE bookings SET status = 'confirmed', paid = 1, payment_intent = ?, expires_at = NULL, cancelled_at = NULL WHERE id = ? AND stripe_session_id = ? AND status != 'confirmed'",
      )
        .bind(session.payment_intent, Number(meta.booking_id), session.id)
        .run();
      if (res.meta.changes) ctx.waitUntil(notifyConfirmed(env, Number(meta.booking_id)));
    }
    if (meta.kind === "card") {
      const card = await env.DB.prepare(
        "UPDATE cards SET status = 'active', payment_intent = ? WHERE id = ? AND stripe_session_id = ? AND status = 'pending' RETURNING *",
      )
        .bind(session.payment_intent, Number(meta.card_id), session.id)
        .first<{ name: string; email: string; credits_total: number; amount_cents: number }>();
      if (card) ctx.waitUntil(sendEmail(env, cardActivatedEmail(env, card)));
    }
  }

  if (event.type === "checkout.session.expired") {
    await env.DB.batch([
      env.DB.prepare("UPDATE bookings SET status = 'cancelled', cancelled_at = ? WHERE stripe_session_id = ? AND status = 'pending'").bind(nowIso(), session.id),
      env.DB.prepare("UPDATE cards SET status = 'expired' WHERE stripe_session_id = ? AND status = 'pending'").bind(session.id),
    ]);
  }

  return json({ received: true });
}
