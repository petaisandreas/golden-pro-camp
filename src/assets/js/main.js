// Golden Pro — scroll choreography, menu and application form.
(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const body = document.body;

  // ---- current page in menus ----
  const page = body.dataset.page;
  document.querySelectorAll(`[data-nav="${page}"]`).forEach((a) => a.setAttribute("aria-current", "page"));

  // ---- floating menu ----
  const menuBtn = document.querySelector(".menu-btn");
  const overlay = document.getElementById("overlay-menu");
  function setMenu(open) {
    body.classList.toggle("menu-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    overlay.setAttribute("aria-hidden", String(!open));
  }
  menuBtn.addEventListener("click", () => setMenu(!body.classList.contains("menu-open")));
  overlay.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setMenu(false); });

  // ---- reveal on scroll (text, photos, gold wave lines) ----
  const revealables = document.querySelectorAll("[data-reveal], .wave");
  if ("IntersectionObserver" in window && !reduceMotion) {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      }),
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    revealables.forEach((el) => io.observe(el));
  } else {
    revealables.forEach((el) => el.classList.add("is-in"));
  }

  // ---- hero slideshow: crossfade to the next photo every few seconds ----
  const SLIDE_MS = 5000;
  const slides = Array.from(document.querySelectorAll(".hero:not(.hero--page) .hero__slide"));
  if (slides.length > 1) {
    const dotsWrap = document.createElement("div");
    dotsWrap.className = "hero__dots";
    dotsWrap.style.setProperty("--slide-ms", SLIDE_MS + "ms");
    const dots = slides.map((_, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "hero__dot";
      dot.setAttribute("aria-label", `Show photo ${i + 1}`);
      dot.addEventListener("click", () => { show(i); restart(); });
      dotsWrap.appendChild(dot);
      return dot;
    });
    slides[0].parentElement.appendChild(dotsWrap);

    // the quotes in the hero head change every second photo
    const quotes = Array.from(document.querySelectorAll(".hero__quote"));

    let current = 0;
    let timer;
    function show(i) {
      current = (i + slides.length) % slides.length;
      slides.forEach((s, n) => s.classList.toggle("is-active", n === current));
      if (quotes.length) {
        const q = Math.floor(current / 2) % quotes.length;
        quotes.forEach((el, n) => {
          el.classList.toggle("is-active", n === q);
          el.setAttribute("aria-hidden", String(n !== q));
        });
      }
      dots.forEach((d, n) => {
        d.classList.remove("is-active");
        if (n === current) { void d.offsetWidth; d.classList.add("is-active"); }
      });
    }
    function restart() {
      clearInterval(timer);
      timer = setInterval(() => show(current + 1), SLIDE_MS);
    }
    show(0);
    restart();
  }

  // ---- scroll-linked motion: hero photos drift back, head text fades away, photos glide with the words ----
  const hero = document.querySelector(".hero");
  const heroSlides = hero ? hero.querySelectorAll(".hero__slide") : [];
  const heroText = hero ? hero.querySelectorAll(".hero__head > :not(.hero__deco)") : [];
  const parallax = Array.from(document.querySelectorAll("[data-parallax]"));
  let ticking = false;

  function onScroll() {
    const y = window.scrollY;
    const vh = window.innerHeight;
    body.classList.toggle("is-scrolled", y > vh * 0.55);
    body.classList.toggle("is-moved", y > 40);

    if (!reduceMotion) {
      if (hero && y < hero.offsetHeight + vh) {
        const p = Math.min(y / vh, 1);
        heroSlides.forEach((s) => { s.style.transform = `translate3d(0, ${(y * 0.12).toFixed(1)}px, 0)`; });
        heroText.forEach((t) => { t.style.opacity = String(Math.max(0, 1 - p * 1.3)); });
      }
      for (const el of parallax) {
        const box = el.parentElement.getBoundingClientRect();
        if (box.bottom < -100 || box.top > vh + 100) continue;
        const speed = parseFloat(el.dataset.parallax) || 0.15;
        let offset = (box.top + box.height / 2 - vh / 2) * -speed;
        // feature photos sit just below their quote: only a small drift, so the photo never slides up under the words
        if (el.parentElement.classList.contains("feature__media")) offset = Math.max(-16, Math.min(56, offset));
        el.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0)`;
      }
    }
    ticking = false;
  }
  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();

  // ---- footer year ----
  document.querySelectorAll("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });

  // ---- application form → Google Forms ----
  const form = document.getElementById("apply-form");
  if (form) {
    const status = form.querySelector(".form__status");
    let entries = {};
    try { entries = JSON.parse(form.dataset.entries || "{}"); } catch (e) { entries = {}; }
    const action = form.dataset.action;
    const formUrl = form.dataset.formUrl;
    const connected = action && Object.values(entries).every(Boolean);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const invalid = Array.from(form.elements).find((el) => el.willValidate && !el.checkValidity());
      if (invalid) {
        status.textContent = "Please fill in every field marked with *.";
        invalid.focus();
        return;
      }

      if (!connected) {
        if (formUrl) {
          status.textContent = "Opening the application form…";
          window.open(formUrl, "_blank", "noopener");
        } else {
          status.textContent = "Applications are not open online yet — message us on Instagram.";
        }
        return;
      }

      const data = new FormData();
      Object.entries(entries).forEach(([field, entryId]) => {
        data.append(entryId, form.elements[field] ? form.elements[field].value : "");
      });
      const button = form.querySelector("button[type=submit]");
      button.disabled = true;
      status.textContent = "Sending…";
      try {
        // Google Forms does not send CORS headers, so the response is opaque.
        await fetch(action, { method: "POST", mode: "no-cors", body: data });
        form.classList.add("is-sent");
        status.textContent = "Thank you! Your application is in. We review every application individually and will email you.";
      } catch (err) {
        button.disabled = false;
        status.textContent = "Something went wrong. Please try again, or message us on Instagram.";
      }
    });
  }
})();
