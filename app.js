/* Hotel Check-In Kiosk SPA (vanilla) */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ----------------------- Assets (simple inline SVG) ----------------------- */
const ICONS = {
  account: svgIcon(`<circle cx="12" cy="8" r="4"></circle><path d="M4 22c1.8-4 5-6 8-6s6.2 2 8 6"></path>`),
  logout: svgIcon(`<path d="M10 17l5-5-5-5"></path><path d="M15 12H3"></path><path d="M21 3v18"></path>`),
  back: svgIcon(`<path d="M15 18l-6-6 6-6"></path>`),
  close: svgIcon(`<path d="M18 6L6 18"></path><path d="M6 6l12 12"></path>`),
  scan: svgIcon(`<path d="M7 7h3V4H6a2 2 0 0 0-2 2v4h3V7Zm10 0v3h3V6a2 2 0 0 0-2-2h-4v3h3Zm0 10h3v3h-3v3h4a2 2 0 0 0 2-2v-4h-3v3Zm-10 3v-3H4v4a2 2 0 0 0 2 2h4v-3H7Z"></path><path d="M7 12h10"></path>`),
  chevronDown: svgIcon(`<path d="M6 9l6 6 6-6"></path>`)
};

function svgIcon(paths) {
  return `
  <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    ${paths}
  </svg>`;
}

/* ----------------------- Snackbars & Modal ----------------------- */
const snackbarHost = $("#snackbarHost");
function showSnackbar(message, kind = "info", timeoutMs = 3500) {
  const el = document.createElement("div");
  el.className = "snackbar";
  el.innerHTML = `
    <div class="msg">${escapeHtml(message)}</div>
    <button class="x" aria-label="Dismiss">×</button>
  `;
  const x = $(".x", el);
  x.addEventListener("click", () => el.remove());
  snackbarHost.appendChild(el);

  const t = setTimeout(() => el.remove(), timeoutMs);
  el.addEventListener("remove", () => clearTimeout(t));
}

const modalHost = $("#modalHost");
const modalTitle = $("#modalTitle");
const modalBody = $("#modalBody");
const modalOk = $("#modalOk");
function confirmModal({ title = "Confirm", body = "Are you sure?", okText = "OK" } = {}) {
  return new Promise((resolve) => {
    modalTitle.textContent = title;
    modalBody.textContent = body;
    modalOk.textContent = okText;

    modalHost.classList.remove("hidden");
    modalHost.setAttribute("aria-hidden", "false");

    const close = (val) => {
      modalHost.classList.add("hidden");
      modalHost.setAttribute("aria-hidden", "true");
      cleanup();
      resolve(val);
    };

    const onBackdrop = (e) => {
      const act = e.target?.dataset?.action;
      if (act === "closeModal") close(false);
    };
    const onCancel = () => close(false);
    const onOk = () => close(true);

    const cleanup = () => {
      modalHost.removeEventListener("click", onBackdrop);
      $("#modalCancel").removeEventListener("click", onCancel);
      modalOk.removeEventListener("click", onOk);
      document.removeEventListener("keydown", onEsc);
    };

    const onEsc = (e) => { if (e.key === "Escape") close(false); };

    modalHost.addEventListener("click", onBackdrop);
    $("#modalCancel").addEventListener("click", onCancel);
    modalOk.addEventListener("click", onOk);
    document.addEventListener("keydown", onEsc);
  });
}

/* ----------------------- Data / State ----------------------- */
const SCREENS = {
  DASHBOARD: "dashboard",
  GUEST_REG: "guestReg",
  SCANNER: "scanner",
  RETURNING: "returningGuest",
  NEW_GUEST: "newGuest",
  STAY_DETAILS: "stayDetails",
  BOOKING_SUMMARY: "bookingSummary",
  CARD_DETAILS: "cardDetails",
  CASH_CONFIRM: "cashConfirm",
  TAP_TO_PAY: "tapToPay",
  PROCESSING: "processing",
  CARD_SUCCESS: "cardSuccess",
  CASH_SUCCESS: "cashSuccess",
  CARD_DECLINED: "cardDeclined",
  RECEIPT: "receiptPrinted",
};

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN",
  "MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA",
  "WA","WV","WI","WY","DC"
];

const ROOMS = [
  { id: "101", name: "Room 101 (King)", maxAdults: 2, maxChildren: 1, rates: [119, 129, 139] },
  { id: "204", name: "Room 204 (Double Queen)", maxAdults: 4, maxChildren: 3, rates: [149, 159, 169] },
  { id: "310", name: "Room 310 (Suite)", maxAdults: 4, maxChildren: 2, rates: [219, 239, 259] },
];

const RATE_PLANS = [
  { id: "standard", label: "Standard" },
  { id: "flex", label: "Flexible" },
  { id: "member", label: "Member" },
];

const appState = {
  screen: SCREENS.DASHBOARD,
  user: { name: "John Doe", hotel: "Example XYZ Hotels", version: "Version 1.0" },

  // guest form / results
  guestForm: {
    fullName: "",
    streetAddress: "",
    city: "",
    state: "",
    zip: "",
    gender: "",
    age: "",
    dob: "", // internal store (recommended)
    idType: "", // DL/ID
    idNumber: "",
    rawAamva: "",
  },

  guestLookup: {
    found: false,
    guestId: null,
    profile: null, // {guestId, fullName, idType, idNumber, rating, activeSince, latestActivity}
    pendingFromScan: null, // info from scan to display on new/returning screens
  },

  stay: {
    checkIn: todayISO(),
    checkOut: addDaysISO(todayISO(), 1),
    adults: "1",
    children: "0",
    roomId: "101",
    ratePlanId: "standard",
    dailyRate: "119",
    deposit: "0",
    discount: "0",
  },

  booking: {
    nights: 1,
    total: 0,
    bookingId: null,
  },

  payment: {
    method: null, // "cash" | "card"
    card: { number: "", expiry: "", cvv: "", name: "", zip: "" },
    txn: { type: "", id: "" },
    lastOutcome: null, // "success" | "declined"
  },

  // scanner
  scanner: {
    stream: null,
    stopLoop: false,
    detector: null,
    zxing: null,
    zxingReader: null,
    lastText: "",
    lastAt: 0,
    engineName: "…",
    cameraState: "idle",
    torchAvailable: false,
  }
};

// simple local “DB”
const DB_KEY = "kiosk_guests_v1";
function loadGuests() {
  try { return JSON.parse(localStorage.getItem(DB_KEY) || "[]"); }
  catch { return []; }
}
function saveGuests(list) { localStorage.setItem(DB_KEY, JSON.stringify(list)); }
function seedGuestsIfEmpty() {
  const list = loadGuests();
  if (list.length) return;
  saveGuests([
    {
      guestId: "G-10001",
      fullName: "Jane Sample",
      idType: "DL",
      idNumber: "S1234567",
      rating: "A",
      activeSince: "2022-04-18",
      latestActivity: "2025-11-02",
    }
  ]);
}
seedGuestsIfEmpty();

/* ----------------------- Rendering ----------------------- */
const appRoot = $("#app");

