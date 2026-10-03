// The status pill and its mini panel on TradingView (EXPERIENCE §6.3, SPEC §9.1 "Rendering"): fixed on the document
// root in a closed shadow root, never inside TradingView's DOM. Draggable (stored as a fraction of the viewport),
// collapsible to the dot, hidden in fullscreen, and themed from TradingView's root class.
declare const __DG_TEST__: boolean;

export type Tone = 'on' | 'setup' | 'attention' | 'off';

export interface PillView {
  tone: Tone;
  /** "On · 3 of 5 trades · cooldown 4:12" */
  text: string;
  /** Mini panel lines: today's meters, the account, the reason. */
  lines: string[];
  /** Tighten-now actions, shown only while protection is on. */
  actions: boolean;
}

export interface PillHandlers {
  open(page: string): void;
  takeBreak(): void;
  doneToday(): void;
}

const STORE = 'dg_pill';

const CSS = `
:host { all: initial; }
.pill { position: fixed; z-index: 2147483646; display: flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px;
  font: 12px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif; font-variant-numeric: tabular-nums; cursor: grab; user-select: none;
  background: #fff; color: #131722; border: 1px solid #e0e3eb; box-shadow: 0 2px 8px rgba(0,0,0,.12); white-space: nowrap; touch-action: none; }
.dark .pill { background: #1e222d; color: #d1d4dc; border-color: #363a45; }
.dot { width: 8px; height: 8px; border-radius: 50%; flex: none; cursor: pointer; }
.on .dot { background: #14c3cf; } .setup .dot { background: #2563eb; } .attention .dot { background: #f59e0b; }
.off .dot { background: #9ca3af; }
.collapsed .text { display: none; }
.collapsed .pill { padding: 6px; }
.panel { position: fixed; z-index: 2147483646; width: 260px; padding: 12px 14px; border-radius: 12px; display: none;
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; background: #fff; color: #131722; border: 1px solid #e0e3eb;
  box-shadow: 0 8px 24px rgba(0,0,0,.2); }
.dark .panel { background: #1e222d; color: #d1d4dc; border-color: #363a45; }
.panel.open { display: block; }
.panel div { margin: 2px 0; }
.row { display: flex; gap: 6px; margin-top: 10px; }
button { flex: 1; min-height: 32px; border-radius: 8px; border: 1px solid rgba(127,127,127,.4); background: transparent; color: inherit;
  font: inherit; font-size: 12px; cursor: pointer; }
button:focus-visible { outline: 2px solid #5eead4; outline-offset: 2px; }
.links { display: flex; gap: 12px; margin-top: 10px; font-size: 12px; }
.links a { color: #0b6fc0; cursor: pointer; text-decoration: underline; }
.dark .links a { color: #5eead4; }
.hidden { display: none !important; }
`;

export class Pill {
  private host = document.createElement('dg-pill');
  private root: ShadowRoot;
  private wrap: HTMLDivElement;
  private pill: HTMLDivElement;
  private text: HTMLSpanElement;
  private panel: HTMLDivElement;
  private pos?: { x: number; y: number };
  private collapsed = false;
  private view?: PillView;

  constructor(
    private h: PillHandlers,
    private anchor: () => DOMRect | undefined,
  ) {
    this.root = this.host.attachShadow({ mode: typeof __DG_TEST__ === 'boolean' && __DG_TEST__ ? 'open' : 'closed' });
    this.root.innerHTML = `<style>${CSS}</style><div class="wrap"><div class="pill" role="status"><span class="dot" title="Collapse"></span><span class="text"></span></div><div class="panel" role="dialog" aria-label="DisciplineGuard"></div></div>`;
    this.wrap = this.root.querySelector('.wrap')!;
    this.pill = this.root.querySelector('.pill')!;
    this.text = this.root.querySelector('.text')!;
    this.panel = this.root.querySelector('.panel')!;
    // TradingView never sees input on the pill (its hotkeys and chart listeners).
    for (const t of ['keydown', 'keyup', 'keypress', 'pointerdown', 'mousedown', 'wheel', 'contextmenu']) this.host.addEventListener(t, (e) => e.stopPropagation());
    this.drag();
    this.root.querySelector('.dot')!.addEventListener('click', (e) => {
      e.stopPropagation();
      this.collapsed = !this.collapsed;
      this.panel.classList.remove('open');
      this.save();
      this.layout();
    });
    addEventListener('resize', () => this.layout());
    document.addEventListener('fullscreenchange', () => this.layout());
    chrome.storage.local.get(STORE).then((v) => {
      const s = v[STORE] as { x?: number; y?: number; collapsed?: boolean } | undefined;
      if (s && typeof s.x === 'number' && typeof s.y === 'number') this.pos = { x: s.x, y: s.y };
      this.collapsed = !!s?.collapsed;
      this.layout();
    });
  }

