// Espace Laure : planning, inscrits, création de cours, cartes.
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const KEY = "lyc-admin-token";
  const store = {
    get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
    set: (v) => { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch {} },
  };
  let token = store.get();

  const call = async (path, opts = {}) => {
    try {
      return await api(path, { ...opts, token });
    } catch (err) {
      if (err.status === 401) logout();
      throw err;
    }
  };

  const toast = (text, kind = "ok") => {
    const t = $("#toast");
    t.textContent = text;
    t.className = `toast toast--${kind}`;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => (t.hidden = true), 4000);
  };

  // ---------- Connexion ----------
  function logout() {
    token = null;
    store.set(null);
    $("#app").hidden = true;
    $("#login").hidden = false;
  }

  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#login-error");
    err.hidden = true;
    try {
      const r = await api("/admin/login", { method: "POST", body: { password: new FormData(e.target).get("password") } });
      token = r.token;
      store.set(token);
      start();
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    }
  });
  $("#logout").addEventListener("click", logout);

  // ---------- Planning ----------
  const payLabel = (b) =>
    b.payment === "online" ? `En ligne · ${fmt.euros(b.amount_cents)}` : b.payment === "card" ? "Carte" : `Sur place · ${fmt.euros(b.amount_cents)}`;

  function classHtml(c) {
    const confirmed = c.bookings.filter((b) => b.status === "confirmed");
    const pending = c.bookings.filter((b) => b.status === "pending");
    const past = new Date(c.starts_at) < new Date();
    const rows = c.bookings
      .map(
        (b) => `<tr>
          <td><b>${esc(b.name)}</b>${b.status === "pending" ? ' <span class="tag">paiement en cours</span>' : ""}</td>
          <td><a href="mailto:${esc(b.email)}">${esc(b.email)}</a>${b.phone ? `<br><a href="tel:${esc(b.phone)}">${esc(b.phone)}</a>` : ""}</td>
          <td>${payLabel(b)}</td>
          <td>${b.payment === "on_site" ? `<label class="check"><input type="checkbox" data-paid="${b.id}" ${b.paid ? "checked" : ""}> payé</label>` : b.paid ? "✓ payé" : ""}</td>
          <td><button class="link-btn" data-cancel-booking="${b.id}" data-name="${esc(b.name)}">Annuler</button></td>
        </tr>`,
      )
      .join("");
    return `<article class="admin-class${c.cancelled ? " is-cancelled" : ""}${past ? " is-past" : ""}">
      <header>
        <div>
          <h3>${esc(fmt.day(c.starts_at))} · ${esc(fmt.time(c.starts_at))}</h3>
          <p>${esc(c.title)} · ${esc(c.duration_min)} min · ${esc(c.location)}</p>
        </div>
        <div class="admin-class-count">${c.cancelled ? "Annulé" : `<b>${confirmed.length}</b> / ${c.capacity}${pending.length ? ` <small>(+${pending.length} en paiement)</small>` : ""}`}</div>
      </header>
      ${
        c.cancelled
          ? ""
          : `${rows ? `<div class="table-wrap"><table>${rows}</table></div>` : `<p class="muted">Personne d'inscrit pour l'instant.</p>`}
      <details class="admin-tools">
        <summary>Ajouter une personne · modifier · annuler le cours</summary>
        <form class="inline-form" data-add-booking="${c.id}">
          <input name="name" placeholder="Prénom et nom" required>
          <input name="email" type="email" placeholder="Email" required>
          <select name="payment"><option value="on_site">Sur place</option><option value="card">Carte</option></select>
          <button class="btn btn--small" type="submit">Ajouter</button>
        </form>
        <form class="inline-form" data-capacity="${c.id}">
          <label>Places <input name="capacity" type="number" min="1" max="100" value="${c.capacity}"></label>
          <button class="btn btn--small btn--ghost" type="submit">Enregistrer</button>
        </form>
        <p class="danger-zone">
          ${c.bookings.length ? "" : `<button class="link-btn" data-delete-class="${c.id}">Supprimer ce cours</button> · `}
          <button class="link-btn danger" data-cancel-class="${c.id}" data-count="${c.bookings.length}">Annuler ce cours${c.bookings.length ? " et prévenir les inscrits" : ""}</button>
        </p>
      </details>`
      }
    </article>`;
  }

  async function loadClasses() {
    const box = $("#classes");
    try {
      const r = await call("/admin/classes");
      $("#new-capacity").placeholder = r.default_capacity;
      box.innerHTML = r.classes.length ? r.classes.map(classHtml).join("") : `<p class="muted">Aucun cours programmé. Créez-en ci-dessous.</p>`;
    } catch (err) {
      box.innerHTML = `<p class="form-msg form-msg--error">${esc(err.message)}</p>`;
    }
  }

  const confirmAction = (button, question, action) => {
    // Double clic de confirmation, sans boîte de dialogue.
    if (button.dataset.armed) return action();
    button.dataset.armed = "1";
    const original = button.textContent;
    button.textContent = question;
    button.classList.add("armed");
    setTimeout(() => {
      delete button.dataset.armed;
      button.textContent = original;
      button.classList.remove("armed");
    }, 4000);
  };

  $("#classes").addEventListener("click", (e) => {
    const t = e.target;
    if (t.dataset.cancelBooking) {
      confirmAction(t, `Confirmer l'annulation de ${t.dataset.name} ?`, async () => {
        try {
          const r = await call(`/admin/bookings/${t.dataset.cancelBooking}/cancel`, { method: "POST" });
          toast(r.note ? `Annulé. ${r.note}` : "Réservation annulée.");
          loadClasses();
          loadCards();
        } catch (err) { toast(err.message, "error"); }
      });
    }
    if (t.dataset.cancelClass) {
      confirmAction(t, t.dataset.count > 0 ? "Sûre ? Les inscrits seront remboursés et prévenus. Cliquez encore" : "Cliquez encore pour confirmer", async () => {
        try {
          const r = await call(`/admin/classes/${t.dataset.cancelClass}/cancel`, { method: "POST" });
          toast(`Cours annulé (${r.cancelled_bookings} inscrit·e·s prévenu·e·s).`);
          loadClasses();
          loadCards();
        } catch (err) { toast(err.message, "error"); }
      });
    }
    if (t.dataset.deleteClass) {
      confirmAction(t, "Cliquez encore pour supprimer", async () => {
        try {
          await call(`/admin/classes/${t.dataset.deleteClass}`, { method: "DELETE" });
          toast("Cours supprimé.");
          loadClasses();
        } catch (err) { toast(err.message, "error"); }
      });
    }
  });

  $("#classes").addEventListener("change", async (e) => {
    const id = e.target.dataset.paid;
    if (!id) return;
    try {
      await call(`/admin/bookings/${id}`, { method: "PATCH", body: { paid: e.target.checked } });
    } catch (err) {
      e.target.checked = !e.target.checked;
      toast(err.message, "error");
    }
  });

  $("#classes").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const fd = Object.fromEntries(new FormData(f));
    try {
      if (f.dataset.addBooking) {
        await call("/admin/bookings", { method: "POST", body: { ...fd, class_id: Number(f.dataset.addBooking) } });
        toast(`${fd.name} est inscrit·e.`);
        loadCards();
      } else if (f.dataset.capacity) {
        await call(`/admin/classes/${f.dataset.capacity}`, { method: "PATCH", body: { capacity: Number(fd.capacity) } });
        toast("Nombre de places mis à jour.");
      }
      loadClasses();
    } catch (err) { toast(err.message, "error"); }
  });

  // ---------- Nouveaux cours ----------
  $("#new-class").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    // L'heure saisie est l'heure de Paris (navigateur de Laure).
    const startsAt = new Date(`${fd.date}T${fd.time}`);
    if (Number.isNaN(startsAt.getTime())) return toast("Date ou heure invalide.", "error");
    try {
      const r = await call("/admin/classes", {
        method: "POST",
        body: {
          starts_at: startsAt.toISOString(),
          duration_min: Number(fd.duration) || undefined,
          capacity: Number(fd.capacity) || undefined,
          repeat_weeks: Number(fd.repeat) || 1,
          title: fd.title,
          location: fd.location,
        },
      });
      toast(r.created > 1 ? `${r.created} cours créés.` : "Cours créé.");
      loadClasses();
    } catch (err) { toast(err.message, "error"); }
  });

  // ---------- Cartes ----------
  async function loadCards() {
    const box = $("#cards");
    try {
      const r = await call("/admin/cards");
      box.innerHTML = r.cards.length
        ? `<div class="table-wrap"><table>
            <tr><th>Nom</th><th>Email</th><th>Restants</th><th>Achat</th></tr>
            ${r.cards
              .map(
                (c) => `<tr>
                  <td><b>${esc(c.name)}</b></td>
                  <td>${esc(c.email)}</td>
                  <td><form class="inline-form" data-card="${c.id}"><input name="credits_left" type="number" min="0" max="50" value="${c.credits_left}"> / ${c.credits_total} <button class="link-btn" type="submit">ok</button></form></td>
                  <td>${c.payment === "online" ? "En ligne" : "Sur place"} · ${fmt.euros(c.amount_cents)}<br><small class="muted">${new Date(c.created_at).toLocaleDateString("fr-FR")}</small></td>
                </tr>`,
              )
              .join("")}
          </table></div>`
        : `<p class="muted">Aucune carte active.</p>`;
    } catch (err) {
      box.innerHTML = `<p class="form-msg form-msg--error">${esc(err.message)}</p>`;
    }
  }

  $("#cards").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await call(`/admin/cards/${e.target.dataset.card}`, { method: "PATCH", body: { credits_left: Number(new FormData(e.target).get("credits_left")) } });
      toast("Carte mise à jour.");
      loadCards();
    } catch (err) { toast(err.message, "error"); }
  });

  $("#new-card").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    try {
      await call("/admin/cards", {
        method: "POST",
        body: { name: fd.name, email: fd.email, amount_cents: fd.amount ? Math.round(Number(fd.amount) * 100) : undefined },
      });
      toast("Carte enregistrée.");
      e.target.reset();
      loadCards();
    } catch (err) { toast(err.message, "error"); }
  });

  function start() {
    $("#login").hidden = true;
    $("#app").hidden = false;
    loadClasses();
    loadCards();
  }
  if (token) start();
})();
