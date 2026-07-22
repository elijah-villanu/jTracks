import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatusBadge } from "@/components/StatusBadge"
import { useApplications } from "@/hooks/useApplications"

/**
 * Minimal placeholder list for F1's acceptance criterion: render the
 * seeded mock applications with no backend running. The real Kanban
 * board (columns, drag-and-drop, cards) is built in F3.
 */
export function ApplicationsPage() {
  const { applications, isLoading, error } = useApplications()

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Applications</h1>
        <p className="text-sm text-muted-foreground">
          Seeded from the mock API -- the Kanban board lands in a later milestone.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading applications...</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <Table>
            <TableCaption>{applications.length} tracked applications.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Date Applied</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                    No applications yet.
                  </TableCell>
                </TableRow>
              ) : (
                applications.map((application) => (
                  <TableRow key={application.id}>
                    <TableCell className="font-medium">{application.company}</TableCell>
                    <TableCell>{application.title}</TableCell>
                    <TableCell>
                      <StatusBadge status={application.status} />
                    </TableCell>
                    <TableCell>{application.location ?? "—"}</TableCell>
                    <TableCell>{application.date_applied ?? "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
