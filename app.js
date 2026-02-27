/* app.js
   SPA controller for the Check-In usability-testing prototype.

   IMPORTANT:
   - We do NOT change any provided screen UI/markup/styles.
   - We load each provided .html at runtime and inject its <style> + <body>.
   - We now ALSO execute each screen's inline <script> (unchanged) so existing
     working behavior (scanner autofill, input formatting, animations) remains intact.
   - Inline scripts are executed in a sandbox function scope to avoid global redeclare issues.
*/
(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const root = document.getElementById("root");
  const screenStyles = document.getElementById("screenStyles") || (() => {
    const s = document.createElement("style");
    s.id = "screenStyles";
    document.head.appendChild(s);
    return s;
  })();

  // Map each step to the provided static HTML file.
  const SCREEN_FILES = {
    dashboard: "dashboard.html",
    guestRegistration: "refinedGuestRegistration.html",
    returningGuest: "returningGuest.html",
    newGuest: "newGuest.html",
    stayDetails: "stayDetails.html",
    bookingSummary: "bookingSummary.html",
    cashPayment: "cashPayment.html",
    cashPaymentSuccessful: "cashPaymentSuccessful.html",
    cardPayment: "cardPayment.html",
    tapToPay: "tapToPay.html",
    cardPaymentProcessing: "cardPaymentProcessing.html",
    cardPaymentDeclined: "cardPaymentDeclined.html",
    cardPaymentSuccessful: "cardPaymentSuccessful.html",
    receiptPrinted: "receiptPrinted.html"
  };

  const screenCache = new Map(); // key -> { css, html, scripts: [{text, src}] }

  const STORAGE_KEY = "ux_checkin_knownGuests_v1";

  /** @type {{guest:any, stay:any, booking:any, payment:any}} */
  const state = {
    guest: {
      fullName: "",
      streetAddress: "",
      city: "",
      state: "",
      zip: "",
      gender: "",
      age: "",
      idType: "",
      idNumber: ""
    },
    stay: {
      checkin: "",
      checkout: "",
      adults: "",
      children: "",
      room: "",
      rate: "",
      deposit: "",
      discount: ""
    },
    booking: {
      days: 0,
      rateAmount: 0,
      total: 0,
      bookingId: "",
      transactionId: ""
    },
    payment: {
      method: "",     // "cash" | "card"
      cardMode: ""    // "tap" | "manual"
    }
  };

  const RATE_MAP = {
    "king-75": 75,
    "queen-65": 65,
    "double-85": 85,
    "studio-75": 75,
    "studio-weekly-50": 50
  };

  let processingTimer = null;
  let renderToken = 0;

  // Track & cleanup timers created by inline scripts we execute
  let activeScriptDisposers = [];
  let currentScreenKey = null;

  function disposeActiveScripts() {
    for (const d of activeScriptDisposers) {
      try { d(); } catch {}
    }
    activeScriptDisposers = [];
  }

  function preUnmountCleanup() {
    // If scanner overlay is open, trigger its own close handler (untouched logic)
    const scanner = document.getElementById("scannerScreen");
    if (scanner && scanner.classList.contains("is-open")) {
      const closeBtn = document.getElementById("closeBtn");
      closeBtn?.click();
    }

    // Stop any active camera streams if present
    for (const v of $$("video", document)) {
      try {
        const so = v.srcObject;
        if (so && typeof so.getTracks === "function") {
          so.getTracks().forEach(t => {
            try { t.stop(); } catch {}
          });
        }
        v.srcObject = null;
      } catch {}
    }
  }

  function loadKnownGuests() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveKnownGuests(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
  }

  function upsertKnownGuest(idNumber, fullName) {
    const list = loadKnownGuests();
    const idx = list.findIndex(x => x && x.idNumber === idNumber);
    const item = { idNumber, fullName: fullName || "" };
    if (idx >= 0) list[idx] = { ...list[idx], ...item };
    else list.push(item);
    saveKnownGuests(list);
  }

  function isReturningGuest(idNumber) {
    const list = loadKnownGuests();
    if (list.some(x => x && x.idNumber === idNumber)) return true;

    // Heuristic for testability (even last digit => returning)
    const last = (idNumber || "").replace(/\D/g, "").slice(-1);
    if (!last) return false;
    return Number(last) % 2 === 0;
  }

  function randDigits(len) {
    let out = "";
    for (let i = 0; i < len; i++) out += String(Math.floor(Math.random() * 10));
    return out;
  }

  function money(n) {
    const num = Number.isFinite(n) ? n : 0;
    return `$ ${num.toFixed(2)}`;
  }

  function parseMoneyLike(v) {
    const s = String(v ?? "").trim();
    if (!s) return 0;
    const cleaned = s.replace(/[^0-9.\-]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  function formatDateTime(dateStr, kind) {
    if (!dateStr) return "Time and Date";
    const base = new Date(dateStr + "T00:00:00");
    if (Number.isNaN(base.getTime())) return "Time and Date";
    if (kind === "checkin") base.setHours(14, 0, 0, 0);
    else if (kind === "checkout") base.setHours(11, 0, 0, 0);
    else base.setHours(12, 0, 0, 0);

    return base.toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function calcDays(checkin, checkout) {
    if (!checkin || !checkout) return 0;
    const d1 = new Date(checkin + "T00:00:00");
    const d2 = new Date(checkout + "T00:00:00");
    if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) return 0;
    const diff = Math.round((d2 - d1) / 86400000);
    return diff < 1 ? 1 : diff;
  }

  function recomputeBooking() {
    const days = calcDays(state.stay.checkin, state.stay.checkout);
    const rateAmount = RATE_MAP[state.stay.rate] ?? 0;
    const deposit = parseMoneyLike(state.stay.deposit);
    const discount = parseMoneyLike(state.stay.discount);
    const total = (days * rateAmount) + deposit - discount;

    state.booking.days = days;
    state.booking.rateAmount = rateAmount;
    state.booking.total = Number.isFinite(total) ? total : 0;

    if (!state.booking.bookingId) state.booking.bookingId = randDigits(10);
    if (!state.booking.transactionId) state.booking.transactionId = randDigits(13);
  }

  async function getScreen(key) {
    if (!SCREEN_FILES[key]) key = "dashboard";
    if (screenCache.has(key)) return screenCache.get(key);

    const file = SCREEN_FILES[key];
    const res = await fetch(file, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Failed to load ${file}: ${res.status}`);
    const text = await res.text();

    const doc = new DOMParser().parseFromString(text, "text/html");

    // Extract styles as-is.
    const css = $$("style", doc).map(s => s.textContent || "").join("\n\n").trim();

    // Extract scripts (UNCHANGED) so we can execute them after mounting.
    const scripts = $$("script", doc).map(s => ({
      src: s.getAttribute("src") || "",
      text: s.textContent || ""
    }));

    // Remove scripts from markup injection (scripts inserted via innerHTML do not execute anyway)
    $$("script", doc).forEach(s => s.remove());

    // Use body markup as-is.
    const html = (doc.body ? doc.body.innerHTML : "").trim();

    const out = { css, html, scripts };
    screenCache.set(key, out);
    return out;
  }

  function runInlineScripts(scripts) {
    if (!Array.isArray(scripts) || scripts.length === 0) return;

    for (const s of scripts) {
      // If external scripts exist, we can load them (none in your provided files),
      // but we keep support here.
      if (s.src) {
        const el = document.createElement("script");
        el.src = s.src;
        document.body.appendChild(el);
        continue;
      }

      const code = (s.text || "").trim();
      if (!code) continue;

      // Sandbox execution so "const x" in scripts doesn't pollute global scope.
      // Also intercept timers so we can cleanup on navigation.
      const timeouts = [];
      const intervals = [];

      const _setTimeout = window.setTimeout.bind(window);
      const _setInterval = window.setInterval.bind(window);
      const _clearTimeout = window.clearTimeout.bind(window);
      const _clearInterval = window.clearInterval.bind(window);

      const wrappedSetTimeout = (fn, ms, ...args) => {
        const id = _setTimeout(fn, ms, ...args);
        timeouts.push(id);
        return id;
      };
      const wrappedSetInterval = (fn, ms, ...args) => {
        const id = _setInterval(fn, ms, ...args);
        intervals.push(id);
        return id;
      };

      try {
        // Execute exactly the script text, untouched.
        const fn = new Function(
          "setTimeout",
          "setInterval",
          "clearTimeout",
          "clearInterval",
          code
        );
        fn(wrappedSetTimeout, wrappedSetInterval, _clearTimeout, _clearInterval);

        activeScriptDisposers.push(() => {
          for (const id of timeouts) { try { _clearTimeout(id); } catch {} }
          for (const id of intervals) { try { _clearInterval(id); } catch {} }
        });
      } catch (e) {
        console.error("Inline script execution failed:", e);
      }
    }
  }

  async function render(key) {
    const token = ++renderToken;

    // Cleanup prior screen
    if (processingTimer) {
      clearTimeout(processingTimer);
      processingTimer = null;
    }
    preUnmountCleanup();
    disposeActiveScripts();

    root.innerHTML = "";
    screenStyles.textContent = "";

    const screen = await getScreen(key);
    if (token !== renderToken) return;

    screenStyles.textContent = screen.css || "";
    root.innerHTML = screen.html || "";

    // Execute original inline scripts (scanner + formatting + animations) UNCHANGED
    runInlineScripts(screen.scripts || []);

    currentScreenKey = key;
    bind(key);
  }

  function go(key, opts = {}) {
    if (!SCREEN_FILES[key]) key = "dashboard";
    const url = `#${key}`;
    if (opts.replace) history.replaceState({ screen: key }, "", url);
    else history.pushState({ screen: key }, "", url);
    render(key).catch(console.error);
  }

  function boot() {
    const initial = (location.hash || "").replace("#", "") || "dashboard";
    const start = SCREEN_FILES[initial] ? initial : "dashboard";
    history.replaceState({ screen: start }, "", `#${start}`);
    render(start).catch(console.error);
  }

  window.addEventListener("popstate", (e) => {
    const key = e.state?.screen || (location.hash || "").replace("#", "") || "dashboard";
    render(SCREEN_FILES[key] ? key : "dashboard").catch(console.error);
  });

  // Row-based helper for the provided designs.
  function setRowValue(label, value) {
    const rows = $$(".row", root);
    for (const r of rows) {
      const l = $(".left", r);
      const v = $(".right", r);
      if (!l || !v) continue;
      if (l.textContent.trim() === label) {
        v.textContent = value;
        return true;
      }
    }
    return false;
  }

  function bind(screenKey) {
    switch (screenKey) {
      case "dashboard": return bindDashboard();
      case "guestRegistration": return bindGuestRegistration();
      case "returningGuest": return bindReturningGuest();
      case "newGuest": return bindNewGuest();
      case "stayDetails": return bindStayDetails();
      case "bookingSummary": return bindBookingSummary();
      case "cashPayment": return bindCashPayment();
      case "cashPaymentSuccessful": return bindCashSuccess();
      case "cardPayment": return bindCardPayment();
      case "tapToPay": return bindTapToPay();
      case "cardPaymentProcessing": return; // passive (dots script runs)
      case "cardPaymentDeclined": return bindCardDeclined();
      case "cardPaymentSuccessful": return bindCardSuccess();
      case "receiptPrinted": return bindReceiptPrinted();
      default: return bindDashboard();
    }
  }

  // =========================
  // Screen bindings
  // =========================
  function bindDashboard() {
    const checkinCard = $$(".card", root).find(c => c.textContent.trim() === "Check-In") || $(".card.primary", root);
    if (checkinCard) {
      checkinCard.style.cursor = "pointer";
      checkinCard.addEventListener("click", () => go("guestRegistration"));
      checkinCard.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go("guestRegistration"); }
      });
      checkinCard.setAttribute("tabindex", "0");
      checkinCard.setAttribute("role", "button");
      checkinCard.setAttribute("aria-label", "Open Check-In");
    }
  }

  function bindGuestRegistration() {
    // NOTE: Scanner behavior is intentionally NOT re-implemented here.
    // The original scanner script inside refinedGuestRegistration.html is executed unchanged.

    const form = $("#guestForm", root);
    const nextBtn = $(".primary-btn", root);
    const backBtn = $(".icon-btn[aria-label='Back']", root);

    const getVal = (id) => ($("#" + id, root)?.value ?? "").trim();
    const setVal = (id, val) => { const el = $("#" + id, root); if (el) el.value = val ?? ""; };

    // Restore state into fields (does not alter scanner logic)
    setVal("fullName", state.guest.fullName);
    setVal("streetAddress", state.guest.streetAddress);
    setVal("city", state.guest.city);
    setVal("state", state.guest.state);
    setVal("zip", state.guest.zip);
    setVal("gender", state.guest.gender);
    setVal("age", state.guest.age);
    setVal("idType", state.guest.idType);
    setVal("idNumber", state.guest.idNumber);

    backBtn?.addEventListener("click", () => go("dashboard"));

    nextBtn?.addEventListener("click", () => {
      if (form && typeof form.reportValidity === "function" && !form.reportValidity()) return;

      state.guest = {
        fullName: getVal("fullName"),
        streetAddress: getVal("streetAddress"),
        city: getVal("city"),
        state: getVal("state"),
        zip: getVal("zip"),
        gender: getVal("gender"),
        age: getVal("age"),
        idType: getVal("idType"),
        idNumber: getVal("idNumber")
      };

      // New check-in flow => new booking IDs.
      state.booking.bookingId = "";
      state.booking.transactionId = "";

      const returning = isReturningGuest(state.guest.idNumber);
      go(returning ? "returningGuest" : "newGuest");
    });
  }

  function bindReturningGuest() {
    setRowValue("Guest", state.guest.fullName || "Full Name");
    setRowValue("ID Number", state.guest.idNumber || "0000000000");
    setRowValue("ID Type", state.guest.idType || "ID/DL/Passport");
    setRowValue("Rating", "4.6");

    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    setRowValue("Active Since", d.toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric" }));
    setRowValue("Latest Activity", new Date().toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric" }));

    const btns = $$(".btn", root);
    btns.find(b => b.textContent.trim() === "Cancel")?.addEventListener("click", () => go("dashboard"));
    btns.find(b => b.textContent.trim() === "Proceed")?.addEventListener("click", () => go("stayDetails"));
  }

  function bindNewGuest() {
    setRowValue("Guest", state.guest.fullName || "Full Name");
    setRowValue("ID Number", state.guest.idNumber || "0000000000");
    setRowValue("ID Type", state.guest.idType || "ID/DL/Passport");

    const btns = $$(".btn", root);
    btns.find(b => b.textContent.trim() === "Skip")?.addEventListener("click", () => go("stayDetails"));

    btns.find(b => b.textContent.trim() === "Save")?.addEventListener("click", () => {
      if (state.guest.idNumber) upsertKnownGuest(state.guest.idNumber, state.guest.fullName);
      go("stayDetails");
    });
  }

  function bindStayDetails() {
    const backBtn = $(".icon-btn.back", root);
    const closeBtn = $(".icon-btn.close", root);
    const nextBtn = $(".primary-btn", root);

    const checkin = $("#checkin", root);
    const checkout = $("#checkout", root);
    const adults = $("#adults", root);
    const children = $("#children", root);
    const room = $("#room", root);
    const rate = $("#rate", root);
    const deposit = $("#deposit", root);
    const discount = $("#discount", root);

    // Restore state (default date script still runs unchanged too)
    if (checkin && state.stay.checkin) checkin.value = state.stay.checkin;
    if (checkout && state.stay.checkout) checkout.value = state.stay.checkout;
    if (adults && state.stay.adults) adults.value = state.stay.adults;
    if (children && state.stay.children) children.value = state.stay.children;
    if (room && state.stay.room) room.value = state.stay.room;
    if (rate && state.stay.rate) rate.value = state.stay.rate;
    if (deposit && state.stay.deposit) deposit.value = state.stay.deposit;
    if (discount && state.stay.discount) discount.value = state.stay.discount;

    backBtn?.addEventListener("click", () => history.back());
    closeBtn?.addEventListener("click", () => go("dashboard"));

    nextBtn?.addEventListener("click", () => {
      state.stay = {
        checkin: checkin?.value || "",
        checkout: checkout?.value || "",
        adults: adults?.value || "",
        children: children?.value || "",
        room: room?.value || "",
        rate: rate?.value || "",
        deposit: deposit?.value || "",
        discount: discount?.value || ""
      };

      if (!state.stay.checkin || !state.stay.checkout || !state.stay.room || !state.stay.rate) {
        alert("Please complete Check-in, Check-out, Room, and Daily Rate.");
        return;
      }

      recomputeBooking();
      go("bookingSummary");
    });
  }

  function bindBookingSummary() {
    const backBtn = $(".icon-btn.back", root);
    const closeBtn = $(".icon-btn.close", root);
    const cashBtn = $$(".btn", root).find(b => b.textContent.trim() === "Cash");
    const cardBtn = $$(".btn", root).find(b => b.textContent.trim() === "Card");

    recomputeBooking();

    setRowValue("Guest", state.guest.fullName || "Full Name");
    setRowValue("Check-in", formatDateTime(state.stay.checkin, "checkin"));
    setRowValue("Check-out", formatDateTime(state.stay.checkout, "checkout"));
    setRowValue("No. of Days", String(state.booking.days || 0));
    setRowValue("Room Number", state.stay.room || "000");

    const guestCount = (parseInt(state.stay.adults || "0", 10) || 0) + (parseInt(state.stay.children || "0", 10) || 0);
    setRowValue("Guests", String(guestCount));

    setRowValue("Daily Rate", money(state.booking.rateAmount));
    setRowValue("Deposit", money(parseMoneyLike(state.stay.deposit)));
    setRowValue("Discount", money(parseMoneyLike(state.stay.discount)));
    setRowValue("Total Amount", money(state.booking.total));

    backBtn?.addEventListener("click", () => history.back());
    closeBtn?.addEventListener("click", () => go("dashboard"));

    cashBtn?.addEventListener("click", () => {
      state.payment.method = "cash";
      state.payment.cardMode = "";
      go("cashPayment");
    });

    cardBtn?.addEventListener("click", () => {
      state.payment.method = "card";
      state.payment.cardMode = "";
      go("cardPayment");
    });
  }

  function bindCashPayment() {
    const backBtn = $(".icon-btn[aria-label='Back']", root);
    const closeBtn = $(".icon-btn[aria-label='Close']", root);
    const yesBtn = $(".primary-btn", root);

    recomputeBooking();
    setRowValue("Total Amount", money(state.booking.total));

    backBtn?.addEventListener("click", () => history.back());
    closeBtn?.addEventListener("click", () => go("dashboard"));

    yesBtn?.addEventListener("click", () => {
      state.payment.method = "cash";
      state.payment.cardMode = "";
      if (!state.booking.transactionId) state.booking.transactionId = randDigits(13);
      go("cashPaymentSuccessful");
    });
  }

  function bindCashSuccess() {
    recomputeBooking();

    setRowValue("Guest", state.guest.fullName || "Full Name");
    setRowValue("Check-in", formatDateTime(state.stay.checkin, "checkin"));
    setRowValue("Check-out", formatDateTime(state.stay.checkout, "checkout"));
    setRowValue("No. of Days", String(state.booking.days || 0));
    setRowValue("Room Number", state.stay.room || "000");

    const guestCount = (parseInt(state.stay.adults || "0", 10) || 0) + (parseInt(state.stay.children || "0", 10) || 0);
    setRowValue("Guests", String(guestCount));

    setRowValue("Booking ID", state.booking.bookingId || randDigits(10));
    setRowValue("Transaction Type", "Cash");
    setRowValue("Total Amount", money(state.booking.total));

    $(".primary-btn", root)?.addEventListener("click", () => go("receiptPrinted"));
  }

  function bindCardPayment() {
    const backBtn = $(".icon-btn[aria-label='Back']", root);
    const closeBtn = $(".icon-btn.close", root);
    const tapBtn = $(".tap-btn", root);
    const payBtn = $(".primary-btn", root);

    recomputeBooking();
    setRowValue("Total Amount", money(state.booking.total));

    backBtn?.addEventListener("click", () => history.back());
    closeBtn?.addEventListener("click", () => go("dashboard"));

    tapBtn?.addEventListener("click", () => {
      state.payment.method = "card";
      state.payment.cardMode = "tap";
      go("tapToPay");
    });

    payBtn?.addEventListener("click", () => {
      state.payment.method = "card";
      state.payment.cardMode = "manual";

      // Deterministic decline simulation:
      // If card number ends in an odd digit => declined, else approved.
      const cardNumber = ($("#cardNumber", root)?.value || "").replace(/\s+/g, "");
      const last = cardNumber.replace(/\D/g, "").slice(-1);
      const decline = last ? (Number(last) % 2 === 1) : false;

      go("cardPaymentProcessing");
      processingTimer = setTimeout(() => {
        go(decline ? "cardPaymentDeclined" : "cardPaymentSuccessful", { replace: true });
      }, 4000);
    });
  }

  function bindTapToPay() {
    recomputeBooking();

    setRowValue("Guest", state.guest.fullName || "Full Name");
    setRowValue("Room Number", state.stay.room || "000");
    setRowValue("Total Amount", money(state.booking.total));

    const closeBtn = $(".close-btn", root);
    closeBtn?.addEventListener("click", () => history.back());

    // Requirement: tap anywhere to simulate tap-to-pay.
    const canvas = $(".canvas", root);
    canvas?.addEventListener("click", (e) => {
      if (closeBtn && e.target && closeBtn.contains(e.target)) return;

      state.payment.method = "card";
      state.payment.cardMode = "tap";

      go("cardPaymentProcessing");
      processingTimer = setTimeout(() => {
        go("cardPaymentSuccessful", { replace: true });
      }, 4000);
    });
  }

  function bindCardDeclined() {
    recomputeBooking();

    setRowValue("Guest", state.guest.fullName || "Full Name");
    setRowValue("Room Number", state.stay.room || "000");
    setRowValue("Booking ID", state.booking.bookingId || randDigits(10));
    setRowValue("Transaction Type", "Debit/Credit/NFC");
    setRowValue("Transaction ID", state.booking.transactionId || randDigits(13));
    setRowValue("Total Amount", money(state.booking.total));

    const btns = $$(".btn", root);
    btns.find(b => b.textContent.trim() === "Retry Payment")?.addEventListener("click", () => go("cardPayment"));
    btns.find(b => b.textContent.trim() === "Change Method")?.addEventListener("click", () => go("bookingSummary"));
  }

  function bindCardSuccess() {
    recomputeBooking();

    setRowValue("Guest", state.guest.fullName || "Full Name");
    setRowValue("Room Number", state.stay.room || "000");
    setRowValue("Booking ID", state.booking.bookingId || randDigits(10));
    setRowValue("Transaction Type", state.payment.cardMode === "tap" ? "NFC" : "Debit/Credit");
    setRowValue("Transaction ID", state.booking.transactionId || randDigits(13));
    setRowValue("Total Amount", money(state.booking.total));

    $(".primary-btn", root)?.addEventListener("click", () => go("receiptPrinted"));
  }

  function bindReceiptPrinted() {
    const btns = $$(".btn", root);
    const share = btns.find(b => b.textContent.trim() === "Share");
    const done = btns.find(b => b.textContent.trim() === "Done");

    share?.addEventListener("click", async () => {
      const text = `Receipt for ${state.guest.fullName || "Guest"} — Total ${money(state.booking.total)}`;
      try {
        if (navigator.share) await navigator.share({ title: "Receipt", text });
        else alert(text);
      } catch {}
    });

    done?.addEventListener("click", () => {
      // Reset flow state (keep known guests).
      state.guest = { fullName: "", streetAddress: "", city: "", state: "", zip: "", gender: "", age: "", idType: "", idNumber: "" };
      state.stay = { checkin: "", checkout: "", adults: "", children: "", room: "", rate: "", deposit: "", discount: "" };
      state.booking = { days: 0, rateAmount: 0, total: 0, bookingId: "", transactionId: "" };
      state.payment = { method: "", cardMode: "" };
      go("dashboard");
    });
  }

  boot();
})();