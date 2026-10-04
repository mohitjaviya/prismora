/**
 * A toast from code with no hook to hand (exports, reminders), instead of
 * the browser's blocking alert(). DialogProvider listens for the event.
 */
export const NOTIFY_EVENT = 'prismora:toast';

export const notify = (message, tone = 'info') => {
  window.dispatchEvent(new CustomEvent(NOTIFY_EVENT, { detail: { message, tone } }));
};
