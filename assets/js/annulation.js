// Page « Ma réservation » (lien reçu par email) : détail, report sur un autre cours, annulation.
(async () => {
  const $ = (id) => document.getElementById(id);
  const title = $("title");
  const text = $("text");
  const cancelBtn = $("cancel-btn");
  const confirmBtn = $("confirm-btn");
  const moveBtn = $("move-btn");
  const token = new URLSearchParams(location.search).get("t");
  if (!token) {
    title.textContent = "Lien invalide";
    text.textContent = "Utilisez le lien reçu dans votre email de confirmation.";
    return;
  }
  const path = `/bookings/${encodeURIComponent(token)}`;
  let b;
  try {
    b = await api(path);
  } catch (err) {
    title.textContent = "Réservation introuvable";
    text.textContent = err.message;
    return;
  }
  const whenOf = (iso) => `${fmt.day(iso)} à ${fmt.time(iso)}`;
  const addressOf = (loc) => (window.LycCalendar ? LycCalendar.addressOf(loc) : loc);
  const showBooking = () => {
    title.textContent = `${b.title}, ${whenOf(b.starts_at)}`;
    text.textContent = addressOf(b.location);
  };
  if (b.status === "cancelled") {
    title.textContent = "Réservation annulée";
    text.textContent = `Votre réservation du ${whenOf(b.starts_at)} est annulée.`;
    return;
  }
  showBooking();
  if (!b.can_cancel) {
    text.textContent += ` — Le délai pour annuler ou reporter en ligne est dépassé : pour tout changement, écrivez à contact@laureyogaclub.fr.`;
    return;
  }

  // --- Annulation
  cancelBtn.hidden = false;
  cancelBtn.addEventListener("click", () => {
    cancelBtn.hidden = true;
    moveBtn.hidden = true;
    $("move").hidden = true;
    confirmBtn.hidden = false;
    text.textContent = "Vous confirmez l'annulation ? Votre place sera libérée.";
  });
  confirmBtn.addEventListener("click", async () => {
    confirmBtn.disabled = true;
    try {
      const r = await api(`${path}/cancel`, { method: "POST" });
      title.textContent = "Réservation annulée";
      text.textContent = r.note || "Votre place a été libérée.";
      confirmBtn.hidden = true;
    } catch (err) {
      text.textContent = err.message;
      confirmBtn.disabled = false;
    }
  });

  // --- Report sur un autre cours
  if (!b.can_move || !window.LycCalendar) return;
  moveBtn.hidden = false;
  let target = null;
  let calendar = null;
  const choice = $("move-choice");
  const okBtn = $("move-ok");
  const msg = $("move-msg");
  moveBtn.addEventListener("click", () => {
    $("move").hidden = false;
    if (!calendar) {
      calendar = LycCalendar($("move-calendar"), {
        onSelect: (cls) => {
          msg.hidden = true;
          if (cls.id === b.class_id) {
            target = null;
            $("move-confirm").hidden = true;
            msg.className = "form-msg form-msg--info";
            msg.textContent = "C'est le cours que vous avez déjà réservé : choisissez-en un autre.";
            msg.hidden = false;
            return;
          }
          target = cls;
          choice.textContent = `Nouveau cours : ${cls.title}, ${whenOf(cls.starts_at)} — ${addressOf(cls.location)}`;
          $("move-confirm").hidden = false;
          $("move-confirm").scrollIntoView({ behavior: "smooth", block: "nearest" });
        },
      });
    }
    $("move").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  okBtn.addEventListener("click", async () => {
    if (!target) return;
    okBtn.disabled = true;
    okBtn.textContent = "Un instant…";
    try {
      const r = await api(`${path}/move`, { method: "POST", body: { class_id: target.id } });
      b = { ...b, starts_at: r.starts_at, title: r.title, location: r.location, class_id: target.id };
      showBooking();
      $("move-confirm").hidden = true;
      $("move-calendar").hidden = true;
      msg.className = "form-msg form-msg--ok";
      msg.innerHTML = `<h3>C'est reporté !</h3><p>Rendez-vous ${esc(whenOf(r.starts_at))}, ${esc(addressOf(r.location))}. Un email de confirmation vient de vous être envoyé.</p>`;
      msg.hidden = false;
      moveBtn.hidden = true;
    } catch (err) {
      msg.className = "form-msg form-msg--error";
      msg.textContent = err.message;
      msg.hidden = false;
      if (err.status === 409 && calendar) calendar.reload();
    } finally {
      okBtn.disabled = false;
      okBtn.textContent = "Confirmer le report";
    }
  });
})();
