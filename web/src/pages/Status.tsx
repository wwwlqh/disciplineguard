// Status and changelog (EXPERIENCE §4): is our server up, does TradingView still work, and what changed. Public.
import { useEffect, useState } from 'react';
import { onLink } from '../router.ts';
import { BrandCrumb } from '../ui/Brand.tsx';

/** Newest first. One line each, in the trader's words. */
const CHANGES: [string, string][] = [
  ['2026-10-03', 'Windows app and extension 0.1.7: setup no longer asks about your last 90 days, and Devices shows the version each one runs.'],
  ['2026-10-03', 'On phones, every page fits the screen. Links to DisciplineGuard show a preview when shared.'],
  ['2026-10-03', 'DisciplineGuard now counts every trade against your rules and never pauses one. A trade that goes past a rule is marked, with a note and an alert.'],
  ['2026-10-03', 'How it works plays on the home page: set your rules, connect, trade. The logo always leads back home.'],
  ['2026-10-03', 'Where it works: each platform shows what works on its website, desktop app and phone app. Start free and Help show the same.'],
  ['2026-10-02', 'Start free asks where you trade (Windows, Mac, phone or website) and connects each platform, with live progress.'],
  ['2026-10-02', 'Windows app 0.1.5: signing in no longer closes the app.'],
  ['2026-10-02', 'A brighter look and a new icon, in the app, the extension and the website.'],
  ['2026-10-02', 'Polymarket and Kalshi: the extension pauses bets that break your rules. Selling is never paused.'],
  ['2026-09-27', 'Tighten for today: a lower max trades or loss limit until your next reset, from Today.'],
  ['2026-09-27', 'Take a break for 1, 7 or 30 days, from Account.'],
  ['2026-09-27', 'Continue with Google.'],
  ['2026-09-27', 'TradingView: the status pill, the daily loss limit, and trades placed outside the order panel now count.'],
  ['2026-09-27', 'TradingView extension for Chrome and Edge.'],
  ['2026-09-27', 'Alerts as Windows notifications from the app.'],
];

/** Set by hand when a platform breaks (for example "TradingView changed. Orders go through normally while we update."). */
const PLATFORMS: [string, string | null][] = [
  ['MT5', null],
  ['TradingView', null],
  ['Polymarket', null],
  ['Kalshi', null],
];

type Check = 'checking' | 'ok' | 'down';

export function Status() {
  const [server, setServer] = useState<Check>('checking');
  const [page, setPage] = useState<number | null>(null);

  useEffect(() => {
    fetch('/v1/health').then((r) => setServer(r.ok ? 'ok' : 'down')).catch(() => setServer('down'));
    // The signed TradingView page config, when one is published (clients/extension/src/pageconfig.ts).
    fetch('/tv-page.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => setPage(s?.payload ? JSON.parse(s.payload).page.version : null))
      .catch(() => {});
  }, []);

  const line = (c: Check, ok: string) => (c === 'checking' ? 'Checking…' : c === 'ok' ? ok : "Can't reach our server. Your saved rules still apply.");
  return (
    <div className="help-page stack">
      <div className="row between">
        <BrandCrumb page="Status" />
        <a href="/help" onClick={onLink} className="small">Help</a>
      </div>
      <div className="card">
        <ul className="list">
          <li className="row between"><span className="row"><span className={`dot ${server === 'down' ? 'attention' : 'on'}`} /> Server</span><span className="small muted">{line(server, 'Working')}</span></li>
          {PLATFORMS.map(([name, problem]) => (
            <li key={name} className="row between">
              <span className="row"><span className={`dot ${problem ? 'attention' : 'on'}`} /> {name}</span>
              <span className="small muted">{problem ?? 'Working'}{name === 'TradingView' && page ? ` · page update ${page}` : ''}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h2>What changed</h2>
        <ul className="list">
          {CHANGES.map(([d, t]) => (
            <li key={t}><span className="small faint">{d}</span><br />{t}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
