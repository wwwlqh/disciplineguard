// Onboarding (EXPERIENCE §5.2): three screens, nothing to type, Back always available, resumable.
// 1 About you · 2 Your rules (starting rules, trading day, analytics) · 3 Connect MT5.
import { useEffect, useMemo, useState } from 'react';
import { buildTemplate, DEFAULT_POPUP, type Choice, type Rules } from '@dg/core';
import { api, type Me } from '../api.ts';
import { browserTz } from '../fmt.ts';
import { navigate } from '../router.ts';
import { ConnectMt5 } from '../ui/Connect.tsx';
import { PracticePause, Switch } from '../ui/kit.tsx';
import { RULE_INFO, RULE_ORDER, RuleFields, validRule } from '../ui/RuleFields.tsx';

type AccountType = 'prop_challenge' | 'prop_funded' | 'own' | 'demo';
type Defaults = { r5?: { r5Max: number }; r6?: { unit: 'pct'; value: number }; r8?: { unit: 'pct' | 'amount'; value: number }; r7ignore?: number };

interface Draft {
  step: number;
  platforms: string[];
  accountType: AccountType;
  firm: string;
  firmDailyPct: number;
  style: 'scalping' | 'day' | 'swing';
  choices: Choice[];
  session: 'london' | 'new_york';
  usualSize: number;
  /** Set once the trader edits a starting rule; until then rules follow the template. */
  rules: Rules | null;
  defaults: Defaults | null;
  tz: string;
  reset: 'midnight' | 'forex_close' | 'futures_session' | 'firm' | 'custom';
  customAt: string;
  analytics: boolean | null;
  applied: boolean;
}

/** MT5 on Windows is protected today. The others collect "tell me when it's ready". */
const OTHER_PLATFORMS: { id: string; label: string; note: string }[] = [
  { id: 'tv', label: 'TradingView', note: "Coming soon. We'll tell you." },
  { id: 'mt4', label: 'MT4', note: "Coming later. We'll tell you." },
  { id: 'mt5_mac', label: 'MT5 on Mac', note: 'Not supported yet.' },
  { id: 'mt_phone', label: 'MT on my phone', note: "Can't be paused, but they still count." },
  { id: 'other', label: 'Something else', note: "We'll tell you if we add it." },
];

const COSTS: { id: Choice; label: string }[] = [
  { id: 'too_many', label: 'I take too many trades' },
  { id: 'win_back', label: 'I trade to win back a loss' },
  { id: 'size_up', label: 'I size up after a loss' },
  { id: 'hours', label: 'I trade outside my plan hours' },
  { id: 'skip_sl', label: 'I skip my stop loss' },
  { id: 'bad_days', label: 'I keep going on a bad day' },
  { id: 'give_back', label: 'I give back profits after a good start' },
];

/** Firm presets: daily loss limit and reset. Check your firm's current rules. */
const FIRMS: Record<string, { pct: number; reset: { at: string; tz: string }; basis: string }> = {
  FTMO: { pct: 5, reset: { at: '00:00', tz: 'Europe/Prague' }, basis: 'the day\'s starting balance or equity' },
};

const STEPS = ['About you', 'Your rules', 'Connect MT5'];

const RESETS: Record<Draft['reset'], string> = {
  midnight: 'midnight in your timezone',
  forex_close: 'forex close, 17:00 New York',
  futures_session: 'futures session, 17:00 Chicago',
  firm: 'your prop firm\'s reset',
  custom: 'a custom time',
};

function initial(me: Me): Draft {
  const saved = me.user.onboarding;
  if (saved && typeof saved === 'object' && saved.step !== undefined && !saved.done && saved.step < STEPS.length) return { ...(saved as Draft), step: saved.applied ? saved.step : Math.min(saved.step, 1) };
  return {
    step: 0, platforms: ['mt5'], accountType: 'own', firm: 'FTMO', firmDailyPct: 5, style: 'day', choices: [], session: 'london', usualSize: 0.5,
    rules: null, defaults: null, tz: browserTz(), reset: 'midnight', customAt: '00:00',
    analytics: null, applied: false,
  };
}

