// Help center (EXPERIENCE §15): one short article per setup step and status reason.
// Public: the EA and the Windows app link here, signed in or not.
import { onLink } from '../router.ts';

interface Article {
  slug: string;
  title: string;
  body: string[];
}

const SETUP: Article[] = [
  {
    slug: 'install',
    title: 'Install DisciplineGuard for Windows',
    body: [
      'Download it from Devices → Add MT5, and run the installer.',
      'The app sets up MetaTrader for you. You never copy files or type a code.',
    ],
  },
  {
    slug: 'allow',
    title: 'Allow this computer',
    body: [
      'In the app, click Continue in browser. The website asks "Allow DisciplineGuard on this computer?". Click Allow.',
      'Not signed in on the website? Sign in with your email first. The Allow page comes back after.',
    ],
  },
  {
    slug: 'protect',
    title: 'Protect MetaTrader',
    body: [
      'The app lists every MetaTrader it finds. Tick the ones you trade on and click Protect.',
      "Don't see yours? Click Browse and pick the folder MetaTrader is installed in.",
    ],
  },
  {
    slug: 'restart',
    title: 'Restart MetaTrader to finish setup',
    body: [
      'If MetaTrader was open during Protect, it needs one restart. Click Restart MetaTrader in the app, or choose Next time I open it.',
      "Open trades aren't affected. The app never closes MetaTrader unless you click Restart.",
    ],
  },
  {
    slug: 'algo-trading',
    title: 'Turn on Algo Trading',
    body: [
      'The panel places trades through Algo Trading. The app turns it on, but it can be switched off in MetaTrader.',
      'Click Algo Trading once in the MetaTrader toolbar so it turns green.',
    ],
  },
  {
    slug: 'practice',
    title: 'Try a practice pause',
    body: [
      'Today → Practice pause shows exactly what a real pause looks like, with your own rules. Nothing is placed.',
      'On the chart: panel menu → Practice pause.',
    ],
  },
];

const STATUS: Article[] = [
  {
    slug: 'open-app',
    title: 'Open the DisciplineGuard app',
    body: [
      'The panel talks to MetaTrader through the DisciplineGuard app. Open DisciplineGuard from the Start menu.',
      'Once connected, the app keeps running in the tray. Closing its window keeps it running.',
      'Orders go through normally until connected.',
    ],
  },
  {
    slug: 'sign-in-app',
    title: 'Sign in to the DisciplineGuard app',
    body: [
      'Open the app and click Continue in browser, then Allow.',
      'If the panel says "Sign in again", your saved rules still apply until you do.',
    ],
  },
  {
    slug: 'tick-terminal',
    title: 'Tick this MetaTrader in the app',
    body: ['This MetaTrader is not protected yet. In the app, tick it and click Protect.'],
  },
  {
    slug: 'connecting',
    title: 'Connecting or loading your rules',
    body: [
      'Usually a few seconds. If it stays, check your internet connection and that the app is open.',
      '"Can\'t reach DisciplineGuard" means our server is out of reach. Orders go through normally until the first rules load.',
    ],
  },
  {
    slug: 'offline',
    title: 'On (offline)',
    body: [
      'Your rules are still on. The panel uses the rules it saved last time and catches up when it can reach us again.',
      '"App not running": open DisciplineGuard from the Start menu.',
      'After 7 days past your plan end with no contact, protection turns off: "Can\'t confirm your plan".',
    ],
  },
  {
    slug: 'panel-only',
    title: 'On (panel only)',
    body: ['You have the panel on more than one chart. One chart does the counting, the others are for trading. Nothing to fix.'],
  },
  {
    slug: 'outside-trades',
    title: 'Trades placed outside the panel',
    body: [
      'MetaTrader lets you trade with F9, the one-click buttons and the phone app. DisciplineGuard can\'t pause those, but they still count toward today.',
      'Panel menu → Hide quick-trade buttons on all charts removes the one-click buttons.',
      'Closing, stop loss, take profit and cancelling are never paused.',
    ],
  },
  {
    slug: 'new-account',
    title: 'New account on this terminal',
    body: [
      'You logged in to a trading account that isn\'t protected yet. Click Protect on the panel. It applies at once.',
      'Up to 10 accounts. Remove one on Devices to add another. Ended accounts are removed at once.',
    ],
  },
  {
    slug: 'trial-used',
    title: 'This account already used a free trial',
    body: ['This trading account had a trial under another login. It works once you subscribe on Account.'],
  },
  {
    slug: 'plan-ended',
    title: 'Trial or plan ended',
    body: [
      'Protection is off and orders go through normally. The panel keeps working with the lot calculator.',
      'Subscribe on Account. Protection comes back at once with your last rules.',
    ],
  },
  {
    slug: 'cant-confirm-plan',
    title: "Can't confirm your plan",
    body: ['No contact with our server for 7 days past your plan end. Open the app and check your internet. It turns back on at the next sync.'],
  },
  {
    slug: 'signed-out',
    title: 'Signed out or removed',
    body: [
      'Protection is off and orders go through normally.',
      'To protect this MetaTrader again, sign in to the app and tick it. A removed account can be added back on the panel.',
    ],
  },
  {
    slug: 'vps',
    title: "Can't run on MetaQuotes' built-in VPS",
    body: ['The panel needs the app on the same computer. Trade from your own terminal, or install MetaTrader and DisciplineGuard on your own VPS.'],
  },
  {
    slug: 'not-running',
    title: 'Not running',
    body: ['MetaTrader is closed. Normal at the end of the day. It turns On when you open it.'],
  },
  {
    slug: 'unknown-build',
    title: 'Unknown EA build',
    body: ['The panel on this terminal is not one we published. Reinstall DisciplineGuard for Windows and click Protect.'],
  },
  {
    slug: 'remove',
    title: 'Remove protection',
    body: [
      'Remove the account or device on Devices. It\'s a loosening, so it waits until your next day reset, at least 12 hours.',
      'During setup mode, or for an Ended account, it applies at once.',
    ],
  },
];

const ALL = [...SETUP, ...STATUS];

function List({ title, items }: { title: string; items: Article[] }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <ul className="help-list">
        {items.map((a) => (
          <li key={a.slug}>
            <a href={`/help/${a.slug}`} onClick={onLink}>{a.title}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Help({ path, signedIn }: { path: string; signedIn: boolean }) {
  const slug = path.split('/')[2];
  const a = ALL.find((x) => x.slug === slug);
  return (
    <div className="help-page stack">
      <div className="row between">
        <a href="/help" onClick={onLink} className="brand"><img src="/mark.svg" alt="" /> Help</a>
        <a href={signedIn ? '/today' : '/signin'} onClick={onLink} className="small">{signedIn ? 'Dashboard' : 'Sign in'}</a>
      </div>
      {a ? (
        <div className="card">
          <h1>{a.title}</h1>
          {a.body.map((p) => <p key={p}>{p}</p>)}
          <p className="small"><a href="/help" onClick={onLink}>All help</a></p>
        </div>
      ) : (
        <>
          <List title="Setup" items={SETUP} />
          <List title="Status" items={STATUS} />
        </>
      )}
      <p className="small muted">Still stuck? {signedIn ? <a href="/account#report" onClick={onLink}>Report a problem</a> : 'Sign in, then Account → Report a problem.'}</p>
    </div>
  );
}
