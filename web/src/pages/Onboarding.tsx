// Onboarding (EXPERIENCE §5.2): four screens, nothing to type, Back always available, resumable.
// 1 Where you trade (each platform, and the ways you trade on it) · 2 About you · 3 Your rules (each ticked cost opens
// its rules; trading day) · 4 Connect (the Windows app for MT5, the browser extension for TradingView, Polymarket and Kalshi).
// Signed out (Start free, at /start), the first three run without an account: the draft stays in this browser,
// Save my rules asks to sign in, and the rules are saved to the account right after.
import { useEffect, useMemo, useState } from 'react';
import { buildTemplate, DEFAULT_POPUP, type Choice, type Rules } from '@dg/core';
import { api, type Me } from '../api.ts';
import { browserTz } from '../fmt.ts';
import { navigate } from '../router.ts';
import { SignIn } from './SignIn.tsx';
import { ConnectBrowser, ConnectMt5, siteList, type Site } from '../ui/Connect.tsx';
import { PracticePause, Switch } from '../ui/kit.tsx';
import { Brand } from '../ui/Brand.tsx';
import { Icon, type IconName } from '../ui/Icon.tsx';
import { RULE_INFO, RULE_ORDER, RuleFields, validRule } from '../ui/RuleFields.tsx';
import { LIVE, MT5_COUNTS, WayBody, WHERE, WhereCard, type Way } from '../ui/Where.tsx';

type AccountType = 'prop_challenge' | 'prop_funded' | 'own' | 'demo';
type Defaults = { r5?: { r5Max: number }; r5bet?: { r5Max: number }; r6?: { unit: 'pct'; value: number }; r8?: { unit: 'pct' | 'amount'; value: number }; r7ignore?: number };

interface Draft {
  /** 2 since "Where you trade" became the first screen. */
  v?: number;
  step: number;
  platforms: string[];
  accountType: AccountType;
  firm: string;
  firmDailyPct: number;
  style: 'scalping' | 'day' | 'swing';
  choices: Choice[];
  session: 'london' | 'new_york';
  usualSize: number;
  /** Polymarket and Kalshi sizes are in dollars. */
  usualBet?: number;
  /** Set once the trader edits a starting rule; until then rules follow the template. */
  rules: Rules | null;
  defaults: Defaults | null;
  tz: string;
  reset: 'midnight' | 'forex_close' | 'futures_session' | 'firm' | 'custom';
  customAt: string;
  applied: boolean;
}

/** Under the platforms (Where.tsx): what isn't one of them. */
const MORE: (Omit<Way, 'works'> & { works?: Way['works'] })[] = [
  { id: 'mt4', label: 'MetaTrader 4', icon: 'window', works: 'later' },
  { id: 'other', label: 'Somewhere else', icon: 'plus' },
];
const SITE_IDS: Site[] = ['tv', 'pm', 'kalshi'];
/** Polymarket or Kalshi: their sizes are in dollars. */
const hasBets = (p: string[]) => p.some((x) => ['pm', 'kalshi', 'pm_phone', 'kalshi_phone'].includes(x));
/** Only Polymarket or Kalshi: no sizes in lots, and prop accounts don't apply. */
function onlyBets(p: string[]): boolean {
  return hasBets(p) && !p.some((x) => x.startsWith('mt') || x.startsWith('tv'));
}

const hasMt = (p: string[]) => p.some((x) => x.startsWith('mt'));

/** What can't be paused from the picks, in one line each. */
function limits(p: string[]): string[] {
  const out: string[] = [];
  if (p.includes('mt4')) out.push("MetaTrader 4 is coming later. We'll tell you.");
  if (p.includes('mt5_mac')) out.push("MetaTrader 5 on Mac isn't supported yet. We'll tell you.");
  if (p.includes('mt_phone') || p.includes('mt5_web')) out.push(MT5_COUNTS);
  if (p.includes('tv_desktop')) out.push("The TradingView desktop app can't be paused. Use the website in Chrome or Edge: same account, same charts.");
  if (['tv_phone', 'pm_phone', 'kalshi_phone'].some((x) => p.includes(x))) out.push("Phone apps can't be paused. Trade on your computer for the pause.");
  if (p.includes('other')) out.push("We'll tell you if we add your platform.");
  return out;
}

