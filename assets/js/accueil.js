// Accueil : affiche le prochain cours collectif disponible (lien direct vers la réservation).
(() => {
  const card = document.getElementById("next-class");
  if (!card) return;
  const body = card.querySelector(".next-body");
  const btn = document.getElementById("next-class-btn");
  const first = document.getElementById("first-class-btn");
  api("/classes")
    .then((d) => {
      const c = d.classes.find((x) => x.places_left > 0);
      if (!c) throw new Error("none");
      body.innerHTML = `
        <span class="cp-date"><small>${esc(fmt.dayShort(c.starts_at))}</small><b>${esc(fmt.dayNum(c.starts_at))}</b><small>${esc(fmt.month(c.starts_at))}</small></span>
        <div>
          <h3>${esc(c.title)}</h3>
          <p><span class="next-time">${esc(fmt.day(c.starts_at))}, ${esc(fmt.range(c.starts_at, c.duration_min))}</span><br>${esc(c.location.includes(",") ? c.location.slice(c.location.indexOf(",") + 1).trim() : c.location)}</p>
        </div>`;
      btn.href = `reserver.html?cours=${c.id}#collectifs`;
      btn.textContent = "Réserver ce cours";
      first.href = `reserver.html?cours=${c.id}&premier=1#collectifs`;
    })
    .catch(() => {
      card.classList.add("is-empty");
      body.textContent = "Les prochaines dates arrivent bientôt : consultez le planning ou écrivez-moi.";
    });
})();
