// Rules (EXPERIENCE §5.5) and rule-change moments (§10).
import { useEffect, useState } from 'react';
import { type PopupSettings, type RuleId } from '@dg/core';
import { api, saveSetting, type Account, type Me } from '../api.ts';
import { accountName, date, time } from '../fmt.ts';
import { navigate } from '../router.ts';
import { applyLabel, Sheet, Switch, useToast, useVerdict, VerdictLine } from '../ui/kit.tsx';
import { RULE_INFO, RULE_ORDER, RuleFields, ruleSummary, validRule } from '../ui/RuleFields.tsx';
import { Icon, RULE_ICON, type IconName } from '../ui/Icon.tsx';
import type { PageProps } from '../main.tsx';

/** The rules page in sections, so ten rules read as four short groups. */
const SECTIONS: [string, RuleId[]][] = [
  ['Trades', ['R1', 'R2', 'R3']],
  ['Time', ['R4', 'R7']],
  ['After a loss', ['R8', 'R10']],
  ['Size and stops', ['R5', 'R6', 'R9']],
];

function Section({ title, icon }: { title: string; icon?: IconName }) {
  return <div className="section-title">{icon && <Icon name={icon} size={15} />}<h2>{title}</h2></div>;
}

function useSave(reload: () => Promise<void>) {
  const toast = useToast();
  return async (key: string, value: unknown) => {
    const r = await saveSetting(key, value);
    if (r.direction === 'same') toast('No change.');
    else if (r.appliesAt === 'now') toast('Applied. Devices update within 5 minutes.');
    else toast(`Scheduled for ${time(r.appliesAt)}. Cancel anytime.`);
    await reload();
    return r;
  };
}

function Scheduled({ me, k, render }: { me: Me; k: string; render(v: any): string }) {
  const p = me.settings[k]?.pending;
  const toast = useToast();
  if (!p) return null;
  return (
    <div className="verdict looser row between" style={{ marginTop: 8 }}>
      <span>From {time(p.effectiveAt)}: {render(p.value)}</span>
      <button className="link" onClick={async () => { await api('POST', '/api/settings/cancel', { key: k }); toast('Cancelled. Your current rule stays.'); window.dispatchEvent(new Event('dg:reload')); }}>
        Cancel change
      </button>
    </div>
  );
}

function SetOn({ me, k }: { me: Me; k: string }) {
  const s = me.settings[k];
  if (!s) return null;
  return <span className="small faint">You set this on {date(s.setAt)}</span>;
}

