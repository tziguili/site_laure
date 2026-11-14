// Page « Ma réservation » (lien reçu par email) : détail + annulation.
(async () => {
  const title = document.getElementById("title");
  const text = document.getElementById("text");
  const cancelBtn = document.getElementById("cancel-btn");
  const confirmBtn = document.getElementById("confirm-btn");
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
  const when = `${fmt.day(b.starts_at)} à ${fmt.time(b.starts_at)}`;
  if (b.status === "cancelled") {
    title.textContent = "Réservation annulée";
    text.textContent = `Votre réservation du ${when} est annulée.`;
    return;
  }
  title.innerHTML = `${esc(b.title)}, <em>${esc(when)}</em>`;
  text.textContent = b.location;
  if (!b.can_cancel) {
    text.textContent += ` — Le délai d'annulation en ligne est dépassé : pour tout changement, écrivez à contact@laureyogaclub.fr.`;
    return;
  }
  cancelBtn.hidden = false;
  cancelBtn.addEventListener("click", () => {
    cancelBtn.hidden = true;
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
})();
