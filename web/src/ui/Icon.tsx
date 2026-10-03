// The icon set: 24×24 line icons, 1.75 stroke, drawn in currentColor. Decorative unless given a label.
import type { ReactNode } from 'react';
import type { RuleId } from '@dg/core';

const P: Record<string, ReactNode> = {
  today: <><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /><circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none" /></>,
  rules: <><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2.2" /><circle cx="9" cy="17" r="2.2" /><path d="M4 12h5M13 12h7" /><circle cx="11" cy="12" r="2.2" /></>,
  devices: <><rect x="3" y="4" width="18" height="12" rx="2.5" /><path d="M8.5 20h7M12 16v4" /></>,
  stats: <><path d="M4 20h16" /><rect x="5.5" y="11" width="3" height="6" rx="1" /><rect x="10.5" y="6" width="3" height="11" rx="1" /><rect x="15.5" y="9" width="3" height="8" rx="1" /></>,
  account: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" /></>,
  help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.1-2.4 3.6" /><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none" /></>,
  owner: <><path d="M4 18 6 8l4 4 2-6 2 6 4-4 2 10H4Z" /></>,
  pause: <><rect x="7" y="5" width="3.6" height="14" rx="1.2" /><rect x="13.4" y="5" width="3.6" height="14" rx="1.2" /></>,
  shield: <><path d="M12 3 5 6v5.5c0 4.4 2.9 7.9 7 9.5 4.1-1.6 7-5.1 7-9.5V6l-7-3Z" /></>,
  shieldCheck: <><path d="M12 3 5 6v5.5c0 4.4 2.9 7.9 7 9.5 4.1-1.6 7-5.1 7-9.5V6l-7-3Z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  bolt: <><path d="M13 3 5 13.5h6L10.5 21 19 10.5h-6L13 3Z" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  hourglass: <><path d="M7 3.5h10M7 20.5h10M8 3.5c0 4 8 4.5 8 8.5s-8 4.5-8 8.5M16 3.5c0 4-8 4.5-8 8.5s8 4.5 8 8.5" /></>,
  coffee: <><path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9Z" /><path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c-.6.8-.6 1.7 0 2.5M11.5 3.5c-.6.8-.6 1.7 0 2.5" /></>,
  moon: <><path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z" /></>,
  check: <><path d="m5 12.5 4.5 4.5L19 7.5" /></>,
  x: <><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  minus: <><path d="M5 12h14" /></>,
  chevronRight: <><path d="m9.5 6 6 6-6 6" /></>,
  chevronDown: <><path d="m6 9.5 6 6 6-6" /></>,
  arrowRight: <><path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5" /></>,
  external: <><path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" /></>,
  download: <><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" /></>,
  alert: <><path d="M10.3 4.3 2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" /><path d="M12 9.5v4" /><circle cx="12" cy="17" r=".9" fill="currentColor" stroke="none" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><circle cx="12" cy="8" r=".9" fill="currentColor" stroke="none" /></>,
  phone: <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
  laptop: <><rect x="4.5" y="5" width="15" height="10.5" rx="1.8" /><path d="M2.5 19h19" /></>,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2.2" /><path d="M15.5 8.5V6.2a1.7 1.7 0 0 0-1.7-1.7H6.2a1.7 1.7 0 0 0-1.7 1.7v7.6a1.7 1.7 0 0 0 1.7 1.7h2.3" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5s1.2-6.1 3.5-8.5Z" /></>,
  window: <><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><path d="M3 9h18" /><circle cx="6.2" cy="6.8" r=".6" fill="currentColor" stroke="none" /><circle cx="8.4" cy="6.8" r=".6" fill="currentColor" stroke="none" /></>,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="2" /><rect x="9.5" y="9.5" width="5" height="5" rx="1" /><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" /></>,
  trendDown: <><path d="M3.5 7 9 12.5l4-4 7.5 7.5" /><path d="M15 16h5.5v-5.5" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /></>,
  layers: <><path d="m12 3.5 8.5 4.5-8.5 4.5L3.5 8 12 3.5Z" /><path d="m3.5 12 8.5 4.5 8.5-4.5M3.5 16l8.5 4.5 8.5-4.5" /></>,
  hash: <><path d="M9.5 4 7.5 20M16.5 4l-2 16M4.5 9h15M3.5 15h15" /></>,
  stop: <><path d="M8.3 3.5h7.4l4.8 4.8v7.4l-4.8 4.8H8.3l-4.8-4.8V8.3l4.8-4.8Z" /><path d="M8.5 12h7" /></>,
  sun: <><circle cx="12" cy="12" r="3.8" /><path d="M12 2.8v2M12 19.2v2M2.8 12h2M19.2 12h2M5.5 5.5l1.4 1.4M17.1 17.1l1.4 1.4M5.5 18.5l1.4-1.4M17.1 6.9l1.4-1.4" /></>,
  scale: <><path d="M12 4v16M7.5 20h9M5 7.5h14" /><path d="m5 7.5-2.5 6a3 3 0 0 0 5 0L5 7.5ZM19 7.5l-2.5 6a3 3 0 0 0 5 0L19 7.5Z" /></>,
  sizeUp: <><path d="M7 17 17 7M10 7h7v7" /><path d="M4.5 4.5l15 15" opacity=".45" /></>,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  unlock: <><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 7.6-1.7" /></>,
  sparkle: <><path d="M12 3.5c.8 3.9 2.6 5.7 6.5 6.5-3.9.8-5.7 2.6-6.5 6.5-.8-3.9-2.6-5.7-6.5-6.5 3.9-.8 5.7-2.6 6.5-6.5Z" /><path d="M18.5 15.5c.3 1.5 1 2.2 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.3 2.2-1 2.5-2.5Z" /></>,
  play: <><path d="M8 5.5v13l10.5-6.5L8 5.5Z" /></>,
  logout: <><path d="M14.5 4H18a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3.5M10 8l-4 4 4 4M6 12h10" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></>,
  bell: <><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5l1.5-2Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2" /></>,
  trash: <><path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13" /></>,
  file: <><path d="M14 3.5H7A2 2 0 0 0 5 5.5v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-10L14 3.5Z" /><path d="M14 3.5v5h5M9 13h6M9 16.5h4" /></>,
  candles: <><path d="M7 3.5v3M7 15.5v5M17 3.5v5M17 17.5v3" /><rect x="5" y="6.5" width="4" height="9" rx="1" /><rect x="15" y="8.5" width="4" height="9" rx="1" /></>,
  activity: <><path d="M3 12h4l2.5-6 5 12 2.5-6h4" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  wave: <><path d="M3 12c2.2 0 2.2-4 4.5-4s2.2 8 4.5 8 2.2-8 4.5-8 2.2 4 4.5 4" /></>,
  refresh: <><path d="M19.5 8A8 8 0 0 0 5 7.5M4.5 16a8 8 0 0 0 14.5.5" /><path d="M19.5 3.5V8H15M4.5 20.5V16H9" /></>,
  star: <><path d="m12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8L12 3.8Z" /></>,
  quote: <><path d="M10 7H6.5A1.5 1.5 0 0 0 5 8.5V12a1.5 1.5 0 0 0 1.5 1.5H9V16a2 2 0 0 1-2 2M19 7h-3.5A1.5 1.5 0 0 0 14 8.5V12a1.5 1.5 0 0 0 1.5 1.5H18V16a2 2 0 0 1-2 2" /></>,
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 18, label, className, strokeWidth = 1.75 }: { name: IconName; size?: number; label?: string; className?: string; strokeWidth?: number }) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {P[name]}
    </svg>
  );
}

/** One icon per rule, used on Rules, the landing page and onboarding. */
export const RULE_ICON: Record<RuleId, IconName> = {
  R1: 'hash',
  R2: 'clock',
  R3: 'bolt',
  R4: 'sun',
  R5: 'layers',
  R6: 'target',
  R7: 'hourglass',
  R8: 'trendDown',
  R9: 'stop',
  R10: 'sizeUp',
};
