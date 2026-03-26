chrome.runtime.onInstalled.addListener(() => {
  console.log("DAT Load Helper installed ✅");
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "GET_PAGE_INFO") {
    chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) return sendResponse({ ok: false, error: "No active tab" });

      try {
        const info = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_INFO" });
        sendResponse({ ok: true, hostname: info.hostname, title: info.title });
      } catch {
        sendResponse({ ok: false, error: "Open one.dat.com and refresh the tab." });
      }
    });
    return true;
  }
});