  /** True when this event came from the pill. */
  owns(e: Event): boolean {
    return e.composedPath().includes(this.host);
  }

  render(v: PillView): void {
    if (!this.host.isConnected) document.documentElement.appendChild(this.host);
    this.view = v;
    this.wrap.className = `wrap ${v.tone}${this.collapsed ? ' collapsed' : ''}${document.documentElement.classList.contains('theme-dark') ? ' dark' : ''}`;
    this.text.textContent = v.text;
    this.pill.setAttribute('aria-label', `DisciplineGuard: ${v.text}`);
    if (this.panel.classList.contains('open')) this.fillPanel();
    this.layout();
  }

  private fillPanel() {
    const v = this.view!;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    this.panel.innerHTML = `${v.lines.map((l) => `<div>${esc(l)}</div>`).join('')}
      ${v.actions ? '<div class="row"><button data-a="break">Take a 15 min break</button><button data-a="done">Done for today</button></div>' : ''}
      <div class="links"><a data-p="today">Dashboard</a><a data-p="today?practice">Practice pause</a><a data-p="help">Help</a></div>`;
    for (const a of this.panel.querySelectorAll<HTMLElement>('[data-p]')) a.onclick = () => this.h.open(a.dataset.p!);
    const b = this.panel.querySelector<HTMLButtonElement>('[data-a="break"]');
    if (b) b.onclick = () => (this.h.takeBreak(), this.panel.classList.remove('open'));
    const d = this.panel.querySelector<HTMLButtonElement>('[data-a="done"]');
    if (d) d.onclick = () => (this.h.doneToday(), this.panel.classList.remove('open'));
  }

  private toggle() {
    if (this.collapsed) {
      this.collapsed = false;
      this.save();
    } else if (this.panel.classList.toggle('open')) this.fillPanel();
    if (this.view) this.render(this.view);
  }

  private drag() {
    let start: { x: number; y: number; left: number; top: number } | undefined;
    let moved = false;
    this.pill.addEventListener('pointerdown', (e) => {
      if ((e.target as Element).classList.contains('dot')) return;
      const r = this.pill.getBoundingClientRect();
      start = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
      moved = false;
      this.pill.setPointerCapture(e.pointerId);
    });
    this.pill.addEventListener('pointermove', (e) => {
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      this.pos = { x: (start.left + dx) / innerWidth, y: (start.top + dy) / innerHeight };
      this.layout();
    });
    this.pill.addEventListener('pointerup', () => {
      if (!start) return;
      start = undefined;
      if (moved) this.save();
      else this.toggle();
    });
  }

  private save() {
    void chrome.storage.local.set({ [STORE]: { ...this.pos, collapsed: this.collapsed } });
  }

  private layout() {
    const hide = !!document.fullscreenElement;
    this.wrap.classList.toggle('hidden', hide);
    if (hide) return;
    const w = this.pill.offsetWidth || 160;
    const h = this.pill.offsetHeight || 26;
    let left: number;
    let top: number;
    if (this.pos) {
      left = this.pos.x * innerWidth;
      top = this.pos.y * innerHeight;
    } else {
      // Default: inside the chart's bottom-right, clear of the price and time scales.
      const a = this.anchor();
      left = a ? a.right - w - 80 : innerWidth - w - 80;
      top = a ? a.bottom - h - 40 : innerHeight - h - 60;
    }
    left = Math.min(Math.max(4, left), innerWidth - w - 4);
    top = Math.min(Math.max(4, top), innerHeight - h - 4);
    this.pill.style.left = `${left}px`;
    this.pill.style.top = `${top}px`;
    const pw = 260;
    this.panel.style.left = `${Math.min(Math.max(4, left + w - pw), innerWidth - pw - 4)}px`;
    const below = top + h + 6;
    this.panel.style.top = top > innerHeight / 2 ? '' : `${below}px`;
    this.panel.style.bottom = top > innerHeight / 2 ? `${innerHeight - top + 6}px` : '';
  }
}
