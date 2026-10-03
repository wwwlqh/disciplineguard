// Where trades are counted (EXPERIENCE §4 Platforms): each platform, each way to trade on it, and what DisciplineGuard does
// there. The website, Start free and Help show this one list, so they always say the same thing.
import { Icon, type IconName } from './Icon.tsx';

/** works: trades placed there are counted (MT5's phone app and web terminal through MT5 on a computer; see `foot`). */
export type Works = 'works' | 'no' | 'not_yet' | 'later';

export interface Way {
  /** The Start free pick. Picks that aren't "works" record "tell me when it's ready". */
  id: string;
  label: string;
  icon: IconName;
  works: Works;
  note?: string;
}

export interface Platform {
  id: string;
  name: string;
  /** The platform's own app icon, in web/public/brands. */
  logo: string;
  ways: Way[];
  /** A note under the card; in Start free it shows once one of `footFor` is ticked. */
  foot?: string;
  footFor?: string[];
}

/** The whole list in one line. */
export const WHERE_LINE = "MetaTrader 5 on Windows, and its phone and web terminal trades count too. TradingView, Polymarket and Kalshi in Chrome or Edge, on Windows or Mac.";

export const MT5_COUNTS = "Phone and web terminal trades count toward your rules while MetaTrader 5 with DisciplineGuard runs on your computer or VPS.";

const website = (id: string): Way => ({ id, label: 'Website', icon: 'globe', works: 'works', note: 'Chrome or Edge' });
const phone = (id: string): Way => ({ id, label: 'Phone app', icon: 'phone', works: 'no' });

export const WHERE: Platform[] = [
  {
    id: 'mt5',
    name: 'MetaTrader 5',
    logo: '/brands/mt5.png',
    ways: [
      { id: 'mt5', label: 'Windows app', icon: 'window', works: 'works', note: 'With the DisciplineGuard app' },
      { id: 'mt_phone', label: 'Phone app', icon: 'phone', works: 'works' },
      { id: 'mt5_web', label: 'Web terminal', icon: 'globe', works: 'works' },
      { id: 'mt5_mac', label: 'Mac app', icon: 'laptop', works: 'not_yet' },
    ],
    foot: MT5_COUNTS,
    footFor: ['mt_phone', 'mt5_web'],
  },
  {
    id: 'tv',
    name: 'TradingView',
    logo: '/brands/tv.png',
    ways: [website('tv'), { id: 'tv_desktop', label: 'Desktop app', icon: 'window', works: 'no', note: 'Use the website instead' }, phone('tv_phone')],
  },
  { id: 'pm', name: 'Polymarket', logo: '/brands/pm.png', ways: [website('pm'), phone('pm_phone')] },
  { id: 'kalshi', name: 'Kalshi', logo: '/brands/kalshi.png', ways: [website('kalshi'), phone('kalshi_phone')] },
];

/** Picks that are counted today. */
export const LIVE = WHERE.flatMap((p) => p.ways.filter((w) => w.works === 'works').map((w) => w.id));

/** "Windows app", "Website": the way each platform is counted. */
export const worksOn = (p: Platform) => p.ways.find((w) => w.works === 'works')?.label;

const STATUS: Record<Works, { label: string; tone: string; icon?: IconName }> = {
  works: { label: 'Works', tone: 'accent', icon: 'check' },
  no: { label: 'Not supported', tone: 'no', icon: 'x' },
  not_yet: { label: 'Not yet', tone: 'no' },
  later: { label: 'Coming later', tone: 'no' },
};

export function WorksChip({ works }: { works: Works }) {
  const s = STATUS[works];
  return (
    <span className={`chip works ${s.tone}`}>
      {s.icon && <Icon name={s.icon} size={13} strokeWidth={2.4} />}
      {s.label}
    </span>
  );
}

/** Icon, name and status on one line; the note below gets the full width. */
export function WayBody({ w }: { w: Pick<Way, 'label' | 'icon' | 'note'> & { works?: Works } }) {
  return (
    <>
      <Icon name={w.icon} className="way-icon" />
      <span className="way-text">
        <span className="way-line">
          <span className="way-label">{w.label}</span>
          {w.works && <WorksChip works={w.works} />}
        </span>
        {w.note && <small>{w.note}</small>}
      </span>
    </>
  );
}

/**
 * One platform and what works where. With `onPick` (Start free), each way is a tick, and the note under the card shows
 * once a way it explains is ticked.
 */
export function WhereCard({ p, picked, onPick, className = '' }: { p: Platform; picked?: string[]; onPick?(id: string, on: boolean): void; className?: string }) {
  const has = (id: string) => !!picked?.includes(id);
  const on = p.ways.some((w) => has(w.id));
  const foot = p.foot && (!onPick || !!p.footFor?.some(has));
  return (
    <div className={`card where${on ? ' on' : ''} ${className}`}>
      <div className="where-head">
        <img className="where-glyph" src={p.logo} alt="" />
        <strong>{p.name}</strong>
      </div>
      <ul className={`where-ways${onPick ? ' pick' : ''}`}>
        {p.ways.map((w) => (
          <li key={w.id} className={`way ${w.works}`}>
            {onPick ? (
              <label className="way-row">
                <input type="checkbox" aria-label={`${p.name}, ${w.label}`} checked={has(w.id)} onChange={(e) => onPick(w.id, e.target.checked)} />
                <WayBody w={w} />
              </label>
            ) : (
              <div className="way-row"><WayBody w={w} /></div>
            )}
          </li>
        ))}
      </ul>
      {foot && <p className="where-foot"><Icon name="info" size={15} /> {p.foot}</p>}
    </div>
  );
}

/** Read-only: every platform, then what's coming. */
export function WhereGrid({ reveal = false }: { reveal?: boolean }) {
  return (
    <>
      <div className="where-grid">
        {WHERE.map((p) => <WhereCard key={p.id} p={p} className={reveal ? 'reveal' : ''} />)}
      </div>
      <p className="where-later"><Icon name="clock" size={15} /> MetaTrader 4 is coming later.</p>
    </>
  );
}
