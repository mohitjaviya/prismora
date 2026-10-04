/**
 * The top of every screen: what this is, what it is for, what you can do here.
 *
 * Thirty-nine pages each wrote their own, so the title, the line under it and
 * the buttons beside it sat at a slightly different height and spacing on every
 * one. The icon is new — with nine sidebar groups collapsed, the heading is the
 * only thing telling you where you are.
 */
// compact: for list screens (<ListPage>), where every pixel above the table is
// a row nobody sees. Smaller title and icon, title and buttons on one centred
// line from lg up, and the subtitle only on screens wide enough to spare it.
export default function PageHeader({ icon: Icon, title, subtitle, actions, children, compact = false, className = '' }) {
  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <div className={`flex justify-between flex-wrap ${compact ? 'items-center gap-3 lg:flex-nowrap' : 'items-start gap-4'}`}>
        {/* flex-1, so this gives way before the row does. A flex-wrap row wraps
            rather than shrinks, so a long subtitle beside three buttons pushed
            the whole action row onto its own line under the title -- on
            Accounting at 1272px, by about twenty pixels. Now the subtitle takes
            a second line and the buttons stay where they belong, and the row
            only wraps once the title block is down to 16rem. */}
        <div className={`flex gap-3 flex-1 ${compact ? 'items-center min-w-[12rem]' : 'items-start min-w-[16rem]'}`}>
          {Icon && (
            <span className={`rounded-2xl bg-brand-accent/10 border border-brand-accent/20
              flex items-center justify-center flex-shrink-0 ${compact ? 'w-9 h-9' : 'w-10 h-10 mt-0.5'}`}>
              <Icon size={compact ? 17 : 19} className="text-brand-accent" />
            </span>
          )}
          <div className="min-w-0">
            <h1 className={`${compact ? 'text-xl' : 'text-2xl'} font-bold text-white leading-tight`}>{title}</h1>
            {subtitle && (
              <p className={compact
                ? 'hidden lg:block text-slate-400 text-xs mt-0.5 leading-snug truncate'
                : 'text-slate-400 text-sm mt-1 leading-snug'}>{subtitle}</p>
            )}
          </div>
        </div>
        {actions && (
          // items-center, so a 40px select and a 40px button share a centre line
          // however the row wraps on a narrow screen.
          // ml-auto keeps them on the right edge on the rare screen narrow
          // enough that the row does wrap, rather than stranding them under
          // the title at the left.
          // max-w-full: on a phone the row was as wide as all its buttons in
          // one line, so the last one ran off the edge ("Add O" at 375px).
          // Capped at the screen, the buttons wrap instead.
          <div className="flex items-center justify-end gap-2 flex-wrap flex-shrink-0 ml-auto max-w-full">{actions}</div>
        )}
      </div>
      {children}
    </div>
  );
}
