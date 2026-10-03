// The landing page's moving demo, drawn in SVG: a live chart, a Buy past the day's limit, the pause, a skip.
// It loops while visible, holds still for reduced motion, and uses the real pause wording from @dg/core.
import { useEffect, useMemo, useRef, useState } from 'react';
import { headline, type Order } from '@dg/core';
import { coreFmt } from '../fmt.ts';
import { Mark } from './Brand.tsx';
import { Icon } from './Icon.tsx';

type Phase = 'idle' | 'aim' | 'press' | 'pause' | 'aimSkip' | 'skip' | 'done';
const STEPS: [Phase, number][] = [['idle', 1600], ['aim', 950], ['press', 380], ['pause', 3400], ['aimSkip', 850], ['skip', 380], ['done', 2400]];

interface Candle { o: number; h: number; l: number; c: number }

function series(n: number): Candle[] {
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: Candle[] = [];
  let p = 1.0831;
  for (let i = 0; i < n; i++) {
    const drift = i < n * 0.55 ? 0.00006 : i < n * 0.8 ? -0.00005 : 0.00009;
    const o = p;
    const c = o + drift + (rnd() - 0.5) * 0.00055;
    const h = Math.max(o, c) + rnd() * 0.00022;
    const l = Math.min(o, c) - rnd() * 0.00022;
    out.push({ o, h, l, c });
    p = c;
  }
  return out;
}

const W = 600;
const H = 236;
const PLOT = 540;

