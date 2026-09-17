/**
 * The top of every screen: what this is, what it is for, what you can do here.
 *
 * Thirty-nine pages each wrote their own, so the title, the line under it and
 * the buttons beside it sat at a slightly different height and spacing on every
 * one. The icon is new — with nine sidebar groups collapsed, the heading is the
 * only thing telling you where you are.
 */
export default function PageHeader({ icon: Icon, title, subtitle, actions, children, className = '' }) {
  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          {Icon && (
            <span className="w-10 h-10 rounded-2xl bg-brand-accent/10 border border-brand-accent/20
              flex items-center justify-center flex-shrink-0 mt-0.5">
              <Icon size={19} className="text-brand-accent" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-white leading-tight">{title}</h1>
            {subtitle && <p className="text-slate-400 text-sm mt-1 leading-snug">{subtitle}</p>}
          </div>
        </div>
        {actions && (
          // items-center, so a 40px select and a 40px button share a centre line
          // however the row wraps on a narrow screen.
          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">{actions}</div>
        )}
      </div>
      {children}
    </div>
  );
}
