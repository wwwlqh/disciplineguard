// The toolbar popup (EXPERIENCE §6.4): status, sign in, practice pause, help.
import { API } from './config.ts';
import type { Cache, Status } from './messages.ts';

const LINES: Record<Status, string> = {
  on: '● On',
  offline: '● On (offline). Rules from your last sync apply.',
  setting_up: '● Setting up. Open Polymarket, Kalshi, or a TradingView chart with your broker connected.',
  attention: '● Needs attention. Sign in again. Your saved rules still apply.',
  off: '● Off. Orders go through normally.',
  signed_out: '● Off. Signed out.',
};

type Reply = { cache: Cache; email: string | null; accounts: string[] };

async function ask(type: string): Promise<Reply> {
  return chrome.runtime.sendMessage({ type });
}

function button(text: string, cls: string, on: () => void) {
  const b = document.createElement('button');
  b.textContent = text;
  b.className = cls;
  b.onclick = on;
  document.getElementById('actions')!.appendChild(b);
}

function render(r: Reply) {
  document.getElementById('status')!.textContent = LINES[r.cache.status];
  document.getElementById('detail')!.textContent = r.email ? `${r.email}${r.accounts.length ? ` · ${r.accounts.join(', ')}` : ''}` : '';
  document.getElementById('actions')!.innerHTML = '';
  const open = (page: string) => () => chrome.tabs.create({ url: `${API}/${page}` });
  if (r.cache.status === 'signed_out') button('Sign in', 'primary', () => void ask('sign_in').then(() => window.close()));
  else {
    button('Open dashboard', 'primary', open('today'));
    button('Practice pause', '', open('today?practice'));
  }
  button('Help', 'link', open('help'));
  if (r.cache.status !== 'signed_out') button('Sign out', 'link', () => void ask('sign_out').then(render));
}

void ask('status').then(render);
