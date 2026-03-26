// content.js — DAT Helper (On-page panel)
// Stable approach: capture loads -> filter -> save -> export
// Adds LoadConnect-style filters:
// Max Miles, Min Miles, Max Deadhead, Min Rate, Min RPM, Exclude States, Reset
//
// Note on Deadhead: only works if DAT response includes deadhead miles. If not present, we show a note.

let capturedLoads = [];
let lastCapturedAt = null;

// ---------- storage keys ----------
const FILTERS_KEY = "lc_panel_filters_v1";
const SAVED_KEY = "savedLoads";

// ---------- helpers ----------
function safe(v) {
  return v === null || v === undefined ? "" : String(v);
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n) {
  return num(n).toLocaleString();
}

function parseState(place) {
  // "City, ST" or "City,ST"
  const t = safe(place).trim();
  const m = t.match(/,\s*([A-Z]{2})\b/);
  return m ? m[1].toUpperCase() : "";
}

function loadKey(l) {
  return [
    l.origin, l.destination, l.company, l.miles, l.pickupDate, l.rate, l.equipment, l.weight
  ].map(safe).join("|");
}

function dedupeLoads(loads) {
  const seen = new Set();
  const out = [];
  for (const l of loads || []) {
    const k = loadKey(l);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(l);
    }
  }
  return out;
}

function getRPM(load) {
  const rpm = num(load.ratePerMile);
  if (rpm > 0) return rpm;
  const miles = num(load.miles);
  const rate = num(load.rate);
  return miles > 0 ? rate / miles : 0;
}

// Try to extract deadhead from unknown DAT response structures
function pickDeadheadMiles(r) {
  const candidates = [
    r?.deadheadMiles,
    r?.deadhead?.miles,
    r?.deadheadDistanceMiles,
    r?.deadheadDistance?.miles,
    r?.tripLength?.deadheadMiles,
    r?.tripLength?.deadhead?.miles,
    r?.deadhead?.distance?.miles
  ];
  for (const c of candidates) {
    const n = num(c);
    if (n > 0) return n;
  }
  return 0; // unknown
}

function mapResults(results) {
  return (results || []).map(r => ({
    origin: `${r?.assetInfo?.origin?.city || ""}, ${r?.assetInfo?.origin?.stateProv || ""}`.trim(),
    destination: `${r?.assetInfo?.destination?.city || ""}, ${r?.assetInfo?.destination?.stateProv || ""}`.trim(),
    rate: r?.rateInfo?.nonBookable?.rateUsd || r?.rateInfo?.bookable?.rate?.rateUsd || 0,
    ratePerMile: r?.estimatedRatePerMile || 0,
    miles: r?.tripLength?.miles || 0,
    deadheadMiles: pickDeadheadMiles(r),
    equipment: r?.assetInfo?.equipmentType || "N/A",
    company: r?.posterInfo?.companyName || "N/A",
    phone: r?.posterInfo?.contact?.phone?.number || "",
    email: r?.posterInfo?.contact?.email || "",
    pickupDate: r?.availability?.earliestWhen || "N/A",
    creditScore: r?.posterInfo?.credit?.creditScore ?? "",
    daysToPay: r?.posterInfo?.credit?.daysToPay ?? "",
    weight: r?.assetInfo?.capacity?.maximumWeightPounds ?? ""
  }));
}

function parseExcludeStates(str) {
  return new Set(
    safe(str)
      .toUpperCase()
      .split(/[\s,]+/)
      .map(s => s.trim())
      .filter(s => s.length === 2)
  );
}

// ---------- filters ----------
let filters = {
  maxMiles: "",
  minMiles: "",
  maxDeadhead: "",
  minRate: "",
  minRpm: "",
  excludeStates: ""
};

async function loadFilters() {
  const data = await chrome.storage.local.get(FILTERS_KEY);
  if (data && data[FILTERS_KEY]) filters = { ...filters, ...data[FILTERS_KEY] };
}

async function saveFilters() {
  await chrome.storage.local.set({ [FILTERS_KEY]: filters });
}

