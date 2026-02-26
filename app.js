// app.js (vanilla, module)

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* -------------------- Router -------------------- */
const routes = {
  "dashboard": "#screen-dashboard",
  "guest-registration": "#screen-guest-registration",
  "scanner": "#screen-scanner",
  "returning": "#screen-returning",
  "new-guest": "#screen-new-guest",
  "stay-details": "#screen-stay-details",
  "booking-summary": "#screen-booking-summary",
  "card-payment": "#screen-card-payment",
  "cash-payment": "#screen-cash-payment",
  "tap-to-pay": "#screen-tap-to-pay",
  "processing": "#screen-processing",
  "card-success": "#screen-card-success",
  "cash-success": "#screen-cash-success",
  "declined": "#screen-declined",
  "receipt-printed": "#screen-receipt-printed",
};

let currentRoute = "dashboard";

/* -------------------- Snackbar -------------------- */
const snackbar = $("#snackbar");
const snackbarText = $("#snackbarText");
const snackbarClose = $("#snackbarClose");
let snackbarTimer = null;

function showSnackbar(message) {
  snackbarText.textContent = message;
  snackbar.classList.add("is-on");
  clearTimeout(snackbarTimer);
  snackbarTimer = setTimeout(() => snackbar.classList.remove("is-on"), 3200);
}
snackbarClose.addEventListener("click", () => snackbar.classList.remove("is-on"));

/* -------------------- Navigation -------------------- */
function setActive(routeName) {
  const target = routes[routeName];
  if (!target) return;

  // stop scanner when leaving scanner screen
  if (currentRoute === "scanner" && routeName !== "scanner") {
    Scanner.stopCamera();
  }

  $$(".screen").forEach(s => s.classList.remove("is-active"));
  $(target).classList.add("is-active");
  currentRoute = routeName;

  // optional: auto start cam on scanner route
  if (routeName === "scanner") {
    // don’t auto-start without user action on iOS sometimes; but we can try:
    // Scanner.initEngine().then(()=>Scanner.startCamera()).catch(()=>{});
  }
}

document.addEventListener("click", (e) => {
  const nav = e.target?.closest("[data-nav]")?.getAttribute("data-nav");
  if (nav) setActive(nav);

  const action = e.target?.closest("[data-action]")?.getAttribute("data-action");
  if (!action) return;

  if (action === "cancel-flow") {
    setActive("dashboard");
  }
  if (action === "skip-save") {
    setActive("stay-details");
  }
  if (action === "save-guest") {
    saveGuestFromForm();
    setActive("stay-details");
  }
});

/* -------------------- Form helpers -------------------- */
const form = {
  fullName: $("#fullName"),
  street: $("#street"),
  city: $("#city"),
  state: $("#state"),
  zip: $("#zip"),
  gender: $("#gender"),
  age: $("#age"),
  idType: $("#idType"),
  idNumber: $("#idNumber"),
  dobRaw: $("#dobRaw"),
  scanRaw: $("#scanRaw"),
};

const errors = {
  fullName: $("#err_fullName"),
  street: $("#err_street"),
  city: $("#err_city"),
  state: $("#err_state"),
  zip: $("#err_zip"),
  gender: $("#err_gender"),
  age: $("#err_age"),
  idNumber: $("#err_idNumber"),
};

function clearErrors() {
  Object.values(errors).forEach(el => (el.textContent = ""));
}

function setError(key, msg) {
  if (errors[key]) errors[key].textContent = msg;
}

function validateGuestForm() {
  clearErrors();
  let ok = true;

  const required = [
    ["fullName", "Full name is required"],
    ["street", "Street address is required"],
    ["city", "City is required"],
    ["state", "State is required"],
    ["zip", "ZIP is required"],
    ["gender", "Gender is required"],
    ["age", "Age is required"],
    ["idNumber", "Identification number is required"],
  ];

  for (const [key, msg] of required) {
    const el = form[key];
    if (!el || !String(el.value || "").trim()) {
      setError(key, msg);
      ok = false;
    }
  }

  // zip validation
  if (form.zip.value && !/^\d{5}$/.test(form.zip.value.trim())) {
    setError("zip", "Enter a valid 5-digit ZIP");
    ok = false;
  }

  // age validation
  if (form.age.value && Number(form.age.value) < 0) {
    setError("age", "Age must be >= 0");
    ok = false;
  }

  return ok;
}

