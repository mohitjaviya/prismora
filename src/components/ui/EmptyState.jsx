import { Inbox } from 'lucide-react';

/**
 * What a screen says when it has nothing to show.
 *
 * Until now it said nothing at all: a table with one row and then eight inches
 * of empty page, or a chart drawn with no series in it. Both read as a screen
 * that failed to load rather than a business with no orders yet, and the two
 * want completely different reactions from whoever is looking.
 *
 * `hint` is where the difference goes — "nothing matches that filter" and
 * "nobody has raised one yet" are not the same emptiness.
 */
export default function EmptyState({
  icon: Icon = Inbox,
  title = 'Nothing here yet',
  hint,
  action,
  compact = false,
  className = '',
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${compact ? 'py-8 px-4' : 'py-14 px-6'} ${className}`}>
      <span className={`rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center mb-3
        ${compact ? 'w-10 h-10' : 'w-14 h-14'}`}>
        <Icon size={compact ? 18 : 24} className="text-slate-600" />
      </span>
      <p className={`font-bold text-slate-300 ${compact ? 'text-xs' : 'text-sm'}`}>{title}</p>
      {hint && (
        <p className={`text-slate-500 mt-1 max-w-sm leading-relaxed ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
          {hint}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
