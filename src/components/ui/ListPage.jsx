/**
 * A screen that is a header and one long list (Orders, Customers, …).
 *
 * On a laptop or wider it is exactly as tall as the space under the top bar,
 * so the table opens in view and only its rows scroll (pair it with
 * <PageHeader compact> and <DataTable fill>). Layout sets
 * --list-page-offset to the top bar plus <main>'s padding, which includes the
 * room kept clear for the AI button. min-h keeps a short window usable: below
 * it the page scrolls a little rather than squeezing the table to two rows.
 * On tablets and phones it is an ordinary page that scrolls as a whole.
 */
export default function ListPage({ children, className = '' }) {
  return (
    <div className={`flex flex-col gap-4 lg:h-[calc(100vh-var(--list-page-offset,8.5rem))] lg:min-h-[26rem] ${className}`}>
      {children}
    </div>
  );
}
