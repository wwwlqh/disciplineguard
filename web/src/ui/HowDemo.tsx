// How it works, played (EXPERIENCE §4): a cursor sets the rules, connects MetaTrader 5, then trades until a trade
// breaks a rule: it goes through, is counted, and a note says which rule. Each step plays, then the next; click a step
// to watch it. Plays only while on screen; reduced motion shows each step's last frame.
import { useEffect, useMemo, useRef, useState } from 'react';
import { breakLine, type Order } from '@dg/core';
import { coreFmt } from '../fmt.ts';
import { Mark } from './Brand.tsx';
import { Icon, type IconName } from './Icon.tsx';
import { RULE_INFO } from './RuleFields.tsx';

/** One beat of a step: how long it lasts, where the cursor goes (a data-at), and whether it clicks there. */
interface Beat { id: string; ms: number; at?: string; click?: boolean }
/** `short`: the tab on a phone. `rest`: the beat shown when motion is reduced. */
interface Step { title: string; short: string; line: string; bar: string; beats: Beat[]; rest: string }

const STEPS: Step[] = [
  {
    title: 'Set your rules',
    short: 'Rules',
    line: 'Tick what costs you. Each tick turns on its rules.',
    bar: 'Start free',
    beats: [
      { id: 'start', ms: 900 },
      { id: 'aim1', ms: 750, at: 'c1' },
      { id: 'tick1', ms: 1300, at: 'c1', click: true },
      { id: 'aim2', ms: 750, at: 'c2' },
      { id: 'tick2', ms: 1300, at: 'c2', click: true },
      { id: 'aimSave', ms: 750, at: 'save' },
      { id: 'saved', ms: 2000, at: 'save', click: true },
    ],
    rest: 'saved',
  },
  {
    title: 'Connect your platform',
    short: 'Connect',
    line: 'Install the Windows app or the browser extension, then click Allow. Nothing to type.',
    bar: 'Connect',
    beats: [
      { id: 'start', ms: 900 },
      { id: 'aimDl', ms: 750, at: 'dl' },
      { id: 'dl', ms: 1100, at: 'dl', click: true },
      { id: 'aimAllow', ms: 800, at: 'allow' },
      { id: 'allowed', ms: 1000, at: 'allow', click: true },
      { id: 'aimProtect', ms: 800, at: 'protect' },
      { id: 'on', ms: 2300, at: 'protect', click: true },
    ],
    rest: 'on',
  },
  {
    title: 'Trade as usual',
    short: 'Trade',
    line: 'Every trade goes straight through and is counted. One that goes past a rule is marked.',
    bar: 'EURUSD · M5',
    beats: [
      { id: 'start', ms: 900 },
      { id: 'aimBuy', ms: 750, at: 'buy' },
      { id: 'placed', ms: 1600, at: 'buy', click: true },
      { id: 'away', ms: 600, at: 'chart' },
      { id: 'aimBuy2', ms: 700, at: 'buy' },
      { id: 'broke', ms: 3800, at: 'buy', click: true },
    ],
    rest: 'broke',
  },
];

const last = (i: number) => STEPS[i].beats.length - 1;
const rest = (i: number) => STEPS[i].beats.findIndex((x) => x.id === STEPS[i].rest);

type Reached = (id: string) => boolean;
type Pressed = (at: string) => boolean;