function applyFilters(loads) {
  const maxMiles = num(filters.maxMiles);
  const minMiles = num(filters.minMiles);
  const maxDeadhead = num(filters.maxDeadhead);
  const minRate = num(filters.minRate);
  const minRpm = num(filters.minRpm);
  const excluded = parseExcludeStates(filters.excludeStates);

  const anyDeadheadData = (loads || []).some(l => num(l.deadheadMiles) > 0);

  return (loads || []).filter(l => {
    const miles = num(l.miles);
    const rate = num(l.rate);
    const rpm = getRPM(l);
    const dh = num(l.deadheadMiles);

    const oSt = parseState(l.origin);
    const dSt = parseState(l.destination);

    if (excluded.size && (excluded.has(oSt) || excluded.has(dSt))) return false;

    if (maxMiles > 0 && miles > maxMiles) return false;
    if (minMiles > 0 && miles < minMiles) return false;

    if (minRate > 0 && rate < minRate) return false;
    if (minRpm > 0 && rpm < minRpm) return false;

    // Deadhead filter only works if we actually have deadhead data
    if (maxDeadhead > 0 && anyDeadheadData) {
      if (dh > maxDeadhead) return false;
    }

    return true;
  });
}

// ---------- saved loads ----------
async function getSavedLoads() {
  const data = await chrome.storage.local.get(SAVED_KEY);
  return dedupeLoads(data[SAVED_KEY] || []);
}

async function saveOneLoad(loadObj) {
  const saved = await getSavedLoads();
  const merged = dedupeLoads([...saved, loadObj]);
  await chrome.storage.local.set({ [SAVED_KEY]: merged });
  return merged.length;
}

async function clearSaved() {
  await chrome.storage.local.set({ [SAVED_KEY]: [] });
}

