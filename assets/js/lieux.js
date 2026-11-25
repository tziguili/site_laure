// Page Planning : lieux des cours (gérés par Laure dans l'admin), photo d'ambiance en fond de l'encart.
(() => {
  const box = document.getElementById("venues");
  if (!box) return;
  api("/venues")
    .then(({ venues }) => {
      if (!venues.length) return; // garde l'encart par défaut
      box.innerHTML = venues
        .map(
          (v, i) => `<article class="area-card${v.photo_url ? " has-photo" : ""}" data-i="${i}">
            <span class="area-badge">${esc(v.area)}</span>
            <h3>${esc(v.name)}</h3>
            <p>${esc(v.address)}${v.info ? `<br>${esc(v.info)}` : ""}</p>
            <a href="${esc(v.maps_url)}" target="_blank" rel="noopener">Itinéraire →</a>
          </article>`,
        )
        .join("");
      // Photo posée en style (et non dans le HTML) : l'adresse est passée telle quelle à CSS, sans risque d'injection.
      venues.forEach((v, i) => {
        if (v.photo_url) box.querySelector(`[data-i="${i}"]`).style.setProperty("--venue-photo", `url(${JSON.stringify(v.photo_url)})`);
      });
    })
    .catch(() => {}); // API indisponible : l'encart Maison Né du HTML reste affiché
})();
