# Laure Yoga Club — site internet

Site vitrine en HTML/CSS statique, hébergé sur GitHub Pages (branche `main`, racine).

## Structure

- `index.html` — Accueil (prochains cours, à propos, avis)
- `cours.html` — Cours collectifs
- `planning.html` — Planning
- `tarifs.html` — Tarifs
- `a-propos.html` — À propos
- `assets/css/style.css` — styles (couleurs et polices en haut du fichier)
- `assets/js/main.js` — menu mobile + animations
- `assets/img/` — images optimisées pour le web (WebP)
- `reserver.html` — réservation (liste des cours, paiement, achat de carte)
- `merci.html` — retour après paiement Stripe
- `annulation.html` — lien « gérer ma réservation » envoyé par email
- `admin.html` — espace Laure (planning, inscrits, création de cours, cartes) — non référencé
- `assets/js/config.js` — adresse de l'API (`API_BASE`)
- `api/` — API de réservation (Cloudflare Worker + base D1 + Stripe Checkout + emails Resend)
- `src/resource/` — photos originales

L'en-tête et le pied de page sont répétés dans chaque page : une modification (menu, contact…) doit être faite dans les 5 fichiers.

## Réservations (`api/`)

- Paiement en ligne via Stripe Checkout (place gardée 35 min pendant le paiement), sur place (14 € le premier cours), ou carte 3 cours.
- Annulation par le client jusqu'à 24 h avant : remboursement Stripe automatique ou crédit rendu sur la carte.
- Tarifs, délais et adresses : `api/wrangler.toml` (section `[vars]`).
- Secrets (jamais dans le dépôt) : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_PASSWORD`, `RESEND_API_KEY` — via `npx wrangler secret put <NOM>` ; en local dans `api/.dev.vars`.
- Webhook Stripe : `https://<worker>/api/stripe/webhook`, événements `checkout.session.completed` et `checkout.session.expired`.

```
cd api
npm install
npm run db:migrate:local
npm run dev            # API sur http://localhost:8787
```
(Node 20+ requis.)

## Voir le site en local

```
python3 -m http.server 8000
```
puis ouvrir http://localhost:8000