function csvEscape(v) {
  const s = safe(v).replace(/"/g, '""').replace(/\r?\n/g, " ");
  return `"${s}"`;
}

async function exportSavedCSV() {
  const saved = await getSavedLoads();
  if (!saved.length) {
    toast("No saved loads to export.", true);
    return;
  }

  const headers = [
    "Origin","Destination","Rate","RPM","Miles","DeadheadMiles","Equipment",
    "Company","Phone","Email","PickupDate","CreditScore","DaysToPay","Weight"
  ];

  const rows = saved.map(l => ([
    l.origin, l.destination, l.rate, getRPM(l).toFixed(2), l.miles, l.deadheadMiles,
    l.equipment, l.company, l.phone, l.email, l.pickupDate, l.creditScore, l.daysToPay, l.weight
  ]).map(csvEscape).join(","));

  const csv = "\ufeff" + [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const a = document.createElement("a");
  a.href = url;
  a.download = `loadex_saved_${stamp}.csv`;
  a.click();

  URL.revokeObjectURL(url);
  toast("Exported saved CSV ✅", false);
}

// ---------- UI (panel) ----------
let host, shadow, launcher;
let panelHidden = false;
let toastTimer = null;

function ensureUI() {
  if (host) return;

  host = document.createElement("div");
  host.style.position = "fixed";
  host.style.right = "12px";
  host.style.bottom = "12px";
  host.style.zIndex = "2147483647";
  host.style.width = "460px";
  host.style.maxWidth = "92vw";

  shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
    <style>
      .card { font-family: Arial, sans-serif; background:#fff; border:1px solid #ddd; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,.15); overflow:hidden; }
      .head { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:#1a73e8; color:#fff; }
      .title { font-weight:700; font-size:13px; }
      .sub { font-size:11px; opacity:.9; margin-top:2px; }
      .btn { border:none; background:rgba(255,255,255,.2); color:#fff; padding:6px 10px; border-radius:8px; cursor:pointer; }
      .btn:hover { background:rgba(255,255,255,.3); }

      .body { padding:10px 12px; max-height: 60vh; overflow:auto; }

      .filters {
        border:1px solid #eee; border-radius:12px; padding:10px; background:#fafafa; margin-bottom:10px;
      }
      .row { display:flex; gap:8px; flex-wrap:wrap; }
      .in {
        width:130px; padding:7px 10px; border-radius:10px;
        border:1px solid #d0d7de; background:#fff; font-size:12px;
      }
      .wide { width:200px; }
      .chip {
        border:1px solid #d0d7de; background:#fff; border-radius:999px;
        padding:6px 10px; font-size:12px; cursor:pointer;
      }
      .chip:hover { background:#f1f3f4; }
      .hint { font-size:11px; color:#777; margin-top:6px; }

      .meta { font-size:12px; color:#444; margin:8px 0; }

      .item { border:1px solid #eee; border-radius:12px; padding:10px; margin-bottom:10px; }
      .route { font-weight:700; font-size:12px; margin-bottom:6px; }
      .line { font-size:11px; color:#333; margin-top:3px; }
      .muted { color:#777; font-size:11px; }

      .actions { display:flex; gap:8px; margin-top:10px; }
      .save { flex:1; border:none; padding:9px; border-radius:10px; cursor:pointer; background:#2e7d32; color:#fff; font-weight:700; }
      .save:hover { background:#1b5e20; }
      .ghost { flex:1; border:1px solid #ddd; padding:9px; border-radius:10px; cursor:pointer; background:#f5f5f5; }
      .ghost:hover { background:#eee; }

      .footer { display:flex; gap:8px; margin-top:8px; }
      .footer button { flex:1; }

      .toast { font-size:11px; margin-top:8px; color:#0b6; }
      .err { color:#b00020; }
    </style>

    <div class="card" id="panel">
      <div class="head">
        <div>
          <div class="title">DAT Load Helper</div>
          <div class="sub" id="counts">Captured: 0 | Showing: 0 | Saved: 0</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn" id="min">Min</button>
          <button class="btn" id="close">Close</button>
        </div>
      </div>

      <div class="body" id="body">
        <div class="filters">
          <div class="row">
            <input class="in" id="maxMiles" placeholder="Max Miles" />
            <input class="in" id="minMiles" placeholder="Min Miles" />
            <input class="in" id="maxDeadhead" placeholder="Max Deadhead" />
            <input class="in" id="minRate" placeholder="Min Rate (e.g. 2000)" />
            <input class="in" id="minRpm" placeholder="Min RPM" />
            <input class="in wide" id="excludeStates" placeholder="Exclude States (CA,NY)" />
            <button class="chip" id="reset">reset</button>
          </div>
          <div class="hint" id="deadheadHint"></div>
        </div>

        <div class="meta" id="meta">Waiting for loads…</div>
        <div id="list"></div>

        <div class="footer">
          <button class="ghost" id="export">Export Saved (CSV)</button>
          <button class="ghost" id="clear">Clear Saved</button>
        </div>

        <div class="toast" id="toast"></div>
      </div>
    </div>
  `;

  // launcher pill (so close never "loses" it)
  launcher = document.createElement("div");
  launcher.style.position = "fixed";
  launcher.style.right = "12px";
  launcher.style.bottom = "12px";
  launcher.style.zIndex = "2147483647";
  launcher.style.background = "#1a73e8";
  launcher.style.color = "white";
  launcher.style.padding = "10px 12px";
  launcher.style.borderRadius = "999px";
  launcher.style.boxShadow = "0 10px 30px rgba(0,0,0,.2)";
  launcher.style.fontFamily = "Arial, sans-serif";
  launcher.style.fontSize = "12px";
  launcher.style.cursor = "pointer";
  launcher.style.display = "none";
  launcher.textContent = "DAT Load Helper";

  launcher.onclick = () => showPanel();

  document.documentElement.appendChild(host);
  document.documentElement.appendChild(launcher);

  // buttons
  shadow.getElementById("min").onclick = () => {
    const body = shadow.getElementById("body");
    body.style.display = body.style.display === "none" ? "block" : "none";
  };

  shadow.getElementById("close").onclick = () => {
    hidePanel();
  };

  shadow.getElementById("export").onclick = exportSavedCSV;
  shadow.getElementById("clear").onclick = async () => {
    await clearSaved();
    toast("Saved loads cleared ✅", false);
    render();
  };

  shadow.getElementById("reset").onclick = async () => {
    filters = { maxMiles:"", minMiles:"", maxDeadhead:"", minRate:"", minRpm:"", excludeStates:"" };
    await saveFilters();
    syncInputs(true);
    render();
    toast("Filters reset ✅", false);
  };

  // inputs
  const onInput = debounce(async () => {
    filters.maxMiles = shadow.getElementById("maxMiles").value.trim();
    filters.minMiles = shadow.getElementById("minMiles").value.trim();
    filters.maxDeadhead = shadow.getElementById("maxDeadhead").value.trim();
    filters.minRate = shadow.getElementById("minRate").value.trim();
    filters.minRpm = shadow.getElementById("minRpm").value.trim();
    filters.excludeStates = shadow.getElementById("excludeStates").value.trim();
    await saveFilters();
    render();
  }, 120);

  ["maxMiles","minMiles","maxDeadhead","minRate","minRpm","excludeStates"].forEach(id => {
    shadow.getElementById(id).addEventListener("input", onInput);
  });
}

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function showPanel() {
  ensureUI();
  panelHidden = false;
  shadow.getElementById("panel").style.display = "block";
  launcher.style.display = "none";
  render();
}

function hidePanel() {
  ensureUI();
  panelHidden = true;
  shadow.getElementById("panel").style.display = "none";
  launcher.style.display = "block";
  launcher.textContent = `DAT Load Helper • ${capturedLoads.length} captured`;
}

function toast(msg, isErr) {
  ensureUI();
  const el = shadow.getElementById("toast");
  el.textContent = msg || "";
  el.className = "toast" + (isErr ? " err" : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.textContent = ""; el.className = "toast"; }, 2200);
}

function syncInputs(force) {
  if (!force) return;
  shadow.getElementById("maxMiles").value = filters.maxMiles;
  shadow.getElementById("minMiles").value = filters.minMiles;
  shadow.getElementById("maxDeadhead").value = filters.maxDeadhead;
  shadow.getElementById("minRate").value = filters.minRate;
  shadow.getElementById("minRpm").value = filters.minRpm;
  shadow.getElementById("excludeStates").value = filters.excludeStates;
}

async function render() {
  if (!shadow || panelHidden) return;

  const listEl = shadow.getElementById("list");
  const metaEl = shadow.getElementById("meta");
  const countsEl = shadow.getElementById("counts");
  const deadheadHint = shadow.getElementById("deadheadHint");

  const filtered = applyFilters(capturedLoads);
  const saved = await getSavedLoads();

  const anyDeadheadData = capturedLoads.some(l => num(l.deadheadMiles) > 0);
  deadheadHint.textContent = anyDeadheadData
    ? "Deadhead filter: active ✅"
    : "Deadhead filter: DAT didn’t provide deadhead miles (we’ll add it later).";

  const t = lastCapturedAt ? new Date(lastCapturedAt).toLocaleString() : "—";
  metaEl.textContent = `Updated: ${t} | Showing first 20 filtered loads`;

  countsEl.textContent = `Captured: ${capturedLoads.length} | Showing: ${filtered.length} | Saved: ${saved.length}`;

  listEl.innerHTML = "";
  const show = filtered.slice(0, 20);

  for (const l of show) {
    const rpm = getRPM(l);
    const dh = num(l.deadheadMiles);

    const item = document.createElement("div");
    item.className = "item";
    item.innerHTML = `
      <div class="route">${safe(l.origin)} → ${safe(l.destination)}</div>
      <div class="line">💰 $${formatMoney(l.rate)} | RPM $${rpm.toFixed(2)}/mi | ${safe(l.miles)} mi${dh ? ` | DH ${dh} mi` : ""}</div>
      <div class="line muted">🏢 ${safe(l.company)} | 📞 ${safe(l.phone) || "N/A"} | ✉️ ${safe(l.email) || "N/A"}</div>
      <div class="actions">
        <button class="save">Save this load</button>
        <button class="ghost">Copy</button>
      </div>
    `;

    const [btnSave, btnCopy] = item.querySelectorAll("button");
    btnSave.onclick = async () => {
      const total = await saveOneLoad(l);
      toast(`Saved ✅ (total saved: ${total})`, false);
      render();
    };

    btnCopy.onclick = async () => {
      const text =
        `FROM: ${safe(l.origin)}\nTO: ${safe(l.destination)}\n` +
        `RATE: $${safe(l.rate)} | RPM: $${getRPM(l).toFixed(2)} | MILES: ${safe(l.miles)}\n` +
        `DEADHEAD: ${dh ? dh + " mi" : "N/A"}\n` +
        `COMPANY: ${safe(l.company)}\nPHONE: ${safe(l.phone)}\nEMAIL: ${safe(l.email)}\n` +
        `PICKUP: ${safe(l.pickupDate)} | CS:${safe(l.creditScore)} | DTP:${safe(l.daysToPay)}`;
      try {
        await navigator.clipboard.writeText(text);
        toast("Copied ✅", false);
      } catch {
        toast("Clipboard blocked by browser.", true);
      }
    };

    listEl.appendChild(item);
  }

  if (filtered.length > 20) {
    const more = document.createElement("div");
    more.className = "muted";
    more.textContent = `…and ${filtered.length - 20} more`;
    listEl.appendChild(more);
  }
}

// keyboard toggle (Ctrl+Shift+L)
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.shiftKey && (e.key === "L" || e.key === "l")) {
    ensureUI();
    if (panelHidden) showPanel();
    else hidePanel();
  }
});

// ---------- capture loads from injector ----------
window.addEventListener("message", async (event) => {
  if (event.source !== window) return;
  const data = event.data;

  if (data?.type === "DAT_LOADS" && Array.isArray(data.loads)) {
    const mapped = mapResults(data.loads);
    capturedLoads = dedupeLoads(mapped);
    lastCapturedAt = new Date().toISOString();

    ensureUI();
    if (panelHidden) {
      launcher.style.display = "block";
      launcher.textContent = `DAT Load Helper • ${capturedLoads.length} captured`;
    } else {
      showPanel();
    }

    render();
  }
});

// ---------- init ----------
(async function init() {
  await loadFilters();
  ensureUI();
  syncInputs(true);
  showPanel();
})();