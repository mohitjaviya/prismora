import { useLayoutEffect, useRef } from 'react';

// Gap between the table card and the bottom of the window. Same as the AI
// button's bottom-6, so the button sits inside the card's page-number row
// (DataTable fill keeps that row's right end clear) rather than over a row.
const BOTTOM_GAP = 24;
// Below this the page scrolls a little rather than squeezing the table shut.
const MIN_HEIGHT = 320;

/**
 * A screen that is a header and one long list (Orders, Customers, …).
 *
 * On a laptop or wider (lg) it is measured to run from where it starts down to
 * BOTTOM_GAP above the bottom of the window, and re-measured when the window
 * changes size, so the table card under it takes all of that and only its rows
 * scroll (pair with <PageHeader compact> and <DataTable fill>). A fixed CSS
 * offset guessed wrong under Windows display scaling and left the card short.
 * <main>'s bottom padding (room for the AI button on other pages) is cancelled
 * with a negative margin so it does not add empty space or a page scrollbar.
 * On tablets and phones it is an ordinary page that scrolls as a whole.
 */
export default function ListPage({ children, className = '' }) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const wide = window.matchMedia('(min-width: 1024px)');
    const fit = () => {
      if (!wide.matches) {
        el.style.height = '';
        el.style.marginBottom = '';
        return;
      }
      const main = el.closest('main');
      const scroller = main?.parentElement;
      const viewH = scroller?.clientHeight || window.innerHeight;
      // offsetTop, not getBoundingClientRect: the fade-in animation moves the
      // page with a transform while it runs. <main> and its scroller are both
      // position: relative, so these add up to the distance from the top.
      const top = (main?.offsetTop || 0) + el.offsetTop;
      const padBottom = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      el.style.height = `${Math.max(MIN_HEIGHT, Math.floor(viewH - top - BOTTOM_GAP))}px`;
      el.style.marginBottom = `${BOTTOM_GAP - padBottom}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    wide.addEventListener('change', fit);
    return () => {
      window.removeEventListener('resize', fit);
      wide.removeEventListener('change', fit);
    };
  }, []);

  return (
    <div ref={ref} className={`flex flex-col gap-4 ${className}`}>
      {children}
    </div>
  );
}