function navigate(screen) {
  appState.screen = screen;
  render();
}

function render() {
  appRoot.innerHTML = "";
  const phone = document.createElement("div");
  phone.className = "phone";
  phone.appendChild(renderScreen());
  appRoot.appendChild(phone);
}

function renderScreen() {
  switch (appState.screen) {
    case SCREENS.DASHBOARD: return Dashboard();
    case SCREENS.GUEST_REG: return GuestRegistration();
    case SCREENS.SCANNER: return ScannerScreen();
    case SCREENS.RETURNING: return ReturningGuest();
    case SCREENS.NEW_GUEST: return NewGuest();
    case SCREENS.STAY_DETAILS: return StayDetails();
    case SCREENS.BOOKING_SUMMARY: return BookingSummary();
    case SCREENS.CARD_DETAILS: return CardPaymentDetails();
    case SCREENS.CASH_CONFIRM: return CashConfirm();
    case SCREENS.TAP_TO_PAY: return TapToPay();
    case SCREENS.PROCESSING: return PaymentProcessing();
    case SCREENS.CARD_SUCCESS: return CardSuccess();
    case SCREENS.CASH_SUCCESS: return CashSuccess();
    case SCREENS.CARD_DECLINED: return CardDeclined();
    case SCREENS.RECEIPT: return ReceiptPrinted();
    default: return Dashboard();
  }
}

/* ----------------------- Screen components ----------------------- */
function TopBar({ left = null, title = "", right = null }) {
  const el = div("topbar");
  const l = div("topbar-left");
  const t = div("topbar-title");
  const r = div("topbar-right");
  t.textContent = title;

  if (left) l.append(...[].concat(left));
  if (right) r.append(...[].concat(right));

  el.append(l, t, r);
  return el;
}

function BottomBar(children) {
  const el = div("bottombar");
  el.append(...[].concat(children));
  return el;
}

function ProgressBar(stepIndex /* 0..3 */) {
  const p = div("progress");
  for (let i = 0; i < 4; i++) {
    const seg = document.createElement("div");
    seg.className = i === stepIndex ? "on" : "";
    p.appendChild(seg);
  }
  return p;
}

/* 0) Dashboard */
function Dashboard() {
  const wrap = document.createElement("div");

  const accountBtn = iconButton(ICONS.account, "Profile (not implemented)", () => {
    showSnackbar("Profile module not included in this flow.");
  });
  const logoutBtn = iconButton(ICONS.logout, "Logout", async () => {
    const ok = await confirmModal({
      title: "Logout",
      body: "Log out and exit to login?",
      okText: "Logout"
    });
    if (ok) showSnackbar("Logged out (demo).");
  });

  wrap.appendChild(
    TopBar({
      title: appState.user.hotel,
      right: [accountBtn, logoutBtn],
    })
  );

  const content = div("content");

  content.appendChild(elP("greeting", `Good Afternoon, ${appState.user.name}.`));

  const checkIn = tile("Check-In", "primary", () => {
    // reset form for new flow but keep any stored values minimal
    resetFlow();
    navigate(SCREENS.GUEST_REG);
  });

  const checkOut = tile("Check-Out", "disabled", () => showSnackbar("Check-Out is disabled in this demo."));
  const stayOver = tile("Stay-Over", "disabled", () => showSnackbar("Stay-Over is disabled in this demo."));

  content.append(checkIn, checkOut, stayOver);

  content.appendChild(hrOther());

  const row1 = div("grid2");
  row1.append(
    tile("Dashboard", "disabled", () => {}),
    tile("Bookings", "disabled", () => showSnackbar("Bookings module not part of this flow."))
  );
  const row2 = div("grid2");
  row2.append(
    tile("Reports", "disabled", () => showSnackbar("Reports module not part of this flow.")),
    tile("Payments", "disabled", () => showSnackbar("Payments module not part of this flow."))
  );

  content.append(row1, row2);

  wrap.appendChild(content);
  wrap.appendChild(divText("footer", appState.user.version));
  return wrap;
}

/* 1) Guest Registration */
function GuestRegistration() {
  const wrap = document.createElement("div");

  const backBtn = iconButton(ICONS.back, "Back", () => navigate(SCREENS.DASHBOARD));
  const scanBtn = iconButton(ICONS.scan, "Scan ID", () => navigate(SCREENS.SCANNER));

  wrap.appendChild(TopBar({ left: backBtn, title: "Guest Registration", right: scanBtn }));
  wrap.appendChild(ProgressBar(0));

  const content = div("content");
  content.appendChild(GuestForm());
  wrap.appendChild(content);

  const nextBtn = button("Next", "btn btn-primary", onGuestNext);
  wrap.appendChild(BottomBar(nextBtn));

  return wrap;
}

function GuestForm() {
  const form = div("form");

  form.append(
    inputField("Full Name*", "fullName", "Enter Full Name"),
    inputField("Street Address*", "streetAddress", "Enter Street Address"),
    inputField("City*", "city", "Enter City"),
    row(
      selectField("State*", "state", ["", ...US_STATES], "Select"),
      inputField("Zip Code*", "zip", "5-digit ZIP code", { inputmode: "numeric" })
    ),
    row(
      selectField("Gender*", "gender", ["", "Male", "Female", "Other"], "Select"),
      inputField("Age*", "age", "00", { inputmode: "numeric" })
    ),
    selectField("Type of Identification", "idType", ["", "DL", "ID"], "Select"),
    inputField("Identification Number*", "idNumber", "0000000000")
  );

  return form;
}

async function onGuestNext() {
  const errors = validateGuestForm(appState.guestForm);
  clearInlineErrors();

  if (Object.keys(errors).length) {
    Object.entries(errors).forEach(([k, msg]) => setInlineError(k, msg));
    showSnackbar("Please Complete All the Required Fields."); // 12
    return;
  }
  navigate(SCREENS.STAY_DETAILS);
}

