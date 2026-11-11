// Client Stripe minimal (API REST via fetch, sans SDK).
import type { Env } from "./env";
import { HttpError, hmacHex, safeEqual } from "./util";

type Params = Record<string, unknown>;

/** Encode des paramètres imbriqués au format attendu par Stripe (a[b][0][c]=…). */
function encode(params: Params, prefix = "", out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === "object" ? encode(item as Params, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else if (typeof v === "object") encode(v as Params, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function stripe<T = any>(env: Env, method: "GET" | "POST", path: string, params?: Params, idempotencyKey?: string): Promise<T> {
  if (!env.STRIPE_SECRET_KEY) throw new HttpError(500, "Paiement en ligne non configuré.");
  const headers: Record<string, string> = { authorization: `Bearer ${env.STRIPE_SECRET_KEY}` };
  let body: string | undefined;
  let url = `https://api.stripe.com/v1${path}`;
  if (params && method === "POST") {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = encode(params).toString();
  } else if (params) {
    url += `?${encode(params)}`;
  }
  if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
  const res = await fetch(url, { method, headers, body });
  const data = (await res.json()) as any;
  if (!res.ok) {
    console.error("Stripe error", res.status, data?.error?.message);
    throw new HttpError(502, "Erreur du service de paiement. Réessayez dans un instant.");
  }
  return data as T;
}

export interface CheckoutInput {
  name: string;          // libellé affiché dans Stripe
  description?: string;
  amountCents: number;
  email: string;
  metadata: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
  expiresInMinutes: number;
}

export async function createCheckoutSession(env: Env, input: CheckoutInput, idempotencyKey: string) {
  return stripe<{ id: string; url: string }>(
    env,
    "POST",
    "/checkout/sessions",
    {
      mode: "payment",
      locale: "fr",
      customer_email: input.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: input.amountCents,
            product_data: { name: input.name, description: input.description },
          },
        },
      ],
      metadata: input.metadata,
      payment_intent_data: { metadata: input.metadata },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      expires_at: Math.floor(Date.now() / 1000) + input.expiresInMinutes * 60,
    },
    idempotencyKey,
  );
}

export async function expireCheckoutSession(env: Env, sessionId: string) {
  try {
    await stripe(env, "POST", `/checkout/sessions/${sessionId}/expire`);
  } catch {
    /* déjà expirée ou payée : rien à faire */
  }
}

export async function refund(env: Env, paymentIntent: string, reason: string) {
  return stripe(env, "POST", "/refunds", { payment_intent: paymentIntent, metadata: { reason } }, `refund-${paymentIntent}`);
}

/** Vérifie la signature d'un webhook Stripe et renvoie l'événement. */
export async function verifyWebhook(env: Env, req: Request): Promise<any> {
  const payload = await req.text();
  const header = req.headers.get("stripe-signature") ?? "";
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts["t"];
  const signatures = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !signatures.length || !env.STRIPE_WEBHOOK_SECRET) throw new HttpError(400, "Signature manquante.");
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) throw new HttpError(400, "Signature expirée.");
  const expected = await hmacHex(env.STRIPE_WEBHOOK_SECRET, `${t}.${payload}`);
  if (!signatures.some((s) => safeEqual(s, expected))) throw new HttpError(400, "Signature invalide.");
  return JSON.parse(payload);
}
