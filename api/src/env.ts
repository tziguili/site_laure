export interface Env {
  DB: D1Database;

  // vars (wrangler.toml)
  SITE_URL: string;
  ALLOWED_ORIGINS: string;
  PRICE_ONLINE_CENTS: string;
  PRICE_ON_SITE_CENTS: string;
  PRICE_DISCOVERY_CENTS: string;
  CARD_PRICE_CENTS: string;
  CARD_CREDITS: string;
  CARD_VALIDITY_DAYS: string;
  GIFT_VALIDITY_DAYS?: string;
  DEFAULT_CAPACITY: string;
  CANCEL_HOURS: string;
  HOLD_MINUTES: string;
  EMAIL_FROM: string;
  EMAIL_REPLY_TO: string;
  ADMIN_EMAIL: string;
  /** Lien « Écrire un avis » de la fiche Google ; vide = pas de demande d'avis. */
  GOOGLE_REVIEW_URL?: string;

  // secrets
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  ADMIN_PASSWORD: string;
  RESEND_API_KEY?: string;
}

export const num = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function config(env: Env) {
  return {
    priceOnline: num(env.PRICE_ONLINE_CENTS, 1700),
    priceOnSite: num(env.PRICE_ON_SITE_CENTS, 1700),
    priceDiscovery: num(env.PRICE_DISCOVERY_CENTS, 1400),
    cardPrice: num(env.CARD_PRICE_CENTS, 4800),
    cardCredits: num(env.CARD_CREDITS, 3),
    cardValidityDays: num(env.CARD_VALIDITY_DAYS, 60),
    giftValidityDays: num(env.GIFT_VALIDITY_DAYS, 60),
    defaultCapacity: num(env.DEFAULT_CAPACITY, 10),
    cancelHours: num(env.CANCEL_HOURS, 24),
    holdMinutes: Math.max(31, num(env.HOLD_MINUTES, 35)),
  };
}
