// The DisciplineGuard mark: two candlesticks that read as a pause, on a bright mint-to-blue tile.
// The favicon (public/mark.svg), the Windows app and the extension icons are the same drawing.
import { useId } from 'react';
import { onLink } from '../router.ts';

const TILE =
  'M162.1 8c30.1 0 45.1 0 56.6 5.9a53.7 53.7 0 0 1 23.5 23.5c5.9 11.5 5.9 26.5 5.9 56.6L248 162.1c0 30.1 0 45.1-5.9 56.6a53.7 53.7 0 0 1-23.5 23.5c-11.5 5.9-26.5 5.9-56.6 5.9L93.9 248c-30.1 0-45.1 0-56.6-5.9a53.7 53.7 0 0 1-23.5-23.5c-5.9-11.5-5.9-26.5-5.9-56.6L8 93.9c0-30.1 0-45.1 5.9-56.6a53.7 53.7 0 0 1 23.5-23.5c11.5-5.9 26.5-5.9 56.6-5.9Z';

export function Mark({ size = 28 }: { size?: number }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const url = (k: string) => `url(#${id}${k})`;
  return (
    <svg className="mark" width={size} height={size} viewBox="0 0 256 256" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}g`} x1="40" y1="8" x2="216" y2="248" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6af4cc" />
          <stop offset=".33" stopColor="#1cd0d0" />
          <stop offset=".67" stopColor="#1e98f2" />
          <stop offset="1" stopColor="#5262f4" />
        </linearGradient>
        <radialGradient id={`${id}h`} cx="60" cy="0" r="240" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity=".42" />
          <stop offset=".62" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}c`} x1="0" y1="40" x2="0" y2="216" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#e6f4ff" />
        </linearGradient>
        <filter id={`${id}s`} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dy="9" stdDeviation="10" floodColor="#0b2f86" floodOpacity=".32" />
        </filter>
      </defs>
      <path d={TILE} fill={url('g')} />
      <path d={TILE} fill={url('h')} />
      <g fill={url('c')} filter={url('s')}>
        <rect x="92" y="62" width="12" height="150" rx="6" />
        <rect x="76" y="92" width="44" height="94" rx="13" />
        <rect x="152" y="42" width="12" height="150" rx="6" />
        <rect x="136" y="70" width="44" height="94" rx="13" />
      </g>
    </svg>
  );
}

/** The mark and the name, linking home: the website's first page, or Today once signed in. */
export function Brand({ href = '/', size = 28, onClick = onLink }: { href?: string; size?: number; onClick?(e: React.MouseEvent<HTMLAnchorElement>): void }) {
  return (
    <a href={href} onClick={onClick} className="brand">
      <Mark size={size} />
      <span>DisciplineGuard</span>
    </a>
  );
}

/** The logo, then where this page sits ("Help", "Status"). */
export function BrandCrumb({ page, href }: { page: string; href?: string }) {
  return (
    <span className="crumb">
      <Brand />
      <span aria-hidden="true">/</span>
      {href ? <a href={href} onClick={onLink}>{page}</a> : <span>{page}</span>}
    </span>
  );
}
