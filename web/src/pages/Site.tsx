// The public website (EXPERIENCE §4): one page at `/` for signed-out visitors. Signed in, `/` is Today.
// Home, when each tool acts, how it works, the rules, what it never does, a real recording and pricing (free, 1 account),
// with a live demo pause.
import { useEffect, useState } from 'react';
import { TRUST_LINES, type Order, type PausePlan } from '@dg/core';
import { coreFmt } from '../fmt.ts';
import { onLink } from '../router.ts';
import { Brand, Mark } from '../ui/Brand.tsx';
import { HeroDemo } from '../ui/HeroDemo.tsx';
import { Icon, RULE_ICON, type IconName } from '../ui/Icon.tsx';
import { Pause } from '../ui/Pause.tsx';
import { RULE_INFO } from '../ui/RuleFields.tsx';

const SOURCE = 'https://github.com/wwwlqh/disciplineguard';

/** A revenge trade four minutes after a loss: the moment the product is for. */
function demo(): { plan: PausePlan; order: Order } {
  return {
    plan: { title: 'R7', violations: [{ rule: 'R7', observed: 4, limit: 15, clearsAt: Date.now() + 11 * 60_000 }], waitSec: 5, tradeNumber: 4, placedAnyway: 0 },
    order: { platform: 'tv', account: 'demo', symbol: 'NAS100', side: 'buy', size: 2, type: 'market', kind: 'entry', sl: 18_240 },
  };
}

const RULES = (['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10'] as const);

const PLATFORMS: [string, string, string][] = [
  ['M5', 'MetaTrader 5', 'Windows'],
  ['TV', 'TradingView', 'Chrome · Edge'],
  ['P', 'Polymarket', 'Chrome · Edge'],
  ['K', 'Kalshi', 'Chrome · Edge'],
];

const PROMISE_ICONS: IconName[] = ['shieldCheck', 'bolt', 'lock'];