/* 2) Scanner */
function ScannerScreen() {
  const wrap = document.createElement("div");
  const closeBtn = iconButton(ICONS.close, "Close", async () => {
    await stopScanner();
    navigate(SCREENS.GUEST_REG);
  });

  const torchBtn = iconButton(`<span style="font-size:14px;font-weight:800;">⚡</span>`, "Toggle Torch", async () => {
    await toggleTorch();
  });
  torchBtn.classList.add("icon-btn");
  torchBtn.style.width = "24px";
  torchBtn.style.height = "24px";

  wrap.appendChild(TopBar({ left: closeBtn, title: "Scanner", right: torchBtn }));

  const content = div("content");

  const viewerCard = div("scanner-wrap");
  const viewer = document.createElement("div");
  viewer.className = "viewer";

  const video = document.createElement("video");
  video.id = "scannerVideo";
  video.setAttribute("playsinline", "");
  video.muted = true;

  const hud = div("hud");
  const frame = div("frame");
  hud.appendChild(frame);

  viewer.append(video, hud);
  viewerCard.appendChild(viewer);

  const meta = document.createElement("div");
  meta.className = "meta-row";
  meta.innerHTML = `
    <span class="pill ${appState.scanner.detector || appState.scanner.zxingReader ? "ok" : ""}" id="enginePill">Engine: ${escapeHtml(appState.scanner.engineName || "…")}</span>
    <span class="pill ${appState.scanner.cameraState === "running" ? "ok" : ""}" id="cameraPill">Camera: ${escapeHtml(appState.scanner.cameraState || "idle")}</span>
  `;

  const controls = div("card");
  controls.appendChild(meta);

  const startBtn = button("Start Camera", "btn btn-primary", async () => {
    try {
      await initScannerEngine();
      await startScanner(video);
      showSnackbar("Scanning…");
      updateScannerPills();
    } catch (e) {
      console.error(e);
      showSnackbar("Camera blocked. Enable camera permissions for this site.");
    }
  });

  const stopBtn = button("Stop", "btn btn-danger", async () => {
    await stopScanner();
    updateScannerPills();
    showSnackbar("Stopped.");
  });
  stopBtn.style.marginTop = "10px";

  const photoLabel = document.createElement("label");
  photoLabel.className = "btn";
  photoLabel.style.display = "grid";
  photoLabel.style.placeItems = "center";
  photoLabel.style.marginTop = "10px";
  photoLabel.style.cursor = "pointer";
  photoLabel.innerHTML = `
    Scan from Photo
    <input id="scanFile" type="file" accept="image/*" class="hidden"/>
  `;

  const tip = document.createElement("div");
  tip.style.marginTop = "10px";
  tip.style.fontSize = "12px";
  tip.style.color = "#666";
  tip.textContent = "Tip: PDF417 needs sharp focus + bright light. Hold steady and close enough to fill the frame.";

  controls.append(startBtn, stopBtn, photoLabel, tip);

  content.append(viewerCard, controls);

  // wire photo input after render
  setTimeout(() => {
    const file = $("#scanFile");
    if (file) {
      file.addEventListener("change", async (e) => {
        const f = e.target.files?.[0];
        try {
          await initScannerEngine();
          await scanImageFile(f);
        } catch (err) {
          console.error(err);
          showSnackbar("Could not decode that image.");
        } finally {
          e.target.value = "";
        }
      });
    }
  }, 0);

  wrap.appendChild(content);
  return wrap;
}

/* 3A) Returning Guest */
function ReturningGuest() {
  const wrap = document.createElement("div");

  const closeBtn = iconButton(ICONS.close, "Cancel", () => navigate(SCREENS.GUEST_REG));
  wrap.appendChild(TopBar({ left: closeBtn, title: "Returning Guest", right: null }));

  const content = div("content");

  const p = appState.guestLookup.profile || {};
  const card = div("card");
  card.innerHTML = `
    <div class="summary-row"><b>Name</b><span>${escapeHtml(p.fullName || "")}</span></div>
    <div class="summary-row"><b>ID</b><span>${escapeHtml(`${p.idType || ""} ${p.idNumber || ""}`)}</span></div>
    <div class="summary-row"><b>Rating</b><span>${escapeHtml(p.rating || "—")}</span></div>
    <div class="summary-row"><b>Active since</b><span>${escapeHtml(p.activeSince || "—")}</span></div>
    <div class="summary-row"><b>Latest activity</b><span>${escapeHtml(p.latestActivity || "—")}</span></div>
  `;

  content.append(card);

  const actions = div("actions-row");
  const cancel = button("Cancel", "btn", () => navigate(SCREENS.GUEST_REG));
  const proceed = button("Proceed", "btn btn-primary", () => {
    navigate(SCREENS.STAY_DETAILS);
  });
  actions.append(cancel, proceed);
  content.append(actions);

  wrap.append(content);
  return wrap;
}

/* 3B) New Guest */
function NewGuest() {
  const wrap = document.createElement("div");
  const closeBtn = iconButton(ICONS.close, "Cancel", () => navigate(SCREENS.GUEST_REG));
  wrap.appendChild(TopBar({ left: closeBtn, title: "New User", right: null }));

  const content = div("content");

  const g = appState.guestLookup.pendingFromScan || appState.guestForm;
  const hero = div("card");
  hero.innerHTML = `
    <div class="state">
      <div class="big">New User</div>
      <div class="badge">No matching guest found</div>
    </div>
    <div class="summary-row"><b>Full name</b><span>${escapeHtml(g.fullName || "—")}</span></div>
    <div class="summary-row"><b>ID</b><span>${escapeHtml(`${g.idType || "—"} ${g.idNumber || "—"}`)}</span></div>
  `;
  content.append(hero);

  const actions = div("actions-row");
  const skip = button("Skip", "btn", () => {
    // proceed without saving
    appState.guestLookup.guestId = null;
    navigate(SCREENS.STAY_DETAILS);
  });
  const save = button("Save", "btn btn-primary", () => {
    const guests = loadGuests();
    const guestId = `G-${Math.floor(10000 + Math.random() * 89999)}`;
    guests.push({
      guestId,
      fullName: appState.guestForm.fullName,
      idType: appState.guestForm.idType || "DL",
      idNumber: appState.guestForm.idNumber,
      rating: "B",
      activeSince: todayISO(),
      latestActivity: todayISO(),
    });
    saveGuests(guests);
    appState.guestLookup.guestId = guestId;
    showSnackbar("Guest saved.");
    navigate(SCREENS.STAY_DETAILS);
  });

  actions.append(skip, save);
  content.append(actions);

  wrap.append(content);
  return wrap;
}

/* 4) Stay Details */
function StayDetails() {
  const wrap = document.createElement("div");
  const closeBtn = iconButton(ICONS.close, "Close", async () => {
    const ok = await confirmModal({ title: "Discard check-in?", body: "Discard this check-in flow?", okText: "Discard" });
    if (ok) {
      resetFlow();
      navigate(SCREENS.DASHBOARD);
    }
  });
  wrap.appendChild(TopBar({ left: closeBtn, title: "Stay Details", right: null }));
  wrap.appendChild(ProgressBar(1));

  const content = div("content");
  const form = div("form");

  form.append(
    dateField("Check-in date", "checkIn"),
    dateField("Check-out date", "checkOut"),
    row(
      selectStayField("Adults", "adults", ["1","2","3","4"]),
      selectStayField("Children", "children", ["0","1","2","3","4"])
    ),
    selectStayField("Select Room", "roomId", ROOMS.map(r => r.id), null, (val)=> roomLabelById(val)),
    selectStayField("Daily Rate", "dailyRate", dailyRateOptionsForRoom(appState.stay.roomId), null, (v)=> `$${v}`),
    inputStayField("Deposit", "deposit", { inputmode: "decimal" }),
    inputStayField("Discount", "discount", { inputmode: "decimal" })
  );

  content.append(form);
  wrap.appendChild(content);

  const nextBtn = button("Next", "btn btn-primary", () => {
    const errs = validateStay(appState.stay);
    clearInlineErrors();
    if (Object.keys(errs).length) {
      Object.entries(errs).forEach(([k, msg]) => setInlineError(k, msg));
      showSnackbar("Please complete required stay details.");
      return;
    }
    computeBooking();
    navigate(SCREENS.BOOKING_SUMMARY);
  });

  wrap.appendChild(BottomBar(nextBtn));
  return wrap;
}

