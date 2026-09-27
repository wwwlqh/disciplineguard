// The first-run window (EXPERIENCE §7.1): sign in → we found your MetaTrader → Protect → done.
// The tray reopens it on a given screen through the "screen" event.
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const el = document.getElementById('screen');
let screen = '';
let poll = null;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function pick(v) {
  if (!v.signedIn) return 'signin';
  const prot = v.rows.filter((r) => r.protected);
  if (!prot.length) return 'found';
  if (prot.some((r) => r.restartNeeded || !r.connected)) return 'result';
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
    <h1>Sign in to DisciplineGuard</h1>
    <p class="muted">Your browser opens. Press <strong>Allow</strong> there. If the website isn't signed in yet, sign in first.</p>
    ${error ? `<p class="warn">${esc(error)}</p>` : ''}
    <div class="actions"><button class="primary" id="go">Continue in browser</button></div>`;
  document.getElementById('go').onclick = async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Waiting for Allow in your browser…';
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
      <span><span class="name">${esc(r.name)}</span><br><span class="folder">${esc(r.folder)}</span></span>
    </label>`;
  const protRow = (r) => `
    <div class="row"><span><span class="name">${esc(r.name)}</span> · ${esc(r.reason)}<br><span class="folder">${esc(r.folder)}</span></span></div>`;
  el.innerHTML = `
    <h1>${open.length ? 'We found your MetaTrader' : prot.length ? 'Your MetaTrader' : 'No MetaTrader 5 found yet'}</h1>
    ${!open.length && !prot.length ? '<p class="muted">Open MetaTrader 5 once, then come back here. Or pick its folder.</p>' : ''}
    ${open.map(row).join('')}
    ${prot.length ? `<p class="muted">Protected</p>${prot.map(protRow).join('')}
      <p class="muted small">To remove protection, remove the account on the website. It's a loosening, so it waits like any other. <button class="link" id="devices">Open Devices</button></p>` : ''}
    <p class="muted">Don't see it? <button class="link" id="browse">Browse</button></p>
    ${open.length ? `<label class="consent"><input type="checkbox" id="baseline" ${v.baseline || !prot.length ? 'checked' : ''}>
      <span>Include my last 90 days of trades. Used only for your own before/after comparison. Only you see it.</span></label>` : ''}
    ${!v.canProtect ? '<p class="warn">This copy of DisciplineGuard can\'t set up MetaTrader. Download it again from the website.</p>' : ''}
    ${error ? `<p class="warn">${esc(error)}</p>` : ''}
    <div class="actions">
      ${open.length ? `<button class="primary" id="protect" ${v.canProtect ? '' : 'disabled'}>Protect</button>` : ''}
      ${prot.length ? '<button id="close">Close</button>' : ''}
    </div>`;
  const on = (id, f) => document.getElementById(id) && (document.getElementById(id).onclick = f);
  on('devices', () => invoke('open_web', { page: 'devices' }));
  on('close', () => invoke('hide'));
  on('browse', async () => {
    try {
      await invoke('browse');
      show('found');
    } catch (err) {
      found(v, err);
    }
  });
  on('protect', async (e) => {
    e.target.disabled = true;
    const ticked = [...el.querySelectorAll('input[type=checkbox][value]')].filter((c) => c.checked).map((c) => c.value);
    try {
      await invoke('protect', { ticked, baseline: document.getElementById('baseline').checked });
      show(ticked.length ? 'result' : 'found');
    } catch (err) {
      found(await invoke('view'), err);
    }
  });
}

function result(v, stuck = []) {
  const prot = v.rows.filter((r) => r.protected);
  const tick = (ok, wait) => (ok ? '✓' : wait);
  const algo = (r) => (r.algoOn === false ? '<span class="warn">off: click Algo Trading once in MetaTrader</span>' : tick(r.algoOn, '…'));
  const waiting = prot.some((r) => r.restartNeeded);
  const allOn = prot.length && prot.every((r) => r.connected && !r.restartNeeded && r.algoOn !== false);
  el.innerHTML = `
    <h1>${allOn ? 'Protected' : 'Setting up'}</h1>
    ${prot.map((r) => `
      <div class="row"><span><span class="name">${esc(r.name)}</span><br>
        <span class="checks">Installed ${tick(r.installed, '…')} · Algo Trading on ${algo(r)} · Connected ${tick(r.connected, '…')}</span></span></div>`).join('')}
    ${waiting ? `<p>MetaTrader needs a quick restart to finish. Open trades aren't affected.</p>
      ${stuck.length ? `<p class="warn">${esc(stuck.join(', '))} didn't close. Close any open MetaTrader dialog, then try again.</p>` : ''}
      <div class="actions"><button class="primary" id="restart">Restart MetaTrader</button><button id="later">Next time I open it</button></div>`
      : allOn ? '<div class="actions"><button class="primary" id="next">Next</button></div>'
      : '<p class="muted">Open MetaTrader and any chart. This updates on its own.</p><div class="actions"><button id="later">Close</button></div>'}`;
  const on = (id, f) => document.getElementById(id) && (document.getElementById(id).onclick = f);
  on('restart', async (e) => {
    e.target.disabled = true;
    e.target.textContent = 'Restarting…';
    const s = await invoke('restart');
    result(await invoke('view'), s);
    startPoll();
  });
  on('later', () => invoke('hide'));
  on('next', () => show('done'));
  startPoll();
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
    <h1>Done</h1>
    <p>Open any chart: the DisciplineGuard panel is there.</p>
    <p class="muted">DisciplineGuard keeps running in the tray, next to the clock.</p>
    <div class="actions"><button class="primary" id="practice">Try a practice pause</button><button id="close">Close</button></div>`;
  document.getElementById('practice').onclick = () => invoke('open_web', { page: 'today?practice' });
  document.getElementById('close').onclick = () => invoke('hide');
}

listen('screen', (e) => show(e.payload));
show('');