/** Fades sections in as they scroll into view. */
function useReveal() {
  useEffect(() => {
    const els = [...document.querySelectorAll('.reveal')];
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) {
      els.forEach((e) => e.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);
}

export function Site() {
  const [d, setD] = useState<ReturnType<typeof demo> | null>(null);
  const [after, setAfter] = useState('');
  const [scrolled, setScrolled] = useState(false);
  useReveal();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const start = (cls = 'btn primary big') => (
    <a href="/start" onClick={onLink} className={cls}>
      Start free <Icon name="arrowRight" size={16} />
    </a>
  );

  return (
    <div className="site">
      <header className={`site-nav${scrolled ? ' scrolled' : ''}`}>
        <div className="wrap">
          <Brand />
          <nav>
            <a href="#how">How it works</a>
            <a href="#rules">Rules</a>
            <a href="#platforms">Platforms</a>
            <a href="#pricing">Pricing</a>
            <a href="/signin" onClick={onLink} className="btn ghost">Sign in</a>
            {start('btn primary')}
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="wrap">
          <div>
            <span className="pill-badge"><b><Icon name="sparkle" size={12} /> Free</b> 1 trading account · every rule</span>
            <h1>Lockout tools act after your limit. <span className="grad-text">DisciplineGuard pauses you at the click.</span></h1>
            <p className="lead">Set your own trading rules. A trade that breaks one gets a short pause first. Skip it, or place it anyway.</p>
            <div className="hero-cta">
              {start()}
              <button className="big" onClick={() => { setAfter(''); setD(demo()); }}><Icon name="pause" size={16} /> Try the pause</button>
            </div>
            {after && <p className="demo-after" role="status"><Icon name="check" size={16} /> {after}</p>}
            <div className="hero-meta">
              <span><Icon name="check" size={15} /> No card needed</span>
              <span><Icon name="check" size={15} /> Closing is never paused</span>
              <span><Icon name="check" size={15} /> Set up in two minutes</span>
            </div>
          </div>
          <HeroDemo />
        </div>
      </section>

      <section className="platform-strip" id="platforms">
        <div className="wrap">
          <span className="eyebrow">Works where you trade</span>
          {PLATFORMS.map(([g, name, where]) => (
            <span key={name} className="plat"><span className="glyph">{g}</span><span>{name} <small>{where}</small></span></span>
          ))}
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head reveal">
            <span className="eyebrow">When each tool acts</span>
            <h2>The moment that matters is the click.</h2>
          </div>
          <div className="card moment reveal">
            <Moment />
          </div>
          <div className="moment-cards">
            <div className="card us reveal"><h3><Mark size={20} /> DisciplineGuard</h3><p>At the click, before the order. You decide, every time.</p></div>
            <div className="card reveal"><h3><Icon name="lock" size={18} /> Lockout tools</h3><p>After the limit. You're locked out.</p></div>
            <div className="card reveal"><h3><Icon name="file" size={18} /> Journals</h3><p>After the trade. Too late for this one.</p></div>
          </div>
        </div>
      </section>

      <section className="sec" id="how">
        <div className="wrap">
          <div className="sec-head reveal">
            <span className="eyebrow">How it works</span>
            <h2>Three steps. Then you trade.</h2>
          </div>
          <div className="steps3">
            <div className="card step3 reveal">
              <div className="vignette"><VignetteRules /></div>
              <span className="num">01</span>
              <h3>Set your rules</h3>
              <p>Pick from a starting template in two minutes.</p>
            </div>
            <div className="card step3 reveal">
              <div className="vignette"><VignetteChart /></div>
              <span className="num">02</span>
              <h3>Trade as usual</h3>
              <p>Nothing changes until a trade breaks a rule.</p>
            </div>
            <div className="card step3 reveal">
              <div className="vignette"><VignettePause /></div>
              <span className="num">03</span>
              <h3>Break a rule, get a pause</h3>
              <p>It names the rule. Skip, or place anyway after the wait.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec" id="rules">
        <div className="wrap">
          <div className="sec-head reveal">
            <span className="eyebrow">The rules</span>
            <h2>Ten rules. Your numbers.</h2>
            <p>Tightening a rule applies now. Loosening one waits until your next day reset, so a bad moment can't switch it off.</p>
          </div>
          <div className="rules-grid">
            {RULES.map((id) => (
              <div key={id} className="rule-tile reveal">
                <span className="tile accent"><Icon name={RULE_ICON[id]} /></span>
                <div><strong>{RULE_INFO[id].name}</strong><span>{RULE_INFO[id].meaning}</span></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head reveal">
            <span className="eyebrow">What it never does</span>
            <h2>Your trades stay yours.</h2>
          </div>
          <div className="promises">
            {TRUST_LINES.map((t, i) => (
              <div key={t} className="card promise reveal">
                <span className="tile accent"><Icon name={PROMISE_ICONS[i]} size={22} /></span>
                <p>{t}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head reveal">
            <span className="eyebrow">On a real chart</span>
            <h2>See it on TradingView.</h2>
          </div>
          <div className="browser reveal">
            <div className="browser-bar">
              <span className="demo-dots"><i /><i /><i /></span>
              <span className="url">tradingview.com/chart</span>
            </div>
            <video src="/demo-tradingview.webm" autoPlay muted loop playsInline aria-label="A Buy on TradingView past the day's trade limit gets a pause and is skipped" />
          </div>
          <p className="caption">Trade 3 on a day capped at 1. Paused, skipped, nothing placed.</p>
        </div>
      </section>

      <section className="sec" id="pricing">
        <div className="wrap">
          <div className="sec-head reveal">
            <span className="eyebrow">Pricing</span>
            <h2>Free. Every rule.</h2>
          </div>
          <div className="price-wrap">
            <div className="card price-card reveal">
              <span className="chip accent"><Icon name="sparkle" size={12} /> Free</span>
              <div className="amount">$0 <small>forever, for 1 account</small></div>
              <ul>
                <li><Icon name="check" size={17} /> Every rule, every popup setting</li>
                <li><Icon name="check" size={17} /> MetaTrader 5, TradingView, Polymarket and Kalshi</li>
                <li><Icon name="check" size={17} /> TradingView Paper Trading doesn't count</li>
                <li><Icon name="check" size={17} /> No card needed</li>
              </ul>
              {start()}
              <p className="small faint" style={{ textAlign: 'center', margin: '12px 0 0' }}>Plans for more accounts are coming.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="sec" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="cta-band reveal">
            <Mark size={44} />
            <h2 style={{ marginTop: 18 }}>A pause before the trade<br />that costs you.</h2>
            <p>Your rules. Your call. Every time.</p>
            {start()}
          </div>
        </div>
      </section>

      <footer className="site-foot">
        <div className="wrap">
          <Brand />
          <nav>
            <a href="/help" onClick={onLink}>Help</a>
            <a href="/help/data" onClick={onLink}>What we store</a>
            <a href="/status" onClick={onLink}>Status</a>
            <a href={SOURCE}>Source code</a>
          </nav>
          <span className="faint">© {new Date().getFullYear()} DisciplineGuard</span>
        </div>
      </footer>

      {d && (
        <Pause
          practice
          plan={d.plan}
          order={d.order}
          note={{ text: 'The market will be here tomorrow.', setAt: Date.now() - 3 * 86_400_000 }}
          planText="2 trades a day, only at the London open"
          fmt={coreFmt()}
          onDecision={(x) => {
            setD(null);
            setAfter(x === 'place' ? 'In real trading, your next click places it. It counts toward today.' : 'Skipped. Nothing was placed. That’s the whole idea.');
          }}
        />
      )}
    </div>
  );
}

/** Where each tool acts on a trade's path: DisciplineGuard at the click, the others after. */
function Moment() {
  const stops: [number, string][] = [[90, 'Rule broken'], [330, 'The click'], [530, 'Order sent'], [730, 'Limit hit'], [910, 'Review']];
  return (
    <svg viewBox="0 30 1000 145" role="img" aria-label="Journals act after the trade, lockout tools after the limit, DisciplineGuard at the click">
      <defs>
        <linearGradient id="m-grad" x1="0" x2="1">
          <stop offset="0" stopColor="#12b8cf" stopOpacity=".15" />
          <stop offset="1" stopColor="#12b8cf" />
        </linearGradient>
        <filter id="m-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
      </defs>
      <line className="m-track" x1="60" x2="940" y1="120" y2="120" strokeWidth="2" />
      <line x1="60" x2="330" y1="120" y2="120" stroke="url(#m-grad)" strokeWidth="3" strokeLinecap="round" />
      {stops.map(([x, label]) => (
        <g key={label}>
          <circle className={x === 330 ? '' : 'm-node'} cx={x} cy="120" r={x === 330 ? 9 : 6} fill={x === 330 ? '#12b8cf' : undefined} strokeWidth="1.5" />
          <text className={x === 330 ? 'm-us' : 'm-small'} x={x} y="156" textAnchor="middle">{label}</text>
        </g>
      ))}
      <circle cx="330" cy="120" r="20" fill="#12b8cf" opacity=".25" filter="url(#m-glow)" />
      <g transform="translate(330 66)">
        <rect x="-92" y="-22" width="184" height="36" rx="12" fill="rgb(18 184 207 / 10%)" stroke="rgb(18 184 207 / 45%)" />
        <text className="m-us" x="0" y="1" textAnchor="middle">DisciplineGuard pauses</text>
        <line x1="0" x2="0" y1="14" y2="44" stroke="#12b8cf" strokeWidth="1.5" />
      </g>
      <g transform="translate(730 66)">
        <rect x="-70" y="-22" width="140" height="36" rx="12" className="m-dim" />
        <text className="m-label" x="0" y="1" textAnchor="middle">Lockout tools</text>
        <line className="m-track" x1="0" x2="0" y1="14" y2="46" strokeWidth="1.5" />
      </g>
      <g transform="translate(910 66)">
        <rect x="-52" y="-22" width="104" height="36" rx="12" className="m-dim" />
        <text className="m-label" x="0" y="1" textAnchor="middle">Journals</text>
        <line className="m-track" x1="0" x2="0" y1="14" y2="48" strokeWidth="1.5" />
      </g>
    </svg>
  );
}

function VignetteRules() {
  const rows: [string, number][] = [['Max trades per day', 60], ['Cooldown after a loss', 35], ['Daily loss limit', 80]];
  return (
    <div className="vg-rules" aria-hidden="true">
      {rows.map(([name, w]) => (
        <div key={name}>
          <div className="vg-row"><span>{name}</span><span className="switch"><input type="checkbox" checked readOnly tabIndex={-1} /><span /></span></div>
          <div className="vg-bar"><i style={{ width: `${w}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function VignetteChart() {
  const pts = [70, 62, 66, 52, 56, 44, 48, 36, 40, 30, 34, 24];
  const path = pts.map((y, i) => `${i ? 'L' : 'M'}${12 + i * 21} ${y}`).join(' ');
  return (
    <svg className="vg-chart" viewBox="0 0 260 96" aria-hidden="true">
      <defs>
        <linearGradient id="vg-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#12b8cf" stopOpacity=".28" />
          <stop offset="1" stopColor="#12b8cf" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${path} L243 96 L12 96 Z`} fill="url(#vg-area)" />
      <path d={path} fill="none" stroke="#12b8cf" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      {[3, 7, 11].map((i) => (
        <g key={i} transform={`translate(${12 + i * 21} ${pts[i]})`}>
          <circle r="9" fill="#fff" stroke="#12b8cf" strokeWidth="1.5" />
          <path d="M-3.5 0 -1 2.5 3.8 -2.6" fill="none" stroke="#0b98c0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ))}
    </svg>
  );
}

function VignettePause() {
  return (
    <div className="vg-pause" aria-hidden="true">
      <span className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 9.5 }}><Mark size={12} /> PAUSE · YOUR RULE</span>
      <b>Your last trade closed at a loss 4 minutes ago.</b>
      <div className="vg-btns"><span>Skip this trade</span><span>Place anyway · 0:05</span></div>
    </div>
  );
}