/* 5) Booking Summary */
function BookingSummary() {
  const wrap = document.createElement("div");
  const backBtn = iconButton(ICONS.back, "Back", () => navigate(SCREENS.STAY_DETAILS));
  const closeBtn = iconButton(ICONS.close, "Close", async () => {
    const ok = await confirmModal({ title: "Discard check-in?", body: "Discard this check-in flow?", okText: "Discard" });
    if (ok) {
      resetFlow();
      navigate(SCREENS.DASHBOARD);
    }
  });

  wrap.appendChild(TopBar({ left: backBtn, title: "Booking Summary", right: closeBtn }));
  wrap.appendChild(ProgressBar(2));

  const content = div("content");

  const guestName = appState.guestForm.fullName || "(Guest)";
  const roomName = roomLabelById(appState.stay.roomId);
  const nights = appState.booking.nights;
  const rate = Number(appState.stay.dailyRate || 0);
  const deposit = Number(appState.stay.deposit || 0);
  const discount = Number(appState.stay.discount || 0);
  const total = appState.booking.total;

  const summary = div("card");
  summary.innerHTML = `
    <div class="summary-row"><b>Guest</b><span>${escapeHtml(guestName)}</span></div>
    <div class="summary-row"><b>Check-in</b><span>${escapeHtml(appState.stay.checkIn)}</span></div>
    <div class="summary-row"><b>Check-out</b><span>${escapeHtml(appState.stay.checkOut)}</span></div>
    <div class="summary-row"><b>Nights</b><span>${nights}</span></div>
    <div class="summary-row"><b>Room</b><span>${escapeHtml(roomName)}</span></div>
    <div class="summary-row"><b>Guests</b><span>${escapeHtml(`${appState.stay.adults} Adults, ${appState.stay.children} Children`)}</span></div>
    <div class="summary-row"><b>Daily rate</b><span>$${rate.toFixed(2)}</span></div>
    <div class="summary-row"><b>Deposit</b><span>$${deposit.toFixed(2)}</span></div>
    <div class="summary-row"><b>Discount</b><span>-$${discount.toFixed(2)}</span></div>
  `;

  const totalCard = div("card");
  totalCard.innerHTML = `
    <div class="summary-row"><b>Total Amount</b><span><b>$${total.toFixed(2)}</b></span></div>
  `;

  content.append(summary, totalCard);

  const payActions = div("actions-row");
  const cashBtn = button("Cash", "btn", () => {
    appState.payment.method = "cash";
    navigate(SCREENS.CASH_CONFIRM);
  });
  const cardBtn = button("Confirm Card", "btn btn-primary", () => {
    appState.payment.method = "card";
    navigate(SCREENS.CARD_DETAILS);
  });
  payActions.append(cashBtn, cardBtn);
  content.append(payActions);

  wrap.append(content);
  return wrap;
}

/* 6A) Card payment details */
function CardPaymentDetails() {
  const wrap = document.createElement("div");
  const backBtn = iconButton(ICONS.back, "Back", () => navigate(SCREENS.BOOKING_SUMMARY));
  const closeBtn = iconButton(ICONS.close, "Close", async () => {
    const ok = await confirmModal({ title: "Discard check-in?", body: "Discard this check-in flow?", okText: "Discard" });
    if (ok) {
      resetFlow();
      navigate(SCREENS.DASHBOARD);
    }
  });
  wrap.appendChild(TopBar({ left: backBtn, title: "Card Payment", right: closeBtn }));

  const content = div("content");
  const totalCard = div("card");
  totalCard.innerHTML = `<div class="summary-row"><b>Total Amount</b><span><b>$${appState.booking.total.toFixed(2)}</b></span></div>`;

  const tapBtn = button("Tap to Pay", "btn", () => navigate(SCREENS.TAP_TO_PAY));

  const manual = div("card");
  manual.innerHTML = `<div style="font-weight:800;margin-bottom:10px;">Manual Card Entry</div>`;
  const manualForm = div("form");
  manualForm.style.gap = "14px";

  manualForm.append(
    inputPayment("Card number", "number", "•••• •••• •••• ••••"),
    row(
      inputPayment("Expiry", "expiry", "MM/YY"),
      inputPayment("CVV", "cvv", "•••", { inputmode: "numeric" })
    ),
    inputPayment("Name", "name", "Name on card"),
    inputPayment("ZIP", "zip", "ZIP", { inputmode: "numeric" })
  );
  manual.append(manualForm);

  const proceed = button("Proceed to Pay", "btn btn-primary", () => {
    // if any manual field filled, require all
    const c = appState.payment.card;
    const any = [c.number, c.expiry, c.cvv, c.name, c.zip].some(v => (v || "").trim().length);
    clearInlineErrors();

    if (any) {
      const errs = {};
      if (!c.number.trim()) errs["card_number"] = "Required";
      if (!c.expiry.trim()) errs["card_expiry"] = "Required";
      if (!c.cvv.trim()) errs["card_cvv"] = "Required";
      if (!c.name.trim()) errs["card_name"] = "Required";
      if (!c.zip.trim()) errs["card_zip"] = "Required";

      if (Object.keys(errs).length) {
        Object.entries(errs).forEach(([k, msg]) => setInlineError(k, msg));
        showSnackbar("Please complete all required card fields.");
        return;
      }
    }
    // go processing
    appState.payment.txn.type = any ? "Manual Card" : "NFC";
    navigate(SCREENS.PROCESSING);
    startProcessingOutcome("card");
  });

  content.append(totalCard, tapBtn, manual, proceed);

  wrap.append(content);
  return wrap;
}

/* 6B) Cash confirm */
function CashConfirm() {
  const wrap = document.createElement("div");
  const backBtn = iconButton(ICONS.back, "Back", () => navigate(SCREENS.BOOKING_SUMMARY));
  const closeBtn = iconButton(ICONS.close, "Close", async () => {
    const ok = await confirmModal({ title: "Discard check-in?", body: "Discard this check-in flow?", okText: "Discard" });
    if (ok) {
      resetFlow();
      navigate(SCREENS.DASHBOARD);
    }
  });
  wrap.appendChild(TopBar({ left: backBtn, title: "Cash Payment", right: closeBtn }));

  const content = div("content");
  const hero = div("card");
  hero.innerHTML = `
    <div class="state">
      <div class="big">Record Cash Payment</div>
      <div class="badge">Total: $${appState.booking.total.toFixed(2)}</div>
    </div>
  `;
  const yes = button("Yes", "btn btn-primary", () => {
    // record cash
    appState.payment.txn.type = "Cash";
    navigate(SCREENS.CASH_SUCCESS);
  });

  content.append(hero, yes);
  wrap.append(content);
  return wrap;
}

