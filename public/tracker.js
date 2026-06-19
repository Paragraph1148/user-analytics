/*
 * tracker.js — embeddable first-party analytics tracker.
 *
 * Privacy-forward by design (see CLAUDE.md):
 *  - Honors Do Not Track and Global Privacy Control: if either is set, it collects
 *    nothing and never touches storage.
 *  - First-party session id only (localStorage primary, cookie fallback), no
 *    fingerprinting, no evercookie.
 *  - No PII: clicks are coordinates + element tag, never text or input values.
 *
 * Reliable delivery: events go through an in-memory queue, flushed by fetch on an
 * interval and by sendBeacon on page hide, with capped retry so a transient failure
 * doesn't drop events.
 *
 * Plain ES5-ish vanilla JS, no build step — drop it on any page with
 *   <script src="/tracker.js"></script>
 */
(function () {
  "use strict";

  // ---- Privacy guard: opt-out wins, decided before anything else happens. ----
  function privacyOptOut() {
    try {
      var dnt = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
      if (dnt === "1" || dnt === "yes" || dnt === 1) return true;
      if (navigator.globalPrivacyControl === true) return true;
    } catch {
      // If we can't read the signals, fail safe by collecting nothing.
      return true;
    }
    return false;
  }
  if (privacyOptOut()) return;

  // ---- Config ----
  var script = document.currentScript;
  var ENDPOINT = (script && script.getAttribute("data-endpoint")) || "/api/collect";
  var SESSION_KEY = "cf_sid";
  var SESSION_TTL = 30 * 60 * 1000; // new session after 30 min of inactivity
  var FLUSH_INTERVAL = 5000; // periodic flush cadence (ms)
  var BATCH_LIMIT = 12; // flush early once the queue reaches this size
  var MAX_RETRIES = 5;

  // ---- Session identity ----
  // url-safe id matching the server's [A-Za-z0-9_-] validation.
  function genId() {
    var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
    var bytes = new Uint8Array(21);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    var id = "";
    for (var i = 0; i < bytes.length; i++) id += alphabet[bytes[i] & 63];
    return id;
  }

  function readLocal() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (obj && typeof obj.id === "string" && typeof obj.ts === "number") return obj;
    } catch {}
    return null;
  }

  function getCookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }

  function persistSession(id, ts) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ id: id, ts: ts }));
    } catch {}
    // The cookie auto-expires after the inactivity window, so its mere presence is a
    // "session still active" signal even if localStorage was cleared.
    var secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      SESSION_KEY + "=" + encodeURIComponent(id) + "; Max-Age=" + SESSION_TTL / 1000 +
      "; Path=/; SameSite=Lax" + secure;
  }

  // Resolve the active session, reconciling the two stores so clearing either one
  // (but not both, within the window) keeps the session intact.
  function resolveSession(now) {
    var local = readLocal();
    var cookieId = getCookie(SESSION_KEY);

    var id;
    if (cookieId) {
      // Cookie present => within the inactivity window (it auto-expires). Trust it,
      // and let it heal a cleared/mismatched localStorage.
      id = cookieId;
    } else if (local && now - local.ts < SESSION_TTL) {
      // Cookie cleared but localStorage still considers the session active.
      id = local.id;
    } else {
      id = genId();
    }
    persistSession(id, now);
    return id;
  }

  var sessionId = resolveSession(Date.now());
  var lastActivity = Date.now();

  // Roll to a new session after inactivity; refresh activity otherwise.
  function ensureSession() {
    var now = Date.now();
    if (now - lastActivity > SESSION_TTL) {
      sessionId = resolveSession(now);
    }
    lastActivity = now;
    persistSession(sessionId, now);
  }

  // ---- Delivery queue ----
  var queue = [];
  var retries = 0;

  function enqueue(type, extra) {
    ensureSession();
    var ev = { sessionId: sessionId, type: type, url: location.href };
    if (extra) {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) ev[k] = extra[k];
      }
    }
    queue.push(ev);
    if (queue.length >= BATCH_LIMIT) flush(false);
  }

  function flush(useBeacon) {
    if (queue.length === 0) return;
    var batch = queue;
    queue = [];
    var body = JSON.stringify(batch);

    // On page hide, sendBeacon is the only reliable transport. The server reads the
    // raw body and parses JSON regardless of content type.
    if (useBeacon && navigator.sendBeacon) {
      var ok = false;
      try {
        ok = navigator.sendBeacon(ENDPOINT, body);
      } catch {}
      if (!ok) queue = batch.concat(queue); // requeue if the browser refused it
      return;
    }

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body,
      keepalive: true,
    })
      .then(function (res) {
        if (!res.ok) throw new Error("status " + res.status);
        retries = 0;
      })
      .catch(function () {
        // Put the batch back at the front and retry with capped exponential backoff.
        queue = batch.concat(queue);
        if (retries < MAX_RETRIES) {
          retries++;
          setTimeout(function () {
            flush(false);
          }, Math.min(1000 * Math.pow(2, retries), 30000));
        }
      });
  }

  // ---- Behavioral signal config ----
  var RAGE_COUNT = 3; // clicks ...
  var RAGE_WINDOW = 1000; // ...within this many ms...
  var RAGE_RADIUS = 30; // ...inside this px box = frustration
  var DEAD_DELAY = 700; // wait this long for a response before calling a click "dead"
  var SCROLL_THROTTLE = 250;
  var DEPTH_MILESTONES = [25, 50, 75, 100];

  // ---- Rage clicks: a burst of clicks in a tight area ----
  var recentClicks = [];
  function isRageBurst(x, y, t) {
    recentClicks.push({ t: t, x: x, y: y });
    recentClicks = recentClicks.filter(function (c) {
      return t - c.t <= RAGE_WINDOW;
    });
    var near = recentClicks.filter(function (c) {
      return Math.abs(c.x - x) <= RAGE_RADIUS && Math.abs(c.y - y) <= RAGE_RADIUS;
    });
    if (near.length >= RAGE_COUNT) {
      recentClicks = []; // reset so one burst emits a single rage signal
      return true;
    }
    return false;
  }

  // ---- Dead clicks: a click on a non-interactive element that changes nothing ----
  // Track the last DOM mutation; if a click neither mutates the page nor navigates, and
  // didn't land on something interactive, it's a "dead" click — a sign of confusion.
  var lastMutation = 0;
  try {
    var mo = new MutationObserver(function () {
      lastMutation = Date.now();
    });
    mo.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
  } catch {}

  var INTERACTIVE =
    "a,button,input,select,textarea,label,summary,details,[role=button],[role=link]," +
    "[onclick],[contenteditable],[tabindex]";
  function isInteractive(el) {
    return !!(el && el.closest && el.closest(INTERACTIVE));
  }

  // ---- Scroll depth + time on page ----
  var maxDepth = 0;
  var depthHit = {};
  var pageStart = Date.now();
  var exitSent = false;

  function scrollDepthPct() {
    var doc = document.documentElement;
    var top = window.pageYOffset || doc.scrollTop || 0;
    var winH = window.innerHeight;
    var docH = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0);
    if (docH <= winH) return 100; // page fits — fully "seen"
    return Math.min(100, Math.round(((top + winH) / docH) * 100));
  }

  // ---- Capture ----
  enqueue("page_view", { referrer: document.referrer || "" });

  // Capture phase so we see every click regardless of stopPropagation downstream.
  document.addEventListener(
    "click",
    function (e) {
      var target = e.target;
      var tag = target && target.tagName ? String(target.tagName).toLowerCase() : "";
      var x = Math.round(e.pageX);
      var y = Math.round(e.pageY);
      var vp = { vpW: window.innerWidth, vpH: window.innerHeight };
      var now = Date.now();

      // element type only — never text or values
      enqueue("click", { x: x, y: y, vpW: vp.vpW, vpH: vp.vpH, meta: { tag: tag } });

      if (isRageBurst(x, y, now)) {
        enqueue("rage_click", { x: x, y: y, vpW: vp.vpW, vpH: vp.vpH, meta: { tag: tag } });
      }

      if (!isInteractive(target)) {
        var hrefBefore = location.href;
        setTimeout(function () {
          var mutated = lastMutation >= now;
          var navigated = location.href !== hrefBefore;
          if (!mutated && !navigated) {
            enqueue("dead_click", {
              x: x,
              y: y,
              vpW: vp.vpW,
              vpH: vp.vpH,
              meta: { tag: tag },
            });
          }
        }, DEAD_DELAY);
      }
    },
    true
  );

  var scrollScheduled = false;
  window.addEventListener(
    "scroll",
    function () {
      if (scrollScheduled) return;
      scrollScheduled = true;
      setTimeout(function () {
        scrollScheduled = false;
        var pct = scrollDepthPct();
        if (pct > maxDepth) maxDepth = pct;
        for (var i = 0; i < DEPTH_MILESTONES.length; i++) {
          var m = DEPTH_MILESTONES[i];
          if (!depthHit[m] && pct >= m) {
            depthHit[m] = true;
            enqueue("scroll", { meta: { depthPct: m } }); // milestone reached
          }
        }
      }, SCROLL_THROTTLE);
    },
    { passive: true }
  );

  // Time on page: emitted once when the page is actually being left.
  function sendExit() {
    if (exitSent) return;
    exitSent = true;
    enqueue("page_exit", {
      meta: { dwellMs: Date.now() - pageStart, maxDepthPct: maxDepth },
    });
    flush(true);
  }

  // ---- Flush triggers ----
  setInterval(function () {
    flush(false);
  }, FLUSH_INTERVAL);

  // Tab hidden: flush what we have but don't end the page (the user may return).
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush(true);
  });
  // Actually leaving: record time-on-page, then flush via beacon.
  window.addEventListener("pagehide", sendExit);
})();
