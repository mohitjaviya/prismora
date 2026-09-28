import { useState } from 'react';
import { X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useConfirm, useToast } from '../context/DialogContext';

/**
 * A partner cancelling its own order.
 *
 * Only while the order is Pending — once the warehouse has started on it, a
 * change goes through us. The database holds the same rule (cancel_my_order,
 * 043), so this button is a convenience, not the check.
 */
export default function CancelMyOrderButton({ order, onDone }) {
  const { cancelMyOrder } = useData();
  const confirm = useConfirm();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (order?.status !== 'Pending') return null;

  const cancel = async () => {
    if (!await confirm({ title: `Cancel order ${order.id}?`, danger: true, confirmLabel: 'Cancel order' })) return;
    setBusy(true);
    const result = await cancelMyOrder(order.id);
    setBusy(false);
    if (!result?.ok) { toast(result?.error || 'The order could not be cancelled.', 'error'); return; }
    toast(`Order ${order.id} cancelled.`, 'success');
    onDone?.();
  };

  return (
    <button
      type="button"
      onClick={cancel}
      disabled={busy}
      className="mt-4 w-full px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 bg-rose-500/10 text-rose-400 border border-rose-500/30 disabled:opacity-50"
    >
      <X size={16} /> {busy ? 'Cancelling…' : 'Cancel Order'}
    </button>
  );
}