/* 7) Tap to Pay (NFC ready) */
function TapToPay() {
  const wrap = document.createElement("div");
  const closeBtn = iconButton(ICONS.close, "Close", async () => {
    // cancel NFC
    navigate(SCREENS.CARD_DETAILS);
  });
  wrap.appendChild(TopBar({ left: closeBtn, title: "Tap to Pay", right: null }));

  const content = div("content");

  const card1 = div("card");
  card1.innerHTML = `
    <div class="state">
      <div class="big">NFC Ready</div>
      <div class="badge">Hold card/phone near reader</div>
    </div>
  `;

  const card2 = div("card");
  card2.innerHTML = `
    <div class="summary-row"><b>Guest</b><span>${escapeHtml(appState.guestForm.fullName || "(Guest)")}</span></div>
    <div class="summary-row"><b>Room</b><span>${escapeHtml(roomLabelById(appState.stay.roomId))}</span></div>
    <div class="summary-row"><b>Total</b><span><b>$${appState.booking.total.toFixed(2)}</b></span></div>
  `;

  const simulate = button("Simulate Tap", "btn btn-primary", () => {
    appState.payment.txn.type = "NFC";
    navigate(SCREENS.PROCESSING);
    startProcessingOutcome("card");
  });

  const note = document.createElement("div");
  note.style.fontSize = "12px";
  note.style.color = "#666";
  note.textContent = "Web browsers can’t access real NFC payment hardware here, so this demo includes a Simulate Tap button.";

  content.append(card1, card2, simulate, note);
  wrap.append(content);
  return wrap;
}

/* 8) Processing */
function PaymentProcessing() {
  const wrap = document.createElement("div");
  wrap.appendChild(TopBar({ left: null, title: "Payment Processing…", right: null }));

  const content = div("content");
  const card = div("card");
  card.innerHTML = `
    <div class="state">
      <div class="big">Payment Processing…</div>
      <div class="badge">Please wait</div>
    </div>
  `;
  content.append(card);
  wrap.append(content);
  return wrap;
}

/* 9A) Card success */
function CardSuccess() {
  const wrap = document.createElement("div");
  wrap.appendChild(TopBar({ left: null, title: "Payment Successful", right: null }));

  const content = div("content");
  const card = div("card");
  const bookingId = appState.booking.bookingId || "B-000000";
  card.innerHTML = `
    <div class="state ok">
      <div class="big">Success</div>
      <div class="badge">Card Payment</div>
    </div>
    <div class="summary-row"><b>Booking ID</b><span>${escapeHtml(bookingId)}</span></div>
    <div class="summary-row"><b>Transaction type</b><span>${escapeHtml(appState.payment.txn.type || "Card")}</span></div>
    <div class="summary-row"><b>Transaction ID</b><span>${escapeHtml(appState.payment.txn.id || "T-000000")}</span></div>
    <div class="summary-row"><b>Total</b><span><b>$${appState.booking.total.toFixed(2)}</b></span></div>
  `;

  const print = button("Print Receipt", "btn btn-primary", () => {
    navigate(SCREENS.RECEIPT);
  });

  content.append(card, print);
  wrap.append(content);
  return wrap;
}

/* 9B) Cash success */
function CashSuccess() {
  const wrap = document.createElement("div");
  wrap.appendChild(TopBar({ left: null, title: "Payment Successful", right: null }));

  const content = div("content");
  const card = div("card");
  const bookingId = appState.booking.bookingId || "B-000000";
  card.innerHTML = `
    <div class="state ok">
      <div class="big">Success</div>
      <div class="badge">Cash Payment</div>
    </div>
    <div class="summary-row"><b>Booking ID</b><span>${escapeHtml(bookingId)}</span></div>
    <div class="summary-row"><b>Transaction type</b><span>Cash</span></div>
    <div class="summary-row"><b>Total</b><span><b>$${appState.booking.total.toFixed(2)}</b></span></div>
  `;

  const print = button("Print Receipt", "btn btn-primary", () => {
    navigate(SCREENS.RECEIPT);
  });

  content.append(card, print);
  wrap.append(content);
  return wrap;
}

/* 9C) Card declined */
function CardDeclined() {
  const wrap = document.createElement("div");
  wrap.appendChild(TopBar({ left: null, title: "Payment Declined", right: null }));

  const content = div("content");
  const card = div("card");
  card.innerHTML = `
    <div class="state bad">
      <div class="big">Declined</div>
      <div class="badge">Card payment failed</div>
    </div>
    <div class="summary-row"><b>Transaction type</b><span>${escapeHtml(appState.payment.txn.type || "Card")}</span></div>
    <div class="summary-row"><b>Total</b><span><b>$${appState.booking.total.toFixed(2)}</b></span></div>
  `;

  const actions = div("actions-row");
  const retry = button("Retry", "btn", () => {
    // You had "Retry" disabled in the mock; keep disabled by default but clickable via flag if desired
  });
  retry.disabled = true;

  const change = button("Change Method", "btn btn-primary", () => {
    navigate(SCREENS.BOOKING_SUMMARY);
  });

  actions.append(retry, change);
  content.append(card, actions);

  wrap.append(content);
  return wrap;
}

/* 10) Receipt Printed */
function ReceiptPrinted() {
  const wrap = document.createElement("div");
  wrap.appendChild(TopBar({ left: null, title: "Receipt Printed", right: null }));

  const content = div("content");
  const card = div("card");
  card.innerHTML = `
    <div class="state ok">
      <div class="big">Receipt Printed</div>
      <div class="badge">Print complete</div>
    </div>
  `;

  const actions = div("actions-row");
  const share = button("Share", "btn", async () => {
    // optional OS share
    const text = `Booking ${appState.booking.bookingId || ""} • Total $${appState.booking.total.toFixed(2)}`;
    if (navigator.share) {
      try { await navigator.share({ title: "Receipt", text }); }
      catch { /* ignore */ }
    } else {
      await navigator.clipboard?.writeText?.(text);
      showSnackbar("Share not available. Copied summary to clipboard.");
    }
  });

  const done = button("Done", "btn btn-primary", () => {
    resetFlow();
    navigate(SCREENS.DASHBOARD);
  });

  actions.append(share, done);
  content.append(card, actions);

  wrap.append(content);
  return wrap;
}

/* ----------------------- Scanner implementation ----------------------- */
async function initScannerEngine() {
  // already ready?
  if (appState.scanner.detector || appState.scanner.zxingReader) return;

  // BarcodeDetector first
  if ("BarcodeDetector" in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats?.();
      const supportsPdf417 = Array.isArray(formats) && formats.includes("pdf417");
      if (supportsPdf417) {
        appState.scanner.detector = new BarcodeDetector({ formats: ["pdf417"] });
        appState.scanner.engineName = "BarcodeDetector (native)";
        return;
      }
      appState.scanner.engineName = "BarcodeDetector (no pdf417) → ZXing";
    } catch {
      appState.scanner.engineName = "BarcodeDetector error → ZXing";
    }
  } else {
    appState.scanner.engineName = "ZXing (fallback)";
  }

  // ZXing fallback (ESM)
  if (!appState.scanner.zxing) {
    appState.scanner.zxing = await import("https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/+esm");
    appState.scanner.zxingReader = new appState.scanner.zxing.BrowserMultiFormatReader();

    // prioritize PDF417
    const hints = new Map();
    hints.set(appState.scanner.zxing.DecodeHintType.POSSIBLE_FORMATS, [
      appState.scanner.zxing.BarcodeFormat.PDF_417
    ]);
    appState.scanner.zxingReader.hints = hints;

    appState.scanner.engineName = "ZXing (@zxing/library)";
  }
}

