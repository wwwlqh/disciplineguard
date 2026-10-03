import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter/opsz.css';
import './styles.css';
import { api, ApiError, type Me } from './api.ts';
import { setFormatContext } from './fmt.ts';
import { navigate, onLink, usePath } from './router.ts';
import { Dot, ToastHost } from './ui/kit.tsx';
import { Brand } from './ui/Brand.tsx';
import { Icon, type IconName } from './ui/Icon.tsx';
import { SignIn } from './pages/SignIn.tsx';
import { Onboarding } from './pages/Onboarding.tsx';
import { deviceStatus, Today } from './pages/Today.tsx';
import { RulesPage } from './pages/Rules.tsx';
import { Devices } from './pages/Devices.tsx';
import { Stats } from './pages/Stats.tsx';
import { AccountPage } from './pages/Account.tsx';
import { Owner } from './pages/Owner.tsx';
import { Allow } from './pages/Allow.tsx';
import { Help } from './pages/Help.tsx';
import { Plans } from './pages/Plans.tsx';
import { Site } from './pages/Site.tsx';
import { Status } from './pages/Status.tsx';

export interface PageProps {
  me: Me;
  reload(): Promise<void>;
}

const NAV: [string, string, IconName][] = [
  ['/today', 'Today', 'today'],
  ['/rules', 'Rules', 'rules'],
  ['/devices', 'Devices', 'devices'],
  ['/stats', 'Stats', 'stats'],
  ['/account', 'Account', 'account'],
];

/** One line for the whole setup: protected, needs a look, or nothing connected yet. */
function protection(me: Me): { kind: 'on' | 'attention' | 'off' | 'setting_up'; title: string; line: string } {
  const st = me.connections.map((c) => deviceStatus(c));
  const on = st.filter((s) => s.kind === 'on').length;
  if (!me.license.enforcing) return { kind: 'off', title: 'Off', line: 'Orders go through normally.' };
  if (me.connections.length === 0) return { kind: 'setting_up', title: 'Not connected', line: 'Connect your platform.' };
  if (st.some((s) => s.kind === 'attention')) return { kind: 'attention', title: 'Needs attention', line: 'A device needs a look.' };
  if (on > 0) return { kind: 'on', title: 'Protected', line: `${on} ${on === 1 ? 'device' : 'devices'} on` };
  return { kind: 'off', title: 'Not running', line: 'Open MetaTrader or a chart.' };
}

function Shell({ me, reload, path }: PageProps & { path: string }) {
  const page = (() => {
    if (path.startsWith('/rules')) return <RulesPage me={me} reload={reload} />;
    if (path.startsWith('/devices')) return <Devices me={me} reload={reload} />;
    if (path.startsWith('/stats')) return <Stats me={me} reload={reload} />;
    if (path.startsWith('/account')) return <AccountPage me={me} reload={reload} />;
    if (path.startsWith('/plans')) return <Plans me={me} reload={reload} />;
    if (path.startsWith('/owner') && me.user.owner) return <Owner />;
    return <Today me={me} reload={reload} />;
  })();
  const active = (href: string) => (path.startsWith(href) || (href === '/today' && path === '/') ? 'active' : '');
  const p = protection(me);
  return (
    <div className="shell">
      <aside className="side">
        <Brand href="/today" />
        <nav className="nav" aria-label="Main">
          {NAV.map(([href, label, icon]) => (
            <a key={href} href={href} onClick={onLink} className={active(href)} aria-current={active(href) ? 'page' : undefined}>
              <Icon name={icon} /> {label}
            </a>
          ))}
          {me.user.owner && (
            <a href="/owner" onClick={onLink} className={active('/owner')}>
              <Icon name="owner" /> Owner
            </a>
          )}
        </nav>
        <div className="side-foot">
          <a className="side-status" href="/devices" onClick={onLink}>
            <span className="row"><Dot kind={p.kind} live={p.kind === 'on'} /><strong>{p.title}</strong></span>
            <span className="small muted">{p.line}</span>
          </a>
          <nav className="nav">
            <a href="/help" onClick={onLink}><Icon name="help" /> Help</a>
          </nav>
          <div className="side-user" title={me.user.email}>
            <span className="avatar" aria-hidden="true">{(me.user.firstName ?? me.user.email).slice(0, 1).toUpperCase()}</span>
            <span>{me.user.email}</span>
          </div>
        </div>
      </aside>
      <header className="topbar">
        <Brand href="/today" size={26} />
        <a className="chip" href="/devices" onClick={onLink}><Dot kind={p.kind} live={p.kind === 'on'} /> {p.title}</a>
      </header>
      <main>{page}</main>
      <nav className="bottom-tabs" aria-label="Main">
        {NAV.map(([href, label, icon]) => (
          <a key={href} href={href} onClick={onLink} className={active(href)} aria-current={active(href) ? 'page' : undefined}>
            <Icon name={icon} size={20} />
            {label}
          </a>
        ))}
      </nav>
    </div>
  );
}

function App() {
  const path = usePath();
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<'loading' | 'signed_out' | 'ready' | 'error'>('loading');

  const reload = useCallback(async () => {
    try {
      const m = await api<Me>('GET', '/api/me');
      setFormatContext(m.tz, m.user.hideAmounts);
      setMe(m);
      setState('ready');
    } catch (e) {
      setState(e instanceof ApiError && e.status === 401 ? 'signed_out' : 'error');
    }
  }, []);

  useEffect(() => {
    if (path !== '/signin') void reload();
  }, [path === '/signin']);

  useEffect(() => {
    const h = () => void reload();
    window.addEventListener('dg:reload', h);
    return () => window.removeEventListener('dg:reload', h);
  }, [reload]);

  if (path.startsWith('/help')) return <Help path={path} signedIn={state === 'ready'} />;
  // The website's first page. Signed in, `/` is Today, except during setup, where the logo leads back here.
  const inSetup = state === 'ready' && !!me && !me.user.onboarding?.done && me.user.setupMode;
  if (path === '/' && (state !== 'ready' || inSetup)) return <Site signedIn={state === 'ready'} />;
  if (path === '/status') return <Status />;
  // Start free: set rules first, sign in to save them.
  if (path === '/start' && state !== 'ready') return state === 'loading' ? <div className="center-page muted">Loading…</div> : <Onboarding key="guest" me={null} reload={reload} />;
  // After signing in, return to the page that asked (the Windows app's Allow page keeps its query).
  if (path === '/signin' || state === 'signed_out') return <SignIn onDone={() => { navigate(path === '/signin' ? '/today' : location.pathname + location.search, true); void reload(); }} />;
  if (state === 'loading' || !me) return <div className="center-page muted">{state === 'error' ? "Can't reach DisciplineGuard. Try again in a moment." : 'Loading…'}</div>;
  if (path === '/allow') return <Allow me={me} />;
  if (!me.user.onboarding?.done && me.user.setupMode) return <Onboarding key="user" me={me} reload={reload} />;
  return <Shell me={me} reload={reload} path={path} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastHost>
      <App />
    </ToastHost>
  </StrictMode>,
);
