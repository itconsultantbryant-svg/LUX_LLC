import { createElement } from 'react';

export type IconName =
  | 'home'
  | 'wallet'
  | 'credit-card'
  | 'heart'
  | 'clock'
  | 'activity'
  | 'user'
  | 'shield'
  | 'building'
  | 'check-circle'
  | 'alert-circle'
  | 'settings';

const paths: Record<IconName, string> = {
  home: 'M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9',
  wallet: 'M2 8h20v12H2zM2 4h20m-2 0v4M6 4v4',
  'credit-card':
    'M22 7H2m20 4V5a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2zM14 17h4',
  heart:
    'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 0.5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z',
  clock: 'M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10zm0-14v8l6 3',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  user: 'M16 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0m4 21v-2a6 6 0 0 0-6-6h-4a6 6 0 0 0-6 6v2',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10',
  building: 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18M6 12h12M6 7h12M6 17h4',
  'check-circle': 'M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4 12 14.01l-3-3',
  'alert-circle':
    'M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10zm-1-7h2v2h-2zm0-8h2v6h-2',
  settings:
    'M9.4 20.8 12 22l2.6-1.2.8-2.9h3.2l.8-3-2.3-2 2.3-2-.8-3h-3.2l-.8-2.9L12 2 9.4 3.2l-.8 2.9H5.4l-.8 3 2.3 2-2.3 2 .8 3h3.2zm2.6-6a2 2 0 1 0 0-4 2 2 0 0 0 0 4',
};

export function Icon({
  name,
  size = 20,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return createElement(
    'svg',
    {
      viewBox: '0 0 24 24',
      width: size,
      height: size,
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.7,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
      className,
    },
    createElement('path', { d: paths[name] }),
  );
}
