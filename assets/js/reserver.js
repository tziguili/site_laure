// Page de réservation : liste des cours, formulaire, achat de carte.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const list = $("#class-list");
  const panel = $("#booking-panel");
  const form = $("#booking-form");
  const msg = $("#booking-msg");
  let data = null;
  let selected = null;

  if (new URLSearchParams(location.search).get("paiement") === "annule") {
    $("#notice").hidden = false;
  }

  function renderClasses() {
    if (!data.classes.length) {
      list.innerHTML = `<p class="empty">Aucun cours n'est ouvert à la réservation pour le moment. Revenez bientôt, ou écrivez-moi à <a href="mailto:laureyogaclub@gmail.com">laureyogaclub@gmail.com</a>.</p>`;
      return;
    }
    list.innerHTML = data.classes
      .map((c) => {
        const full = c.places_left === 0;
        const places = full ? "Complet" : c.places_left === 1 ? "Dernière place" : `${c.places_left} places`;
        return `<button type="button" class="class-pick${full ? " is-full" : ""}" data-id="${c.id}" ${full ? "disabled" : ""} aria-pressed="false">
          <span class="cp-date"><small>${esc(fmt.dayShort(c.starts_at))}</small><b>${esc(fmt.dayNum(c.starts_at))}</b><small>${esc(fmt.month(c.starts_at))}</small></span>
          <span class="cp-body"><b>${esc(fmt.time(c.starts_at))} · ${esc(c.title)}</b><span>${esc(c.duration_min)} min · ${esc(c.location.split(",")[0])}</span></span>
          <span class="cp-places${c.places_left <= 2 && !full ? " is-low" : ""}">${places}</span>
        </button>`;
      })
      .join("");
  }

  function renderPrices() {
    const p = data.prices;
    $("#price-online").textContent = fmt.euros(p.online);
    $("#price-onsite").textContent = `${fmt.euros(p.on_site)} · ${fmt.euros(p.discovery)} pour un premier cours`;
    $("#price-card").textContent = `1 cours décompté de votre carte ${p.card_credits} cours`;
    $("#card-price").textContent = fmt.euros(p.card);
    document.querySelectorAll("[data-card-credits]").forEach((el) => (el.textContent = p.card_credits));
    $("#cancel-hours").textContent = data.cancel_hours;
  }

  function select(id) {
    selected = data.classes.find((c) => c.id === id);
    list.querySelectorAll(".class-pick").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.id) === id)));
    $("#selected-class").textContent = `${fmt.day(selected.starts_at)} à ${fmt.time(selected.starts_at)} — ${selected.title}`;
    msg.hidden = true;
    form.hidden = false;
    if (window.matchMedia("(max-width: 880px)").matches) panel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  list.addEventListener("click", (e) => {
    const b = e.target.closest(".class-pick");
    if (b && !b.disabled) select(Number(b.dataset.id));
  });

  function showMsg(el, html, kind) {
    el.innerHTML = html;
    el.className = `form-msg form-msg--${kind}`;
    el.hidden = false;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Un instant…";
    try {
      const res = await api("/bookings", {
        method: "POST",
        body: {
          class_id: selected.id,
          name: fd.get("name"),
          email: fd.get("email"),
          phone: fd.get("phone"),
          payment: fd.get("payment"),
          website: fd.get("website"),
        },
      });
      if (res.checkoutUrl) {
        location.href = res.checkoutUrl;
        return;
      }
      form.hidden = true;
      const pay =
        fd.get("payment") === "card"
          ? `1 cours a été décompté de votre carte (il vous en reste ${res.creditsLeft}).`
          : `Vous réglerez <b>${fmt.euros(res.amountCents)}</b> sur place (carte bancaire ou espèces).`;
      showMsg(
        msg,
        `<h3>C'est réservé !</h3><p>Rendez-vous ${esc(fmt.day(selected.starts_at))} à ${esc(fmt.time(selected.starts_at))}. ${pay}</p><p>Un email de confirmation vient de vous être envoyé à <b>${esc(fd.get("email"))}</b>.</p>`,
        "ok",
      );
      load();
    } catch (err) {
      showMsg(msg, esc(err.message), "error");
      if (err.status === 409) load();
    } finally {
      btn.disabled = false;
      btn.textContent = "Confirmer la réservation";
    }
  });

  // Achat de carte
  const cardForm = $("#card-form");
  cardForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(cardForm);
    const btn = cardForm.querySelector("button[type=submit]");
    btn.disabled = true;
    try {
      const res = await api("/cards", { method: "POST", body: { name: fd.get("name"), email: fd.get("email"), website: fd.get("website") } });
      location.href = res.checkoutUrl;
    } catch (err) {
      showMsg($("#card-msg"), esc(err.message), "error");
      btn.disabled = false;
    }
  });

  async function load() {
    try {
      data = await api("/classes");
      renderPrices();
      renderClasses();
      if (selected) {
        const still = data.classes.find((c) => c.id === selected.id && c.places_left > 0);
        list.querySelectorAll(".class-pick").forEach((b) => b.setAttribute("aria-pressed", String(still && Number(b.dataset.id) === still.id)));
      }
    } catch (err) {
      list.innerHTML = `<p class="empty">Impossible de charger les cours pour le moment. ${esc(err.message)}</p>`;
    }
  }
  load();
})();
