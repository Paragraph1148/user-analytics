/*
 * tracker.js — embeddable first-party analytics tracker (v2: consent-aware).
 *
 * Privacy model:
 *  - Do Not Track / Global Privacy Control are a HARD opt-out: if set, this collects
 *    nothing and never starts, regardless of any consent choice.
 *  - Otherwise it collects nothing until the user grants `analytics` consent (read from
 *    the first-party `cf_consent` cookie a consent banner writes). It starts/stops live
 *    when consent changes, signalled by a `cf:consent` event on window.
 *  - First-party session id only (localStorage + cookie), no fingerprinting/evercookie.
 *  - No PII: clicks are coordinates + element tag, never text or input values.
 *
 * Reliable delivery: in-memory queue flushed by fetch on an interval and by sendBeacon on
 * page hide, with capped retry. Server-side enforcement re-checks consent on every request.
 *
 * Plain vanilla JS, no build step.
 */
(function () {
  "use strict";

  // ---- Hard privacy guard: DNT/GPC opt-out wins over everything, including consent. ----
  function privacyOptOut() {
    try {
      var dnt = navigator.doNotTrack || window.doNotTrack || navigator.msDoNotTrack;
      if (dnt === "1" || dnt === "yes" || dnt === 1) return true;
      if (navigator.globalPrivacyControl === true) return true;
    } catch {
      return true; // unreadable signals => fail safe
    }
    return false;
  }
  if (privacyOptOut()) return;

  // ---- Config ----
  var script = document.currentScript;
  var ENDPOINT = (script && script.getAttribute("data-endpoint")) || "/api/collect";
  var CONSENT_COOKIE = "cf_consent";
  var CONSENT_VERSION = 1;
  var SESSION_KEY = "cf_sid";
  var SESSION_TTL = 30 * 60 * 1000;
  var FLUSH_INTERVAL = 5000;
  var BATCH_LIMIT = 12;
  var MAX_RETRIES = 5;

  var RAGE_COUNT = 3;
  var RAGE_WINDOW = 1000;
  var RAGE_RADIUS = 30;
  var DEAD_DELAY = 700;
  var SCROLL_THROTTLE = 250;
  var DEPTH_MILESTONES = [25, 50, 75, 100];

  function getCookie(name) {
    var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }

  // ---- Consent: analytics permission from the first-party cf_consent cookie ----
  function analyticsConsented() {
    try {
      var o = JSON.parse(getCookie(CONSENT_COOKIE));
      return !!o && o.v === CONSENT_VERSION && o.a === true;
    } catch {
      return false;
    }
  }

  // ---- Session identity ----
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
      var obj = JSON.parse(localStorage.getItem(SESSION_KEY));
      if (obj && typeof obj.id === "string" && typeof obj.ts === "number") return obj;
    } catch {}
    return null;
  }
  function persistSession(id, ts) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ id: id, ts: ts }));
    } catch {}
    var secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      SESSION_KEY + "=" + encodeURIComponent(id) + "; Max-Age=" + SESSION_TTL / 1000 +
      "; Path=/; SameSite=Lax" + secure;
  }
  function resolveSession(now) {
    var local = readLocal();
    var cookieId = getCookie(SESSION_KEY);
    var id;
    if (cookieId) id = cookieId;
    else if (local && now - local.ts < SESSION_TTL) id = local.id;
    else id = genId();
    persistSession(id, now);
    return id;
  }

  // ---- Mutable state (initialized in start()) ----
  var sessionId = null;
  var lastActivity = 0;
  var queue = [];
  var retries = 0;
  var recentClicks = [];
  var lastMutation = 0;
  var maxDepth = 0;
  var depthHit = {};
  var pageStart = 0;
  var scrollScheduled = false;

  function ensureSession() {
    var now = Date.now();
    if (!sessionId || now - lastActivity > SESSION_TTL) sessionId = resolveSession(now);
    lastActivity = now;
    persistSession(sessionId, now);
  }

  function enqueue(type, extra) {
    if (!started) return;
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
    if (useBeacon && navigator.sendBeacon) {
      var ok = false;
      try {
        ok = navigator.sendBeacon(ENDPOINT, body);
      } catch {}
      if (!ok) queue = batch.concat(queue);
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
        queue = batch.concat(queue);
        if (retries < MAX_RETRIES) {
          retries++;
          setTimeout(function () {
            flush(false);
          }, Math.min(1000 * Math.pow(2, retries), 30000));
        }
      });
  }

  // ---- Behavioral signal helpers ----
  function isRageBurst(x, y, t) {
    recentClicks.push({ t: t, x: x, y: y });
    recentClicks = recentClicks.filter(function (c) {
      return t - c.t <= RAGE_WINDOW;
    });
    var near = recentClicks.filter(function (c) {
      return Math.abs(c.x - x) <= RAGE_RADIUS && Math.abs(c.y - y) <= RAGE_RADIUS;
    });
    if (near.length >= RAGE_COUNT) {
      recentClicks = [];
      return true;
    }
    return false;
  }

  var INTERACTIVE =
    "a,button,input,select,textarea,label,summary,details,[role=button],[role=link]," +
    "[onclick],[contenteditable],[tabindex]";
  function isInteractive(el) {
    return !!(el && el.closest && el.closest(INTERACTIVE));
  }

  function scrollDepthPct() {
    var doc = document.documentElement;
    var top = window.pageYOffset || doc.scrollTop || 0;
    var winH = window.innerHeight;
    var docH = Math.max(doc.scrollHeight, document.body ? document.body.scrollHeight : 0);
    if (docH <= winH) return 100;
    return Math.min(100, Math.round(((top + winH) / docH) * 100));
  }

  // ---- Capture handlers (named so they can be detached on consent withdrawal) ----
  function onClick(e) {
    var target = e.target;
    var tag = target && target.tagName ? String(target.tagName).toLowerCase() : "";
    var x = Math.round(e.pageX);
    var y = Math.round(e.pageY);
    var vpW = window.innerWidth;
    var vpH = window.innerHeight;
    var now = Date.now();

    enqueue("click", { x: x, y: y, vpW: vpW, vpH: vpH, meta: { tag: tag } });

    if (isRageBurst(x, y, now)) {
      enqueue("rage_click", { x: x, y: y, vpW: vpW, vpH: vpH, meta: { tag: tag } });
    }

    if (!isInteractive(target)) {
      var hrefBefore = location.href;
      setTimeout(function () {
        if (!started) return;
        var mutated = lastMutation >= now;
        var navigated = location.href !== hrefBefore;
        if (!mutated && !navigated) {
          enqueue("dead_click", { x: x, y: y, vpW: vpW, vpH: vpH, meta: { tag: tag } });
        }
      }, DEAD_DELAY);
    }
  }

  function onScroll() {
    if (scrollScheduled) return;
    scrollScheduled = true;
    setTimeout(function () {
      scrollScheduled = false;
      if (!started) return;
      var pct = scrollDepthPct();
      if (pct > maxDepth) maxDepth = pct;
      for (var i = 0; i < DEPTH_MILESTONES.length; i++) {
        var m = DEPTH_MILESTONES[i];
        if (!depthHit[m] && pct >= m) {
          depthHit[m] = true;
          enqueue("scroll", { meta: { depthPct: m } });
        }
      }
    }, SCROLL_THROTTLE);
  }

  function onVisibility() {
    if (document.visibilityState === "hidden") flush(true);
  }

  var exitSent = false;
  function sendExit() {
    if (exitSent || !started) return;
    exitSent = true;
    enqueue("page_exit", { meta: { dwellMs: Date.now() - pageStart, maxDepthPct: maxDepth } });
    flush(true);
  }

  // ---- Lifecycle: start/stop gated by consent ----
  var started = false;
  var flushTimerId = null;
  var mo = null;

  function start() {
    if (started || !analyticsConsented()) return;
    started = true;
    exitSent = false;
    maxDepth = 0;
    depthHit = {};
    recentClicks = [];
    pageStart = Date.now();

    sessionId = resolveSession(Date.now());
    lastActivity = Date.now();

    try {
      mo = new MutationObserver(function () {
        lastMutation = Date.now();
      });
      mo.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
    } catch {}

    enqueue("page_view", { referrer: document.referrer || "" });
    document.addEventListener("click", onClick, true);
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", sendExit);
    flushTimerId = setInterval(function () {
      flush(false);
    }, FLUSH_INTERVAL);
  }

  function stop() {
    if (!started) return;
    started = false;
    document.removeEventListener("click", onClick, true);
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("pagehide", sendExit);
    if (flushTimerId) {
      clearInterval(flushTimerId);
      flushTimerId = null;
    }
    if (mo) {
      try {
        mo.disconnect();
      } catch {}
      mo = null;
    }
    queue = []; // drop unsent events on withdrawal
  }

  // React to consent changes signalled by the banner, and check once on load.
  window.addEventListener("cf:consent", function () {
    if (analyticsConsented()) start();
    else stop();
  });
  if (analyticsConsented()) start();
})();