$("#btnGuestNext").addEventListener("click", () => {
  if (!validateGuestForm()) {
    showSnackbar("Please Complete All the Required Fields.");
    return;
  }
  setActive("stay-details");
});

/* -------------------- Stay -> Summary -> Payments -------------------- */
function nightsBetween(a, b) {
  const start = new Date(a);
  const end = new Date(b);
  const ms = end - start;
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

const stay = {
  checkIn: $("#checkIn"),
  checkOut: $("#checkOut"),
  adults: $("#adults"),
  children: $("#children"),
  room: $("#room"),
  rate: $("#rate"),
  deposit: $("#deposit"),
  discount: $("#discount"),
};

function validateStay() {
  $("#err_checkIn").textContent = "";
  $("#err_checkOut").textContent = "";

  let ok = true;
  if (!stay.checkIn.value) { $("#err_checkIn").textContent = "Required"; ok = false; }
  if (!stay.checkOut.value) { $("#err_checkOut").textContent = "Required"; ok = false; }

  if (stay.checkIn.value && stay.checkOut.value) {
    const n = nightsBetween(stay.checkIn.value, stay.checkOut.value);
    if (n <= 0) {
      $("#err_checkOut").textContent = "Must be after check-in";
      ok = false;
    }
  }
  return ok;
}

function computeTotals() {
  const nights = nightsBetween(stay.checkIn.value, stay.checkOut.value);
  const rate = Number(stay.rate.value || 0);
  const deposit = Number(stay.deposit.value || 0);
  const discount = Number(stay.discount.value || 0);
  const subtotal = nights * rate;
  const total = Math.max(0, subtotal - discount + deposit);
  return { nights, rate, deposit, discount, subtotal, total };
}

$("#btnStayNext").addEventListener("click", () => {
  if (!validateStay()) {
    showSnackbar("Please Complete All the Required Fields.");
    return;
  }
  const t = computeTotals();
  renderSummary(t);
  setActive("booking-summary");
});

function renderSummary(totals) {
  const guestLine = `${form.fullName.value} • ${form.idType.value || "—"} ${form.idNumber.value}`;
  const datesLine = `${stay.checkIn.value} → ${stay.checkOut.value} • ${totals.nights} night(s)`;
  const roomLine = `${stay.room.value} • Adults ${stay.adults.value}, Children ${stay.children.value}`;

  $("#summaryCard").innerHTML = `
    <div class="card__title">Summary</div>
    <div class="card__row"><span>Guest</span><span>${escapeHtml(guestLine)}</span></div>
    <div class="card__row"><span>Dates</span><span>${escapeHtml(datesLine)}</span></div>
    <div class="card__row"><span>Room</span><span>${escapeHtml(roomLine)}</span></div>
    <div class="card__row"><span>Daily rate</span><span>$${totals.rate.toFixed(2)}</span></div>
    <div class="card__row"><span>Deposit</span><span>$${totals.deposit.toFixed(2)}</span></div>
    <div class="card__row"><span>Discount</span><span>-$${totals.discount.toFixed(2)}</span></div>
  `;
  $("#totalCard").innerHTML = `<div class="card__title">Total Amount</div>$${totals.total.toFixed(2)}`;
  $("#cardTotal").textContent = `Total Amount: $${totals.total.toFixed(2)}`;
  $("#cashTotal").textContent = `Total Amount: $${totals.total.toFixed(2)}`;

  $("#tapSummary").innerHTML = `
    <div class="card__title">Guest</div>
    <div>${escapeHtml(form.fullName.value)}</div>
    <div style="margin-top:6px;color:#555;">Room: ${escapeHtml(stay.room.value)}</div>
  `;
  $("#tapTotal").textContent = `Total Amount: $${totals.total.toFixed(2)}`;

  // details for success screens
  const bookingId = "BK" + Math.floor(Math.random() * 900000 + 100000);
  window.__bookingId = bookingId;
  window.__lastTotal = totals.total;
}

$("#btnProceedCard").addEventListener("click", () => {
  // Manual card validation is optional in your spec; keeping it light:
  const anyFilled = [$("#cc_number"), $("#cc_exp"), $("#cc_cvv"), $("#cc_name"), $("#cc_zip")].some(i => i.value.trim());
  if (anyFilled) {
    // basic required if paying manually
    const allFilled = [$("#cc_number"), $("#cc_exp"), $("#cc_cvv"), $("#cc_name"), $("#cc_zip")].every(i => i.value.trim());
    if (!allFilled) {
      showSnackbar("Please Complete All the Required Fields.");
      return;
    }
  }
  startProcessing("card");
});

$("#btnCashYes").addEventListener("click", () => {
  // record cash transaction
  $("#cashSuccessDetails").innerHTML = `
    <div class="card__title">Transaction</div>
    <div class="card__row"><span>Booking ID</span><span>${escapeHtml(window.__bookingId || "—")}</span></div>
    <div class="card__row"><span>Type</span><span>Cash</span></div>
    <div class="card__row"><span>Total</span><span>$${Number(window.__lastTotal || 0).toFixed(2)}</span></div>
  `;
  setActive("cash-success");
});

$("#btnSimulateTap").addEventListener("click", () => startProcessing("nfc"));

function startProcessing(method) {
  setActive("processing");

  // simulate gateway: success 70%, decline 30%
  setTimeout(() => {
    const ok = Math.random() > 0.3;

    if (ok) {
      $("#cardSuccessDetails").innerHTML = `
        <div class="card__title">Transaction</div>
        <div class="card__row"><span>Booking ID</span><span>${escapeHtml(window.__bookingId || "—")}</span></div>
        <div class="card__row"><span>Type</span><span>${method === "nfc" ? "NFC" : "Card"}</span></div>
        <div class="card__row"><span>Txn ID</span><span>TX${Math.floor(Math.random()*9000000+1000000)}</span></div>
        <div class="card__row"><span>Total</span><span>$${Number(window.__lastTotal || 0).toFixed(2)}</span></div>
      `;
      setActive("card-success");
    } else {
      $("#declineDetails").innerHTML = `
        <div class="card__title">Transaction</div>
        <div class="card__row"><span>Booking ID</span><span>${escapeHtml(window.__bookingId || "—")}</span></div>
        <div class="card__row"><span>Reason</span><span>Declined</span></div>
        <div class="card__row"><span>Total</span><span>$${Number(window.__lastTotal || 0).toFixed(2)}</span></div>
      `;
      setActive("declined");
    }
  }, 1800);
}

/* -------------------- US States dropdown -------------------- */
const US_STATES = [
  ["", "Select"],
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],
  ["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["FL","Florida"],["GA","Georgia"],
  ["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],
  ["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],
  ["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],
  ["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],
  ["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],
  ["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],
  ["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],
  ["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"],
  ["DC","District of Columbia"]
];

function populateStates() {
  form.state.innerHTML = US_STATES.map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
}
populateStates();

/* -------------------- AAMVA parsing + Autofill -------------------- */
// Robust-ish: supports lines "DAQ..." etc; also handles when the payload has \r\n or extra header text.
function parseAAMVA(raw) {
  const out = {};
  if (!raw) return out;

  const normalized = raw.replace(/\r/g, "\n");
  // Many scans have header text; extracting known 3-char field codes.
  const lines = normalized.split("\n").map(s => s.trim()).filter(Boolean);

  for (const line of lines) {
    if (line.length >= 3) {
      const key = line.slice(0, 3);
      const val = line.slice(3).trim();
      if (/^[A-Z0-9]{3}$/.test(key) && val) out[key] = val;
    }
  }

  // fallback regex sweep if the barcode text is not line-delimited cleanly
  if (Object.keys(out).length < 4) {
    const re = /([A-Z0-9]{3})([^\n\r]*)/g;
    let m;
    while ((m = re.exec(normalized)) !== null) {
      const key = m[1];
      const val = (m[2] || "").trim();
      if (val && !out[key]) out[key] = val;
    }
  }

  return out;
}

function normalizeGender(dbc) {
  const v = String(dbc || "").trim().toUpperCase();
  if (v === "1" || v === "M" || v === "MALE") return "Male";
  if (v === "2" || v === "F" || v === "FEMALE") return "Female";
  if (!v) return "";
  return "Other";
}

function parseDOB(dbb) {
  // DBB can be YYYYMMDD or MMDDYYYY depending on issuer
  const s = String(dbb || "").replace(/\D/g, "");
  if (s.length !== 8) return null;

  // Try YYYYMMDD first if year looks plausible
  const y1 = Number(s.slice(0,4));
  const m1 = Number(s.slice(4,6));
  const d1 = Number(s.slice(6,8));
  if (y1 >= 1900 && y1 <= 2100 && m1 >= 1 && m1 <= 12 && d1 >= 1 && d1 <= 31) {
    return new Date(y1, m1 - 1, d1);
  }

  // fallback MMDDYYYY
  const m2 = Number(s.slice(0,2));
  const d2 = Number(s.slice(2,4));
  const y2 = Number(s.slice(4,8));
  if (y2 >= 1900 && y2 <= 2100 && m2 >= 1 && m2 <= 12 && d2 >= 1 && d2 <= 31) {
    return new Date(y2, m2 - 1, d2);
  }

  return null;
}

function calcAge(dobDate) {
  const today = new Date();
  let age = today.getFullYear() - dobDate.getFullYear();
  const m = today.getMonth() - dobDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) age--;
  return Math.max(0, age);
}

function setFieldValue(el, value) {
  if (typeof value !== "string") value = value == null ? "" : String(value);
  el.value = value;
}

function applyAutofill(fields, rawPayload) {
  // Full Name: DAC first, DAD middle, DCS last
  const first = fields.DAC || "";
  const middle = fields.DAD || "";
  const last = fields.DCS || "";
  const full = [first, middle, last].filter(Boolean).join(" ").trim();

  setFieldValue(form.fullName, full);
  setFieldValue(form.street, fields.DAG || "");
  setFieldValue(form.city, fields.DAI || "");

  // State: auto-populate if matches dropdown; else leave blank and inline error
  const st = (fields.DAJ || "").trim().toUpperCase();
  if (st && US_STATES.some(([abbr]) => abbr === st)) {
    setFieldValue(form.state, st);
    setError("state", "");
  } else if (st) {
    setFieldValue(form.state, "");
    setError("state", "Scanned state not recognized. Please select manually.");
  }

  // ZIP: normalize to 5 digits
  const zip = (fields.DAK || "").trim();
  const zip5 = zip.replace(/\D/g, "").slice(0, 5);
  setFieldValue(form.zip, zip5);

  // Gender
  setFieldValue(form.gender, normalizeGender(fields.DBC));

  // DOB -> Age
  const dob = parseDOB(fields.DBB);
  if (dob) {
    form.dobRaw.value = dob.toISOString().slice(0,10);
    setFieldValue(form.age, String(calcAge(dob)));
  }

  // ID number
  setFieldValue(form.idNumber, fields.DAQ || "");

  // ID type: if you have a reliable subfile designator mapping, wire it here.
  // For now, keep whatever user chooses unless empty:
  if (!form.idType.value) {
    // weak heuristic: many DL scans are DL; keep empty if unknown
    // setFieldValue(form.idType, "DL");
  }

  // keep raw
  form.scanRaw.value = rawPayload || "";

  showSnackbar("Details auto-filled.");
}

/* -------------------- Returning/New guest decision -------------------- */
function guestKey(idType, idNumber) {
  return `${String(idType || "").trim()}|${String(idNumber || "").trim()}`.trim();
}

function isReturningGuest(idType, idNumber) {
  const key = guestKey(idType, idNumber);
  if (!key || key === "|") return false;
  return localStorage.getItem("guest:" + key) === "1";
}

function saveGuestFromForm() {
  const key = guestKey(form.idType.value, form.idNumber.value);
  if (!key || key === "|") return;
  localStorage.setItem("guest:" + key, "1");
}

/* -------------------- Scanner (REAL, your working engine) -------------------- */
const Scanner = (() => {
  const video = $("#scannerVideo");
  const canvas = $("#scannerCanvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const btnStartCam = $("#btnStartCam");
  const btnStopCam = $("#btnStopCam");
  const btnTorch = $("#btnTorch");
  const pillEngine = $("#pillEngine");
  const pillCamera = $("#pillCamera");
  const fileInput = $("#scannerFile");

  let stream = null;
  let stopLoop = false;

  let detector = null;
  let zxing = null;
  let zxingReader = null;

  let lastText = "";
  let lastAt = 0;

  function setEngine(name, kind = "") {
    pillEngine.textContent = `Engine: ${name}`;
    pillEngine.className = `pill ${kind}`.trim();
  }
  function setCameraState(msg, kind = "") {
    pillCamera.textContent = `Camera: ${msg}`;
    pillCamera.className = `pill ${kind}`.trim();
  }

  function publish(text) {
    const now = Date.now();
    if (!text) return;
    if (text === lastText && (now - lastAt) < 1500) return;
    lastText = text; lastAt = now;

    navigator.vibrate?.(30);

    // parse + autofill
    const fields = parseAAMVA(text);
    if (!fields || Object.keys(fields).length < 4) {
      showSnackbar("Auto-fill failed. Please enter details manually.");
      // return to guest form but don’t wipe
      setActive("guest-registration");
      return;
    }

    applyAutofill(fields, text);

    // decide 3A / 3B
    const idNumber = fields.DAQ || form.idNumber.value;
    const idType = form.idType.value || "DL"; // your spec says derive; if you implement, replace this
    // update UI preview cards
    $("#rg_name").textContent = form.fullName.value || "—";
    $("#rg_type").textContent = idType || "—";
    $("#rg_id").textContent = idNumber || "—";

    $("#ng_name").textContent = form.fullName.value || "—";
    $("#ng_type").textContent = idType || "—";
    $("#ng_id").textContent = idNumber || "—";

    // route
    setActive(isReturningGuest(idType, idNumber) ? "returning" : "new-guest");
  }

  async function initEngine() {
    if ("BarcodeDetector" in window) {
      try {
        const formats = await window.BarcodeDetector.getSupportedFormats?.();
        const supportsPdf417 = Array.isArray(formats) && formats.includes("pdf417");

        if (supportsPdf417) {
          detector = new BarcodeDetector({ formats: ["pdf417"] });
          setEngine("BarcodeDetector (native)", "ok");
          return;
        }
        setEngine("BarcodeDetector (no pdf417) → ZXing", "warn");
      } catch {
        setEngine("BarcodeDetector error → ZXing", "warn");
      }
    } else {
      setEngine("ZXing (fallback)", "warn");
    }

    if (!zxing) {
      zxing = await import("https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/+esm");
      zxingReader = new zxing.BrowserMultiFormatReader();

      const hints = new Map();
      hints.set(zxing.DecodeHintType.POSSIBLE_FORMATS, [zxing.BarcodeFormat.PDF_417]);
      zxingReader.hints = hints;

      setEngine("ZXing (@zxing/library)", "ok");
    }
  }

  async function startCamera() {
    stopLoop = false;

    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      }
    };

    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await video.play();

    setCameraState("running", "ok");
    btnStopCam.disabled = false;
    btnStartCam.disabled = true;

    await updateTorchAvailability();
    scanLoop();
  }

  function stopCamera() {
    stopLoop = true;
    btnTorch.disabled = true;

    try {
      video.pause();
      video.srcObject = null;
    } catch {}

    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }

    setCameraState("idle");
    btnStopCam.disabled = true;
    btnStartCam.disabled = false;
  }

  async function updateTorchAvailability() {
    try {
      const track = stream?.getVideoTracks?.()?.[0];
      const caps = track?.getCapabilities?.();
      btnTorch.disabled = !caps?.torch;
    } catch {
      btnTorch.disabled = true;
    }
  }

  async function toggleTorch() {
    try {
      const track = stream?.getVideoTracks?.()?.[0];
      if (!track) return;

      const settings = track.getSettings?.();
      const isOn = !!settings?.torch;

      await track.applyConstraints({ advanced: [{ torch: !isOn }] });
    } catch {
      showSnackbar("Torch not available on this device/browser.");
    }
  }

  async function scanLoop() {
    if (stopLoop) return;

    try {
      if (!detector && !zxingReader) await initEngine();

      if (detector) {
        const barcodes = await detector.detect(video);
        if (barcodes?.length) {
          publish(barcodes[0].rawValue || "");
        }
      } else if (zxingReader && zxing) {
        if (video.readyState >= 2) {
          const w = video.videoWidth;
          const h = video.videoHeight;

          // Crop center region (matches your working example; helps PDF417)
          const cropW = Math.floor(w * 0.90);
          const cropH = Math.floor(h * 0.55);
          const sx = Math.floor((w - cropW) / 2);
          const sy = Math.floor((h - cropH) / 2);

          canvas.width = cropW;
          canvas.height = cropH;
          ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, cropW, cropH);

          const imageData = ctx.getImageData(0, 0, cropW, cropH);

          const luminance = new zxing.RGBLuminanceSource(imageData.data, cropW, cropH);
          const binarizer = new zxing.HybridBinarizer(luminance);
          const bitmap = new zxing.BinaryBitmap(binarizer);

          try {
            const res = zxingReader.decodeBitmap(bitmap);
            publish(res?.getText?.() || "");
          } catch {
            // expected when no barcode is found
          }
        }
      }
    } catch {
      // keep scanning, but don’t spam
    }

    setTimeout(scanLoop, 110);
  }

  async function scanImageFile(file) {
    if (!file) return;
    await initEngine();

    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

    if (detector) {
      const barcodes = await detector.detect(canvas);
      if (barcodes?.length) {
        publish(barcodes[0].rawValue || "");
        return;
      }
      showSnackbar("Auto-fill failed. Please enter details manually.");
      setActive("guest-registration");
    } else if (zxingReader && zxing) {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const luminance = new zxing.RGBLuminanceSource(imageData.data, canvas.width, canvas.height);
      const binarizer = new zxing.HybridBinarizer(luminance);
      const bitmap = new zxing.BinaryBitmap(binarizer);

      try {
        const res = zxingReader.decodeBitmap(bitmap);
        publish(res?.getText?.() || "");
      } catch {
        showSnackbar("Auto-fill failed. Please enter details manually.");
        setActive("guest-registration");
      }
    }
  }

  // UI events
  btnStartCam.addEventListener("click", async () => {
    try {
      await initEngine();
      await startCamera();
    } catch (e) {
      console.error(e);
      showSnackbar("Auto-fill failed. Please enter details manually.");
      setActive("guest-registration");
    }
  });

  btnStopCam.addEventListener("click", stopCamera);
  btnTorch.addEventListener("click", toggleTorch);

  fileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    try {
      await scanImageFile(file);
    } finally {
      fileInput.value = "";
    }
  });

  // initial capability note
  (async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setEngine("No camera API", "warn");
      setCameraState("unsupported", "warn");
    } else {
      await initEngine();
    }
  })();

  return { initEngine, startCamera, stopCamera };
})();

/* -------------------- New Guest Save/Skip behavior -------------------- */
function syncIdTypeForStorage() {
  // if idType is still empty, keep it empty; but localStorage key needs something stable.
  // You can enforce requiring Type of ID if you want.
  if (!form.idType.value) form.idType.value = "DL";
}

document.addEventListener("click", (e) => {
  if (e.target?.closest('[data-action="save-guest"]')) {
    syncIdTypeForStorage();
    saveGuestFromForm();
  }
});

/* -------------------- Account/Logout placeholders -------------------- */
$("#btnAccount").addEventListener("click", () => showSnackbar("Account (not implemented)"));
$("#btnLogout").addEventListener("click", () => showSnackbar("Logout (not implemented)"));

/* -------------------- Utilities -------------------- */
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
