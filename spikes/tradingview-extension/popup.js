const DEFAULTS = { mode: 'log', waitSeconds: 5, replay: false, selectors: '', textMatch: false, dgLog: [] };
const $ = id => document.getElementById(id);

function render(v) {
  $('mode').value = v.mode;
  $('wait').value = v.waitSeconds;
  $('textMatch').checked = v.textMatch;
  $('selectors').value = v.selectors;
  const outcomes = v.dgLog.filter(x => x.kind === 'outcome');
  const sent = outcomes.filter(x => x.outcome === 'sent').length;
  $('status').textContent = `${v.dgLog.length} log entries · ${outcomes.length} tests · ${sent} orders went through`;
}

chrome.storage.local.get(DEFAULTS, render);

$('save').onclick = () => {
  chrome.storage.local.set({
    mode: $('mode').value,
    waitSeconds: Math.max(0, Math.min(60, Number($('wait').value) || 0)),
    textMatch: $('textMatch').checked,
    selectors: $('selectors').value
  }, () => chrome.storage.local.get(DEFAULTS, render));
};
$('mode').onchange = () => $('save').onclick();

$('copy').onclick = () => chrome.storage.local.get(DEFAULTS, async v => {
  await navigator.clipboard.writeText(JSON.stringify(v.dgLog, null, 1));
  $('status').textContent = 'Log copied. Paste it to Claude.';
});
$('clear').onclick = () => chrome.storage.local.set({ dgLog: [] }, () => chrome.storage.local.get(DEFAULTS, render));