async function startScanner(videoEl) {
  appState.scanner.stopLoop = false;

  const constraints = {
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    }
  };

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  appState.scanner.stream = stream;
  videoEl.srcObject = stream;
  await videoEl.play();

  appState.scanner.cameraState = "running";
  appState.scanner.torchAvailable = await updateTorchAvailability();

  scanLoop(videoEl);
}

async function stopScanner() {
  appState.scanner.stopLoop = true;

  const videoEl = $("#scannerVideo");
  if (videoEl) {
    try { videoEl.pause(); } catch {}
    videoEl.srcObject = null;
  }

  if (appState.scanner.stream) {
    appState.scanner.stream.getTracks().forEach(t => t.stop());
  }
  appState.scanner.stream = null;
  appState.scanner.cameraState = "idle";
  appState.scanner.torchAvailable = false;
}

async function updateTorchAvailability() {
  try {
    const track = appState.scanner.stream?.getVideoTracks?.()?.[0];
    const caps = track?.getCapabilities?.();
    return !!caps?.torch;
  } catch {
    return false;
  }
}

async function toggleTorch() {
  try {
    const track = appState.scanner.stream?.getVideoTracks?.()?.[0];
    if (!track) {
      showSnackbar("Start the camera first.");
      return;
    }
    const caps = track.getCapabilities?.();
    if (!caps?.torch) {
      showSnackbar("Torch not available on this device/browser.");
      return;
    }
    const settings = track.getSettings?.();
    const isOn = !!settings?.torch;
    await track.applyConstraints({ advanced: [{ torch: !isOn }] });
  } catch {
    showSnackbar("Torch not available on this device/browser.");
  }
}

function publishScan(text) {
  const now = Date.now();
  if (!text) return;
  if (text === appState.scanner.lastText && (now - appState.scanner.lastAt) < 1500) return;

  appState.scanner.lastText = text;
  appState.scanner.lastAt = now;

  // Parse AAMVA → map to form
  const parsed = parseAAMVA(text);
  if (!parsed.ok) {
    showSnackbar("Auto-fill failed. Please enter details manually."); // 11
    return;
  }

  applyAAMVAToGuestForm(parsed.fields, text);
  showSnackbar("Details auto-filled."); // 13

  // After scan: try lookup and route to 3A/3B
  const lookup = lookupGuest(appState.guestForm.idType || "DL", appState.guestForm.idNumber);
  if (lookup.found) {
    appState.guestLookup.found = true;
    appState.guestLookup.guestId = lookup.profile.guestId;
    appState.guestLookup.profile = lookup.profile;
    appState.guestLookup.pendingFromScan = { ...appState.guestForm };
    stopScanner().finally(() => navigate(SCREENS.RETURNING));
  } else {
    appState.guestLookup.found = false;
    appState.guestLookup.guestId = null;
    appState.guestLookup.profile = null;
    appState.guestLookup.pendingFromScan = { ...appState.guestForm };
    stopScanner().finally(() => navigate(SCREENS.NEW_GUEST));
  }
}

async function scanLoop(videoEl) {
  if (appState.scanner.stopLoop) return;

  try {
    if (appState.scanner.detector) {
      const barcodes = await appState.scanner.detector.detect(videoEl);
      if (barcodes?.length) {
        const val = barcodes[0].rawValue || "";
        // NOTE: bounding-box gate “fully inside frame” varies by API; keep simple here.
        publishScan(val);
      }
    } else if (appState.scanner.zxingReader && appState.scanner.zxing) {
      if (videoEl.readyState >= 2) {
        const w = videoEl.videoWidth;
        const h = videoEl.videoHeight;

        const cropW = Math.floor(w * 0.90);
        const cropH = Math.floor(h * 0.55);
        const sx = Math.floor((w - cropW) / 2);
        const sy = Math.floor((h - cropH) / 2);

        const canvas = getScratchCanvas();
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        canvas.width = cropW;
        canvas.height = cropH;
        ctx.drawImage(videoEl, sx, sy, cropW, cropH, 0, 0, cropW, cropH);

        const imageData = ctx.getImageData(0, 0, cropW, cropH);
        const z = appState.scanner.zxing;

        const luminance = new z.RGBLuminanceSource(imageData.data, cropW, cropH);
        const binarizer = new z.HybridBinarizer(luminance);
        const bitmap = new z.BinaryBitmap(binarizer);

        try {
          const res = appState.scanner.zxingReader.decodeBitmap(bitmap);
          publishScan(res?.getText?.() || "");
        } catch {
          // expected when nothing found
        }
      }
    }
  } catch {
    // keep scanning quietly
  }

  setTimeout(() => scanLoop(videoEl), 110);
}

async function scanImageFile(file) {
  if (!file) return;
  const canvas = getScratchCanvas();
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();

  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  ctx.drawImage(img, 0, 0);

  if (appState.scanner.detector) {
    const barcodes = await appState.scanner.detector.detect(canvas);
    if (barcodes?.length) {
      publishScan(barcodes[0].rawValue || "");
      return;
    }
    showSnackbar("Auto-fill failed. Please enter details manually."); // 11
  } else if (appState.scanner.zxingReader && appState.scanner.zxing) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const z = appState.scanner.zxing;

    const luminance = new z.RGBLuminanceSource(imageData.data, canvas.width, canvas.height);
    const binarizer = new z.HybridBinarizer(luminance);
    const bitmap = new z.BinaryBitmap(binarizer);

    try {
      const res = appState.scanner.zxingReader.decodeBitmap(bitmap);
      publishScan(res?.getText?.() || "");
    } catch {
      showSnackbar("Auto-fill failed. Please enter details manually."); // 11
    }
  }
}

function updateScannerPills() {
  const enginePill = $("#enginePill");
  const cameraPill = $("#cameraPill");
  if (enginePill) enginePill.textContent = `Engine: ${appState.scanner.engineName || "…"}`;
  if (cameraPill) cameraPill.textContent = `Camera: ${appState.scanner.cameraState || "idle"}`;
}

let scratchCanvas = null;
function getScratchCanvas() {
  if (!scratchCanvas) scratchCanvas = document.createElement("canvas");
  return scratchCanvas;
}

/* ----------------------- AAMVA parsing + mapping ----------------------- */
/**
 * Parses PDF417 AAMVA raw text into fields keyed by element IDs (DAC, DAD, DCS, etc).
 * Supports common formats where each field appears on its own line: "DCSLASTNAME"
 */
