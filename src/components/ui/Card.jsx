/**
 * The panel every screen is built from, and the two shapes it takes most often.
 *
 * `glass-panel` was applied by hand with its own padding and radius each time,
 * which is how the app ended up with rounded-xl, rounded-2xl and rounded-3xl
 * panels sitting next to each other.
 */

export default function Card({ children, className = '', padding = 'p-5', ...rest }) {
  return (
    <div {...rest} className={`glass-panel rounded-2xl border border-white/5 ${padding} ${className}`}>
      {children}
    </div>
  );
}

/**
 * A card with a title bar: icon, heading, a line of explanation, and room on
 * the right for a count, a filter or a button.
 */
export function SectionCard({
  icon: Icon, title, subtitle, actions, children, className = '', bodyClassName = '', ...rest
}) {
  return (
    <div {...rest} className={`glass-panel rounded-2xl border border-white/5 overflow-hidden ${className}`}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-white/5 flex-wrap">
          <div className="flex items-start gap-2.5 min-w-0">
            {Icon && (
              <span className="w-8 h-8 rounded-xl bg-brand-accent/10 flex items-center justify-center flex-shrink-0">
                <Icon size={15} className="text-brand-accent" />
              </span>
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-white leading-tight">{title}</h3>
              {subtitle && <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName || 'p-5'}>{children}</div>
    </div>
  );
}

/**
 * One number and what it counts.
 *
 * `trend` is deliberately dropped when it is zero. Every stat on the dashboard
 * read "0%" against an empty database, which looks like a broken widget rather
 * than an honest absence of history.
 */
export function StatCard({ label, value, icon: Icon, trend, hint, tone = 'accent', className = '' }) {
  const tones = {
    accent: 'text-brand-accent bg-brand-accent/10',
    success: 'text-emerald-400 bg-emerald-500/10',
    warning: 'text-amber-400 bg-amber-500/10',
    danger: 'text-rose-400 bg-rose-500/10',
    info: 'text-blue-400 bg-blue-500/10',
  };
  const up = Number(trend) > 0;
  return (
    <div className={`glass-panel rounded-2xl border border-white/5 p-4 sm:p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide leading-tight">{label}</p>
        {Icon && (
          <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${tones[tone] || tones.accent}`}>
            <Icon size={16} />
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2 mt-2 flex-wrap">
        <p className="text-2xl font-extrabold text-white leading-none">{value}</p>
        {Number(trend) !== 0 && Number.isFinite(Number(trend)) && (
          <span className={`text-[11px] font-bold ${up ? 'text-emerald-400' : 'text-rose-400'}`}>
            {up ? '↑' : '↓'} {Math.abs(Number(trend))}%
          </span>
        )}
      </div>
      {hint && <p className="text-[10px] text-slate-500 mt-1.5 leading-snug">{hint}</p>}
    </div>
  );
}
