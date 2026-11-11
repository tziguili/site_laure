// Menu mobile
const toggle = document.querySelector(".nav-toggle");
const nav = document.getElementById("nav");
if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });
}

// Apparition douce des sections au défilement
// (ce qui est déjà à l'écran au chargement s'affiche tout de suite)
const items = [...document.querySelectorAll(".reveal")].filter((el) => {
  if (el.getBoundingClientRect().top < window.innerHeight) { el.classList.add("is-visible"); return false; }
  return true;
});
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  items.forEach((el) => io.observe(el));
} else {
  items.forEach((el) => el.classList.add("is-visible"));
}

// Année du pied de page
const y = document.getElementById("year");
if (y) y.textContent = new Date().getFullYear();
