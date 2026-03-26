// dat_hover_icons.js
// Hover icons that appear RIGHT NEXT TO phone/email text (not in the corner)

(() => {
  if (window.__datHoverIconsInstalled) return;
  window.__datHoverIconsInstalled = true;

  const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
  const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;

  function cleanTel(phone) {
    return String(phone || "").trim().replace(/[^\d+]/g, "");
  }

  function makeSvg(type) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.classList.add("dh-icon");

    const path = document.createElementNS(ns, "path");
    path.setAttribute("fill", "currentColor");

    if (type === "phone") {
      path.setAttribute(
        "d",
        "M6.6 10.8c1.4 2.7 3.7 5 6.4 6.4l2.1-2.1c.3-.3.7-.4 1.1-.3 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C11.3 21 3 12.7 3 2c0-.6.4-1 1-1h3c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1L6.6 10.8z"
      );
    } else {
      path.setAttribute(
        "d",
        "M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"
      );
    }

    svg.appendChild(path);
    return svg;
  }

  function ensureStyle() {
    if (document.getElementById("dh-hover-icons-style")) return;

    const style = document.createElement("style");
    style.id = "dh-hover-icons-style";
    style.textContent = `
      /* Wrapper is inline-size so icons sit next to the text */
      .dh-wrap {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        position: relative;
        max-width: 100%;
      }

      /* Force the wrapped text to behave like inline text (prevents "corner" icons) */
      .dh-text {
        display: inline !important;
        width: auto !important;
        flex: 0 1 auto !important;
      }

      .dh-icons {
        display: inline-flex;
        gap: 4px;
        opacity: 0;
        transform: translateY(-1px);
        transition: opacity .12s ease, transform .12s ease;
      }

      /* Show icons only on hover near the text */
      .dh-wrap:hover .dh-icons {
        opacity: 1;
        transform: translateY(0);
      }

      .dh-btn {
        width: 18px;
        height: 18px;
        border: 1px solid #cfd8dc;
        border-radius: 4px;
        background: #fff;
        color: #1a73e8;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        text-decoration: none;
        cursor: pointer;
      }

      .dh-btn:hover { background: #f1f3f4; }
      .dh-icon { width: 12px; height: 12px; }
    `;
    document.documentElement.appendChild(style);
  }

  function alreadyWrapped(el) {
    return el && (el.closest?.(".dh-wrap") || el.dataset?.dhWrapped === "1");
  }

  function wrapWithIcons(el, { phone, email }) {
    if (!el || alreadyWrapped(el)) return;

    // Only wrap "simple" elements (avoid big containers)
    if (el.children && el.children.length > 0) return;

    ensureStyle();

    const wrap = document.createElement("span");
    wrap.className = "dh-wrap";

    // Insert wrapper at element position
    el.parentNode.insertBefore(wrap, el);

    // Mark text element so CSS can force it inline
    el.classList.add("dh-text");
    el.dataset.dhWrapped = "1";

    wrap.appendChild(el);

    const icons = document.createElement("span");
    icons.className = "dh-icons";

    if (phone) {
      const a = document.createElement("a");
      a.className = "dh-btn";
      a.href = `tel:${cleanTel(phone)}`;
      a.title = "Call";
      a.appendChild(makeSvg("phone"));
      icons.appendChild(a);
    }

    if (email) {
      const a = document.createElement("a");
      a.className = "dh-btn";
      a.href = `mailto:${email}`;
      a.title = "Email";
      a.appendChild(makeSvg("mail"));
      icons.appendChild(a);
    }

    if (icons.childNodes.length) wrap.appendChild(icons);
  }

  function scan(root = document) {
    // Best: mailto/tel links (exact placement)
    root.querySelectorAll('a[href^="mailto:"]').forEach(a => {
      if (alreadyWrapped(a)) return;
      const email = (a.getAttribute("href") || "").replace(/^mailto:/i, "").trim() || a.textContent.trim();
      if (email) wrapWithIcons(a, { email });
    });

    root.querySelectorAll('a[href^="tel:"]').forEach(a => {
      if (alreadyWrapped(a)) return;
      const phone = (a.getAttribute("href") || "").replace(/^tel:/i, "").trim() || a.textContent.trim();
      if (phone) wrapWithIcons(a, { phone });
    });

    // Fallback: plain text email/phone (only simple nodes)
    root.querySelectorAll("span, div, p, li").forEach(el => {
      if (alreadyWrapped(el)) return;
      if (el.children && el.children.length > 0) return;

      const text = (el.textContent || "").trim();
      if (!text) return;

      const emailMatch = text.match(EMAIL_RE);
      if (emailMatch) {
        wrapWithIcons(el, { email: emailMatch[0] });
        return;
      }

      const phoneMatch = text.match(PHONE_RE);
      if (phoneMatch) {
        wrapWithIcons(el, { phone: phoneMatch[0] });
      }
    });
  }

  // Initial scan
  const start = () => scan(document);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  // DAT is dynamic -> observe changes
  const obs = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.addedNodes && m.addedNodes.length) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1) scan(n);
        }
      }
    }
  });

  obs.observe(document.documentElement, { childList: true, subtree: true });
})();