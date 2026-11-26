// Golden Pro — scroll choreography, menu and application form.
(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const body = document.body;

  // ---- every page opens at its top (links with #section still jump there) ----
  // Browsers otherwise restore the old scroll position on reload, back/forward
  // and in some embedded previews, landing visitors mid-page.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  const toTop = () => { if (!location.hash) window.scrollTo({ top: 0, left: 0, behavior: "instant" }); };
  toTop();
  window.addEventListener("pageshow", (e) => { if (e.persisted) toTop(); });

  // ---- current page in menus ----
  const page = body.dataset.page;
  document.querySelectorAll(`[data-nav="${page}"]`).forEach((a) => a.setAttribute("aria-current", "page"));

  // ---- floating menu ----
  const menuBtn = document.querySelector(".menu-btn");
  const overlay = document.getElementById("overlay-menu");
  const menuLinks = Array.from(overlay.querySelectorAll("a"));
  const isOpen = () => body.classList.contains("menu-open");
  let lockedY = 0;
  overlay.inert = true; // closed menu is out of the tab order and hidden from screen readers
  function setMenu(open) {
    if (open === isOpen()) return;
    if (open) {
      // pin the page where it is (overflow:hidden alone doesn't stop scrolling on iOS)
      lockedY = window.scrollY;
      body.style.top = `-${lockedY}px`;
    }
    body.classList.toggle("menu-open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    overlay.setAttribute("aria-hidden", String(!open));
    overlay.inert = !open;
    if (open) {
      menuLinks[0].focus({ preventScroll: true });
    } else {
      body.style.top = "";
      window.scrollTo({ top: lockedY, behavior: "instant" });
      if (overlay.contains(document.activeElement) || document.activeElement === body) menuBtn.focus({ preventScroll: true });
    }
  }
  menuBtn.addEventListener("click", () => setMenu(!isOpen()));
  overlay.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
  document.addEventListener("keydown", (e) => {
    if (!isOpen()) return;
    if (e.key === "Escape") { setMenu(false); return; }
    if (e.key === "Tab") {
      // keep focus cycling between the close button and the menu links
      const loop = [menuBtn, ...menuLinks];
      const i = loop.indexOf(document.activeElement);
      const next = e.shiftKey ? (i <= 0 ? loop.length - 1 : i - 1) : (i === loop.length - 1 ? 0 : i + 1);
      e.preventDefault();
      loop[next].focus();
    }
  });

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
  // tells the safety net in early.js that hidden content will be revealed
  window.goldenReady = true;

  // ---- carousels (home hero, community photo): crossfade to the next photo every few seconds ----
  // A carousel with a single photo stays still. Quotes in the hero change every second photo.
  const SLIDE_MS = 8000;
  document.querySelectorAll("[data-carousel]").forEach((box) => {
    const slides = Array.from(box.querySelectorAll(".hero__slide"));
    if (slides.length < 2) return;
    const quotes = Array.from(box.querySelectorAll(".hero__quote"));
    let current = 0;
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
    }
    show(0);
    setInterval(() => show(current + 1), SLIDE_MS);
  });

  // ---- scroll-linked motion: head text fades away, photos glide with the words ----
  const hero = document.querySelector(".hero");
  const heroText = hero ? hero.querySelectorAll(".hero__head > :not(.hero__deco)") : [];
  const parallax = Array.from(document.querySelectorAll("[data-parallax]"));
  let ticking = false;

  function onScroll() {
    if (isOpen()) { ticking = false; return; } // the page is pinned while the menu is open
    const y = window.scrollY;
    const vh = window.innerHeight;
    body.classList.toggle("is-scrolled", y > vh * 0.55);
    body.classList.toggle("is-moved", y > 40);
    body.classList.toggle("is-folded", y > 140); // desktop side menu folds into the three-line button

    if (!reduceMotion) {
      if (hero && y < hero.offsetHeight + vh) {
        const p = Math.min(y / vh, 1);
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
    const connected =
      /^https:\/\/docs\.google\.com\/forms\/d\/e\/[\w-]+\/formResponse$/.test(action || "") &&
      Object.values(entries).length > 0 &&
      Object.values(entries).every((v) => /^entry\.\d+$/.test(v));

    // under-18 section: only shown (and only validated) when the age is a number below 18.
    // A disabled fieldset takes its fields out of validation.
    const ageInput = form.elements.age;
    const under18 = document.getElementById("under18");
    const syncUnder18 = () => {
      const age = ageInput.value.trim() === "" ? NaN : Number(ageInput.value);
      const show = Number.isFinite(age) && age < 18;
      under18.hidden = !show;
      under18.disabled = !show;
    };
    ageInput.addEventListener("input", syncUnder18);
    ageInput.addEventListener("change", syncUnder18);
    syncUnder18();

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      syncUnder18();
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
        const el = form.elements[field];
        let value = "";
        if (el && !el.disabled) value = el.type === "checkbox" ? (el.checked ? "Yes" : "") : el.value;
        data.append(entryId, value);
      });
      const button = form.querySelector("button[type=submit]");
      button.disabled = true;
      status.textContent = "Sending…";
      try {
        // Google Forms does not send CORS headers, so the response is opaque.
        await fetch(action, { method: "POST", mode: "no-cors", body: data });
        form.classList.add("is-sent");
        status.textContent = "Thank you! Your application is in. We review every application individually and will email you. No reply within 10 days? Message us on Instagram.";
      } catch (err) {
        button.disabled = false;
        status.textContent = "Something went wrong. Please try again, or message us on Instagram.";
      }
    });
  }
})();