function RuleCard({ me, id, reload }: { me: Me; id: RuleId; reload(): Promise<void> }) {
  const active = (me.rules as any)[id];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(active);
  const key = `rule:${id}`;
  const v = useVerdict(key, draft, editing && validRule(id, draft));
  const save = useSave(reload);
  const info = RULE_INFO[id];
  useEffect(() => setDraft(active), [JSON.stringify(active)]);
  return (
    <div className={`card rule-card${active.on ? '' : ' off'}`}>
      <span className={`tile${active.on ? ' accent' : ''}`}><Icon name={RULE_ICON[id]} /></span>
      <div className="rule-main">
        <div className="rule-name">{info.name} {info.badges.map((b) => <span key={b} className="chip">{b}</span>)}</div>
        <div className="small muted">{info.meaning}</div>
        <div className="rule-now">
          <span className={`value-pill${active.on ? ' on' : ''}`}>{ruleSummary(id, me.rules)}</span>
          <SetOn me={me} k={key} />
        </div>
      </div>
      {!editing ? <button onClick={() => setEditing(true)}>Change</button> : <span />}
      <div className="rule-extra">
        <Scheduled me={me} k={key} render={(val) => ruleSummary(id, { ...me.rules, [id]: val } as any)} />
        {editing && (
          <div className="rule-edit">
            <div className="row">
              <Switch label={`${info.name} on`} checked={draft.on} onChange={(on) => setDraft({ ...draft, on })} />
              <span>{draft.on ? 'On' : 'Off'}</span>
            </div>
            {draft.on && <RuleFields id={id} value={draft} onChange={setDraft} />}
            <VerdictLine v={v} setupMode={me.user.setupMode} />
            <div className="row">
              <button className="primary" disabled={!validRule(id, draft) || !v || v.direction === 'same'} onClick={async () => { await save(key, draft); setEditing(false); }}>
                {applyLabel(v)}
              </button>
              <button onClick={() => { setDraft(active); setEditing(false); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PopupCard({ me, reload }: { me: Me; reload(): Promise<void> }) {
  const [p, setP] = useState<PopupSettings>(me.popup);
  const changed = JSON.stringify(p) !== JSON.stringify(me.popup);
  const v = useVerdict('popup', p, changed);
  const save = useSave(reload);
  const num = (val: number, f: (n: number) => void, min: number, max: number) => (
    <input type="number" className="narrow" min={min} max={max} value={val} onChange={(e) => f(Math.max(min, Math.min(max, Number(e.target.value))))} />
  );
  const seq = p.growing.on ? [0, 1, 2, 3].map((n) => Math.min(p.wait + p.growing.step * n, Math.max(p.growing.cap, p.wait))).join(' s → ') + ' s' : '';
  return (
    <div className="card">
      <div className="card-head"><h2><Icon name="pause" /> Popup settings</h2></div>
      <p className="small muted">Trades that keep your rules go straight through, unless you pick "every new trade".</p>
      <div className="stack">
        <label className="field">When it shows
          <select value={p.show} onChange={(e) => setP({ ...p, show: e.target.value as PopupSettings['show'] })}>
            <option value="breaks">Only when a trade goes past one of my rules</option>
            <option value="every">On every new trade</option>
          </select>
        </label>
        <label className="field">Wait before "Place anyway" unlocks (0–60 s)
          <span className="row">{num(p.wait, (wait) => setP({ ...p, wait }), 0, 60)} <span className="small muted">seconds</span></span>
        </label>
        <div>
          <label className="check"><input type="checkbox" checked={p.lossWait.on} onChange={(e) => setP({ ...p, lossWait: { ...p.lossWait, on: e.target.checked } })} /> A longer wait after a loss</label>
          {p.lossWait.on && (
            <div className="row small" style={{ marginTop: 6, paddingLeft: 28 }}>
              Wait {num(p.lossWait.seconds, (seconds) => setP({ ...p, lossWait: { ...p.lossWait, seconds } }), 0, 60)} s when my last losing trade closed less than {num(p.lossWait.withinMinutes, (withinMinutes) => setP({ ...p, lossWait: { ...p.lossWait, withinMinutes } }), 5, 120)} min ago
            </div>
          )}
        </div>
        <div>
          <label className="check"><input type="checkbox" checked={p.growing.on} onChange={(e) => setP({ ...p, growing: { ...p.growing, on: e.target.checked } })} /> Growing wait</label>
          {p.growing.on && (
            <div className="small" style={{ marginTop: 6, paddingLeft: 28 }}>
              <div className="row">Each trade placed anyway today adds {num(p.growing.step, (step) => setP({ ...p, growing: { ...p.growing, step } }), 1, 30)} s, up to {num(p.growing.cap, (cap) => setP({ ...p, growing: { ...p.growing, cap } }), 1, 120)} s</div>
              <div className="muted">Example: {seq}. Resets at your next trading day.</div>
            </div>
          )}
        </div>
        <label className="field">Type to confirm
          <span className="row">
            <select value={p.typeConfirm.mode} onChange={(e) => setP({ ...p, typeConfirm: { ...p.typeConfirm, mode: e.target.value as PopupSettings['typeConfirm']['mode'] } })}>
              <option value="off">Off</option>
              <option value="always">Always</option>
              <option value="after">After some trades placed anyway today</option>
            </select>
            {p.typeConfirm.mode === 'after' && <>after {num(p.typeConfirm.n, (n) => setP({ ...p, typeConfirm: { ...p.typeConfirm, n } }), 1, 10)}</>}
          </span>
        </label>
        <label className="check"><input type="checkbox" checked={p.skipCard} onChange={(e) => setP({ ...p, skipCard: e.target.checked })} /> After a skip, offer "Take a break" and "Done for today"</label>
        <label className="check"><input type="checkbox" checked={p.keyboardPlace} onChange={(e) => setP({ ...p, keyboardPlace: e.target.checked })} /> Accessibility: type PLACE instead of clicking</label>
      </div>
      <Scheduled me={me} k="popup" render={() => 'new popup settings'} />
      {changed && (
        <div className="stack" style={{ marginTop: 12 }}>
          <VerdictLine v={v} setupMode={me.user.setupMode} />
          <div className="row">
            <button className="primary" disabled={!v || v.direction === 'same'} onClick={() => save('popup', p)}>{applyLabel(v)}</button>
            <button onClick={() => setP(me.popup)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** "Close outside trades" (SPEC §9.2): on applies now, off waits like any loosening. */
function CloseOutsideCard({ me, reload }: { me: Me; reload(): Promise<void> }) {
  const cur = me.rules.closeOutside;
  const [on, setOn] = useState(cur);
  const v = useVerdict('closeOutside', on, on !== cur);
  const save = useSave(reload);
  useEffect(() => setOn(cur), [cur]);
  return (
    <div className={`card rule-card${cur ? '' : ' off'}`}>
      <span className={`tile${cur ? ' accent' : ''}`}><Icon name="phone" /></span>
      <div className="rule-main">
        <div className="rule-name">Close outside trades <span className="chip">MT5</span></div>
        <div className="small muted">
          A trade placed on your phone, the web terminal or MetaTrader's own order window that goes past a rule is closed within seconds. If a missing stop loss is the only problem, you get 60 seconds to add one. Trades from other EAs are never closed.
        </div>
        <div className="rule-now"><span className={`value-pill${cur ? ' on' : ''}`}>{cur ? 'On' : 'Off'}</span> <SetOn me={me} k="closeOutside" /></div>
      </div>
      <Switch label="Close outside trades" checked={on} onChange={setOn} />
      <div className="rule-extra">
      <Scheduled me={me} k="closeOutside" render={(val) => (val ? 'on' : 'off')} />
      {on !== cur && (
        <div className="rule-edit">
          <VerdictLine v={v} setupMode={me.user.setupMode} />
          <div className="row">
            <button
              className="primary"
              disabled={!v || v.direction === 'same'}
              onClick={async () => {
                const r = await save('closeOutside', on);
                // Scheduled: the switch shows what applies now, and the line above shows the change to come.
                setOn(r.appliesAt === 'now' ? on : cur);
              }}
            >
              {applyLabel(v)}
            </button>
            <button onClick={() => setOn(cur)}>Cancel</button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

type Limit = { unit: 'amount' | 'pct'; value: number } | null;

function LimitEditor({ me, k, label, pctMax, allowPct, reload }: { me: Me; k: string; label: string; pctMax: number; allowPct: boolean; reload(): Promise<void> }) {
  const cur: Limit = me.settings[k]?.active ?? null;
  const [d, setD] = useState<Limit>(cur);
  const changed = JSON.stringify(d) !== JSON.stringify(cur);
  const valid = d === null || (Number.isFinite(d.value) && d.value > 0 && (d.unit === 'amount' || (d.value >= 0.1 && d.value <= pctMax)));
  const v = useVerdict(k, d, changed && valid);
  const save = useSave(reload);
  return (
    <div className="stack">
      <div className="row">
        <label className="check small"><input type="checkbox" checked={d !== null} onChange={(e) => setD(e.target.checked ? { unit: allowPct ? 'pct' : 'amount', value: allowPct ? 2 : 300 } : null)} /> {label}</label>
        {d && (
          <>
            <input type="number" className="narrow" step={0.1} value={d.value} onChange={(e) => setD({ ...d, value: Number(e.target.value) })} />
            <select value={d.unit} onChange={(e) => setD({ ...d, unit: e.target.value as 'amount' | 'pct' })}>
              {allowPct && <option value="pct">% of day-start balance</option>}
              <option value="amount">amount</option>
            </select>
          </>
        )}
      </div>
      <Scheduled me={me} k={k} render={(val) => (val ? `${val.value}${val.unit === 'pct' ? '%' : ''}` : 'off')} />
      {changed && (
        <>
          <VerdictLine v={v} setupMode={me.user.setupMode} />
          <div className="row"><button className="primary" disabled={!valid || !v} onClick={() => save(k, d)}>{applyLabel(v)}</button><button onClick={() => setD(cur)}>Cancel</button></div>
        </>
      )}
    </div>
  );
}

function SizeEditor({ me, k, reload }: { me: Me; k: string; reload(): Promise<void> }) {
  const cur = me.settings[k]?.active ?? null;
  const [max, setMax] = useState<number>(cur?.r5Max ?? NaN);
  const [ov, setOv] = useState<{ prefix: string; max: number }[]>(cur?.r5Overrides ?? []);
  const draft = Number.isFinite(max) ? { r5Max: max, r5Overrides: ov.filter((o) => o.prefix && o.max > 0) } : null;
  const changed = JSON.stringify(draft) !== JSON.stringify(cur ? { r5Max: cur.r5Max, r5Overrides: cur.r5Overrides ?? [] } : null);
  const v = useVerdict(k, draft, changed && !!draft && max > 0);
  const save = useSave(reload);
  return (
    <div className="stack">
      <div className="row small">
        Max position size <input type="number" className="narrow" min={0.01} step={0.01} value={Number.isFinite(max) ? max : ''} onChange={(e) => setMax(e.target.value === '' ? NaN : Number(e.target.value))} /> lots
        <button className="link" onClick={() => setOv([...ov, { prefix: '', max: 0.1 }])}>Add a symbol override</button>
      </div>
      {ov.map((o, i) => (
        <div key={i} className="row small">
          <input placeholder="XAUUSD" value={o.prefix} onChange={(e) => setOv(ov.map((x, j) => (j === i ? { ...x, prefix: e.target.value.toUpperCase() } : x)))} style={{ width: 110 }} />
          <input type="number" className="narrow" step={0.01} value={o.max} onChange={(e) => setOv(ov.map((x, j) => (j === i ? { ...x, max: Number(e.target.value) } : x)))} /> lots
          <button className="link" onClick={() => setOv(ov.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      <Scheduled me={me} k={k} render={(val) => `max ${val.r5Max}`} />
      {changed && draft && (
        <>
          <VerdictLine v={v} setupMode={me.user.setupMode} />
          <div className="row"><button className="primary" disabled={!v} onClick={() => save(k, draft)}>{applyLabel(v)}</button></div>
        </>
      )}
    </div>
  );
}

function AccountSheet({ me, a, reload }: { me: Me; a: Account; reload(): Promise<void> }) {
  const [nick, setNick] = useState(a.nickname ?? '');
  const toast = useToast();
  return (
    <div className="card">
      <div className="card-head">
        <h2><Icon name="devices" /> {accountName(a)}</h2>
        <span className={`chip${a.state === 'active' ? ' accent' : ''}`}>{a.state.replace('_', ' ')}</span>
      </div>
      <div className="row small" style={{ margin: '10px 0' }}>
        Nickname <input value={nick} maxLength={40} onChange={(e) => setNick(e.target.value)} />
        <button onClick={async () => { await api('PUT', `/api/accounts/${a.id}`, { nickname: nick }); toast('Saved'); await reload(); }}>Save</button>
      </div>
      <div className="stack">
        <LimitEditor me={me} k={`acct:${a.id}:r8`} label="Daily loss limit for this account" pctMax={20} allowPct={a.platform !== 'tv'} reload={reload} />
        <SizeEditor me={me} k={`acct:${a.id}:r5`} reload={reload} />
        {a.platform !== 'tv' && <LimitEditor me={me} k={`acct:${a.id}:r6`} label="Max risk per trade" pctMax={10} allowPct reload={reload} />}
      </div>
      <p className="small faint" style={{ marginTop: 8 }}>Values not set here come from your defaults below.</p>
    </div>
  );
}

function LockSheet({ me, onClose, reload }: { me: Me; onClose(): void; reload(): Promise<void> }) {
  const [name, setName] = useState(me.user.firstName ?? '');
  const [ok, setOk] = useState(false);
  const toast = useToast();
  const on = RULE_ORDER.filter((id) => (me.rules as any)[id].on);
  return (
    <Sheet label="Lock my rules" onClose={onClose}>
      <h2>Lock my rules</h2>
      <ul>
        {on.map((id) => <li key={id}>{RULE_INFO[id].name}: {ruleSummary(id, me.rules)}</li>)}
        {me.rules.closeOutside && <li>Close outside trades: on</li>}
        {on.length === 0 && <li>No rules on yet.</li>}
      </ul>
      <label className="check" style={{ margin: '10px 0' }}>
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>I understand loosening waits until my next day reset (at least 12 hours).</span>
      </label>
      <label className="field">Type your first name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="row">
        <button className="primary" disabled={!ok || name.trim().length < 1} onClick={async () => { await api('POST', '/api/lock', { firstName: name, understood: true }); toast('Locked.'); onClose(); await reload(); }}>
          Lock my rules
        </button>
        <button onClick={onClose}>Not yet</button>
      </div>
    </Sheet>
  );
}

function DayCard({ me, reload }: { me: Me; reload(): Promise<void> }) {
  const [tz, setTz] = useState(me.tz);
  const curReset = me.settings.reset?.active ?? { preset: 'midnight' };
  const [reset, setReset] = useState<any>(curReset);
  const tzV = useVerdict('tz', tz, tz !== me.tz);
  const rV = useVerdict('reset', reset, JSON.stringify(reset) !== JSON.stringify(curReset));
  const save = useSave(reload);
  return (
    <div className="card">
      <div className="card-head"><h2><Icon name="clock" /> Your trading day</h2></div>
      <div className="grid two">
        <label className="field">Timezone<input value={tz} onChange={(e) => setTz(e.target.value)} /></label>
        <label className="field">Day reset
          <select value={reset.preset} onChange={(e) => setReset(e.target.value === 'custom' ? { preset: 'custom', at: '00:00', tz } : { preset: e.target.value })}>
            <option value="midnight">Midnight</option><option value="forex_close">Forex close (17:00 New York)</option>
            <option value="futures_session">Futures session (17:00 Chicago)</option><option value="custom">Custom</option>
          </select>
        </label>
      </div>
      {reset.preset === 'custom' && (
        <div className="row" style={{ marginTop: 8 }}>
          <input type="time" value={reset.at} onChange={(e) => setReset({ ...reset, at: e.target.value })} />
          <input value={reset.tz} onChange={(e) => setReset({ ...reset, tz: e.target.value })} placeholder="Europe/Prague" />
        </div>
      )}
      {tz !== me.tz && <div className="stack" style={{ marginTop: 8 }}><VerdictLine v={tzV} setupMode={me.user.setupMode} /><button className="primary" disabled={!tzV} onClick={() => save('tz', tz)}>{applyLabel(tzV)}</button></div>}
      {JSON.stringify(reset) !== JSON.stringify(curReset) && <div className="stack" style={{ marginTop: 8 }}><VerdictLine v={rV} setupMode={me.user.setupMode} /><button className="primary" disabled={!rV} onClick={() => save('reset', reset)}>{applyLabel(rV)}</button></div>}
      <Scheduled me={me} k="tz" render={(v) => v} />
      <Scheduled me={me} k="reset" render={(v) => v.preset} />
    </div>
  );
}

export function RulesPage({ me, reload }: PageProps) {
  const [lock, setLock] = useState(() => new URLSearchParams(location.search).get('lock') === '1' && me.user.setupMode);
  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>Rules</h1>
          <div className="small muted">
            {me.user.setupMode ? 'Setup mode: every change applies now.' : `Locked${me.user.lockedBy && me.user.lockedBy !== 'auto' ? ` by ${me.user.lockedBy}` : ''} on ${me.user.lockedAt ? date(me.user.lockedAt) : ''}. Tighter applies now; looser waits.`}
          </div>
        </div>
        {me.user.setupMode && <button className="primary" onClick={() => setLock(true)}><Icon name="lock" size={16} /> Lock my rules</button>}
      </div>
      {SECTIONS.map(([title, ids]) => (
        <div key={title}>
          <Section title={title} />
          {ids.map((id) => <RuleCard key={id} me={me} id={id} reload={reload} />)}
        </div>
      ))}
      <div>
        <Section title="Outside trades" />
        <CloseOutsideCard me={me} reload={reload} />
      </div>
      <div>
        <Section title="The pause and your day" />
        <PopupCard me={me} reload={reload} />
        <DayCard me={me} reload={reload} />
      </div>
      <div id="accounts">
        <Section title="Accounts" />
        {me.accounts.length === 0 && <p className="muted">No accounts yet.</p>}
        {me.accounts.map((a) => <AccountSheet key={a.id} me={me} a={a} reload={reload} />)}
      </div>
      <div className="card">
        <div className="card-head"><h2><Icon name="layers" /> Defaults for accounts</h2></div>
        <p className="small muted">For any account without its own value.</p>
        <div className="stack">
          <LimitEditor me={me} k="default:r8" label="Daily loss limit" pctMax={20} allowPct reload={reload} />
          <SizeEditor me={me} k="default:r5" reload={reload} />
          <LimitEditor me={me} k="default:r6" label="Max risk per trade (MT)" pctMax={10} allowPct reload={reload} />
        </div>
      </div>
      {lock && <LockSheet me={me} reload={reload} onClose={() => { setLock(false); navigate('/rules', true); }} />}
    </div>
  );
}
