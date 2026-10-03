// The public website (EXPERIENCE §4): one page at `/`, where the logo leads. Signed in, its buttons open the dashboard.
// Home, how it works (played), compared with lockouts and journals, the rules, where it works, what it never does and
// pricing (free, 1 account).
import { useEffect, useState } from 'react';
import { TRUST_LINES } from '@dg/core';
import { onLink } from '../router.ts';
import { Brand, Mark } from '../ui/Brand.tsx';
import { HeroDemo } from '../ui/HeroDemo.tsx';
import { HowDemo } from '../ui/HowDemo.tsx';
import { Icon, RULE_ICON, type IconName } from '../ui/Icon.tsx';
import { RULE_INFO } from '../ui/RuleFields.tsx';
import { WHERE, WHERE_LINE, WhereGrid, worksOn } from '../ui/Where.tsx';

const SOURCE = 'https://github.com/wwwlqh/disciplineguard';

const RULES = (['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10'] as const);

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

/** Signed in: "setup" until the rules are saved, then "ready". */
export function Site({ account }: { account?: 'setup' | 'ready' }) {
  const [scrolled, setScrolled] = useState(false);
  useReveal();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const [href, label] = account === 'ready' ? ['/today', 'Open dashboard'] : account === 'setup' ? ['/start', 'Continue setup'] : ['/start', 'Start free'];
  const start = (cls = 'btn primary big') => (
    <a href={href} onClick={onLink} className={cls}>
      {label} <Icon name="arrowRight" size={16} />
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
            {!account && <a href="/signin" onClick={onLink} className="btn ghost">Sign in</a>}
            {start('btn primary')}
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="wrap">
          <div>
            <span className="pill-badge"><b><Icon name="sparkle" size={12} /> Free</b> 1 trading account · every rule</span>
            <h1>Your trading rules, <span className="grad-text">counted on every trade.</span></h1>
            <p className="lead">Set your own rules. Every trade you place is counted against them, and one that goes past a rule is marked. Nothing is ever blocked.</p>
            <div className="hero-cta">
              {start()}
              <a className="btn big" href="#how"><Icon name="play" size={16} /> See how it works</a>
            </div>
            <div className="hero-meta">
              <span><Icon name="check" size={15} /> No card needed</span>
              <span><Icon name="check" size={15} /> Never blocks a trade</span>
              <span><Icon name="check" size={15} /> Set up in two minutes</span>
            </div>
          </div>
          <HeroDemo />
        </div>
      </section>

      <section className="platform-strip">
        <div className="wrap">
          <span className="eyebrow">Works with</span>
          {WHERE.map((p) => (
            <a key={p.id} href="#platforms" className="plat">
              <img className="where-glyph" src={p.logo} alt="" />
              <span>{p.name} <small>{worksOn(p)}</small></span>
            </a>
          ))}
        </div>
      </section>

      <section className="sec" id="how">
        <div className="wrap">
          <div className="sec-head reveal">
            <span className="eyebrow">How it works</span>
            <h2>Three steps. Then you trade.</h2>
          </div>
          <div className="reveal">
            <HowDemo />
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="sec-head reveal">
            <span className="eyebrow">Compared</span>
            <h2>No journal to fill in. No lockout.</h2>
          </div>
          <div className="moment-cards">
            <div className="card us reveal"><h3><Mark size={20} /> DisciplineGuard</h3><p>Counts every trade by itself, as you place it. You always decide.</p></div>
            <div className="card reveal"><h3><Icon name="lock" size={18} /> Lockout tools</h3><p>Lock you out after the limit.</p></div>
            <div className="card reveal"><h3><Icon name="file" size={18} /> Journals</h3><p>You write each trade up yourself, after.</p></div>
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

      <section className="sec" id="platforms">
        <div className="wrap">
          <div className="sec-head reveal">
            <span className="eyebrow">Where it works</span>
            <h2>Your platform, on your computer.</h2>
            <p>{WHERE_LINE}</p>
          </div>
          <div className="where-wrap">
            <WhereGrid reveal />
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
                <li><Icon name="check" size={17} /> Every rule, every alert</li>
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
            <h2 style={{ marginTop: 18 }}>See every time you go<br />past your own rules.</h2>
            <p>Your rules. Counted on every trade.</p>
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

    </div>
  );
}