/** A phone or tablet: nothing there can be paused, so setup finishes on a computer. */
const MOBILE = typeof navigator !== 'undefined' && (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));

const COSTS: { id: Choice; label: string; icon: IconName }[] = [
  { id: 'too_many', label: 'I take too many trades', icon: 'hash' },
  { id: 'win_back', label: 'I trade to win back a loss', icon: 'hourglass' },
  { id: 'size_up', label: 'I size up after a loss', icon: 'sizeUp' },
  { id: 'hours', label: 'I trade outside my plan hours', icon: 'sun' },
  { id: 'skip_sl', label: 'I skip my stop loss', icon: 'stop' },
  { id: 'bad_days', label: 'I keep going on a bad day', icon: 'trendDown' },
  { id: 'give_back', label: 'I give back profits after a good start', icon: 'refresh' },
];

/** Firm presets: daily loss limit and reset. Check your firm's current rules. */
const FIRMS: Record<string, { pct: number; reset: { at: string; tz: string }; basis: string }> = {
  FTMO: { pct: 5, reset: { at: '00:00', tz: 'Europe/Prague' }, basis: 'the day\'s starting balance or equity' },
};

const STEPS = ['Where you trade', 'About you', 'Your rules', 'Connect'];
const RULES_STEP = 2;
const CONNECT_STEP = 3;

/** A signed-out draft, kept in this browser until the trader signs in. */
const GUEST_KEY = 'dg:onboarding';
type Stored = Draft & { pending?: boolean };
function readGuest(): Stored | null {
  try {
    const v = JSON.parse(localStorage.getItem(GUEST_KEY) ?? 'null');
    return v && typeof v === 'object' && typeof v.step === 'number' ? v : null;
  } catch {
    return null;
  }
}
function writeGuest(d: Stored | null): void {
  try {
    if (d) localStorage.setItem(GUEST_KEY, JSON.stringify(d));
    else localStorage.removeItem(GUEST_KEY);
  } catch {}
}

/** Next local midnight, so a guest's practice pause can say when a daily limit clears. */
function nextMidnight(): number {
  const t = new Date();
  t.setHours(24, 0, 0, 0);
  return t.getTime();
}

const RESETS: Record<Draft['reset'], string> = {
  midnight: 'midnight in your timezone',
  forex_close: 'forex close, 17:00 New York',
  futures_session: 'futures session, 17:00 Chicago',
  firm: 'your prop firm\'s reset',
  custom: 'a custom time',
};

/** A draft from before "Where you trade" was added resumes one screen later. */
function upgrade<T extends Draft>(x: T): T {
  return x.v === 2 ? x : { ...x, v: 2, step: x.step + 1 };
}

function initial(me: Me | null): Draft {
  const stored = readGuest();
  const guest = stored && upgrade(stored);
  // Rules set before signing in win: Save my rules was pressed for them.
  if (guest && (!me || guest.pending)) return { ...guest, step: Math.min(guest.step, RULES_STEP), applied: false };
  const raw = me?.user.onboarding;
  const saved = raw && typeof raw === 'object' && typeof raw.step === 'number' && !raw.done ? upgrade(raw as Draft) : null;
  if (saved && saved.step < STEPS.length) return { ...saved, step: saved.applied ? saved.step : Math.min(saved.step, RULES_STEP) };
  return {
    v: 2, step: 0, platforms: [], accountType: 'own', firm: 'FTMO', firmDailyPct: 5, style: 'day', choices: [], session: 'london', usualSize: 0.5, usualBet: 20,
    rules: null, defaults: null, tz: browserTz(), reset: 'midnight', customAt: '00:00',
    applied: false,
  };
}

