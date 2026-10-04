// The first-run window (EXPERIENCE §7.1): sign in → we found your MetaTrader → Protect → done.
// The tray reopens it on a given screen through the "screen" event.
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const el = document.getElementById('screen');
let screen = '';
let poll = null;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Line icons (24×24, drawn in currentColor), the same set as the web app.
const svg = (d, size = 18, sw = 1.8) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  shieldCheck: (s, w) => svg('<path d="M12 3 5 6v5.5c0 4.4 2.9 7.9 7 9.5 4.1-1.6 7-5.1 7-9.5V6l-7-3Z"/><path d="m9 12 2.2 2.2L15.5 10"/>', s, w),
  pause: (s, w) => svg('<rect x="7" y="5" width="3.6" height="14" rx="1.2"/><rect x="13.4" y="5" width="3.6" height="14" rx="1.2"/>', s, w),
  window: (s, w) => svg('<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M3 9h18"/>', s, w),
  check: (s, w) => svg('<path d="m5 12.5 4.5 4.5L19 7.5"/>', s, w),
  alert: (s, w) => svg('<path d="M10.3 4.3 2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z"/><path d="M12 9.5v4"/><path d="M12 17h.01"/>', s, w),
  globe: (s, w) => svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5s1.2-6.1 3.5-8.5Z"/>', s, w),
  folder: (s, w) => svg('<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/>', s, w),
  refresh: (s, w) => svg('<path d="M19.5 8A8 8 0 0 0 5 7.5M4.5 16a8 8 0 0 0 14.5.5"/><path d="M19.5 3.5V8H15M4.5 20.5V16H9"/>', s, w),
};

function hero(icon, tone = '') {
  const badge = icon ? `<span class="badge ${tone}">${icon}</span>` : '<img class="logo" src="mark.svg" alt="">';
  return `<div class="hero" aria-hidden="true"><span class="ring"></span><span class="ring r2"></span>${badge}</div>`;
}

function pick(v) {
  if (!v.signedIn) return 'signin';
  const prot = v.rows.filter((r) => r.protected);
  if (!prot.length) return 'found';
  // Still setting up: never connected yet, or waiting on a restart, a chart or Algo Trading. A MetaTrader that
  // connected before and is now just closed is not setting up.
  if (prot.some((r) => !r.linked || r.status === 'setting_up' || r.status === 'needs_attention')) return 'result';
  return 'found';
}

async function show(name) {
  clearInterval(poll);
  const v = await invoke('view');
  screen = name || pick(v);
  if (screen === 'restart') screen = 'result';
  ({ signin, found, result, done })[screen](v);
}

function signin(_v, error = '') {
  el.innerHTML = `
    ${hero()}
    <div class="center">
      <h1>Sign in to DisciplineGuard</h1>
      <p class="muted">Press <strong>Allow</strong> in your browser.</p>
      ${error ? `<p class="warn">${esc(error)}</p>` : ''}
    </div>
    <ul class="promises">
      <li>${ICON.shieldCheck(16)}<span>Closing a trade is never paused.</span></li>
      <li>${ICON.shieldCheck(16)}<span>Trades that keep your rules go straight through. We never make an order wait for our server.</span></li>
      <li>${ICON.shieldCheck(16)}<span>We never see your broker password, and we never open, change or close a trade unless you click to do it or turn on Close outside trades.</span></li>
    </ul>
    <div class="actions"><button class="primary" id="go">${ICON.globe(16)} Continue in browser</button></div>`;
  document.getElementById('go').onclick = async (e) => {
    e.currentTarget.disabled = true;
    e.currentTarget.textContent = 'Waiting for Allow…';
    try {
      await invoke('sign_in');
      show('found');
    } catch (err) {
      signin(_v, err);
    }
  };
}

