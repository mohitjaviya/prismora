/**
 * One look for every chart.
 *
 * The three screens with charts each styled their own axes, grid and tooltip,
 * and all of them were still on an earlier palette: a #112240 navy tooltip and
 * #D4AF37 gold bars, from before PRISMORA was magenta. A chart in the wrong
 * colours reads as part of a different product.
 *
 * Everything here is a CSS custom property rather than a literal, for two
 * reasons. Recharts writes its styling into inline styles, which cannot respond
 * to a class on the root element on their own; and the light theme needs its
 * own steps rather than an automatic flip of the dark ones. Both sets live in
 * index.css, under `:root` and `.light`.
 *
 * The series colours are a fixed, validated order -- checked against both panel
 * colours for lightness, chroma, colour-vision separation and contrast, not
 * picked by eye. The order is what makes them safe, so slots are filled 1..N
 * and never re-ordered or cycled per chart. A ninth series does not get a
 * ninth colour; it folds into "Other".
 */

export const CHART_TOOLTIP = {
  contentStyle: {
    backgroundColor: 'var(--chart-tooltip-bg)',
    border: '1px solid var(--chart-tooltip-border)',
    borderRadius: '12px',
    color: 'var(--chart-tooltip-text)',
    fontSize: '12px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
  },
  itemStyle: { color: 'var(--chart-tooltip-text)' },
  labelStyle: { color: 'var(--chart-axis)', fontWeight: 600, marginBottom: 4 },
  cursor: { fill: 'var(--chart-cursor)' },
};

export const CHART_GRID = { stroke: 'var(--chart-grid)', strokeDasharray: '3 3', vertical: false };

export const CHART_AXIS = {
  stroke: 'var(--chart-axis)',
  fontSize: 11,
  tickLine: false,
  axisLine: false,
};

/**
 * The colour for a chart with one series.
 *
 * With nothing beside it there is no pair to tell apart, so the separation rule
 * does not apply and the brand accent can be used -- it clears the lightness
 * band, the chroma floor and 3:1 contrast on both panels.
 */
export const CHART_SINGLE = 'var(--viz-single)';

/** Two or more series: the validated order, filled from slot 1. */
export const CHART_COLORS = [
  'var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)',
  'var(--viz-5)', 'var(--viz-6)', 'var(--viz-7)', 'var(--viz-8)',
];

/**
 * The colour for series `i`.
 *
 * Past the eighth it stops rather than wrapping: a cycled colour says two
 * different series are the same one, which is worse than running out.
 */
export const colorAt = (i) => CHART_COLORS[i] || 'var(--chart-axis)';
