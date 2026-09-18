import { Search as SearchIcon, ChevronDown } from 'lucide-react';

/**
 * Form controls at one height, with one focus ring.
 *
 * There were 138 uses of .glass-input and 149 hand-rolled inputs that copied
 * roughly half of it, which is why a filter row could hold three boxes at three
 * different heights. Everything here is h-10 at the default size, so a select,
 * an input and a Button in the same row line up without anyone nudging margins.
 */

// Everything visual lives in .glass-input, in index.css. Restating it here is
// how the kit's controls and the hand-written ones in modals drifted apart in
// the first place, so this adds only width.
const BASE = 'w-full glass-input';

const SIZES = { sm: 'h-8 px-2.5 text-[11px]', md: 'h-10 px-3 text-xs', lg: 'h-11 px-3.5 text-sm' };

/** Label, control, and the one line explaining it — spaced the same everywhere. */
export function Field({ label, hint, error, required, children, className = '' }) {
  return (
    <div className={`min-w-0 ${className}`}>
      {label && (
        <label className="block text-[11px] font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
          {label}{required && <span className="text-brand-accent ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error
        ? <p className="text-[10px] text-rose-400 mt-1 leading-snug">{error}</p>
        : hint ? <p className="text-[10px] text-slate-500 mt-1 leading-snug">{hint}</p> : null}
    </div>
  );
}

export function Input({ size = 'md', className = '', error, ...rest }) {
  return (
    <input
      {...rest}
      className={`${BASE} ${SIZES[size] || SIZES.md} ${error ? 'border-rose-500/50' : ''} ${className}`}
    />
  );
}

export function Textarea({ className = '', rows = 3, error, ...rest }) {
  return (
    <textarea
      rows={rows}
      {...rest}
      className={`${BASE} px-3 py-2 text-xs leading-relaxed ${error ? 'border-rose-500/50' : ''} ${className}`}
    />
  );
}

/**
 * A select with the browser arrow replaced.
 *
 * The native arrow renders in the operating system's colours, which on a dark
 * panel came out as a light grey wedge on several machines and was the single
 * most obvious thing giving away that these were unstyled controls.
 */
export function Select({ size = 'md', className = '', error, children, ...rest }) {
  return (
    <div className="relative min-w-0">
      <select
        {...rest}
        className={`${BASE} ${SIZES[size] || SIZES.md} pr-8 appearance-none cursor-pointer
          ${error ? 'border-rose-500/50' : ''} ${className}`}
      >
        {children}
      </select>
      <ChevronDown
        size={14}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
      />
    </div>
  );
}

/** The search box that belongs at the top of a list. */
export function SearchInput({ size = 'md', className = '', ...rest }) {
  const pad = size === 'sm' ? 'pl-7' : 'pl-9';
  return (
    <div className="relative min-w-0 flex-1">
      <SearchIcon
        size={size === 'sm' ? 12 : 14}
        className={`absolute ${size === 'sm' ? 'left-2.5' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none`}
      />
      <input
        type="search"
        {...rest}
        className={`${BASE} ${SIZES[size] || SIZES.md} ${pad} ${className}`}
      />
    </div>
  );
}
