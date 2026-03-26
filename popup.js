document.addEventListener("DOMContentLoaded", async () => {
  const siteEl = document.getElementById("site");
  const titleEl = document.getElementById("pageTitle");
  const statusEl = document.getElementById("status");

  const capturedStatusEl = document.getElementById("capturedStatus");
  const capturedListEl = document.getElementById("capturedList");

  const savedStatusEl = document.getElementById("savedStatus");
  const savedListEl = document.getElementById("savedList");

  function setStatus(text) {
    statusEl.textContent = text || "";
  }

  function safe(v) {
    return (v === null || v === undefined) ? "" : String(v);
  }

  function renderLoads(listEl, loads, limit = 10) {
    if (!loads || loads.length === 0) {
      listEl.innerHTML = `<div class="muted">No loads.</div>`;
      return;
    }

    const items = loads.slice(0, limit).map((l, i) => `
      <div class="item">
        <b>${i + 1}. ${safe(l.origin)} → ${safe(l.destination)}</b><br>
        💰 $${Number(l.rate || 0).toLocaleString()} | $${safe(l.ratePerMile)}/mi | ${safe(l.miles)} mi<br>
        🚛 ${safe(l.equipment)} | ⚖️ ${Number(l.weight || 0).toLocaleString()} lbs<br>
        🏢 ${safe(l.company)}<br>
        📞 ${safe(l.phone)} | ✉️ ${safe(l.email)}<br>
        📅 ${safe(l.pickupDate)} | CS: ${safe(l.creditScore)} | DTP: ${safe(l.daysToPay)}
      </div>
    `).join("");

    const more = loads.length > limit
      ? `<div class="muted">...and ${loads.length - limit} more loads</div>`
      : "";

    listEl.innerHTML = items + more;
  }

  function dedupeLoads(loads) {
    // simple dedupe key (good enough)
    const seen = new Set();
    const out = [];
    for (const l of loads || []) {
      const key = [
        l.origin, l.destination, l.company, l.miles, l.pickupDate, l.rate, l.equipment, l.weight
      ].map(x => safe(x)).join("|");

      if (!seen.has(key)) {
        seen.add(key);
        out.push(l);
      }
    }
    return out;
  }

  function csvEscape(value) {
    const s = safe(value).replace(/"/g, '""').replace(/\r?\n/g, " ");
    return `"${s}"`;
  }

  function exportCSV(loads) {
    if (!loads || loads.length === 0) {
      savedStatusEl.textContent = "No saved loads to export!";
      return;
    }

    const headers = [
      "Origin","Destination","Rate","Rate/Mile","Miles","Equipment",
      "Company","Phone","Email","Pickup","CreditScore","DaysToPay","Weight"
    ];

    const rows = loads.map(l => [
      l.origin, l.destination, l.rate, l.ratePerMile, l.miles, l.equipment,
      l.company, l.phone, l.email, l.pickupDate, l.creditScore, l.daysToPay, l.weight
    ].map(csvEscape).join(","));

    // BOM helps Excel open UTF-8 correctly
    const csv = "\ufeff" + [headers.join(","), ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const a = document.createElement("a");
    a.href = url;
    a.download = `dat_loads_${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    savedStatusEl.textContent = "Exported ✅";
  }

  async function loadInfo() {
    try {
      const res = await chrome.runtime.sendMessage({ type: "GET_PAGE_INFO" });
      if (res?.ok) {
        siteEl.textContent = res.hostname;
        titleEl.textContent = res.title || "";
        setStatus("Ready ✅");
      } else {
        setStatus(res?.error || "Open one.dat.com");
      }
    } catch {
      siteEl.textContent = "Unavailable";
      setStatus("Open one.dat.com");
    }
  }

  async function getTabId() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab");
    return tab.id;
  }

  async function scanCaptured() {
    capturedStatusEl.textContent = "Scanning DAT...";
    capturedListEl.innerHTML = "";

    try {
      const tabId = await getTabId();

      // Ask content.js to “scan” (meaning: use captured loads from injector)
      const scanRes = await chrome.tabs.sendMessage(tabId, { type: "SCAN_LOADS" });
      if (!scanRes?.ok) {
        capturedStatusEl.textContent = "Error: " + (scanRes?.error || "unknown");
        return;
      }

      const loadsRes = await chrome.tabs.sendMessage(tabId, { type: "GET_LOADS" });
      const loads = dedupeLoads(loadsRes?.loads || []);

      capturedStatusEl.textContent = `✅ Captured ${loads.length} loads`;
      renderLoads(capturedListEl, loads, 20);
    } catch (e) {
      capturedStatusEl.textContent = "Error: " + e.message;
    }
  }

  async function loadSaved() {
    const data = await chrome.storage.local.get("savedLoads");
    const saved = dedupeLoads(data.savedLoads || []);
    if (saved.length === 0) {
      savedStatusEl.textContent = "No loads saved yet.";
      savedListEl.innerHTML = `<div class="muted">Nothing saved.</div>`;
      return;
    }
    savedStatusEl.textContent = `Saved: ${saved.length} loads ✅`;
    renderLoads(savedListEl, saved, 10);
  }

  async function saveCapturedToStorage() {
    savedStatusEl.textContent = "Saving captured loads...";
    try {
      const tabId = await getTabId();
      const loadsRes = await chrome.tabs.sendMessage(tabId, { type: "GET_LOADS" });
      const loads = dedupeLoads(loadsRes?.loads || []);

      await chrome.storage.local.set({ savedLoads: loads });
      savedStatusEl.textContent = `Saved: ${loads.length} loads ✅`;
      renderLoads(savedListEl, loads, 10);
    } catch (e) {
      savedStatusEl.textContent = "Save error: " + e.message;
    }
  }

  async function clearSaved() {
    await chrome.storage.local.set({ savedLoads: [] });
    savedStatusEl.textContent = "Cleared 🗑️";
    savedListEl.innerHTML = `<div class="muted">Nothing saved.</div>`;
  }

  document.getElementById("btnScan").addEventListener("click", scanCaptured);
  document.getElementById("btnSave").addEventListener("click", saveCapturedToStorage);
  document.getElementById("btnClear").addEventListener("click", clearSaved);
  document.getElementById("btnExport").addEventListener("click", async () => {
    const data = await chrome.storage.local.get("savedLoads");
    exportCSV(dedupeLoads(data.savedLoads || []));
  });

  await loadInfo();
  await loadSaved();
});