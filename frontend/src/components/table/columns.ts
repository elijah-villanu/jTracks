/**
 * The pipeline's sortable column vocabulary: the key/label pairs and the
 * sort types, shared by every rendering of the applications list.
 *
 * **Why this is its own module and not part of `applications-table.tsx`,
 * where it used to live.** Four surfaces need these: the table, the card
 * list (F32), the board (F51) and the shared `SortSelect`. Three of them
 * are also imported *by* the table, so as long as the table owned the
 * constants the graph had a cycle in it -- and a cycle here is not
 * cosmetic. `sort-select.tsx` builds its option list from `COLUMN_LABEL`
 * at module scope, so when the table imported the select and the select
 * imported the table back, the select's module body ran first and hit
 * `ReferenceError: Cannot access 'COLUMN_LABEL' before initialization`:
 * a blank page. `tsc` and `vite build` both reported clean, because a
 * `const` temporal-dead-zone violation across an import cycle is a
 * runtime fact, not a type or bundling one. A leaf module with no imports
 * of its own cannot participate in a cycle at all.
 */

export type SortKey = "title" | "company" | "status" | "location" | "date_applied"
export type SortDirection = "asc" | "desc"

/**
 * All five sortable columns, in display order. Single source of truth for
 * column labels -- `ApplicationsPage`'s sort-state announcement, the card
 * rendering, the board's per-field `<dt>`s and `SortSelect`'s options all
 * read `COLUMN_LABEL` below rather than hard-coding the strings again, so
 * the wording can't drift between the four surfaces.
 */
export const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "company", label: "Company" },
  { key: "title", label: "Job Title" },
  { key: "status", label: "Status" },
  { key: "location", label: "Location" },
  { key: "date_applied", label: "Date Applied" },
]

export const COLUMN_LABEL: Record<SortKey, string> = COLUMNS.reduce(
  (labels, column) => ({ ...labels, [column.key]: column.label }),
  {} as Record<SortKey, string>
)
