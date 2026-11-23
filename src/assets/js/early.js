// Runs before first paint: lets CSS hide reveal-on-scroll content, with a safety net
// that shows everything again if main.js never loads.
document.documentElement.className = "js";
setTimeout(function () { if (!window.goldenReady) document.documentElement.classList.remove("js"); }, 2500);
