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
- `src/resource/` — photos originales

L'en-tête et le pied de page sont répétés dans chaque page : une modification (menu, contact…) doit être faite dans les 5 fichiers.

Les réservations passent par Setmore : https://laureyogaclub.setmore.com/book

## Voir le site en local

```
python3 -m http.server 8000
```
puis ouvrir http://localhost:8000

## Mode maintenance

```
./scripts/maintenance.sh on      # affiche la page « Le site prend une pause »
./scripts/maintenance.sh off     # remet le site
./scripts/maintenance.sh status
```
La page de maintenance est sur la branche `maintenance` (GitHub Pages publie cette branche au lieu de `main`). Effet en ~1 minute.
