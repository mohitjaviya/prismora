// "Jump to the error": scroll the first message into view and put the cursor
// in its field, so a long form or a popup never fails silently below the fold.

const controlOf = (message) => message?.parentElement?.querySelector('input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])');

export function jumpTo(message) {
  if (!message) return;
  const control = controlOf(message);
  (control || message).scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  control?.focus?.({ preventScroll: true });
}

/** The first message in the popup that is open (or on the page when none is). */
export function jumpToFirstError() {
  const all = [...document.querySelectorAll('[data-field-error]')];
  if (all.length === 0) return;
  const popups = all.map((m) => m.closest('.fixed')).filter(Boolean);
  const top = popups[popups.length - 1];
  jumpTo(top ? all.find((m) => m.closest('.fixed') === top) : all[0]);
}
