import { useState } from 'react';

/**
 * Text held to a couple of lines, with "Show more" to read the rest.
 *
 * `truncate` on a table cell does nothing (cells ignore max-width), so a long
 * description stretched its column off the page instead. This keeps a fixed
 * width and a fixed height until someone asks to read it.
 */
export default function ClampText({ text, lines = 2, width = 'w-56', empty = '—', className = '' }) {
  const [open, setOpen] = useState(false);
  const value = String(text ?? '').trim();
  if (!value) return <span className="text-slate-600">{empty}</span>;
  const long = value.length > 40 * lines;
  const clamp = lines === 1 ? 'line-clamp-1' : lines === 3 ? 'line-clamp-3' : 'line-clamp-2';
  return (
    <div className={`${width} max-w-full`}>
      <p className={`leading-snug whitespace-normal break-words ${open ? '' : clamp} ${className}`} title={open ? undefined : value}>
        {value}
      </p>
      {long && (
        <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
          className="mt-0.5 text-[10px] font-semibold text-brand-accent hover:underline">
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
