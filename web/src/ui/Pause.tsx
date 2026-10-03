// The pause card (EXPERIENCE §9, SPEC §7.3). Used for the practice pause in the web app;
// the extension renders the same layout. Place anyway needs a real pointer click after the wait.
import { useEffect, useRef, useState } from 'react';
import { headline, otherRules, PAUSE_FOOTER, PAUSE_TIMEOUT_SEC, placeLabel, REASONS, wayOut, type Fmt, type Order, type PausePlan } from '@dg/core';
import { Mark } from './Brand.tsx';

export interface PauseProps {
  plan: PausePlan;
  order: Order;
  fmt: Fmt;
  practice?: boolean;
  keyboardPlace?: boolean;
  r3Seconds?: number;
  lines?: string[];
  todayFacts?: string;
  onDecision(d: 'skip' | 'place' | 'timeout', info: { shownMs: number }): void;
}

export function Pause(p: PauseProps) {
  const opened = useRef(Date.now());
  const [now, setNow] = useState(Date.now());
  const [typed, setTyped] = useState('');
  const [kbd, setKbd] = useState('');
  const [reason, setReason] = useState('');
  const skipRef = useRef<HTMLButtonElement>(null);
  const [announce, setAnnounce] = useState(p.plan.waitSec > 0 ? `Place anyway available in ${p.plan.waitSec} seconds` : '');

  useEffect(() => {
    skipRef.current?.focus();
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  const elapsed = now - opened.current;
  const left = Math.max(0, p.plan.waitSec * 1000 - elapsed);
  const typedOk = p.plan.typeConfirm === undefined || typed.trim() === String(p.plan.typeConfirm);
  const unlocked = left === 0 && typedOk;

  useEffect(() => {
    if (left === 0 && p.plan.waitSec > 0) setAnnounce('Place anyway is available');
  }, [left === 0]);

  useEffect(() => {
    if (elapsed > PAUSE_TIMEOUT_SEC * 1000) p.onDecision('timeout', { shownMs: elapsed });
  }, [elapsed > PAUSE_TIMEOUT_SEC * 1000]);

  const v = p.plan.violations[0];
  const title = headline(v, p.order, p.fmt, now, p.r3Seconds);
  const out = wayOut(v, p.order, p.fmt);
  const others = otherRules(p.plan);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      p.onDecision('skip', { shownMs: elapsed });
    }
  }

  function onPlace(e: React.MouseEvent) {
    // Only a real pointer click: keyboard activation arrives with detail 0 (SPEC §7.3, invariant 5).
    if (!e.isTrusted || e.detail === 0 || !unlocked) return;
    p.onDecision('place', { shownMs: elapsed });
  }

  return (
    <div className="pause-backdrop" onKeyDown={onKey}>
      <div className="pause" role="alertdialog" aria-modal="true" aria-labelledby="pause-h">
        <div className="label">
          <Mark size={18} /> PAUSE · YOUR RULE {p.practice && <span className="practice-tag">PRACTICE</span>}
        </div>
        <div id="pause-h" className="headline">{title}</div>
        {others.length > 0 && <div className="others">Also: {others.join(' · ')}</div>}
        <div className="lines">
          {out && <div>{out}</div>}
          {p.plan.reattemptAgoSec !== undefined && <div>You skipped this trade {p.plan.reattemptAgoSec} s ago.</div>}
          {p.lines?.map((l) => <div key={l}>{l}</div>)}
        </div>
        {p.todayFacts && <div className="facts">{p.todayFacts}</div>}
        <div className="row" style={{ marginTop: 10 }}>
          <span className="order-chip">
            {p.order.side === 'buy' ? 'Buy' : 'Sell'} {p.fmt.size(p.order.size, p.order)} {p.order.symbol}
            {p.order.sl !== undefined ? ` · SL ${p.order.sl}` : ''}
          </span>
        </div>
        <div className="chips" role="group" aria-label="Name it (optional)">
          {REASONS.map(([id, label]) => (
            <button key={id} aria-pressed={reason === id} onClick={() => setReason(reason === id ? '' : id)}>
              {label}
            </button>
          ))}
        </div>
        {p.plan.waitSec > 0 && (
          <div className="wait" aria-hidden="true">
            <i style={{ width: `${100 - (left / (p.plan.waitSec * 1000)) * 100}%` }} />
          </div>
        )}
        {p.plan.waitSec === 0 && <div style={{ height: 14 }} />}
        {p.plan.typeConfirm !== undefined && (
          <label className="field" style={{ marginBottom: 10 }}>
            Type {p.plan.typeConfirm} to place trade {p.plan.typeConfirm} today
            <input inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} className="narrow" aria-label="Number to type" />
          </label>
        )}
        {p.keyboardPlace && (
          <label className="field" style={{ marginBottom: 10 }}>
            Or type PLACE and press Enter
            <input
              value={kbd}
              onChange={(e) => setKbd(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && kbd.trim() === 'PLACE' && unlocked) p.onDecision('place', { shownMs: elapsed });
              }}
            />
          </label>
        )}
        <div className="buttons">
          <button ref={skipRef} className="primary" onClick={() => p.onDecision('skip', { shownMs: elapsed })}>
            Skip this trade
          </button>
          <button className="place" disabled={!unlocked} onClick={onPlace} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && e.preventDefault()}>
            {left > 0 ? `Place anyway · 0:${String(Math.ceil(left / 1000)).padStart(2, '0')}` : placeLabel(p.order, p.fmt)}
          </button>
        </div>
        <div className="footer">{PAUSE_FOOTER}</div>
        <div aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{announce}</div>
      </div>
    </div>
  );
}
