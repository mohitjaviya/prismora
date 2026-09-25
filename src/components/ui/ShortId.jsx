import { useState } from 'react';
import { shortId } from '../../utils/ids';

/**
 * A record id that fits its column: shortened, with the full id on hover and
 * copied on click, so nothing is lost by not showing all forty characters.
 */
export default function ShortId({ id, className = '' }) {
  const [copied, setCopied] = useState(false);
  const full = String(id ?? '');
  if (!full) return <span className="text-slate-600">—</span>;
  const copy = async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard blocked; the tooltip still shows it */ }
  };
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied' : `${full} — click to copy`}
      className={`font-mono whitespace-nowrap hover:text-brand-accent transition-colors ${className}`}
    >
      {copied ? 'Copied' : shortId(full)}
    </button>
  );
}
