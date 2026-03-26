(() => {
  if (window.__datInjectorInstalled) return;
  window.__datInjectorInstalled = true;

  console.log("DAT INJECTOR LOADED ✅");

  function looksLikeLoad(x) {
    return x && typeof x === "object" && x.assetInfo && x.posterInfo;
  }

  function findResults(obj, maxDepth = 5) {
    const direct = obj?.data?.freightSearchV4?.findLoads?.results;
    if (Array.isArray(direct) && direct.some(looksLikeLoad)) return direct;

    const seen = new Set();
    function walk(node, depth) {
      if (!node || depth > maxDepth) return null;
      if (typeof node === "object") {
        if (seen.has(node)) return null;
        seen.add(node);
      }

      if (Array.isArray(node)) {
        if (node.length && node.some(looksLikeLoad)) return node;
        for (const v of node) {
          const hit = walk(v, depth + 1);
          if (hit) return hit;
        }
        return null;
      }

      if (typeof node === "object") {
        for (const k of Object.keys(node)) {
          const hit = walk(node[k], depth + 1);
          if (hit) return hit;
        }
      }
      return null;
    }

    return walk(obj, 0);
  }

  function postLoads(data) {
    try {
      const results = findResults(data);
      if (results && results.length) {
        console.log("DAT LOADS FOUND:", results.length);
        window.postMessage({ type: "DAT_LOADS", loads: results }, "*");
      }
    } catch {}
  }

  // ---- fetch hook ----
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      if (url.includes("graphql")) {
        const clone = res.clone();
        clone.json().then(postLoads).catch(() => {});
      }
    } catch {}
    return res;
  };

  // ---- XHR hook ----
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__datUrl = url || "";
    return origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    try {
      this.addEventListener("load", () => {
        try {
          if (!String(this.__datUrl || "").includes("graphql")) return;
          const text = this.responseText;
          if (!text || text[0] !== "{") return;
          postLoads(JSON.parse(text));
        } catch {}
      });
    } catch {}
    return origSend.apply(this, args);
  };
})();