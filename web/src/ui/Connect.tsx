// Connect a platform (EXPERIENCE §5.7, SPEC §9.1, §9.5): MetaTrader 5 through the Windows app; TradingView, Polymarket
// and Kalshi through the browser extension. Each card follows along live: allowed, then each account as it reports in.
import { useEffect, useRef, useState } from 'react';
import { api, type Connection, type Me } from '../api.ts';
import { deviceStatus } from '../pages/Today.tsx';
import { Dot } from './kit.tsx';
import { Icon } from './Icon.tsx';

export const APP_FILE = '/downloads/DisciplineGuard-Setup.exe';
export const EXTENSION_FILE = '/downloads/DisciplineGuard-TradingView.zip';

export type Site = 'tv' | 'pm' | 'kalshi';
export const SITES: Record<Site, { name: string; url: string }> = {
  tv: { name: 'TradingView', url: 'https://www.tradingview.com/chart/' },
  pm: { name: 'Polymarket', url: 'https://polymarket.com/' },
  kalshi: { name: 'Kalshi', url: 'https://kalshi.com/' },
};

/** "TradingView, Polymarket or Kalshi" */
export function siteList(sites: Site[], last = 'or'): string {
  const n = sites.map((s) => SITES[s].name);
  return n.length > 1 ? `${n.slice(0, -1).join(', ')} ${last} ${n[n.length - 1]}` : (n[0] ?? '');
}

const progressKey = (m: Me) => JSON.stringify([m.connections.map((c) => [c.id, c.status, !!c.lastSeen]), (m.apps ?? []).map((a) => a.id)]);

/**
 * Connections and sign-ins, refreshed every 3 s while a card is open. With `onlyNew` (Devices), only what appears after
 * the card opened counts, so a device that was already there isn't taken for the one being added.
 */
function useProgress(me: Me, onlyNew: boolean, onChange?: () => void) {
  const [live, setLive] = useState(me);
  const [before] = useState(() => new Set(onlyNew ? [...me.connections.map((c) => c.id), ...(me.apps ?? []).map((a) => a.id)] : []));
  const last = useRef(progressKey(me));
  useEffect(() => {
    let on = true;
    const id = setInterval(async () => {
      const m = await api<Me>('GET', '/api/me').catch(() => null);
      if (!on || !m) return;
      setLive(m);
      const k = progressKey(m);
      if (k !== last.current) {
        last.current = k;
        onChange?.();
      }
    }, 3000);
    return () => {
      on = false;
      clearInterval(id);
    };
  }, []);
  return { connections: live.connections.filter((c) => !before.has(c.id)), apps: (live.apps ?? []).filter((a) => !before.has(a.id)) };
}

/** Under the steps: each account that connected, else where it was allowed, else waiting. */
function Live({ conns, allowed, waiting }: { conns: Connection[]; allowed: string | null; waiting: string }) {
  if (conns.length) {
    return (
      <div className="banner live-conns" role="status">
        {conns.map((c) => {
          const s = deviceStatus(c);
          return <span key={c.id}><Dot kind={s.kind} live={s.kind === 'on'} /> <strong>{c.name}</strong> · {s.label}</span>;
        })}
      </div>
    );
  }
  return (
    <p className={`live-line${allowed ? ' ok' : ''}`} role="status">
      {allowed ? <Icon name="check" size={16} strokeWidth={2.2} /> : <Dot kind="setting_up" live />} {allowed ?? waiting}
    </p>
  );
}

export function ConnectMt5({ me, onlyNew = false, onConnected }: { me: Me; onlyNew?: boolean; onConnected?(): void }) {
  const p = useProgress(me, onlyNew, onConnected);
  const app = p.apps.find((a) => !a.browser);
  return (
    <div className="stack">
      <ol className="steps">
        <li>
          <div>
            <a className="btn primary" href={APP_FILE} download><Icon name="download" size={16} /> Download DisciplineGuard for Windows</a>
            <div className="small muted">It sets up MetaTrader for you.</div>
          </div>
        </li>
        <li><span>Open it and click <strong>Allow</strong>.</span></li>
        <li><span>Tick your MetaTrader and press <strong>Protect</strong>.</span></li>
      </ol>
      <Live
        conns={p.connections.filter((c) => c.kind === 'mt5' || c.kind === 'mt4')}
        allowed={app ? `Allowed on ${app.name}. Tick your MetaTrader and press Protect.` : null}
        waiting="Waiting for your computer…"
      />
      <details className="small muted">
        <summary>Trouble?</summary>
        <ul>
          <li>MetaTrader not listed: press Browse in the app.</li>
          <li>On a VPS: install the app there too.</li>
          <li>Antivirus blocked it: allow it, then run it again.</li>
        </ul>
      </details>
    </div>
  );
}

/** chrome://extensions can't be a link from a web page, so it's copied instead. */
function CopyText({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const copy = () =>
    navigator.clipboard?.writeText(text).then(() => {
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    }).catch(() => {});
  return (
    <span className="copy-text">
      <code>{text}</code>
      <button type="button" className="ghost icon-btn" aria-label={done ? 'Copied' : `Copy ${text}`} onClick={copy}>
        <Icon name={done ? 'check' : 'copy'} size={14} />
      </button>
    </span>
  );
}

export function ConnectBrowser({ me, sites = ['tv', 'pm', 'kalshi'], onlyNew = false, onConnected }: { me: Me; sites?: Site[]; onlyNew?: boolean; onConnected?(): void }) {
  const p = useProgress(me, onlyNew, onConnected);
  const ua = navigator.userAgent;
  const edge = /Edg\//.test(ua);
  const app = p.apps.find((a) => a.browser);
  return (
    <div className="stack">
      {!/Chrome\//.test(ua) && <div className="banner amber"><span><Icon name="alert" /> Open this page in Chrome or Edge.</span></div>}
      <ol className="steps">
        <li>
          <div>
            <a className="btn primary" href={EXTENSION_FILE} download><Icon name="download" size={16} /> Download the extension</a>
            <div className="small muted">Then unzip it.</div>
          </div>
        </li>
        <li><span>Go to <CopyText text={`${edge ? 'edge' : 'chrome'}://extensions`} />, turn on <strong>Developer mode</strong>, click <strong>Load unpacked</strong> and pick the unzipped folder.</span></li>
        <li><span>On the tab that opens, click <strong>Sign in</strong>, then <strong>Allow</strong>.</span></li>
        <li>
          <span>
            Open{' '}
            {sites.map((s, i) => (
              <span key={s}>
                {i > 0 && (i === sites.length - 1 ? ' or ' : ', ')}
                <a href={SITES[s].url} target="_blank" rel="noreferrer">{SITES[s].name}</a>
              </span>
            ))}
            .
          </span>
        </li>
      </ol>
      <Live
        conns={p.connections.filter((c) => c.kind === 'tv')}
        allowed={app ? `Allowed on ${app.name}. Open ${siteList(sites)}.` : null}
        waiting="Waiting for the extension…"
      />
      <details className="small muted">
        <summary>Trouble?</summary>
        <ul>
          <li>No Sign in tab: click the puzzle icon in the toolbar, then DisciplineGuard.</li>
          {sites.includes('tv') && <li>TradingView: use the website with your broker connected. The desktop app can't be paused.</li>}
          <li>Safari and Firefox aren't supported.</li>
        </ul>
      </details>
    </div>
  );
}
