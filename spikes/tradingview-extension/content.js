// DG spike: can we hold a TradingView order click, show the popup, then let it through?
// Answers SPEC §17 Q1a (hold) and Q1b (replay). Throwaway code, not product code.
(() => {
  const DEFAULTS = {
    mode: 'log',        // 'log' records clicks, 'pick' adds the clicked control to the guarded list, 'hold' shows the popup
    waitSeconds: 5,
    replay: false,      // dropped from the product (SPEC 7.5): the trader clicks Buy/Sell once more
    selectors: '',      // one CSS selector per line (filled by pick mode)
    textMatch: false    // also guard any button whose text starts with Buy or Sell
  };
  const LOG_KEY = 'dgLog';
  const CLOSE_MARKERS = /\b(close|flatten|cancel|reduce|modify|exit)\b/i;
  const POINTER_EVENTS = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'touchstart', 'touchend'];

  let cfg = { ...DEFAULTS };
  chrome.storage.local.get(DEFAULTS, v => { cfg = v; });
  chrome.storage.onChanged.addListener(changes => {
    for (const k in changes) if (k in DEFAULTS) cfg[k] = changes[k].newValue;
  });

  // ---------- log ----------
  const pending = [];
  let flushTimer = null;
  function log(entry) {
    entry.t = new Date().toISOString();
    entry.frame = window === window.top ? 'top' : location.href.slice(0, 80);
    console.debug('[DG spike]', entry);
    pending.push(entry);
    clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      const items = pending.splice(0);
      chrome.storage.local.get({ [LOG_KEY]: [] }, v => {
        chrome.storage.local.set({ [LOG_KEY]: v[LOG_KEY].concat(items).slice(-500) });
      });
    }, 300);
  }

  function describe(el, withText) {
    const d = { tag: el.tagName.toLowerCase() };
    const dn = el.getAttribute('data-name');
    const aria = el.getAttribute('aria-label');
    const cls = typeof el.className === 'string' ? el.className.slice(0, 80) : '';
    if (dn) d.dataName = dn;
    if (aria) d.aria = aria;
    if (cls) d.cls = cls;
    if (withText && el.childElementCount < 20) {
      const t = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
      if (t) d.text = t;
    }
    return d;
  }
  const pathInfo = e => e.composedPath().filter(n => n instanceof Element).slice(0, 6).map((el, i) => describe(el, i < 3));

  // ---------- which clicks are guarded ----------
  function selectorList() {
    return (cfg.selectors || '').split('\n').map(s => s.trim()).filter(Boolean);
  }
  function notClose(el) {
    return CLOSE_MARKERS.test((el.innerText || '').trim()) ? null : el; // invariant 1: closing is never held
  }
  function guardedFromPath(e) {
    const sels = selectorList();
    for (const n of e.composedPath()) {
      if (!(n instanceof Element)) continue;
      if (n === document.body) break;
      for (const s of sels) {
        try { if (n.matches(s)) return notClose(n); } catch { /* bad selector */ }
      }
      if (cfg.textMatch && (n.tagName === 'BUTTON' || n.getAttribute('role') === 'button')
          && /^(buy|sell)\b/i.test((n.innerText || '').trim())) return notClose(n);
    }
    return null;
  }
  // Enter inside an order-panel field: find the guarded submit button near the field.
  function guardedFromEnter(e) {
    const sels = selectorList();
    if (!sels.length) return null;
    let n = e.target instanceof Element ? e.target : null;
    for (let i = 0; n && i < 12; i++, n = n.parentElement) {
      for (const s of sels) {
        try { const b = n.querySelector(s); if (b) return notClose(b); } catch { /* bad selector */ }
      }
    }
    return null;
  }

  // ---------- popup UI (closed shadow root, modal dialog) ----------
  const host = document.createElement('dg-spike');
  let root = null, dlg = null, toastEl = null;
  function ensureUI() {
    if (root) return;
    root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        dialog { width: 360px; border: 0; border-radius: 12px; padding: 20px; font: 14px/1.4 system-ui, sans-serif;
                 background: #fff; color: #111; box-shadow: 0 12px 40px rgba(0,0,0,.35); }
        dialog.dark { background: #1e222d; color: #e6e6e6; }
        dialog::backdrop { background: rgba(0,0,0,.45); }
        .label { font-size: 11px; letter-spacing: .08em; opacity: .6; }
        .head { font-size: 17px; font-weight: 600; margin: 6px 0 10px; }
        .order { font-size: 13px; opacity: .75; margin-bottom: 12px; }
        .bar { height: 4px; background: rgba(127,127,127,.25); border-radius: 2px; overflow: hidden; margin-bottom: 14px; }
        .bar i { display: block; height: 100%; width: 0; background: #2962ff; }
        .row { display: flex; gap: 8px; }
        button { flex: 1; padding: 10px; border-radius: 8px; border: 1px solid rgba(127,127,127,.4);
                 background: transparent; color: inherit; font: inherit; cursor: pointer; }
        button.primary { background: #2962ff; border-color: #2962ff; color: #fff; }
        button:disabled { opacity: .45; cursor: default; }
        .foot { font-size: 11px; opacity: .6; margin-top: 12px; }
        .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 2147483647;
                 background: #111; color: #fff; padding: 8px 14px; border-radius: 8px; font: 13px system-ui, sans-serif; display: none; }
      </style>
      <dialog>
        <div class="label">PAUSE · SPIKE</div>
        <div class="head">Check your plan before this trade.</div>
        <div class="order"></div>
        <div class="bar"><i></i></div>
        <div class="row main">
          <button class="primary skip">Skip this trade</button>
          <button class="place" disabled>Place anyway</button>
        </div>
        <div class="row confirm" style="display:none">
          <button class="sent">Order went through</button>
          <button class="notsent">Nothing happened</button>
        </div>
        <div class="foot">Spike test. Closing a position is never held.</div>
      </dialog>
      <div class="toast"></div>`;
    dlg = root.querySelector('dialog');
    toastEl = root.querySelector('.toast');
    for (const t of ['keydown', 'keyup', 'keypress']) host.addEventListener(t, ev => ev.stopPropagation());
    root.querySelector('.skip').addEventListener('click', () => closePause('skip'));
    root.querySelector('.place').addEventListener('click', onPlaceAnyway);
    root.querySelector('.sent').addEventListener('click', () => finishConfirm('sent'));
    root.querySelector('.notsent').addEventListener('click', () => finishConfirm('not_sent'));
    dlg.addEventListener('cancel', ev => { ev.preventDefault(); if (state) closePause('skip_esc'); });
  }
  function mountHost() {
    if (!host.isConnected) document.documentElement.appendChild(host);
  }
  function toast(msg, ms = 2500) {
    ensureUI(); mountHost();
    toastEl.textContent = msg;
    toastEl.style.display = 'block';
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { toastEl.style.display = 'none'; }, ms);
  }

  // ---------- pause flow ----------
  let state = null;   // open pause: { el, openedAt, waitMs, timer, trigger }
  let pass = null;    // one-time pass after Place anyway: { el, until, replaying }

  function openPause(el, e) {
    ensureUI(); mountHost();
    const waitMs = Math.max(0, Math.min(60, Number(cfg.waitSeconds) || 0)) * 1000;
    state = { el, openedAt: performance.now(), waitMs, trigger: e.type, target: describe(el, true) };
    dlg.classList.toggle('dark', document.documentElement.classList.contains('theme-dark'));
    root.querySelector('.order').textContent = `Held: ${state.target.text || state.target.dataName || state.target.tag}`;
    root.querySelector('.main').style.display = 'flex';
    root.querySelector('.confirm').style.display = 'none';
    const place = root.querySelector('.place');
    place.disabled = waitMs > 0;
    dlg.showModal();
    root.querySelector('.skip').focus();
    state.timer = setInterval(tick, 100);
    tick();
    log({ kind: 'pause_open', trigger: e.type, trusted: e.isTrusted, target: state.target, waitMs });
  }
  function tick() {
    if (!state) return;
    const elapsed = performance.now() - state.openedAt;
    const left = Math.max(0, state.waitMs - elapsed);
    const place = root.querySelector('.place');
    root.querySelector('.bar i').style.width = state.waitMs ? `${100 - (left / state.waitMs) * 100}%` : '100%';
    place.textContent = left > 0 ? `Place anyway · ${Math.ceil(left / 1000)}` : 'Place anyway';
    place.disabled = left > 0;
    if (elapsed > 120000) closePause('timeout');
  }
  function closePause(decision) {
    if (!state) return;
    clearInterval(state.timer);
    log({ kind: 'pause_close', decision, shownMs: Math.round(performance.now() - state.openedAt) });
    state = null;
    dlg.close();
  }
  function onPlaceAnyway(ev) {
    if (!state) return;
    if (!ev.isTrusted || ev.detail === 0) { log({ kind: 'place_ignored', why: 'not a real pointer click' }); return; }
    const elapsed = performance.now() - state.openedAt;
    if (elapsed < state.waitMs) { log({ kind: 'place_ignored', why: 'before unlock', atMs: Math.round(elapsed) }); return; }
    const el = state.el;
    clearInterval(state.timer);
    log({ kind: 'pause_close', decision: 'place', shownMs: Math.round(elapsed), replay: cfg.replay });
    state = null;
    if (cfg.replay) {
      dlg.close();
      replayClick(el);
    } else {
      dlg.close();
      pass = { el, until: performance.now() + 10000, replaying: false };
      toast('Now click the button once more to place the order (10 s).', 10000);
      askOutcomeLater();
    }
  }
  function replayClick(el) {
    // Q1b: re-find the control and replay a full click sequence on it.
    if (!el.isConnected) { log({ kind: 'replay_failed', why: 'control no longer in page' }); toast('Control disappeared. Click it again.'); return; }
    pass = { el, until: performance.now() + 3000, replaying: true };
    const r = el.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, composed: true, view: window,
                   clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0, buttons: 1 };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', { ...opts, buttons: 0, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('click', { ...opts, buttons: 0, detail: 1 }));
    pass = null;
    log({ kind: 'replay_done' });
    askOutcomeLater();
  }
  // The spike asks the tester whether the order really went out: that is the Q1a/Q1b answer.
  function askOutcomeLater() {
    setTimeout(() => {
      ensureUI(); mountHost();
      root.querySelector('.head').textContent = 'Did the order go through?';
      root.querySelector('.order').textContent = 'Check the Orders / Positions panel, then answer.';
      root.querySelector('.bar i').style.width = '0';
      root.querySelector('.main').style.display = 'none';
      root.querySelector('.confirm').style.display = 'flex';
      if (!dlg.open) dlg.showModal();
    }, cfg.replay ? 1500 : 11000);
  }
  function finishConfirm(outcome) {
    log({ kind: 'outcome', outcome, replay: cfg.replay });
    dlg.close();
    root.querySelector('.head').textContent = 'Check your plan before this trade.';
  }

  // ---------- the capture listener ----------
  function onEvent(e) {
    if (e.composedPath().includes(host)) return;

    if (cfg.mode === 'pick') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.type !== 'click') return;
      const n = e.composedPath().find(x => x instanceof Element && x.hasAttribute('data-name'));
      if (!n) { toast('No data-name on this control. Send me the log instead.'); log({ kind: 'pick_failed', path: pathInfo(e) }); return; }
      const sel = `[data-name="${n.getAttribute('data-name')}"]`;
      const list = selectorList();
      if (!list.includes(sel)) list.push(sel);
      chrome.storage.local.set({ selectors: list.join('\n') });
      toast(`Guarded: ${sel}`);
      log({ kind: 'picked', sel, el: describe(n, true) });
      return;
    }

    const isEnter = e.type === 'keydown' && e.key === 'Enter';
    if (e.type === 'keydown' && !isEnter) return;
    const el = isEnter ? guardedFromEnter(e) : guardedFromPath(e);

    if (cfg.mode === 'log') {
      if (e.type === 'pointerdown' || e.type === 'click' || isEnter) {
        log({ kind: 'event', type: e.type, trusted: e.isTrusted, guarded: !!el, path: pathInfo(e) });
      }
      return;
    }

    // hold mode
    if (!el) return;
    if (pass && pass.el === el && performance.now() < pass.until) {
      if (e.type === 'click' && !pass.replaying) {
        log({ kind: 'second_click_passed' });
        pass = null;
      }
      return; // let it through
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!state) openPause(el, e);
    else log({ kind: 'held_while_open', type: e.type });
  }

  for (const t of [...POINTER_EVENTS, 'keydown']) window.addEventListener(t, onEvent, { capture: true });
})();
