import { ClientType } from './document-utils';

export function ClientTypeIcon({ type }: { type: ClientType }) {
  const common = {
    width: 28,
    height: 28,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };

  if (type === 'PJ') {
    return (
      <svg {...common}>
        <path d="M4 21h16" />
        <path d="M6 21V5a1 1 0 0 1 1-1h7v17" />
        <path d="M14 9h3a1 1 0 0 1 1 1v11" />
        <path d="M9 8h2M9 12h2M9 16h2" />
      </svg>
    );
  }

  if (type === 'PF') {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1.6-4.2 4.2-6.3 8-6.3s6.4 2.1 8 6.3" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21" />
      <path d="M12 3C9.6 5.5 8.4 8.5 8.4 12S9.6 18.5 12 21" />
    </svg>
  );
}
