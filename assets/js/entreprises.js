// Formulaire de demande de devis entreprise.
(() => {
  const form = document.getElementById("quote-form");
  const msg = document.getElementById("quote-msg");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Envoi…";
    try {
      await api("/contact", { method: "POST", body: Object.fromEntries(new FormData(form)) });
      form.hidden = true;
      msg.className = "form-msg form-msg--ok";
      msg.innerHTML = "<h3>Merci !</h3><p>Votre demande est bien partie. Je reviens vers vous très rapidement — un email de confirmation vient de vous être envoyé.</p>";
    } catch (err) {
      msg.className = "form-msg form-msg--error";
      msg.textContent = err.message;
    } finally {
      msg.hidden = false;
      btn.disabled = false;
      btn.textContent = "Envoyer ma demande";
    }
  });
})();