function found(v, error = '') {
  const open = v.rows.filter((r) => !r.protected);
  const prot = v.rows.filter((r) => r.protected);
  const row = (r) => `
    <label class="row">
      <input type="checkbox" value="${esc(r.id)}" ${r.dismissed ? '' : 'checked'}>
      <span class="tile">${ICON.window(18)}</span>
      <span class="grow"><span class="name">${esc(r.name)}</span><span class="folder">${esc(r.folder)}</span></span>
    </label>`;
  const protRow = (r) => `
    <div class="row">
      <span class="tile accent">${ICON.shieldCheck(18)}</span>
      <span class="grow"><span class="name">${esc(r.name)}</span><span class="folder">${esc(r.folder)}</span></span>
      <span class="chip">${esc(r.reason)}</span>
    </div>`;
  const none = !open.length && !prot.length;
  el.innerHTML = `
    ${none ? hero(ICON.window(28, 2)) : ''}
    <h1 class="${none ? 'center' : ''}">${open.length ? 'We found your MetaTrader' : prot.length ? 'Your MetaTrader' : 'No MetaTrader 5 found yet'}</h1>
    ${none ? '<p class="muted center">Open MetaTrader 5 once, or pick its folder.</p>' : open.length ? '<p class="muted">Tick the ones you trade on.</p>' : ''}
    ${open.length ? `<div class="list">${open.map(row).join('')}</div>` : ''}
    ${prot.length ? `<p class="label">Protected</p><div class="list">${prot.map(protRow).join('')}</div>
      <p class="muted small">To remove protection, use <button class="link" id="devices">Devices</button> on the website.</p>` : ''}
    ${none ? '' : `<p class="muted small">Don't see it? <button class="link" id="browse">Browse</button></p>`}
    ${!v.canProtect ? '<p class="warn">This copy can\'t set up MetaTrader. Download it again.</p>' : ''}
    ${error ? `<p class="warn">${esc(error)}</p>` : ''}
    <div class="actions">
      ${prot.length ? '<button id="close">Close</button>' : ''}
      ${!open.length && prot.some((r) => r.status === 'not_running') ? `<button class="primary" id="openmt">${ICON.window(16)} Open MetaTrader</button>` : ''}
      ${open.length ? `<button class="primary" id="protect" ${v.canProtect ? '' : 'disabled'}>${ICON.shieldCheck(16)} Protect</button>` : ''}
      ${none ? `<button class="primary" id="browse">${ICON.folder(16)} Pick its folder</button>` : ''}
    </div>`;
  const on = (id, f) => document.getElementById(id) && (document.getElementById(id).onclick = f);
  on('devices', () => invoke('open_web', { page: 'devices' }));
  on('close', () => invoke('hide'));
  on('openmt', openMt);
  on('browse', async () => {
    try {
      await invoke('browse');
      show('found');
    } catch (err) {
      found(v, err);
    }
  });
  on('protect', async (e) => {
    e.currentTarget.disabled = true;
    const ticked = [...el.querySelectorAll('input[type=checkbox][value]')].filter((c) => c.checked).map((c) => c.value);
    try {
      await invoke('protect', { ticked });
      show(ticked.length ? 'result' : 'found');
    } catch (err) {
      found(await invoke('view'), err);
    }
  });
}

function result(v, stuck = []) {
  const prot = v.rows.filter((r) => r.protected);
  const step = (state, label) => `<div class="step ${state}"><span class="st">${state === 'ok' ? ICON.check(13, 2.6) : state === 'bad' ? ICON.alert(13, 2.2) : ''}</span><span>${label}</span></div>`;
  const algo = (r) => (r.algoOn === false ? step('bad', 'Algo Trading is off: click Algo Trading once in MetaTrader') : step(r.algoOn ? 'ok' : 'wait', 'Algo Trading on'));
  const waiting = prot.some((r) => r.restartNeeded);
  const allOn = prot.length && prot.every((r) => r.connected && !r.restartNeeded && r.algoOn !== false);
  const closed = prot.some((r) => r.status === 'not_running');
  el.innerHTML = `
    ${hero(allOn ? ICON.shieldCheck(30, 2) : waiting ? ICON.refresh(28, 2) : ICON.window(28, 2), waiting ? 'amber' : '')}
    <h1 class="center">${allOn ? 'Protected' : 'Setting up'}</h1>
    <div class="list">
      ${prot.map((r) => `
        <div class="row">
          <span class="grow"><span class="name">${esc(r.name)}</span>
            <span class="steps">${step(r.installed ? 'ok' : 'wait', 'Installed')}${algo(r)}${step(r.connected ? 'ok' : 'wait', 'Connected')}</span>
          </span>
        </div>`).join('')}
    </div>
    ${waiting ? `<div class="notice amber">MetaTrader needs a quick restart to finish. Open trades aren't affected.</div>
      ${stuck.length ? `<p class="warn">${esc(stuck.join(', '))} didn't close. Close any MetaTrader dialog and try again.</p>` : ''}
      <div class="actions"><button id="later">Next time I open it</button><button class="primary" id="restart">${ICON.refresh(16)} Restart MetaTrader</button></div>`
      : allOn ? '<div class="actions"><button class="primary" id="next">Next</button></div>'
      : closed ? `<p class="muted center">DisciplineGuard connects once MetaTrader is open.</p><div class="actions"><button id="later">Close</button><button class="primary" id="openmt">${ICON.window(16)} Open MetaTrader</button></div>`
      : '<p class="muted center">Open any chart in MetaTrader.</p><div class="actions"><button id="later">Close</button></div>'}`;
  const on = (id, f) => document.getElementById(id) && (document.getElementById(id).onclick = f);
  on('restart', async (e) => {
    e.currentTarget.disabled = true;
    e.currentTarget.textContent = 'Restarting…';
    const s = await invoke('restart');
    result(await invoke('view'), s);
    startPoll();
  });
  on('later', () => invoke('hide'));
  on('openmt', openMt);
  on('next', () => show('done'));
  startPoll();
}

async function openMt(e) {
  e.currentTarget.disabled = true;
  e.currentTarget.textContent = 'Opening…';
  await invoke('open_mt');
  show('result');
}

function startPoll() {
  clearInterval(poll);
  poll = setInterval(async () => {
    if (screen !== 'result' || document.hidden) return;
    const v = await invoke('view');
    if (!el.querySelector('#restart:disabled')) result(v);
  }, 3000);
}

function done() {
  el.innerHTML = `
    ${hero(ICON.check(32, 2.4))}
    <div class="center">
      <h1>You're protected</h1>
      <p class="muted">Open any chart: the panel is there. DisciplineGuard stays in the tray.</p>
    </div>
    <div class="actions"><button id="close">Close</button><button class="primary" id="practice">${ICON.pause(16)} Try a practice pause</button></div>`;
  document.getElementById('practice').onclick = () => invoke('open_web', { page: 'today?practice' });
  document.getElementById('close').onclick = () => invoke('hide');
}

listen('screen', (e) => show(e.payload));
show('');