export function Onboarding({ me, reload }: { me: Me; reload(): Promise<void> }) {
  const [d, setD] = useState<Draft>(() => initial(me));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [practiceOpen, setPracticeOpen] = useState(false);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const isProp = d.accountType === 'prop_challenge' || d.accountType === 'prop_funded';
  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 760px)').matches;

  // Save progress so onboarding can be resumed (EXPERIENCE §5.2).
  useEffect(() => {
    if (d.applied) return;
    const id = setTimeout(() => void api('PUT', '/api/onboarding', { state: d }).catch(() => {}), 600);
    return () => clearTimeout(id);
  }, [d]);

  const template = useMemo(() => buildTemplate({
    choices: isProp ? [...d.choices, 'bad_days'].slice(0, 3) as Choice[] : d.choices,
    style: d.style,
    userTz: d.tz,
    session: d.session,
    accounts: [{ id: 'default', platform: 'mt5', type: d.accountType, usualSize: d.usualSize, prop: isProp ? { dailyLimitPct: d.firmDailyPct } : undefined }],
  }), [d.choices, d.style, d.tz, d.session, d.accountType, d.usualSize, d.firmDailyPct]);

  const tplAcc = template.rules.accounts.default ?? {};
  const rules = d.rules ?? template.rules;
  const defaults: Defaults = d.defaults ?? {
    r5: tplAcc.r5Max !== undefined ? { r5Max: tplAcc.r5Max } : undefined,
    r6: tplAcc.r6 as Defaults['r6'],
    r8: tplAcc.r8,
    r7ignore: tplAcc.r7IgnoreBelow,
  };
  const editRule = (id: string, v: unknown) => set({ rules: { ...rules, [id]: v } as Rules, defaults });
  const editDefaults = (p: Partial<Defaults>) => set({ rules, defaults: { ...defaults, ...p } });
  const rulesOn = RULE_ORDER.filter((id) => (rules as any)[id]?.on);

  async function apply() {
    setBusy(true);
    setErr('');
    try {
      const reset =
        d.reset === 'firm' && FIRMS[d.firm]
          ? { preset: 'custom', ...FIRMS[d.firm].reset }
          : d.reset === 'custom'
            ? { preset: 'custom', at: d.customAt, tz: d.tz }
            : { preset: d.reset };
      const payloadRules: Record<string, unknown> = {};
      for (const id of RULE_ORDER) payloadRules[id] = (rules as any)[id];
      await api('POST', '/api/onboarding/apply', {
        tz: d.tz, reset, analyticsConsent: d.analytics, rules: payloadRules,
        defaults: {
          r5: defaults.r5 ? { r5Max: defaults.r5.r5Max, r5Overrides: [] } : undefined,
          r6: defaults.r6, r8: defaults.r8, r7ignore: defaults.r7ignore,
        },
        popup: DEFAULT_POPUP, choices: d.choices, style: d.style,
        platforms: d.platforms, accountTypes: d.accountType, tellMe: d.platforms.filter((p) => p !== 'mt5'),
      });
      set({ applied: true, step: 2 });
    } catch (e: any) {
      setErr(e.message === e.code ? 'Something is missing. Check the earlier screens.' : e.message);
    } finally {
      setBusy(false);
    }
  }

  const canNext = (() => {
    switch (d.step) {
      case 1: return d.choices.length > 0 && RULE_ORDER.every((id) => validRule(id, (rules as any)[id])) && d.analytics !== null;
      default: return true;
    }
  })();

  function next() {
    if (d.step === 1) return void apply();
    set({ step: Math.min(STEPS.length - 1, d.step + 1) });
  }

  async function finish(lock: boolean) {
    navigate(lock ? '/rules?lock=1' : '/today', true);
    await reload();
  }

  const draftMe: Me = { ...me, rules, notes: [], plan: '', popup: DEFAULT_POPUP };

  return (
    <div className="wizard">
      <div className="row between small muted">
        <span>Step {d.step + 1} of {STEPS.length} · {STEPS[d.step]}</span>
        <span>{me.user.email}</span>
      </div>
      <div className="progress" aria-hidden="true"><i style={{ width: `${((d.step + 1) / STEPS.length) * 100}%` }} /></div>

      {d.step === 0 && (
        <section className="stack">
          <h1>About your trading</h1>
          <div>
            <p className="muted">What kind of account do you trade most?</p>
            <div className="row">
              {([['prop_challenge', 'Prop challenge'], ['prop_funded', 'Funded prop'], ['own', 'My own money'], ['demo', 'Demo']] as const).map(([id, label]) => (
                <label key={id} className="check"><input type="radio" name="acct" checked={d.accountType === id} onChange={() => set({ accountType: id, rules: null, defaults: null, reset: id.startsWith('prop') && FIRMS[d.firm] ? 'firm' : d.reset === 'firm' ? 'midnight' : d.reset })} /> {label}</label>
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
            <label className="field">
              Usual position size (lots)
              <input type="number" min={0.01} step={0.01} value={d.usualSize} onChange={(e) => set({ usualSize: Number(e.target.value), rules: null, defaults: null })} />
            </label>
          </div>
          <div>
            <p className="muted">Also trade somewhere else?</p>
            <div className="row">
              {OTHER_PLATFORMS.map((p) => (
                <label key={p.id} className="check">
                  <input type="checkbox" checked={d.platforms.includes(p.id)} onChange={(e) => set({ platforms: e.target.checked ? [...d.platforms, p.id] : d.platforms.filter((x) => x !== p.id) })} /> {p.label}
                </label>
              ))}
            </div>
            {OTHER_PLATFORMS.filter((p) => d.platforms.includes(p.id)).map((p) => <p key={p.id} className="small muted">{p.label}: {p.note}</p>)}
          </div>
        </section>
      )}

      {d.step === 1 && (
        <section className="stack">
          <h1>What costs you the most?</h1>
          <p className="muted">Pick up to two.</p>
          <div className="stack">
            {COSTS.map((c) => (
              <label key={c.id} className="choice">
                <input
                  type="checkbox"
                  checked={d.choices.includes(c.id)}
                  disabled={!d.choices.includes(c.id) && d.choices.length >= 2}
                  onChange={(e) => set({ choices: e.target.checked ? [...d.choices, c.id] : d.choices.filter((x) => x !== c.id), rules: null, defaults: null })}
                />
                <span>
                  <strong>{c.label}</strong>
                  {c.id === 'give_back' && <div className="small muted">Coming later.</div>}
                </span>
              </label>
            ))}
          </div>
          {d.choices.includes('hours') && (
            <div className="row">
              <span className="small muted">Session:</span>
              <label className="check small"><input type="radio" name="sess" checked={d.session === 'london'} onChange={() => set({ session: 'london', rules: null, defaults: null })} /> London 08:00–11:00</label>
              <label className="check small"><input type="radio" name="sess" checked={d.session === 'new_york'} onChange={() => set({ session: 'new_york', rules: null, defaults: null })} /> New York 14:30–17:00</label>
            </div>
          )}
          {d.choices.length > 0 && (
            <div className="card">
              <strong>Your starting rules</strong>
              <p className="small muted">{rulesOn.map((id) => RULE_INFO[id].name).join(' · ') || 'None yet'}</p>
              {isProp && defaults.r8 && <p className="small">New trades pause at {defaults.r8.value}% down. Your firm's overall limit isn't tracked.</p>}
              <details>
                <summary className="small">Adjust</summary>
                <div className="stack" style={{ marginTop: 10 }}>
                  {RULE_ORDER.map((id) => {
                    const v = (rules as any)[id];
                    return (
                      <div key={id}>
                        <div className="row between">
                          <div>
                            <strong>{RULE_INFO[id].name}</strong>
                            <div className="small muted">{RULE_INFO[id].meaning}</div>
                          </div>
                          <Switch label={RULE_INFO[id].name} checked={v.on} onChange={(on) => editRule(id, { ...v, on })} />
                        </div>
                        {v.on && (
                          <div style={{ marginTop: 8 }}>
                            {id === 'R5' ? (
                              <label className="field">Max size (lots)
                                <input type="number" className="narrow" min={0.01} step={0.01} value={defaults.r5?.r5Max ?? ''} onChange={(e) => editDefaults({ r5: { r5Max: Number(e.target.value) } })} />
                              </label>
                            ) : id === 'R6' ? (
                              <label className="field">Max risk per trade (% of the day's starting balance)
                                <input type="number" className="narrow" min={0.1} max={10} step={0.1} value={defaults.r6?.value ?? 1} onChange={(e) => editDefaults({ r6: { unit: 'pct', value: Number(e.target.value) } })} />
                              </label>
                            ) : (
                              <RuleFields inWizard id={id} value={v} onChange={(nv) => editRule(id, nv)} />
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
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>
            </div>
          )}
          <details className="card">
            <summary>Your day resets at {d.reset === 'firm' && FIRMS[d.firm] ? `${d.firm}'s reset (midnight Prague time)` : RESETS[d.reset]} · {d.tz}</summary>
            <div className="stack" style={{ marginTop: 10 }}>
              <label className="field">Timezone <input value={d.tz} onChange={(e) => set({ tz: e.target.value })} /></label>
              <label className="field">
                Day reset
                <select value={d.reset} onChange={(e) => set({ reset: e.target.value as Draft['reset'] })}>
                  {(Object.keys(RESETS) as Draft['reset'][]).filter((k) => k !== 'firm' || isProp).map((k) => <option key={k} value={k}>{RESETS[k]}</option>)}
                </select>
              </label>
              {d.reset === 'custom' && <label className="field">Reset time <input type="time" value={d.customAt} onChange={(e) => set({ customAt: e.target.value })} /></label>}
              <p className="small muted">Daily limits start again at each reset.</p>
            </div>
          </details>

          <div className="card stack">
            <p className="small">Tightening applies now. Loosening waits until your next day reset (at least 12 hours).</p>
            <div className="row">
              <span className="small">Share product usage (never trade details)?</span>
              <button className={d.analytics === true ? 'primary' : ''} aria-pressed={d.analytics === true} onClick={() => set({ analytics: true })}>Yes</button>
              <button className={d.analytics === false ? 'primary' : ''} aria-pressed={d.analytics === false} onClick={() => set({ analytics: false })}>No</button>
            </div>
          </div>
          {err && <p role="alert">{err}</p>}
        </section>
      )}

      {d.step === 2 && (
        <section className="stack">
          <h1>{phone ? 'Finish on your computer' : 'Connect MT5'}</h1>
          {phone ? (
            <>
              <p className="muted">Open this on your computer:</p>
              <p className="code" style={{ fontSize: 18 }}>{location.host}/devices</p>
            </>
          ) : (
            <ConnectMt5 me={me} />
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
        {d.step < 2 && (
          <button className="primary" disabled={!canNext || busy} onClick={next}>
            {d.step === 1 ? 'Save my rules' : 'Next'}
          </button>
        )}
      </div>

      {practiceOpen && <PracticePause me={draftMe} onClose={() => setPracticeOpen(false)} />}
    </div>
  );
}
