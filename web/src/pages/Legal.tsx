// Legal and help. DRAFT texts: a lawyer reviews them before the first beta user connects a live account (PHASES.md 1A).
import { TRUST_LINES } from '@dg/core';

export function Legal() {
  return (
    <div className="wizard" style={{ maxWidth: 760 }}>
      <p><a href="/today">← Back</a></p>
      <div className="banner amber">Draft texts. Not yet reviewed by a lawyer. Not in force until this notice is removed.</div>

      <h1 id="risk">Risk notice</h1>
      <p>DisciplineGuard is a self-control tool. It doesn't give investment, trading, financial or tax advice, and it doesn't manage your account.</p>
      <ul>
        <li>A pause can delay or cancel your order while prices move. You may get a worse price, or no trade at all.</li>
        <li>DisciplineGuard can stop checking: when your computer or terminal is off, when a platform changes, when you trade on your phone or another device, or when our service is down. Orders then go through without a pause.</li>
        <li>Closing a trade, changing a stop loss or take profit, and cancelling orders are never paused. DisciplineGuard never opens, changes or closes a trade unless you click to do it.</li>
        <li>Limits you set are checked from data on your device. They can differ from your broker's or prop firm's figures. Your firm's own rules always apply.</li>
        <li>Trading carries a high risk of losing money. Past results don't predict future ones.</li>
      </ul>

      <h2 id="terms" style={{ marginTop: 28 }}>Terms (summary of the draft)</h2>
      <ul>
        <li>You must be 18 or older.</li>
        <li>Loosening a rule waits until your next day reset, or 12 hours if later. Support can't unlock rules, apply scheduled changes early or reopen setup mode.</li>
        <li>Plans renew automatically until you cancel. Full refund on request within 14 days of your first payment for a plan.</li>
        <li>We may change these terms with at least 30 days' notice.</li>
      </ul>

      <h2 id="privacy" style={{ marginTop: 28 }}>What we see</h2>
      <div className="grid two">
        <div className="card">
          <h3>We see</h3>
          <ul className="small">
            <li>Trade counts and daily P/L totals</li>
            <li>Symbol, side and size of paused orders</li>
            <li>Broker or server name, last 3 digits of accounts</li>
            <li>Your rules, notes and plan (to show them to you)</li>
          </ul>
        </div>
        <div className="card">
          <h3>We never see</h3>
          <ul className="small">
            <li>Your broker password</li>
            <li>Full account numbers (we store a one-way code)</li>
            <li>Other websites</li>
          </ul>
          <p className="small muted">Notes, plans and reasons never go to analytics or partners.</p>
        </div>
      </div>
      <p className="small muted">Processors: Cloudflare (hosting, database), Resend (email), Lemon Squeezy (payments, as seller). Data is deleted on account deletion, or 90 days after your plan ends.</p>

      <h2 id="firms" style={{ marginTop: 28 }}>Is it allowed by my firm?</h2>
      <p>DisciplineGuard's MT5 panel sends only the orders you click, like any trade panel. Each user gets their own magic number, and orders carry no shared comment.</p>
      <ul>
        <li><strong>FTMO</strong>: allows EAs. It forbids EAs that make over 2,000 server requests a day, and third parties trading for you. Checked on FTMO's "Forbidden trading practices" page, updated 2 Feb 2026.</li>
      </ul>
      <p className="small muted">Firm rules change. Check your firm's current rules. DisciplineGuard isn't affiliated with any firm and doesn't guarantee you pass.</p>

      <h2 id="wellbeing" style={{ marginTop: 28 }}>Trading and wellbeing</h2>
      <p>Some stretches are harder than others. If trading is costing you sleep, money you need, or time with people, talking to someone helps. These services are free and confidential:</p>
      <ul>
        <li>UK: National Gambling Helpline (GamCare), 0808 8020 133</li>
        <li>US: 1-800-GAMBLER</li>
        <li>Australia: Gambling Help Online, gamblinghelponline.org.au</li>
        <li>Worldwide: Gamblers Anonymous, gamblersanonymous.org</li>
      </ul>
      <p className="small muted">Before this page goes live, each service is confirmed to accept trading-related problems.</p>

      <h2 style={{ marginTop: 28 }}>Our promises</h2>
      <ul>{TRUST_LINES.map((l) => <li key={l}>{l}</li>)}</ul>
      <p className="footer-legal">TradingView, MetaTrader and Telegram are trademarks of their owners; DisciplineGuard isn't affiliated with or endorsed by them.</p>
    </div>
  );
}
