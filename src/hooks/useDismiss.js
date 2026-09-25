import { useEffect } from 'react';

/**
 * Close a menu or panel on a click outside it, or on Escape.
 *
 * The notification panel and the profile menu had neither: each stayed open
 * until its own button was clicked again, over whatever the person moved on
 * to. `refs` is every element that counts as "inside" — the panel and the
 * button that opens it, so that clicking the button toggles rather than
 * closing and immediately reopening.
 */
export default function useDismiss(refs, open, onDismiss) {
  useEffect(() => {
    if (!open) return undefined;
    const inside = (target) => refs.some(r => r.current && r.current.contains(target));
    const onPointer = (e) => { if (!inside(e.target)) onDismiss(); };
    const onKey = (e) => { if (e.key === 'Escape') onDismiss(); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('touchstart', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('touchstart', onPointer);
      document.removeEventListener('keydown', onKey);
    };
    // refs are stable objects; onDismiss is re-read on each open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