function parseAAMVA(raw) {
  if (!raw || typeof raw !== "string") return { ok: false, fields: {} };

  // Normalize line breaks and strip NULs
  const text = raw.replace(/\u0000/g, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n").map(s => s.trim()).filter(Boolean);

  const fields = {};
  // Many AAMVA barcodes use 3-letter element IDs followed by value
  for (const line of lines) {
    const m = line.match(/^([A-Z0-9]{3})(.*)$/);
    if (!m) continue;
    const key = m[1];
    const val = (m[2] || "").trim();
    // keep first occurrence unless value empty
    if (!(key in fields) || !fields[key]) fields[key] = val;
  }

  // sanity: need at least DAQ or name pieces
  const ok = !!(fields.DAQ || fields.DCS || fields.DAC);
  return { ok, fields };
}

function applyAAMVAToGuestForm(fields, raw) {
  appState.guestForm.rawAamva = raw;

  // Full name: DAC first, DAD middle, DCS last
  const first = (fields.DAC || "").trim();
  const middle = (fields.DAD || "").trim();
  const last = (fields.DCS || "").trim();
  const fullName = [first, middle, last].filter(Boolean).join(" ").trim();
  if (fullName) appState.guestForm.fullName = fullName;

  // Address fields
  if (fields.DAG) appState.guestForm.streetAddress = fields.DAG.trim();
  if (fields.DAI) appState.guestForm.city = fields.DAI.trim();

  // State (DAJ) must match dropdown; else keep blank + inline error
  const st = (fields.DAJ || "").trim().toUpperCase();
  if (st && US_STATES.includes(st)) {
    appState.guestForm.state = st;
  } else if (st) {
    appState.guestForm.state = "";
    setTimeout(() => setInlineError("state", "State value from scan doesn't match list."), 0);
  }

  // Zip (DAK) normalize ZIP+4 to first 5
  if (fields.DAK) {
    const z = fields.DAK.trim();
    const m = z.match(/^(\d{5})/);
    appState.guestForm.zip = m ? m[1] : z;
  }

  // Gender (DBC): normalize
  if (fields.DBC) {
    const g = fields.DBC.trim().toUpperCase();
    const gender =
      (g === "1" || g === "M" || g === "MALE") ? "Male" :
      (g === "2" || g === "F" || g === "FEMALE") ? "Female" :
      "Other";
    appState.guestForm.gender = gender;
  }

  // DOB (DBB) to age
  if (fields.DBB) {
    const dob = parseAAMVADate(fields.DBB.trim());
    if (dob) {
      appState.guestForm.dob = dob;
      appState.guestForm.age = String(calcAge(dob));
    }
  }

  // ID Type: if unknown, leave blank. (Many barcodes don’t expose the subfile designator cleanly in decoded text.)
  // If you have a reliable source, map it here. For now: default DL when ID number exists.
  if (!appState.guestForm.idType) {
    appState.guestForm.idType = "DL";
  }

  // ID number (DAQ)
  if (fields.DAQ) appState.guestForm.idNumber = fields.DAQ.trim();

  // Re-render if we’re on the guest form
  if (appState.screen === SCREENS.GUEST_REG) render();
}

function parseAAMVADate(s) {
  // Common forms: YYYYMMDD or MMDDYYYY
  const t = s.replace(/\D/g, "");
  if (t.length !== 8) return null;

  // Heuristic: if starts with 19/20 => YYYYMMDD
  if (t.startsWith("19") || t.startsWith("20")) {
    const yyyy = t.slice(0, 4), mm = t.slice(4, 6), dd = t.slice(6, 8);
    return `${yyyy}-${mm}-${dd}`;
  } else {
    const mm = t.slice(0, 2), dd = t.slice(2, 4), yyyy = t.slice(4, 8);
    return `${yyyy}-${mm}-${dd}`;
  }
}

function calcAge(dobISO) {
  const [y, m, d] = dobISO.split("-").map(Number);
  const dob = new Date(y, m - 1, d);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const md = now.getMonth() - dob.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < dob.getDate())) age--;
  return Math.max(0, age);
}

/* ----------------------- Validation ----------------------- */
function validateGuestForm(f) {
  const errs = {};
  if (!f.fullName.trim()) errs.fullName = "Required";
  if (!f.streetAddress.trim()) errs.streetAddress = "Required";
  if (!f.city.trim()) errs.city = "Required";
  if (!f.state.trim()) errs.state = "Required";
  if (!/^\d{5}$/.test((f.zip || "").trim())) errs.zip = "5-digit ZIP required";
  if (!f.gender.trim()) errs.gender = "Required";
  if (!String(f.age || "").trim() || isNaN(Number(f.age))) errs.age = "Valid age required";
  if (!f.idNumber.trim()) errs.idNumber = "Required";
  return errs;
}

function validateStay(s) {
  const errs = {};
  if (!s.checkIn) errs.checkIn = "Required";
  if (!s.checkOut) errs.checkOut = "Required";

  if (s.checkIn && s.checkOut) {
    if (new Date(s.checkOut) <= new Date(s.checkIn)) {
      errs.checkOut = "Must be after check-in";
    }
  }

  if (!s.roomId) errs.roomId = "Required";
  if (!s.dailyRate) errs.dailyRate = "Required";

  const dep = Number(s.deposit || 0);
  const disc = Number(s.discount || 0);
  if (isNaN(dep) || dep < 0) errs.deposit = "Must be a number ≥ 0";
  if (isNaN(disc) || disc < 0) errs.discount = "Must be a number ≥ 0";

  return errs;
}

/* ----------------------- Booking computations ----------------------- */
function computeBooking() {
  const nights = diffNights(appState.stay.checkIn, appState.stay.checkOut);
  appState.booking.nights = nights;

  const rate = Number(appState.stay.dailyRate || 0);
  const deposit = Number(appState.stay.deposit || 0);
  const discount = Number(appState.stay.discount || 0);

  const subtotal = nights * rate;
  const total = Math.max(0, subtotal + deposit - discount);

  appState.booking.total = total;
  appState.booking.bookingId = `B-${Math.floor(100000 + Math.random() * 899999)}`;
}

/* ----------------------- Payment outcome simulation ----------------------- */
function startProcessingOutcome(kind /* 'card' */) {
  // non-interruptible; after delay route
  const txnId = `T-${Math.floor(100000 + Math.random() * 899999)}`;
  appState.payment.txn.id = txnId;

  setTimeout(() => {
    // For demo: 80% success
    const ok = Math.random() < 0.8;
    if (ok) {
      appState.payment.lastOutcome = "success";
      navigate(SCREENS.CARD_SUCCESS);
    } else {
      appState.payment.lastOutcome = "declined";
      navigate(SCREENS.CARD_DECLINED);
    }
  }, 1800);
}

/* ----------------------- Guest lookup ----------------------- */
function lookupGuest(idType, idNumber) {
  const guests = loadGuests();
  const profile = guests.find(g => (g.idType || "").toUpperCase() === (idType || "").toUpperCase()
    && String(g.idNumber || "").trim() === String(idNumber || "").trim());
  if (profile) return { found: true, profile };
  return { found: false, profile: null };
}

