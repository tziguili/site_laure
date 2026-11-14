// Calendrier mensuel des cours collectifs (Planning et Réserver).
// Une ligne par semaine (lundi → dimanche), cours cliquables dans le jour concerné,
// flèches pour changer de mois, boutons de lieu (« Paris 12 »…) générés à partir des cours.
(() => {
  const TZ = "Europe/Paris";
  const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
  const MAX_MONTHS_AHEAD = 6;

  // Date « murale » de Paris (année, mois 0-11, jour) d'un instant ISO
  const parisParts = (iso) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
        .formatToParts(new Date(iso)).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]),
    );
    return { y: p.year, m: p.month - 1, d: p.day };
  };
  const key = (y, m, d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const monthLabel = (y, m) => new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(Date.UTC(y, m, 15)));
  /** « 25 rue Beccaria, 75012 Paris » plutôt que « Maison Né, 25 rue Beccaria, … » */
  const addressOf = (loc) => (loc.includes(",") ? loc.slice(loc.indexOf(",") + 1).trim() : loc);

  window.LycCalendar = function LycCalendar(root, { onSelect, selectedId } = {}) {
    const today = parisParts(new Date().toISOString());
    let y = today.y, m = today.m;
    let area = null;          // filtre de lieu
    let selected = selectedId || null;
    let data = null;          // réponse API du mois affiché
    const cache = new Map();

    root.classList.add("cal");
    root.innerHTML = `
      <div class="cal-bar">
        <button type="button" class="cal-nav cal-prev" aria-label="Mois précédent"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
        <h3 class="cal-title" aria-live="polite"></h3>
        <button type="button" class="cal-nav cal-next" aria-label="Mois suivant"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>
      </div>
      <div class="cal-areas" role="group" aria-label="Lieu"></div>
      <div class="cal-grid" role="grid"></div>
      <p class="cal-empty" hidden></p>`;
    const $ = (s) => root.querySelector(s);

    async function fetchMonth(yy, mm) {
      const k = key(yy, mm, 1);
      if (cache.has(k)) return cache.get(k);
      // fenêtre large (du lundi précédent au dimanche suivant) pour remplir les jours des mois voisins
      const from = new Date(Date.UTC(yy, mm, 1) - 7 * 86400000).toISOString();
      const to = new Date(Date.UTC(yy, mm + 1, 1) + 8 * 86400000).toISOString();
      const res = await api(`/classes?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
      cache.set(k, res);
      return res;
    }

    function render() {
      $(".cal-title").textContent = monthLabel(y, m);
      $(".cal-prev").disabled = y === today.y && m === today.m;
      const monthsAhead = (y - today.y) * 12 + (m - today.m);
      $(".cal-next").disabled = monthsAhead >= MAX_MONTHS_AHEAD;

      const all = data ? data.classes : [];
      const areas = [...new Set(all.map((c) => c.area))].sort();
      if (area && !areas.includes(area)) area = null;
      $(".cal-areas").innerHTML = areas.length
        ? (areas.length > 1 ? `<button type="button" class="cal-area${area ? "" : " is-on"}" data-area="">Tous les lieux</button>` : "") +
          areas.map((a) => `<button type="button" class="cal-area${area === a || areas.length === 1 ? " is-on" : ""}" data-area="${esc(a)}">${esc(a)}</button>`).join("")
        : "";
      const list = all.filter((c) => !area || c.area === area);

      const byDay = new Map();
      list.forEach((c) => {
        const p = parisParts(c.starts_at);
        const k = key(p.y, p.m, p.d);
        byDay.set(k, [...(byDay.get(k) || []), c]);
      });

      // grille : du lundi de la 1re semaine au dimanche de la dernière
      const first = new Date(Date.UTC(y, m, 1));
      const lead = (first.getUTCDay() + 6) % 7;
      const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const cells = Math.ceil((lead + daysInMonth) / 7) * 7;
      let html = DOW.map((d) => `<div class="cal-dow" role="columnheader">${d}</div>`).join("");
      for (let i = 0; i < cells; i++) {
        const dt = new Date(Date.UTC(y, m, 1 - lead + i));
        const dy = dt.getUTCFullYear(), dm = dt.getUTCMonth(), dd = dt.getUTCDate();
        const k = key(dy, dm, dd);
        const outside = dm !== m;
        const past = k < key(today.y, today.m, today.d);
        const isToday = k === key(today.y, today.m, today.d);
        const items = (byDay.get(k) || [])
          .map((c) => {
            const full = c.places_left === 0;
            const label = `${fmt.time(c.starts_at)} · ${c.title} · ${addressOf(c.location)} · ${full ? "complet" : c.places_left + " place" + (c.places_left > 1 ? "s" : "")}`;
            return `<button type="button" class="cal-class${full ? " is-full" : ""}${selected === c.id ? " is-selected" : ""}" data-id="${c.id}" ${full ? "disabled" : ""} aria-label="${esc(label)}" title="${esc(label)}">
              <b>${esc(fmt.time(c.starts_at))}</b><span class="cal-class-info">${full ? "Complet" : `${c.places_left} pl.`}</span>
            </button>`;
          })
          .join("");
        html += `<div class="cal-day${outside ? " is-outside" : ""}${past ? " is-past" : ""}${isToday ? " is-today" : ""}${items ? " has-class" : ""}" role="gridcell">
          <span class="cal-num">${dd}</span>${items}</div>`;
      }
      $(".cal-grid").innerHTML = html;
      const empty = $(".cal-empty");
      const inMonth = list.filter((c) => parisParts(c.starts_at).m === m);
      empty.hidden = inMonth.length > 0 || !data;
      empty.textContent = "Aucun cours n'est encore programmé ce mois-ci. Essayez le mois suivant, ou écrivez-moi à contact@laureyogaclub.fr.";
    }

    async function load() {
      data = null;
      render();
      root.classList.add("is-loading");
      try {
        data = await fetchMonth(y, m);
      } catch (err) {
        $(".cal-empty").hidden = false;
        $(".cal-empty").textContent = "Impossible de charger le planning pour le moment. " + err.message;
      } finally {
        root.classList.remove("is-loading");
      }
      render();
    }

    root.addEventListener("click", (e) => {
      const nav = e.target.closest(".cal-nav");
      if (nav && !nav.disabled) {
        if (nav.classList.contains("cal-prev")) { m--; if (m < 0) { m = 11; y--; } }
        else { m++; if (m > 11) { m = 0; y++; } }
        load();
        return;
      }
      const a = e.target.closest(".cal-area");
      if (a) { area = a.dataset.area || null; render(); return; }
      const c = e.target.closest(".cal-class");
      if (c && !c.disabled && data) {
        const cls = data.classes.find((x) => x.id === Number(c.dataset.id));
        selected = cls.id;
        render();
        if (onSelect) onSelect(cls, data);
      }
    });

    load();
    return {
      reload() { cache.clear(); return load(); },
      get data() { return data; },
      /** Affiche le mois d'un cours donné et le sélectionne */
      async focus(id, iso) { const p = parisParts(iso); y = p.y; m = p.m; selected = id; await load(); },
      addressOf,
    };
  };
  window.LycCalendar.addressOf = addressOf;
})();