export function HowDemo() {
  const still = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [step, setStep] = useState(0);
  const [beat, setBeat] = useState(() => (still ? rest(0) : 0));
  const [visible, setVisible] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);

  const s = STEPS[step];
  const b = s.beats[beat];
  const ids = s.beats.map((x) => x.id);
  const reached: Reached = (id) => beat >= ids.indexOf(id);
  const pressed: Pressed = (at) => !still && !!b.click && b.at === at;
  const go = (i: number) => {
    setStep(i);
    setBeat(still ? rest(i) : 0);
  };

  // Plays only while on screen and the tab is visible.
  useEffect(() => {
    const el = root.current;
    if (!el || still) return;
    let seen = false;
    const update = () => setVisible(seen && !document.hidden);
    const io = new IntersectionObserver(([e]) => {
      seen = e.isIntersecting;
      update();
    }, { threshold: 0.35 });
    io.observe(el);
    document.addEventListener('visibilitychange', update);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, [still]);

  // One beat at a time; after a step's last beat, the next step.
  useEffect(() => {
    if (still || !visible) return;
    const id = setTimeout(() => (beat < last(step) ? setBeat(beat + 1) : go((step + 1) % STEPS.length)), b.ms);
    return () => clearTimeout(id);
  }, [step, beat, visible, still]);

  // The cursor goes to what the beat is about, or rests in the corner at a step's start.
  useEffect(() => {
    const box = body.current;
    if (!box || still) return;
    if (!b.at) {
      if (beat === 0) setCursor({ x: box.clientWidth * 0.82, y: box.clientHeight * 0.84 });
      return;
    }
    const el = box.querySelector<HTMLElement>(`[data-at="${b.at}"]`);
    if (!el) return;
    const o = box.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    setCursor({ x: r.left - o.left + r.width * 0.5, y: r.top - o.top + r.height * 0.62 });
  }, [step, beat, still]);

  const total = s.beats.reduce((a, x) => a + x.ms, 0);
  const done = s.beats.slice(0, beat + 1).reduce((a, x) => a + x.ms, 0);

  return (
    <div className="how" ref={root}>
      <ol className="how-steps">
        {STEPS.map((x, i) => (
          <li key={x.title}>
            <button type="button" className={`how-step${i === step ? ' on' : ''}`} aria-pressed={i === step} onClick={() => go(i)}>
              <span className="how-num">0{i + 1}</span>
              <span className="how-text">
                <strong><span className="how-full">{x.title}</span><span className="how-short">{x.short}</span></strong>
                <span>{x.line}</span>
              </span>
              {!still && (
                <span className="how-bar" aria-hidden="true">
                  <i style={i === step ? { width: `${(done / total) * 100}%`, transition: visible ? `width ${b.ms}ms linear` : 'none' } : undefined} />
                </span>
              )}
            </button>
          </li>
        ))}
      </ol>
      <p className="how-caption">{s.line}</p>
      <div className="demo-window how-window" role="img" aria-label={`Step ${step + 1}: ${s.title}. ${s.line}`}>
        <div className="demo-top" aria-hidden="true">
          <span className="demo-dots"><i /><i /><i /></span>
          <span className="demo-title">{step === 2 ? <Icon name="candles" size={14} /> : <Mark size={14} />} {s.bar}</span>
          {step === 2 && <span className={`demo-pill${reached('broke') ? ' over' : ''}`}><span className="live-dot" /> DisciplineGuard · On · {reached('broke') ? 4 : reached('placed') ? 3 : 2} of 3 trades</span>}
        </div>
        <div className="demo-body how-body" ref={body} aria-hidden="true">
          {step === 0 && <RulesScreen reached={reached} pressed={pressed} />}
          {step === 1 && <ConnectScreen reached={reached} pressed={pressed} />}
          {step === 2 && <TradeScreen reached={reached} pressed={pressed} />}
          {!still && cursor && (
            <div className={`demo-cursor${b.click ? ' click' : ''}`} style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}>
              <svg width="22" height="22" viewBox="0 0 24 24"><path d="M5 3.5 18.5 12 12 13.4 9.2 19.5 5 3.5Z" fill="#fff" stroke="#0b1220" strokeWidth="1.4" strokeLinejoin="round" /></svg>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const press = (on: boolean) => (on ? ' hw-press' : '');

/** Start free's "What costs you the most?": two ticks turn on their rules, then Save my rules. */
function RulesScreen({ reached, pressed }: { reached: Reached; pressed: Pressed }) {
  const rows: { at?: string; on: boolean; icon: IconName; label: string; rule?: [string, string] }[] = [
    { at: 'c1', on: reached('tick1'), icon: 'hash', label: 'I take too many trades', rule: [RULE_INFO.R1.name, '3'] },
    { at: 'c2', on: reached('tick2'), icon: 'hourglass', label: 'I trade to win back a loss', rule: [RULE_INFO.R7.name, '15 min'] },
    { on: false, icon: 'stop', label: 'I skip my stop loss' },
  ];
  return (
    <div className="hw">
      <div className="hw-h">What costs you the most?</div>
      <div className="hw-list">
        {rows.map((x) => (
          <div key={x.label} className={`hw-choice${x.on ? ' on' : ''}`}>
            <div className="hw-row">
              <span className={`hw-box${press(!!x.at && pressed(x.at))}`} data-at={x.at}>{x.on && <Icon name="check" size={12} strokeWidth={3} />}</span>
              <span className={`tile hw-tile${x.on ? ' accent' : ''}`}><Icon name={x.icon} size={15} /></span>
              <span>{x.label}</span>
            </div>
            {x.rule && (
              <div className="hw-rule">
                <div>
                  <div className="hw-rule-in">
                    <span>{x.rule[0]}</span>
                    <span className="value-pill on">{x.rule[1]}</span>
                    <span className="switch hw-switch"><input type="checkbox" checked readOnly tabIndex={-1} /><span /></span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="hw-foot">
        <span className={`hw-btn primary${press(pressed('save'))}`} data-at="save">Save my rules</span>
      </div>
      <div className={`demo-toast${reached('saved') ? ' on' : ''}`}><Icon name="check" size={15} strokeWidth={2.2} /> Rules saved</div>
    </div>
  );
}

/** Connect for MetaTrader 5: download, Allow on the website, Connect in the app, then On. */
function ConnectScreen({ reached, pressed }: { reached: Reached; pressed: Pressed }) {
  const n = (done: boolean, i: number) => <span className="hw-n">{done ? <Icon name="check" size={13} strokeWidth={2.6} /> : i}</span>;
  return (
    <div className="hw">
      <div className="hw-h"><Icon name="window" size={16} /> MetaTrader 5 · Windows app</div>
      <ol className="hw-steps">
        <li className={reached('dl') ? 'done' : ''}>
          {n(reached('dl'), 1)}
          <span className={`hw-btn primary${press(pressed('dl'))}`} data-at="dl"><Icon name="download" size={14} /> Download DisciplineGuard</span>
        </li>
        <li className={reached('allowed') ? 'done' : ''}>{n(reached('allowed'), 2)}<span>Open it and click <b>Allow</b></span></li>
        <li className={reached('on') ? 'done' : ''}>{n(reached('on'), 3)}<span>Tick your MetaTrader and press <b>Connect</b></span></li>
      </ol>
      <p className={`hw-live${reached('on') ? ' on' : reached('allowed') ? ' allowed' : ''}`}>
        {reached('on') ? (
          <><span className="dot on live" /> <span>FTMO ···a90 · <b>On</b></span></>
        ) : reached('allowed') ? (
          <><Icon name="check" size={15} strokeWidth={2.2} /> Allowed on DESKTOP-4F2</>
        ) : (
          <><span className="dot setting_up live" /> Waiting for your computer…</>
        )}
      </p>
      <div className={`hw-pop${reached('dl') && !reached('allowed') ? ' on' : ''}`}>
        <Mark size={30} />
        <b>Allow DisciplineGuard on this computer?</b>
        <span className="hw-sub">DESKTOP-4F2 · Windows</span>
        <span className={`hw-btn primary${press(pressed('allow'))}`} data-at="allow">Allow</span>
      </div>
      <div className={`hw-pop hw-app${reached('allowed') && !reached('on') ? ' on' : ''}`}>
        <div className="hw-app-top"><Mark size={14} /> DisciplineGuard</div>
        <div className="hw-mt"><span className="hw-box"><Icon name="check" size={12} strokeWidth={3} /></span> MetaTrader 5 · FTMO</div>
        <span className={`hw-btn primary${press(pressed('protect'))}`} data-at="protect">Connect</span>
      </div>
    </div>
  );
}

/** A small chart that drifts up: candles as [open, high, low, close]. */
const CANDLES: [number, number, number, number][] = (() => {
  let s = 11;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let p = 60;
  return Array.from({ length: 32 }, (_, i) => {
    const o = p;
    const c = o + (i < 20 ? 0.55 : -0.25) + (rnd() - 0.5) * 3.4;
    p = c;
    return [o, Math.max(o, c) + rnd() * 1.6, Math.min(o, c) - rnd() * 1.6, c];
  });
})();

/** The chart: a trade within the rules is placed; the next breaks the day's limit, goes through, and is marked. */
function TradeScreen({ reached, pressed }: { reached: Reached; pressed: Pressed }) {
  const lo = Math.min(...CANDLES.map((c) => c[2]));
  const hi = Math.max(...CANDLES.map((c) => c[1]));
  const y = (v: number) => 10 + ((hi - v) / (hi - lo)) * 200;
  const w = 540 / CANDLES.length;
  const order: Order = { platform: 'mt5', account: 'demo', symbol: 'EURUSD', side: 'buy', size: 0.5, type: 'market', kind: 'entry' };
  const line = breakLine({ rule: 'R1', observed: 4, limit: 3 }, order, coreFmt(), Date.now());
  return (
    <div className="hw hw-trade">
      <svg className="hw-chart" viewBox="0 0 600 220" preserveAspectRatio="none" data-at="chart">
        {[0.25, 0.5, 0.75].map((f) => <line key={f} className="demo-grid" x1="0" x2="540" y1={220 * f} y2={220 * f} />)}
        {CANDLES.map(([o, h, l, c], i) => {
          const x = (i + 0.5) * w;
          return (
            <g key={i} className={c >= o ? 'demo-up' : 'demo-down'}>
              <line x1={x} x2={x} y1={y(h)} y2={y(l)} strokeWidth="1.2" />
              <rect x={x - w * 0.31} y={y(Math.max(o, c))} width={w * 0.62} height={Math.max(1.5, Math.abs(y(o) - y(c)))} rx="1.2" />
            </g>
          );
        })}
        <line className="demo-last" x1="0" x2="540" y1={y(CANDLES[CANDLES.length - 1][3])} y2={y(CANDLES[CANDLES.length - 1][3])} />
      </svg>
      <div className="demo-ticket">
        <span className="demo-sym">EURUSD</span>
        <span className="demo-lots"><span className="faint">Lots</span> 0.50</span>
        <span className="demo-btn sell"><small>Sell</small>1.08412</span>
        <span className={`demo-btn buy${pressed('buy') ? ' pressed' : ''}`} data-at="buy"><small>Buy</small>1.08415</span>
      </div>
      <div className={`demo-toast${reached('placed') && !reached('aimBuy2') ? ' on' : ''}`}><Icon name="check" size={15} strokeWidth={2.2} /> Placed. Trade 3 of 3 today.</div>
      <div className={`demo-note${reached('broke') ? ' on' : ''}`}>
        <div className="dp-label"><Mark size={15} /> PAST YOUR RULE · MAX TRADES PER DAY</div>
        <div className="dp-head">{line}</div>
        <div className="dp-line">Placed, and it counts toward today.</div>
      </div>
    </div>
  );
}
