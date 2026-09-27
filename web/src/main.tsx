import { StrictMode, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { api, ApiError, type Me } from './api.ts';
import { setFormatContext } from './fmt.ts';
import { navigate, onLink, usePath } from './router.ts';
import { ToastHost } from './ui/kit.tsx';
import { SignIn } from './pages/SignIn.tsx';
import { Onboarding } from './pages/Onboarding.tsx';
import { Today } from './pages/Today.tsx';
import { RulesPage } from './pages/Rules.tsx';
import { Devices } from './pages/Devices.tsx';
import { Stats } from './pages/Stats.tsx';
import { AccountPage } from './pages/Account.tsx';
import { Owner } from './pages/Owner.tsx';
import { Allow } from './pages/Allow.tsx';
import { Help } from './pages/Help.tsx';
import { Plans } from './pages/Plans.tsx';
import { Site } from './pages/Site.tsx';

export interface PageProps {
  me: Me;
  reload(): Promise<void>;
}

const NAV = [
  ['/today', 'Today'],
  ['/rules', 'Rules'],
  ['/devices', 'Devices'],
  ['/stats', 'Stats'],
  ['/account', 'Account'],
] as const;

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
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <img src="/mark.svg" alt="" /> DisciplineGuard
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.map(([href, label]) => (
            <a key={href} href={href} onClick={onLink} className={active(href)} aria-current={active(href) ? 'page' : undefined}>
              {label}
            </a>
          ))}
          {me.user.owner && (
            <a href="/owner" onClick={onLink} className={active('/owner')}>
              Owner
            </a>
          )}
        </nav>
      </aside>
      <main>{page}</main>
      <nav className="bottom-tabs" aria-label="Main">
        {NAV.slice(0, 4).map(([href, label]) => (
          <a key={href} href={href} onClick={onLink} className={active(href)}>
            {label}
          </a>
        ))}
        <a href="/account" onClick={onLink} className={active('/account')}>
          More
        </a>
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
  if (path === '/' && state !== 'ready') return <Site />;
  // After signing in, return to the page that asked (the Windows app's Allow page keeps its query).
  if (path === '/signin' || state === 'signed_out') return <SignIn onDone={() => { navigate(path === '/signin' ? '/today' : location.pathname + location.search, true); void reload(); }} />;
  if (state === 'loading' || !me) return <div className="center-page muted">{state === 'error' ? "Can't reach DisciplineGuard. Try again in a moment." : 'Loading…'}</div>;
  if (path === '/allow') return <Allow me={me} />;
  if (!me.user.onboarding?.done && me.user.setupMode) return <Onboarding me={me} reload={reload} />;
  return <Shell me={me} reload={reload} path={path} />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastHost>
      <App />
    </ToastHost>
  </StrictMode>,
);
