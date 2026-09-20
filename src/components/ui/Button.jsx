/**
 * One button, five intents, three sizes.
 *
 * The toolbars were built control by control, so a select, an Export and an
 * Add sitting in the same row were three different heights. Everything here
 * shares a height per size, which is what makes a row of them line up.
 */

const VARIANT = {
  // The gradient is defined once in index.css as .btn-accent, since it also
  // carries the shadow and the hover lift.
  primary: 'btn-accent border border-transparent',
  secondary: 'bg-brand-primary-lighter/60 border border-white/10 text-white hover:bg-brand-primary-lighter hover:border-white/20',
  ghost: 'bg-transparent border border-transparent text-slate-400 hover:text-white hover:bg-white/5',
  outline: 'bg-transparent border border-white/10 text-slate-300 hover:text-white hover:border-white/25',
  danger: 'bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20',
  // A secondary action that still wants to be noticed -- File Expense beside
  // Assign Beat. Written by hand on SFA before this existed, which is how it
  // ended up a different height from every other button on the page.
  accent: 'bg-brand-accent/10 border border-brand-accent/30 text-brand-accent hover:bg-brand-accent/20',
};

const SIZE = {
  sm: 'h-8 px-3 text-[11px] gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-xs gap-2 rounded-xl',
  lg: 'h-11 px-5 text-sm gap-2 rounded-xl',
};

const ICON_SIZE = { sm: 13, md: 15, lg: 16 };

export default function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  children,
  className = '',
  ...rest
}) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center font-bold whitespace-nowrap transition-all
        disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100
        ${VARIANT[variant] || VARIANT.secondary} ${SIZE[size] || SIZE.md} ${className}`}
    >
      {Icon && <Icon size={ICON_SIZE[size] || 15} className="flex-shrink-0" />}
      {children}
      {IconRight && <IconRight size={ICON_SIZE[size] || 15} className="flex-shrink-0" />}
    </button>
  );
}

/**
 * A square button holding nothing but an icon.
 *
 * The row-action pencils and bins were bare <button> tags with no padding, so
 * they had no hit area to speak of on a phone and nothing to say what they
 * did. These carry a title, which is also their accessible name.
 */
export function IconButton({ icon: Icon, title, tone = 'default', size = 'md', className = '', ...rest }) {
  const tones = {
    default: 'text-slate-400 hover:text-white hover:bg-white/10',
    accent: 'text-brand-accent hover:bg-brand-accent/10',
    danger: 'text-rose-400 hover:bg-rose-500/10',
    success: 'text-emerald-400 hover:bg-emerald-500/10',
  };
  const box = size === 'sm' ? 'w-7 h-7 rounded-lg' : 'w-9 h-9 rounded-xl';
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      {...rest}
      className={`inline-flex items-center justify-center border border-transparent transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed
        ${tones[tone] || tones.default} ${box} ${className}`}
    >
      <Icon size={size === 'sm' ? 13 : 15} />
    </button>
  );
}
