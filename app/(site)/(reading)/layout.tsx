/**
 * Reading width for everything that is prose: `/about`, the listings, and
 * every writeup. The home page sits outside this group because the graph needs
 * more room than a column of text should have (D-043). A nested route group,
 * not a root layout, so moving between pages is still a client navigation.
 */
export default function ReadingLayout({ children }: LayoutProps<'/'>) {
  return <div className="mx-auto w-full max-w-3xl px-4 md:px-6">{children}</div>
}
