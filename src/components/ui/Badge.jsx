import { badgeStyle } from '../../utils/masterLists';
import { toneFor } from '../../utils/statusTone';

/**
 * Status pills, from one palette.
 *
 * Statuses were coloured page by page, so Delivered was emerald on Orders and
 * green-400 on Ledger, and three screens each had their own idea of what a
 * warning looked like. A status that changes colour between screens is read as
 * a different status.
 *
 * `color` takes precedence when given: master-list options carry their own
 * colour, chosen by whoever added the option, and that has to win over
 * anything guessed from the label.
 */

const TONE = {
  neutral: 'bg-white/5 text-slate-400 border-white/10',
  accent: 'bg-brand-accent/10 text-brand-accent border-brand-accent/25',
  success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25',
  warning: 'bg-amber-500/10 text-amber-400 border-amber-500/25',
  danger: 'bg-rose-500/10 text-rose-400 border-rose-500/25',
  info: 'bg-blue-500/10 text-blue-400 border-blue-500/25',
  purple: 'bg-purple-500/10 text-purple-400 border-purple-500/25',
};

export default function Badge({ children, tone, color, size = 'md', className = '', ...rest }) {
  const resolved = tone || toneFor(children);
  const dims = size === 'sm'
    ? 'text-[9px] px-1.5 py-0.5'
    : 'text-[10px] px-2 py-0.5';
  return (
    <span
      {...rest}
      style={color ? badgeStyle(color) : undefined}
      className={`inline-flex items-center gap-1 font-bold rounded-full border whitespace-nowrap
        ${color ? '' : (TONE[resolved] || TONE.neutral)} ${dims} ${className}`}
    >
      {children}
    </span>
  );
}

/** A count beside a heading — "Leads 9" — rather than a sentence saying nine. */
export function CountBadge({ value, className = '' }) {
  return (
    <span className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full
      bg-brand-accent/15 text-brand-accent text-[10px] font-extrabold ${className}`}>
      {value}
    </span>
  );
}
