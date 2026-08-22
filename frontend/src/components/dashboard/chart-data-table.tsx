import type { ReactNode } from "react"

interface ChartDataTableProps {
  /** Describes what the chart shows; becomes the table's <caption>. */
  caption: string
  columns: string[]
  rows: (string | number)[][]
  /**
   * Optional prose summary read *before* the table -- a one-line takeaway
   * ("42 applications, most in Applied") so a screen reader user gets the
   * gist without having to walk every row.
   */
  summary?: ReactNode
}

/**
 * Visually-hidden text alternative for a chart (WCAG 1.1.1 Non-text
 * Content).
 *
 * The three dashboard charts render either a recharts <svg> or, for the
 * Sankey, hand-rolled SVG. Neither exposes anything a screen reader can
 * use: recharts emits a mass of unlabelled <path>/<text> nodes with no
 * accessible name, and reading the loose axis <text> aloud produces a
 * stream of numbers with no structure. Rather than bolting ARIA onto the
 * SVG internals, each chart marks its visual layer `aria-hidden` and
 * renders this table instead -- the same data, in a real <table> with
 * real headers, navigable with standard screen reader table commands.
 *
 * `sr-only` (not `display: none`) so it stays in the accessibility tree.
 */
export function ChartDataTable({ caption, columns, rows, summary }: ChartDataTableProps) {
  return (
    <div className="sr-only">
      {summary && <p>{summary}</p>}
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) =>
                cellIndex === 0 ? (
                  <th key={cellIndex} scope="row">
                    {cell}
                  </th>
                ) : (
                  <td key={cellIndex}>{cell}</td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
