import { createElement } from 'react';

export type IconName =
  | 'home'
  | 'wallet'
  | 'credit-card'
  | 'heart'
  | 'clock'
  | 'activity'
  | 'user'
  | 'users'
  | 'user-check'
  | 'shield'
  | 'shield-check'
  | 'building'
  | 'hospital'
  | 'stethoscope'
  | 'check-circle'
  | 'check'
  | 'alert-circle'
  | 'alert-triangle'
  | 'info'
  | 'help-circle'
  | 'settings'
  | 'lock'
  | 'key'
  | 'bell'
  | 'file-text'
  | 'receipt'
  | 'calendar'
  | 'search'
  | 'map-pin'
  | 'sparkles'
  | 'cpu'
  | 'trending-up'
  | 'gift'
  | 'message-circle'
  | 'download'
  | 'upload'
  | 'eye'
  | 'plus'
  | 'arrow-right'
  | 'chevron-right'
  | 'x'
  | 'refresh'
  | 'log-out'
  | 'edit'
  | 'trash'
  | 'filter'
  | 'smartphone'
  | 'qr-code'
  | 'globe';

/**
 * Single-source icon set. Every glyph is a 24x24 stroke drawing so the whole
 * library keeps one consistent optical weight and inherits `currentColor`.
 * An icon is one path or an array of paths (multi-subpath icons such as
 * `trending-up`). Circles are expressed as arc paths so a single `<path>`
 * element per subpath is enough — no per-shape element plumbing required.
 */
const paths: Record<IconName, string | string[]> = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9.5',
  wallet: 'M2 8h20v12H2zM2 4h20m-2 0v4M6 4v4M17 14h.01',
  'credit-card':
    'M22 7H2m20 4V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2zM14 17h4',
  heart:
    'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z',
  clock: 'M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0zM12 6v6l4 2',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
  users:
    'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  'user-check':
    'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM17 11l2 2 4-4',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  'shield-check': ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M9 12l2 2 4-4'],
  building: 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M6 12h12M6 7h12M6 17h4M3 22h18',
  hospital: 'M4 21V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v15M2 21h20M12 7v6M9 10h6M9 21v-4h6v4',
  stethoscope:
    'M6 3v6a5 5 0 0 0 10 0V3M6 3H4M16 3h2M11 14v1a5 5 0 0 0 5 5 5 5 0 0 0 5-5v-1M21 10a2 2 0 1 0-4 0 2 2 0 0 0 4 0z',
  'check-circle': ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'M22 4 12 14.01l-3-3'],
  check: 'M20 6 9 17l-5-5',
  'alert-circle': 'M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0zM12 8v4M12 16h.01',
  'alert-triangle':
    'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  info: 'M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0zM12 16v-4M12 8h.01',
  'help-circle':
    'M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0zM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01',
  settings:
    'M9.4 20.8 12 22l2.6-1.2.8-2.9h3.2l.8-3-2.3-2 2.3-2-.8-3h-3.2l-.8-2.9L12 2 9.4 3.2l-.8 2.9H5.4l-.8 3 2.3 2-2.3 2 .8 3h3.2zm2.6-6a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
  lock: 'M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2zM7 11V7a5 5 0 0 1 10 0v4M12 16v2',
  key: 'M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0',
  'file-text':
    'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  receipt:
    'M4 2v20l2-1.5L8 22l2-1.5L12 22l2-1.5L16 22l2-1.5L20 22V2l-2 1.5L16 2l-2 1.5L12 2l-2 1.5L8 2 6 3.5zM8 8h8M8 12h8M8 16h5',
  calendar:
    'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18',
  search: 'M19 11a8 8 0 1 0-16 0 8 8 0 0 0 16 0zM21 21l-4.35-4.35',
  'map-pin': 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0zM15 10a3 3 0 1 0-6 0 3 3 0 0 0 6 0z',
  sparkles: [
    'M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z',
    'M19 2v4M21 4h-4M5 16v4M7 18H3',
  ],
  cpu: 'M6 6h12a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM10 10h4v4h-4zM12 2v3M12 19v3M2 12h3M19 12h3M6 2v3M6 19v3M18 2v3M18 19v3',
  'trending-up': ['M23 6l-9.5 9.5-5-5L1 18', 'M17 6h6v6'],
  gift: [
    'M20 12v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9M2 7h20v5H2zM12 22V7',
    'M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
  ],
  'message-circle':
    'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  eye: 'M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7zM15 12a3 3 0 1 0-6 0 3 3 0 0 0 6 0z',
  plus: 'M12 5v14M5 12h14',
  'arrow-right': 'M5 12h14M12 5l7 7-7 7',
  'chevron-right': 'M9 18l6-6-6-6',
  x: 'M18 6 6 18M6 6l12 12',
  refresh:
    'M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15',
  'log-out': ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5M21 12H9'],
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z',
  trash:
    'M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6',
  filter: 'M22 3H2l8 9.46V19l4 2v-8.54z',
  smartphone: 'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM12 18h.01',
  'qr-code':
    'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM16 16h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z',
  globe:
    'M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0zM2 12h20M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20z',
};

export function Icon({
  name,
  size = 20,
  className,
  strokeWidth = 1.7,
}: {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  const d = paths[name];
  const segments = Array.isArray(d) ? d : [d];
  return createElement(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
      focusable: 'false',
      className,
    },
    segments.map((segment, index) => createElement('path', { key: index, d: segment })),
  );
}