export function Onboarding({ me, reload }: { me: Me | null; reload(): Promise<void> }) {
  const [d, setD] = useState<Draft>(() => initial(me));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [practiceOpen, setPracticeOpen] = useState(false);
  const [signIn, setSignIn] = useState(false);
  const [pending] = useState(() => !!me && !!readGuest()?.pending);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const betsOnly = onlyBets(d.platforms);
  const bets = hasBets(d.platforms);
  /** Max risk per trade works on MetaTrader only. */
  const mt = hasMt(d.platforms);
  const accountType: AccountType = betsOnly && d.accountType.startsWith('prop') ? 'own' : d.accountType;
  const isProp = accountType === 'prop_challenge' || accountType === 'prop_funded';
  const reset: Draft['reset'] = d.reset === 'firm' && !isProp ? 'midnight' : d.reset;
  // The starting rules follow a switch to or from lots, dollars or MetaTrader.
  const togglePlatform = (id: string, on: boolean) => {
    const platforms = on ? [...d.platforms, id] : d.platforms.filter((x) => x !== id);
    const same = onlyBets(platforms) === betsOnly && hasBets(platforms) === bets && hasMt(platforms) === mt;
    set(same ? { platforms } : { platforms, rules: null, defaults: null });
  };

  // Save progress so onboarding can be resumed (EXPERIENCE §5.2).
  useEffect(() => {
    if (d.applied || pending) return;
    if (!me) return writeGuest(d);
    const id = setTimeout(() => void api('PUT', '/api/onboarding', { state: d }).catch(() => {}), 600);
    return () => clearTimeout(id);
  }, [d]);

  // Just signed in after Save my rules: save them to the account.
  useEffect(() => {
    if (pending) void apply();
  }, []);

  const template = useMemo(() => {
    const t = buildTemplate({
      choices: isProp && !d.choices.includes('bad_days') ? [...d.choices, 'bad_days'] : d.choices,
      style: d.style,
      userTz: d.tz,
      session: d.session,
      accounts: [{ id: 'default', platform: 'mt5', type: accountType, usualSize: d.usualSize, prop: isProp ? { dailyLimitPct: d.firmDailyPct } : undefined }],
    });
    if (!mt) t.rules.R6 = { on: false };
    return t;
  }, [d.choices, d.style, d.tz, d.session, accountType, d.usualSize, d.firmDailyPct, mt]);

  const tplAcc = template.rules.accounts.default ?? {};
  const rules = d.rules ?? template.rules;
  const defaults: Defaults = d.defaults ?? {
    // Lots for MetaTrader and TradingView, dollars for Polymarket and Kalshi: the server keeps them apart.
    r5: !betsOnly && tplAcc.r5Max !== undefined ? { r5Max: tplAcc.r5Max } : undefined,
    r5bet: bets && template.rules.R5.on ? { r5Max: d.usualBet ?? 20 } : undefined,
    r6: tplAcc.r6 as Defaults['r6'],
    r8: tplAcc.r8,
    r7ignore: tplAcc.r7IgnoreBelow,
  };
  const editRule = (id: string, v: unknown) => set({ rules: { ...rules, [id]: v } as Rules, defaults });
  const editDefaults = (p: Partial<Defaults>) => set({ rules, defaults: { ...defaults, ...p } });
  const rulesOn = RULE_ORDER.filter((id) => (rules as any)[id]?.on);

  /** Which rules each choice turns on by itself, so a ticked choice opens its own rules. */
  const choiceRules = useMemo(() => {
    const out: Partial<Record<Choice, string[]>> = {};
    for (const c of COSTS) {
      const t = buildTemplate({ choices: [c.id], style: d.style, userTz: d.tz, session: d.session, accounts: [{ id: 'default', platform: 'mt5', type: accountType, usualSize: d.usualSize }] });
      out[c.id] = RULE_ORDER.filter((id) => (t.rules as any)[id]?.on && (mt || id !== 'R6'));
    }
    return out;
  }, [d.style, d.tz, d.session, accountType, d.usualSize, mt]);
  /** Rules already shown under an earlier ticked choice: each rule shows once. */
  const shownBefore = (c: Choice) => {
    const seen = new Set<string>();
    for (const x of COSTS) {
      if (x.id === c) break;
      if (d.choices.includes(x.id)) for (const id of choiceRules[x.id] ?? []) seen.add(id);
    }
    return seen;
  };
  const underChoices = new Set(d.choices.flatMap((c) => choiceRules[c] ?? []));
  const extraRules = d.choices.length ? rulesOn.filter((id) => !underChoices.has(id)) : [];

  const ruleEditor = (id: string) => {
    const v = (rules as any)[id];
    return (
      <div key={id}>
        <div className="row between">
          <div>
            <strong>{RULE_INFO[id as keyof typeof RULE_INFO].name}</strong>
            <div className="small muted">{RULE_INFO[id as keyof typeof RULE_INFO].meaning}</div>
          </div>
          <Switch label={RULE_INFO[id as keyof typeof RULE_INFO].name} checked={v.on} onChange={(on) => editRule(id, { ...v, on })} />
        </div>
        {v.on && (
          <div style={{ marginTop: 8 }}>
            {id === 'R5' ? (
              <div className="row">
                {!betsOnly && (
                  <label className="field">Max size (lots)
                    <input type="number" className="narrow" min={0.01} step={0.01} value={defaults.r5?.r5Max ?? ''} onChange={(e) => editDefaults({ r5: { r5Max: Number(e.target.value) } })} />
                  </label>
                )}
                {bets && (
                  <label className="field">Max bet ($)
                    <input type="number" className="narrow" min={1} step={1} value={defaults.r5bet?.r5Max ?? ''} onChange={(e) => editDefaults({ r5bet: { r5Max: Number(e.target.value) } })} />
                  </label>
                )}
              </div>
            ) : id === 'R6' ? (
              <label className="field">Max risk per trade (% of the day's starting balance)
                <input type="number" className="narrow" min={0.1} max={10} step={0.1} value={defaults.r6?.value ?? 1} onChange={(e) => editDefaults({ r6: { unit: 'pct', value: Number(e.target.value) } })} />
              </label>
            ) : (
              <RuleFields inWizard id={id as any} value={v} onChange={(nv) => editRule(id, nv)} />
            )}
            {id === 'R8' && (
              <div className="row" style={{ marginTop: 8 }}>
                <label className="field">Daily loss limit
                  <input type="number" className="narrow" min={0.1} step={0.1} value={defaults.r8?.value ?? ''} onChange={(e) => editDefaults({ r8: { unit: defaults.r8?.unit ?? 'pct', value: Number(e.target.value) } })} />
                </label>
                <label className="field">Unit
                  <select value={defaults.r8?.unit ?? 'pct'} onChange={(e) => editDefaults({ r8: { unit: e.target.value as 'pct' | 'amount', value: defaults.r8?.value ?? 2 } })}>
                    <option value="pct">% of the day's starting balance</option>
                    <option value="amount">amount in account currency</option>
                  </select>
                </label>
              </div>
            )}
            {id === 'R8' && isProp && <p className="small muted">Your firm's overall limit isn't tracked.</p>}
          </div>
        )}
      </div>
    );
  };

  async function apply() {
    setBusy(true);
    setErr('');
    try {
      const resetSpec =
        reset === 'firm' && FIRMS[d.firm]
          ? { preset: 'custom', ...FIRMS[d.firm].reset }
          : reset === 'custom'
            ? { preset: 'custom', at: d.customAt, tz: d.tz }
            : { preset: reset };
      const payloadRules: Record<string, unknown> = {};
      for (const id of RULE_ORDER) payloadRules[id] = (rules as any)[id];
      await api('POST', '/api/onboarding/apply', {
        tz: d.tz, reset: resetSpec, rules: payloadRules,
        defaults: {
          r5: defaults.r5 ? { r5Max: defaults.r5.r5Max, r5Overrides: [] } : undefined,
          r5bet: defaults.r5bet ? { r5Max: defaults.r5bet.r5Max, r5Overrides: [] } : undefined,
          r6: defaults.r6, r8: defaults.r8, r7ignore: defaults.r7ignore,
        },
        popup: DEFAULT_POPUP, choices: d.choices, style: d.style,
        platforms: d.platforms, accountTypes: accountType, tellMe: d.platforms.filter((p) => !LIVE.includes(p)),
      });
      writeGuest(null);
      set({ applied: true, step: CONNECT_STEP });
    } catch (e: any) {
      setErr(e.message === e.code ? 'Something is missing. Check the earlier screens.' : e.message);
    } finally {
      setBusy(false);
    }
  }

  const canNext = (() => {
    switch (d.step) {
      case 0: return d.platforms.length > 0;
      case RULES_STEP: return d.choices.length > 0 && RULE_ORDER.every((id) => validRule(id, (rules as any)[id]));
      default: return true;
    }
  })();

  function next() {
    if (d.step === RULES_STEP && !me) {
      writeGuest({ ...d, pending: true });
      return setSignIn(true);
    }
    if (d.step === RULES_STEP) return void apply();
    set({ step: Math.min(STEPS.length - 1, d.step + 1) });
  }

  // Connect: the Windows app for MT5, the extension for the websites. A site's phone or desktop app gets the website's card,
  // since the website can be paused. MT5 phone and web terminal trades count only while MT5 runs with the Windows app.
  const mt5 = ['mt5', 'mt_phone', 'mt5_web'].some((x) => d.platforms.includes(x));
  const sites = SITE_IDS.filter((s) => d.platforms.some((x) => x === s || x.startsWith(`${s}_`)));
  const cantConnect = limits(d.platforms);

  async function finish(lock: boolean) {
    navigate(lock ? '/rules?lock=1' : '/today', true);
    await reload();
  }

  /** The logo: the website's first page, or Today once the rules are saved. */
  const home = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (d.applied) void finish(false);
    else navigate('/');
  };

  const draftMe = { ...(me ?? { time: { userResets: [nextMidnight()] } }), rules, notes: [], plan: '', popup: DEFAULT_POPUP } as Me;

  if (signIn && !me) return <SignIn title="Save your rules" onDone={() => window.dispatchEvent(new Event('dg:reload'))} />;
  if (pending && !d.applied && !err) return <div className="center-page muted">{err || 'Saving your rules…'}</div>;

  return (
    <div className="wizard">
      <div className="wizard-top">
        <Brand href={d.applied ? '/today' : '/'} onClick={home} />
        {me ? <span className="small faint">{me.user.email}</span> : <a className="small" href="/signin" onClick={(e) => { e.preventDefault(); navigate('/signin'); }}>Sign in</a>}
      </div>
      <ol className="stepper" aria-label={`Step ${d.step + 1} of ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <li key={s} className={i < d.step ? 'done' : i === d.step ? 'now' : ''} aria-current={i === d.step ? 'step' : undefined}>
            <span className="n">{i < d.step ? <Icon name="check" size={14} strokeWidth={2.4} /> : i + 1}</span>
            <span className="l">{s}</span>
          </li>
        ))}
      </ol>

      {d.step === 0 && (
        <section className="stack">
          <h1>Where do you trade?</h1>
          <p className="muted">Tick all that apply.</p>
          <div className="where-grid">
            {WHERE.map((p) => <WhereCard key={p.id} p={p} picked={d.platforms} onPick={togglePlatform} />)}
          </div>
          <ul className="where-ways pick where-more">
            {MORE.map((w) => (
              <li key={w.id} className={`way ${w.works ?? 'other'}`}>
                <label className="way-row">
                  <input type="checkbox" checked={d.platforms.includes(w.id)} onChange={(e) => togglePlatform(w.id, e.target.checked)} />
                  <WayBody w={w} />
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.step === 1 && (
        <section className="stack">
          <h1>About your trading</h1>
          <div>
            <p className="muted">What kind of account do you trade most?</p>
            <div className="option-grid">
              {([['prop_challenge', 'Prop challenge', 'target'], ['prop_funded', 'Funded prop', 'star'], ['own', 'My own money', 'account'], ['demo', 'Demo', 'play']] as const)
                .filter(([id]) => !betsOnly || !id.startsWith('prop'))
                .map(([id, label, icon]) => (
                  <label key={id} className="option">
                    <input type="radio" name="acct" checked={accountType === id} onChange={() => set({ accountType: id, rules: null, defaults: null, reset: id.startsWith('prop') && FIRMS[d.firm] ? 'firm' : d.reset === 'firm' ? 'midnight' : d.reset })} />
                    <span className="tile"><Icon name={icon} /></span>
                    <strong>{label}</strong>
                  </label>
                ))}
            </div>
          </div>
          {isProp && (
            <div className="grid two">
              <label className="field">
                Firm
                <input list="firms" value={d.firm} onChange={(e) => set({ firm: e.target.value, reset: FIRMS[e.target.value] ? 'firm' : d.reset })} />
                <datalist id="firms">{Object.keys(FIRMS).map((f) => <option key={f} value={f} />)}</datalist>
              </label>
              <label className="field">
                Firm's daily loss limit (%)
                <input type="number" min={0.5} max={20} step={0.5} value={d.firmDailyPct} onChange={(e) => set({ firmDailyPct: Number(e.target.value), rules: null, defaults: null })} />
              </label>
              {FIRMS[d.firm] && <p className="small muted">{d.firm} measures it from {FIRMS[d.firm].basis}.</p>}
            </div>
          )}
          <div className="grid two">
            <label className="field">
              How you trade
              <select value={d.style} onChange={(e) => set({ style: e.target.value as Draft['style'], rules: null, defaults: null })}>
                <option value="scalping">Scalping (seconds to minutes)</option>
                <option value="day">Day trading</option>
                <option value="swing">Swing (held for days)</option>
              </select>
            </label>
            {!betsOnly && (
              <label className="field">
                Usual position size (lots)
                <input type="number" min={0.01} step={0.01} value={d.usualSize} onChange={(e) => set({ usualSize: Number(e.target.value), rules: null, defaults: null })} />
              </label>
            )}
            {bets && (
              <label className="field">
                Usual bet ($)
                <input type="number" min={1} step={1} value={d.usualBet ?? 20} onChange={(e) => set({ usualBet: Number(e.target.value), rules: null, defaults: null })} />
              </label>
            )}
          </div>
        </section>
      )}

      {d.step === RULES_STEP && (
        <section className="stack">
          <h1>What costs you the most?</h1>
          <p className="muted">Tick all that apply. Each one opens its rules.</p>
          <div className="stack">
            {COSTS.map((c) => {
              const on = d.choices.includes(c.id);
              const ids = on ? (choiceRules[c.id] ?? []).filter((id) => !shownBefore(c.id).has(id)) : [];
              return (
                <div key={c.id} className={`card cost-card${on ? ' on' : ''}`}>
                  <label className="choice">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => set({ choices: e.target.checked ? [...d.choices, c.id] : d.choices.filter((x) => x !== c.id), rules: null, defaults: null })}
                    />
                    <span className={`tile${on ? ' accent' : ''}`}><Icon name={c.icon} /></span>
                    <span>
                      <strong>{c.label}</strong>
                      {c.id === 'give_back' && <div className="small muted">Coming later.</div>}
                    </span>
                  </label>
                  {on && (c.id === 'hours' || ids.length > 0) && (
                    <div className="cost-rules">
                      {c.id === 'hours' && (
                        <div className="row">
                          <label className="check small"><input type="radio" name="sess" checked={d.session === 'london'} onChange={() => set({ session: 'london', rules: null, defaults: null })} /> London 08:00–11:00</label>
                          <label className="check small"><input type="radio" name="sess" checked={d.session === 'new_york'} onChange={() => set({ session: 'new_york', rules: null, defaults: null })} /> New York 14:30–17:00</label>
                        </div>
                      )}
                      {ids.map(ruleEditor)}
                    </div>
                  )}
                </div>
              );
            })}
            {extraRules.length > 0 && (
              <div className="card stack">
                <strong>{isProp ? 'For your prop account' : 'Also on'}</strong>
                {extraRules.map(ruleEditor)}
              </div>
            )}
          </div>
          <details className="card">
            <summary>Your day resets at {reset === 'firm' && FIRMS[d.firm] ? `${d.firm}'s reset (midnight Prague time)` : RESETS[reset]} · {d.tz}</summary>
            <div className="stack" style={{ marginTop: 10 }}>
              <label className="field">Timezone <input value={d.tz} onChange={(e) => set({ tz: e.target.value })} /></label>
              <label className="field">
                Day reset
                <select value={reset} onChange={(e) => set({ reset: e.target.value as Draft['reset'] })}>
                  {(Object.keys(RESETS) as Draft['reset'][]).filter((k) => k !== 'firm' || isProp).map((k) => <option key={k} value={k}>{RESETS[k]}</option>)}
                </select>
              </label>
              {reset === 'custom' && <label className="field">Reset time <input type="time" value={d.customAt} onChange={(e) => set({ customAt: e.target.value })} /></label>}
              <p className="small muted">Daily limits start again at each reset.</p>
            </div>
          </details>

          {rulesOn.length > 0 && <button onClick={() => setPracticeOpen(true)}><Icon name="pause" size={16} /> Try a pause with these rules</button>}
          <p className="small muted">Tightening applies now. Loosening waits until your next day reset (at least 12 hours).</p>
          {err && <p role="alert">{err}</p>}
        </section>
      )}

      {d.step === CONNECT_STEP && (
        <section className="stack">
          <h1>{MOBILE ? 'Finish on your computer' : 'Connect'}</h1>
          {MOBILE ? (
            <>
              <p className="muted">Open this on your computer:</p>
              <p className="code" style={{ fontSize: 18 }}>{location.host}/devices</p>
            </>
          ) : (
            me && (
              <>
                {mt5 && (
                  <div className="card">
                    <div className="card-head"><h2><Icon name="window" /> MetaTrader 5 · Windows app</h2></div>
                    <ConnectMt5 me={me} />
                  </div>
                )}
                {sites.length > 0 && (
                  <div className="card">
                    <div className="card-head"><h2><Icon name="globe" /> {siteList(sites, 'and')} · Chrome or Edge</h2></div>
                    <ConnectBrowser me={me} sites={sites} />
                  </div>
                )}
                {!mt5 && sites.length === 0 && <p className="muted">Nothing to connect yet.</p>}
              </>
            )
          )}
          {cantConnect.length > 0 && (
            <ul className="limits small muted">
              {cantConnect.map((l) => <li key={l}><Icon name="info" size={15} /> {l}</li>)}
            </ul>
          )}
          <div className="card stack">
            <p className="small">
              <strong>Setup mode:</strong> changes apply instantly until you lock your rules. They lock on their own about 3 days after your first device turns on.
            </p>
            <div className="row">
              <button onClick={() => setPracticeOpen(true)}>Try a practice pause</button>
              <button className="primary" onClick={() => void finish(false)}>Go to Today</button>
              <button onClick={() => void finish(true)}>Lock my rules now</button>
            </div>
          </div>
        </section>
      )}

      <div className="wizard-nav">
        {!d.applied && <button onClick={() => set({ step: Math.max(0, d.step - 1) })} disabled={d.step === 0}>Back</button>}
        {d.step < CONNECT_STEP && (
          <button className="primary" disabled={!canNext || busy} onClick={next}>
            {d.step === RULES_STEP ? 'Save my rules' : 'Next'}
          </button>
        )}
      </div>

      {practiceOpen && <PracticePause me={draftMe} onClose={() => setPracticeOpen(false)} />}
    </div>
  );
}