export function HeroDemo() {
  const still = useMemo(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [phase, setPhase] = useState<Phase>(still ? 'pause' : 'idle');
  const [candles, setCandles] = useState(() => series(46));
  const [left, setLeft] = useState(5);
  const [cursor, setCursor] = useState({ x: 210, y: 120 });
  const [visible, setVisible] = useState(true);
  const body = useRef<HTMLDivElement>(null);
  const buy = useRef<HTMLSpanElement>(null);
  const skip = useRef<HTMLSpanElement>(null);

  // Only animate while on screen and the tab is visible.
  useEffect(() => {
    const el = body.current;
    if (!el || still) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting && !document.hidden), { threshold: 0.2 });
    io.observe(el);
    const vis = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', vis);
    return () => {
      io.disconnect();
      document.removeEventListener('visibilitychange', vis);
    };
  }, [still]);

  // The script: one step at a time.
  useEffect(() => {
    if (still || !visible) return;
    const i = STEPS.findIndex(([p]) => p === phase);
    const id = setTimeout(() => setPhase(STEPS[(i + 1) % STEPS.length][0]), STEPS[i][1]);
    return () => clearTimeout(id);
  }, [phase, visible, still]);

  // The cursor travels to the button the step is about.
  useEffect(() => {
    const at = (el: HTMLElement | null, dx = 0.55, dy = 0.6) => {
      if (!el || !body.current) return;
      const b = body.current.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      setCursor({ x: r.left - b.left + r.width * dx, y: r.top - b.top + r.height * dy });
    };
    if (phase === 'aim') at(buy.current);
    if (phase === 'aimSkip') at(skip.current, 0.45, 0.55);
    if (phase === 'done') setCursor((c) => ({ x: c.x - 120, y: c.y - 70 }));
    if (phase === 'pause') setLeft(5);
  }, [phase]);

  // The countdown on Place anyway.
  useEffect(() => {
    if (phase !== 'pause' || still) return;
    const id = setInterval(() => setLeft((s) => Math.max(1, s - 1)), 1000);
    return () => clearInterval(id);
  }, [phase, still]);

  // The last candle ticks.
  useEffect(() => {
    if (still || !visible) return;
    let s = 99;
    const id = setInterval(() => {
      s = (s * 48271) % 2147483647;
      const step = ((s / 2147483647) - 0.5) * 0.00014;
      setCandles((cs) => {
        const last = cs[cs.length - 1];
        const c = Math.min(last.o + 0.0006, Math.max(last.o - 0.0006, last.c + step));
        return [...cs.slice(0, -1), { ...last, c, h: Math.max(last.h, c), l: Math.min(last.l, c) }];
      });
    }, 650);
    return () => clearInterval(id);
  }, [still, visible]);

  const lo = Math.min(...candles.map((c) => c.l));
  const hi = Math.max(...candles.map((c) => c.h));
  const pad = (hi - lo) * 0.12;
  const y = (p: number) => 14 + ((hi + pad - p) / (hi - lo + 2 * pad)) * (H - 28);
  const step = PLOT / candles.length;
  const last = candles[candles.length - 1];
  const ma = candles.map((_, i) => {
    const w = candles.slice(Math.max(0, i - 7), i + 1);
    return w.reduce((a, c) => a + c.c, 0) / w.length;
  });
  const maPath = ma.map((v, i) => `${i ? 'L' : 'M'}${(i + 0.5) * step} ${y(v).toFixed(1)}`).join(' ');
  const bid = last.c;
  const ask = last.c + 0.00003;

  const order: Order = { platform: 'mt5', account: 'demo', symbol: 'EURUSD', side: 'buy', size: 0.5, type: 'market', kind: 'entry' };
  const head = headline({ rule: 'R1', observed: 4, limit: 3 }, order, coreFmt(), Date.now());
  const showPause = phase === 'pause' || phase === 'aimSkip' || phase === 'skip';

  return (
    <div className="demo-window" aria-label="A Buy past the day's trade limit gets a pause, and the trader skips it" role="img">
      <div className="demo-top" aria-hidden="true">
        <span className="demo-dots"><i /><i /><i /></span>
        <span className="demo-title"><Icon name="candles" size={14} /> EURUSD · M5</span>
        <span className="demo-pill"><span className="live-dot" /> DisciplineGuard · On · 3 of 3 trades</span>
      </div>
      <div className="demo-body" ref={body} aria-hidden="true">
        <svg className="demo-chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="demo-ma" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#5b4ff0" stopOpacity=".15" />
              <stop offset="1" stopColor="#2563eb" stopOpacity=".85" />
            </linearGradient>
          </defs>
          {[0.2, 0.4, 0.6, 0.8].map((f) => <line key={f} className="demo-grid" x1="0" x2={PLOT} y1={H * f} y2={H * f} />)}
          <path d={maPath} stroke="url(#demo-ma)" strokeWidth="2" fill="none" strokeLinecap="round" />
          {candles.map((c, i) => {
            const up = c.c >= c.o;
            const x = (i + 0.5) * step;
            const top = y(Math.max(c.o, c.c));
            const h = Math.max(1.5, Math.abs(y(c.o) - y(c.c)));
            return (
              <g key={i} className={up ? 'demo-up' : 'demo-down'}>
                <line x1={x} x2={x} y1={y(c.h)} y2={y(c.l)} strokeWidth="1.2" />
                <rect x={x - step * 0.31} y={top} width={step * 0.62} height={h} rx="1.2" />
              </g>
            );
          })}
          <line className="demo-last" x1="0" x2={PLOT} y1={y(last.c)} y2={y(last.c)} />
          <rect className="demo-tag" x={PLOT + 4} y={y(last.c) - 10} width={W - PLOT - 6} height="20" rx="5" />
          <text className="demo-tag-text" x={PLOT + 4 + (W - PLOT - 6) / 2} y={y(last.c) + 4} textAnchor="middle">{last.c.toFixed(5)}</text>
          {[0.2, 0.6].map((f) => (
            <text key={f} className="demo-axis" x={W - 6} y={H * f - 5} textAnchor="end">{(hi + pad - f * (hi - lo + 2 * pad)).toFixed(4)}</text>
          ))}
        </svg>
        <div className="demo-ticket">
          <span className="demo-sym">EURUSD</span>
          <span className="demo-lots"><span className="faint">Lots</span> 0.50</span>
          <span className="demo-btn sell"><small>Sell</small>{bid.toFixed(5)}</span>
          <span ref={buy} className={`demo-btn buy${phase === 'press' ? ' pressed' : ''}`}><small>Buy</small>{ask.toFixed(5)}</span>
        </div>

        <div className={`demo-scrim${showPause ? ' on' : ''}`} />
        <div className={`demo-pause${showPause ? ' on' : ''}`}>
          <div className="dp-label"><Mark size={15} /> PAUSE · YOUR RULE</div>
          <div className="dp-head">{head}</div>
          <div className="dp-line">Your limit resets 00:00.</div>
          <div className="dp-chip">Buy 0.50 EURUSD</div>
          <div className="dp-wait"><i className={showPause && !still ? 'run' : ''} /></div>
          <div className="dp-buttons">
            <span ref={skip} className={`dp-skip${phase === 'skip' ? ' pressed' : ''}`}>Skip this trade</span>
            <span className="dp-place">Place anyway · 0:0{left}</span>
          </div>
        </div>
        <div className={`demo-toast${phase === 'done' ? ' on' : ''}`}><Icon name="check" size={15} strokeWidth={2.2} /> Skipped. Nothing was placed.</div>

        {!still && (
          <div className={`demo-cursor${phase === 'press' || phase === 'skip' ? ' click' : ''}`} style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}>
            <svg width="22" height="22" viewBox="0 0 24 24"><path d="M5 3.5 18.5 12 12 13.4 9.2 19.5 5 3.5Z" fill="#fff" stroke="#0b1220" strokeWidth="1.4" strokeLinejoin="round" /></svg>
          </div>
        )}
      </div>
    </div>
  );
}
