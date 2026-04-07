// ==UserScript==
// @name         IBKR Session Keep-Alive
// @namespace    ibkr-keepalive
// @version      1.0
// @description  Keeps Interactive Brokers Client Portal session alive by tickling the API
// @match        https://www.interactivebrokers.ie/*
// @match        https://www.interactivebrokers.com/*
// @match        https://ndcdyn.interactivebrokers.com/*
// @match        https://localhost:5000/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const TICKLE_URL = "/portal.proxy/v1/portal/tickle";
  const VALIDATE_URL = "/portal.proxy/v1/portal/sso/validate";
  const TICKLE_INTERVAL_MS = 55 * 1000;
  const VALIDATE_INTERVAL_MS = 5 * 60 * 1000;

  let tickleOk = 0;
  let tickleFail = 0;
  let lastTickle = null;
  let lastValidate = null;

  async function tickle() {
    try {
      const r = await fetch(TICKLE_URL, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
      });
      if (r.ok) {
        tickleOk++;
        lastTickle = new Date();
        console.log("[IBKR-KA] tickle OK", tickleOk);
      } else {
        tickleFail++;
        console.warn("[IBKR-KA] tickle HTTP", r.status);
      }
    } catch (e) {
      tickleFail++;
      console.error("[IBKR-KA] tickle error", e);
    }
    updateBadge();
  }

  async function validate() {
    try {
      const r = await fetch(VALIDATE_URL, { credentials: "same-origin" });
      const data = await r.json();
      lastValidate = new Date();
      if (data.authenticated || data.AUTH_STATUS === true) {
        console.log("[IBKR-KA] validate: authenticated");
      } else {
        console.warn("[IBKR-KA] validate: not authenticated", data);
      }
    } catch (e) {
      console.error("[IBKR-KA] validate error", e);
    }
  }

  function createBadge() {
    const badge = document.createElement("div");
    badge.id = "ibkr-ka-badge";
    badge.style.cssText = [
      "position:fixed",
      "bottom:8px",
      "right:8px",
      "z-index:999999",
      "background:#1a1a2e",
      "color:#0f0",
      "font:11px/1.4 monospace",
      "padding:6px 10px",
      "border-radius:6px",
      "opacity:0.85",
      "cursor:pointer",
      "user-select:none",
    ].join(";");
    badge.title = "Click to force tickle";
    badge.addEventListener("click", () => {
      tickle();
      validate();
    });
    document.body.appendChild(badge);
    return badge;
  }

  function updateBadge() {
    const badge =
      document.getElementById("ibkr-ka-badge") || createBadge();
    const ts = lastTickle
      ? lastTickle.toLocaleTimeString()
      : "-";
    badge.textContent = `KA: ${tickleOk}ok ${tickleFail}err | ${ts}`;
    badge.style.color = tickleFail > tickleOk ? "#f44" : "#0f0";
  }

  // Initial calls
  tickle();
  validate();

  // Recurring
  setInterval(tickle, TICKLE_INTERVAL_MS);
  setInterval(validate, VALIDATE_INTERVAL_MS);

  console.log(
    "[IBKR-KA] started - tickle every",
    TICKLE_INTERVAL_MS / 1000,
    "s, validate every",
    VALIDATE_INTERVAL_MS / 1000,
    "s"
  );
})();
