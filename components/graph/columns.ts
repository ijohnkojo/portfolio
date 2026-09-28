/**
 * The home page's two columns: the graph, and a panel beside it. The legend
 * row above the graph and the graph row itself share this template, so the
 * legend sits exactly over the inspector. Literal strings, so Tailwind sees
 * them.
 *
 * The panel is 18rem until `xl`, then 22.5rem: at 1024px a 22.5rem panel
 * leaves the graph at 72% of its frame, below the 80% the label-collision
 * test checks (D-042); 18rem leaves it at 81%.
 */
export const GRAPH_COLUMNS =
  'grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem] lg:gap-x-10 xl:grid-cols-[minmax(0,1fr)_22.5rem]'
