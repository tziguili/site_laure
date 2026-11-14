// Page Réserver : calendrier des cours collectifs, réservation, carte 3 cours,
// demande de cours particulier / yoga en entreprise.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const params = new URLSearchParams(location.search);
  if (params.get("paiement") === "annule") $("#notice").hidden = false;

  const form = $("#booking-form");
  const msg = $("#booking-msg");
  let selected = null;

  function showMsg(el, html, kind) {
    el.innerHTML = html;
    el.className = `form-msg form-msg--${kind}`;
    el.hidden = false;
  }

  function applyPrices(d) {
    const p = d.prices;
    $("#price-online").textContent = `${fmt.euros(p.online)} · ${fmt.euros(p.discovery)} pour un premier cours`;
    $("#card-price").textContent = fmt.euros(p.card);
    document.querySelectorAll("[data-card-credits]").forEach((el) => (el.textContent = p.card_credits));
    $("#cancel-hours").textContent = d.cancel_hours;
  }

  function select(cls) {
    selected = cls;
    $("#selected-class").textContent = `${fmt.day(cls.starts_at)} à ${fmt.time(cls.starts_at)} — ${cls.title}`;
    const addr = $("#selected-address");
    addr.textContent = `${LycCalendar.addressOf(cls.location)} · ${cls.places_left} place${cls.places_left > 1 ? "s" : ""} restante${cls.places_left > 1 ? "s" : ""}`;
    addr.hidden = false;
    msg.hidden = true;
    form.hidden = false;
    if (window.matchMedia("(max-width: 880px)").matches) $("#booking-panel").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const calendar = LycCalendar($("#calendar"), {
    onSelect: (cls, data) => { applyPrices(data); select(cls); },
  });
  // Prix affichés dès le premier chargement + lien direct depuis le planning (reserver.html?cours=ID)
  api("/classes").then((d) => {
    applyPrices(d);
    const id = Number(params.get("cours"));
    const cls = id && d.classes.find((c) => c.id === id && c.places_left > 0);
    if (cls) { calendar.focus(cls.id, cls.starts_at); select(cls); }
  }).catch(() => {});

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
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
      if (res.checkoutUrl) { location.href = res.checkoutUrl; return; }
      form.hidden = true;
      showMsg(
        msg,
        `<h3>C'est réservé !</h3><p>Rendez-vous ${esc(fmt.day(selected.starts_at))} à ${esc(fmt.time(selected.starts_at))}, ${esc(LycCalendar.addressOf(selected.location))}. 1 cours a été décompté de votre carte (il vous en reste ${res.creditsLeft}).</p><p>Un email de confirmation vient de vous être envoyé à <b>${esc(fd.get("email"))}</b>.</p>`,
        "ok",
      );
      calendar.reload();
    } catch (err) {
      const noCard = err.status === 402;
      showMsg(msg, esc(err.message) + (noCard ? ` <a href="#carte">Acheter une carte 3 cours</a> ou choisissez « Payer en ligne ».` : ""), "error");
      if (err.status === 409) calendar.reload();
    } finally {
      btn.disabled = false;
      btn.textContent = "Confirmer la réservation";
    }
  });

  // Achat de la carte 3 cours
  const cardForm = $("#card-form");
  cardForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!cardForm.reportValidity()) return;
    const fd = new FormData(cardForm);
    const btn = cardForm.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Un instant…";
    try {
      const res = await api("/cards", { method: "POST", body: { name: fd.get("name"), email: fd.get("email"), website: fd.get("website") } });
      location.href = res.checkoutUrl;
    } catch (err) {
      showMsg($("#card-msg"), esc(err.message), "error");
      btn.disabled = false;
      btn.textContent = "Acheter la carte";
    }
  });

  // Demande : cours particulier / yoga en entreprise
  const reqForm = $("#request-form");
  const syncKind = () => {
    const ent = reqForm.kind.value === "entreprise";
    reqForm.querySelectorAll(".only-entreprise").forEach((el) => (el.hidden = !ent));
    reqForm.company.required = ent;
  };
  if (params.get("demande") === "entreprise") reqForm.querySelector('input[value="entreprise"]').checked = true;
  reqForm.addEventListener("change", (e) => { if (e.target.name === "kind") syncKind(); });
  syncKind();
  reqForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!reqForm.reportValidity()) return;
    const btn = reqForm.querySelector("button[type=submit]");
    const out = $("#request-msg");
    btn.disabled = true;
    btn.textContent = "Envoi…";
    try {
      await api("/contact", { method: "POST", body: Object.fromEntries(new FormData(reqForm)) });
      reqForm.hidden = true;
      showMsg(out, "<h3>Merci !</h3><p>Votre demande est bien partie. Je vous recontacte très rapidement ; un email de confirmation vient de vous être envoyé.</p>", "ok");
    } catch (err) {
      showMsg(out, esc(err.message), "error");
    } finally {
      btn.disabled = false;
      btn.textContent = "Envoyer ma demande";
    }
  });
})();