/* ----------------------- Helpers: UI fields ----------------------- */
function inputField(label, key, placeholder, attrs = {}) {
  const f = div("field");
  f.appendChild(divText("label", label));
  const inp = document.createElement("input");
  inp.className = "input";
  inp.placeholder = placeholder;
  inp.value = appState.guestForm[key] || "";
  Object.assign(inp, attrs);
  inp.addEventListener("input", (e) => {
    appState.guestForm[key] = e.target.value;
  });
  inp.dataset.errkey = key;

  f.append(inp, inlineErrorEl(key));
  return f;
}

function selectField(label, key, options, placeholder = "Select") {
  const f = div("field");
  f.appendChild(divText("label", label));
  const sel = document.createElement("select");
  sel.className = "input";
  sel.dataset.errkey = key;

  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = opt || placeholder;
    sel.appendChild(o);
  }
  sel.value = appState.guestForm[key] || "";
  sel.addEventListener("change", (e) => {
    appState.guestForm[key] = e.target.value;
  });

  f.append(sel, inlineErrorEl(key));
  return f;
}

function dateField(label, key) {
  const f = div("field");
  f.appendChild(divText("label", label));
  const inp = document.createElement("input");
  inp.type = "date";
  inp.className = "input";
  inp.value = appState.stay[key] || "";
  inp.dataset.errkey = key;
  inp.addEventListener("input", (e) => {
    appState.stay[key] = e.target.value;
    if (key === "checkIn" && new Date(appState.stay.checkOut) <= new Date(appState.stay.checkIn)) {
      appState.stay.checkOut = addDaysISO(appState.stay.checkIn, 1);
      render();
    }
  });
  f.append(inp, inlineErrorEl(key));
  return f;
}

function selectStayField(label, key, options, placeholder = "Select", labeler = null) {
  const f = div("field");
  f.appendChild(divText("label", label));
  const sel = document.createElement("select");
  sel.className = "input";
  sel.dataset.errkey = key;

  if (placeholder !== null) {
    const o0 = document.createElement("option");
    o0.value = "";
    o0.textContent = placeholder;
    sel.appendChild(o0);
  }

  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt;
    o.textContent = labeler ? labeler(opt) : opt;
    sel.appendChild(o);
  }

  sel.value = appState.stay[key] || "";
  sel.addEventListener("change", (e) => {
    appState.stay[key] = e.target.value;

    if (key === "roomId") {
      const opts = dailyRateOptionsForRoom(appState.stay.roomId);
      appState.stay.dailyRate = opts[0] || "";
      render();
    }
  });

  f.append(sel, inlineErrorEl(key));
  return f;
}

function inputStayField(label, key, attrs = {}) {
  const f = div("field");
  f.appendChild(divText("label", label));
  const inp = document.createElement("input");
  inp.className = "input";
  inp.value = appState.stay[key] || "";
  Object.assign(inp, attrs);
  inp.addEventListener("input", (e) => {
    appState.stay[key] = e.target.value;
  });
  inp.dataset.errkey = key;

  f.append(inp, inlineErrorEl(key));
  return f;
}

function inputPayment(label, key, placeholder, attrs = {}) {
  const f = div("field");
  const errKey = `card_${key}`;
  f.appendChild(divText("label", label));
  const inp = document.createElement("input");
  inp.className = "input";
  inp.placeholder = placeholder;
  inp.value = appState.payment.card[key] || "";
  Object.assign(inp, attrs);
  inp.addEventListener("input", (e) => {
    appState.payment.card[key] = e.target.value;
  });
  inp.dataset.errkey = errKey;

  f.append(inp, inlineErrorEl(errKey));
  return f;
}

function row(a, b) {
  const r = div("input-row");
  r.append(a, b);
  return r;
}

function tile(text, kind, onClick) {
  const t = document.createElement("div");
  t.className = `tile ${kind || ""}`.trim();
  t.textContent = text;
  if (kind !== "disabled") t.addEventListener("click", onClick);
  return t;
}

function hrOther() {
  const wrap = div("hr-row");
  wrap.append(div("hr"), divText("hr-label", "Other"), div("hr"));
  return wrap;
}

function button(text, className, onClick) {
  const b = document.createElement("button");
  b.className = className;
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

function iconButton(svg, aria, onClick) {
  const b = document.createElement("button");
  b.className = "icon-btn";
  b.setAttribute("aria-label", aria);
  b.innerHTML = typeof svg === "string" ? svg : String(svg);
  b.addEventListener("click", onClick);
  return b;
}

function div(cls) {
  const d = document.createElement("div");
  d.className = cls;
  return d;
}
function divText(cls, txt) {
  const d = div(cls);
  d.textContent = txt;
  return d;
}
function elP(cls, txt) {
  const p = document.createElement("div");
  p.className = cls;
  p.textContent = txt;
  return p;
}

/* ----------------------- Inline error utilities ----------------------- */
function inlineErrorEl(key) {
  const e = document.createElement("div");
  e.className = "error";
  e.dataset.errfor = key;
  e.textContent = "";
  return e;
}
function setInlineError(key, msg) {
  const el = document.querySelector(`[data-errfor="${CSS.escape(key)}"]`);
  if (el) el.textContent = msg;
}
function clearInlineErrors() {
  $$(`[data-errfor]`).forEach(el => el.textContent = "");
}

/* ----------------------- Misc helpers ----------------------- */
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function addDaysISO(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function diffNights(checkInISO, checkOutISO) {
  const a = new Date(checkInISO);
  const b = new Date(checkOutISO);
  const ms = b - a;
  const nights = Math.round(ms / (1000 * 60 * 60 * 24));
  return Math.max(1, nights);
}
function roomLabelById(id) {
  return (ROOMS.find(r => r.id === id)?.name) || id;
}
function dailyRateOptionsForRoom(roomId) {
  const r = ROOMS.find(x => x.id === roomId);
  return (r?.rates || [119]).map(n => String(n));
}

function resetFlow() {
  appState.guestForm = {
    fullName: "",
    streetAddress: "",
    city: "",
    state: "",
    zip: "",
    gender: "",
    age: "",
    dob: "",
    idType: "",
    idNumber: "",
    rawAamva: "",
  };
  appState.guestLookup = {
    found: false,
    guestId: null,
    profile: null,
    pendingFromScan: null,
  };
  appState.stay = {
    checkIn: todayISO(),
    checkOut: addDaysISO(todayISO(), 1),
    adults: "1",
    children: "0",
    roomId: "101",
    ratePlanId: "standard",
    dailyRate: "119",
    deposit: "0",
    discount: "0",
  };
  appState.booking = { nights: 1, total: 0, bookingId: null };
  appState.payment = { method: null, card: { number: "", expiry: "", cvv: "", name: "", zip: "" }, txn: { type: "", id: "" }, lastOutcome: null };
  stopScanner().catch(()=>{});
}

/* ----------------------- Boot ----------------------- */
window.addEventListener("beforeunload", () => {
  // stop camera tracks if any
  if (appState.scanner.stream) {
    appState.scanner.stream.getTracks().forEach(t => t.stop());
  }
});

// Keep Guest Registration inputs in sync on rerender (especially after scan)
document.addEventListener("input", (e) => {
  // handled per input listeners
});

render();
