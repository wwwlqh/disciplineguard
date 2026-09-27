// The public website (EXPERIENCE §4): one page at `/` for signed-out visitors. Signed in, `/` is Today.
// Home, how it works, the comparison, platforms and pricing, with a live demo pause.
import { useState } from 'react';
import { RULE_NAMES, TRUST_LINES, type Order, type PausePlan } from '@dg/core';
import { coreFmt } from '../fmt.ts';
import { onLink } from '../router.ts';
import { Pause } from '../ui/Pause.tsx';

const SOURCE = 'https://github.com/wwwlqh/disciplineguard-clients';

/** A revenge trade four minutes after a loss: the moment the product is for. */
function demo(): { plan: PausePlan; order: Order } {
  return {
    plan: { title: 'R7', violations: [{ rule: 'R7', observed: 4, limit: 15, clearsAt: Date.now() + 11 * 60_000 }], waitSec: 5, tradeNumber: 4, placedAnyway: 0 },
    order: { platform: 'tv', account: 'demo', symbol: 'NAS100', side: 'buy', size: 2, type: 'market', kind: 'entry', sl: 18_240 },
  };
}

// The rules, by their product names. Max risk per trade is MT5 only.
const RULES = (['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R10'] as const).map((id) => RULE_NAMES[id]);

export function Site() {
  const [d, setD] = useState<ReturnType<typeof demo> | null>(null);
  const [after, setAfter] = useState('');
  const start = (
    <a href="/signin" onClick={onLink} className="btn primary">
      Start 14-day free trial
    </a>
  );
  return (
    <div className="site">
      <header className="site-nav">
        <a href="/" onClick={onLink} className="brand"><img src="/mark.svg" alt="" /> DisciplineGuard</a>
        <nav className="row">
          <a href="#how">How it works</a>
          <a href="#platforms">Platforms</a>
          <a href="#pricing">Pricing</a>
          <a href="/signin" onClick={onLink} className="btn">Sign in</a>
        </nav>
      </header>

      <section className="hero">
        <h1>Lockout tools act after your limit. DisciplineGuard pauses you at the click.</h1>
        <p className="lead">Set your own trading rules. A trade that breaks one gets a short pause first. Skip it, or place it anyway.</p>
        <div className="row">
          {start}
          <button onClick={() => { setAfter(''); setD(demo()); }}>Try the pause</button>
        </div>
        <p className="muted small">MT5 and TradingView. No card needed.</p>
        {after && <p className="demo-after" role="status">{after}</p>}
      </section>

      <section className="trust">
        {TRUST_LINES.map((t) => <p key={t}>{t}</p>)}
      </section>

      <section id="how">
        <h2>How it works</h2>
        <ol className="how">
          <li><b>Set your rules.</b> Pick from a starting template in two minutes.</li>
          <li><b>Trade as usual.</b> Nothing changes until a trade breaks a rule.</li>
          <li><b>Break a rule, get a pause.</b> It names the rule. Skip, or place anyway after the wait.</li>
        </ol>
        <div className="rule-chips">{RULES.map((r) => <span key={r} className="chip">{r}</span>)}</div>
        <p className="muted">Tightening a rule applies now. Loosening one waits until your next day reset, so a bad moment can't switch it off.</p>
      </section>

      <section>
        <h2>When each tool acts</h2>
        <div className="table-wrap">
          <table className="data compare">
            <thead><tr><th></th><th>Acts</th><th>You decide</th></tr></thead>
            <tbody>
              <tr><td>Journals</td><td>After the trade</td><td>Too late for this one</td></tr>
              <tr><td>Lockout tools</td><td>After the limit</td><td>No, you're locked out</td></tr>
              <tr className="us"><td>DisciplineGuard</td><td>At the click, before the order</td><td>Yes, every time</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="platforms">
        <h2>Platforms</h2>
        <div className="grid two">
          <div className="card">
            <h3>MetaTrader 5</h3>
            <p className="muted">On Windows. The app sets MetaTrader up for you: no files to copy, nothing to type. Works with prop firm and broker accounts.</p>
          </div>
          <div className="card">
            <h3>TradingView</h3>
            <p className="muted">In Chrome and Edge. Pauses the order panel and one-click Buy/Sell. Trades from the DOM or chart trading can't be paused yet, but they still count.</p>
          </div>
        </div>
        <p className="muted small">Not yet: phone apps, the TradingView desktop app, MT5 on Mac, MT4.</p>
      </section>

      <section id="pricing">
        <h2>Pricing</h2>
        <div className="grid two">
          <div className="card price">
            <h3>Yearly</h3>
            <p><span className="stat">$99</span> <span className="muted">a year</span></p>
          </div>
          <div className="card price">
            <h3>Monthly</h3>
            <p><span className="stat">$14.99</span> <span className="muted">a month</span></p>
          </div>
        </div>
        <p className="muted">14 days free from your first connection. No card needed. Full refund within 14 days of paying.</p>
        {start}
      </section>

      <footer className="site-foot row">
        <a href="/help" onClick={onLink}>Help</a>
        <a href="/help/data" onClick={onLink}>What we store</a>
        <a href={SOURCE}>Source code</a>
        <span className="faint">© {new Date().getFullYear()} DisciplineGuard</span>
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
