// Avis : carrousel (flèches + glisser) et fenêtre « avis complet » au clic.
(() => {
  const track = document.getElementById("reviews-track");
  const dialog = document.getElementById("review-dialog");
  if (!track) return;
  const prev = document.querySelector(".slider-btn--prev");
  const next = document.querySelector(".slider-btn--next");

  const step = () => {
    const card = track.querySelector(".quote");
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    const perView = Math.max(1, Math.round(track.clientWidth / (card.offsetWidth + gap)));
    return perView * (card.offsetWidth + gap);
  };
  const update = () => {
    prev.disabled = track.scrollLeft <= 4;
    next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
  };
  prev.addEventListener("click", () => track.scrollBy({ left: -step(), behavior: "smooth" }));
  next.addEventListener("click", () => track.scrollBy({ left: step(), behavior: "smooth" }));
  track.addEventListener("scroll", update, { passive: true });
  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { e.preventDefault(); next.click(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); prev.click(); }
  });

  // « Lire la suite » seulement quand le texte est coupé
  const markTruncated = () => {
    track.querySelectorAll(".quote").forEach((q) => {
      const t = q.querySelector(".quote-text");
      q.classList.toggle("is-truncated", t.scrollHeight > t.clientHeight + 2);
    });
    update();
  };
  window.addEventListener("resize", markTruncated);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(markTruncated);
  markTruncated();

  // Avis complet
  if (!dialog || typeof dialog.showModal !== "function") return;
  const full = dialog.querySelector(".review-full");
  const author = dialog.querySelector(".review-author");
  track.addEventListener("click", (e) => {
    const q = e.target.closest(".quote");
    if (!q) return;
    full.textContent = q.querySelector(".quote-text").textContent;
    author.textContent = q.querySelector(".quote-name").textContent;
    dialog.showModal();
  });
  dialog.querySelector(".review-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); }); // clic en dehors
})();
