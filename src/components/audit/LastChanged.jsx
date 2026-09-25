import { History } from 'lucide-react';
import { lastChangedBy } from '../../utils/audit';

/**
 * "Last changed by Ravi · 25 Sept, 10:02" under a record's title.
 *
 * Read from the record's updatedBy / updatedAt, which the database stamps from
 * the same function that writes the Audit Log (040) — so the two agree.
 * Renders nothing until a row has been stamped.
 */
export default function LastChanged({ record, users, className = '' }) {
  const last = lastChangedBy(record, users);
  if (!last) return null;
  const when = new Date(last.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return (
    <p className={`flex items-center gap-1 text-[11px] text-slate-500 ${className}`}>
      <History size={11} />
      Last changed by <span className="text-slate-300 font-medium">{last.name}</span> · {when}
    </p>
  );
}
