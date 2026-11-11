// Page de retour après paiement Stripe.
(async () => {
  const title = document.getElementById("title");
  const text = document.getElementById("text");
  const id = new URLSearchParams(location.search).get("session_id");
  if (!id) {
    title.textContent = "Rien à afficher";
    text.textContent = "Aucun paiement en cours.";
    return;
  }
  // Le webhook Stripe peut arriver quelques secondes après la redirection : on réessaie.
  for (let i = 0; i < 12; i++) {
    try {
      const r = await api(`/checkout/${encodeURIComponent(id)}`);
      if (r.kind === "booking" && r.status === "confirmed") {
        title.innerHTML = "Merci, <em>c'est réservé !</em>";
        text.innerHTML = `Rendez-vous ${esc(fmt.day(r.starts_at))} à ${esc(fmt.time(r.starts_at))} — ${esc(r.location)}. Un email de confirmation vous a été envoyé.`;
        return;
      }
      if (r.kind === "card" && r.status === "active") {
        title.innerHTML = "Merci, <em>votre carte est active !</em>";
        text.textContent = `Votre carte ${r.credits_total} cours est prête. Pour l'utiliser, réservez un cours en choisissant « Ma carte » avec la même adresse email.`;
        return;
      }
    } catch (err) {
      if (err.status !== 404) break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  title.textContent = "Paiement reçu";
  text.textContent = "La confirmation prend un peu plus de temps que prévu. Vous allez la recevoir par email ; en cas de doute, écrivez à contact@laureyogaclub.fr.";
})();
