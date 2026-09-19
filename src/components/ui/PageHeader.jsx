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
        {/* flex-1, so this gives way before the row does. A flex-wrap row wraps
            rather than shrinks, so a long subtitle beside three buttons pushed
            the whole action row onto its own line under the title -- on
            Accounting at 1272px, by about twenty pixels. Now the subtitle takes
            a second line and the buttons stay where they belong, and the row
            only wraps once the title block is down to 16rem. */}
        <div className="flex items-start gap-3 flex-1 min-w-[16rem]">
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
          // ml-auto keeps them on the right edge on the rare screen narrow
          // enough that the row does wrap, rather than stranding them under
          // the title at the left.
          <div className="flex items-center gap-2 flex-wrap flex-shrink-0 ml-auto">{actions}</div>
        )}
      </div>
      {children}
    </div>
  );
}
