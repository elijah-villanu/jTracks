import { Badge } from "@/components/ui/badge"
import type { ApplicationStatus } from "@/types/api"

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  ghosted: "Ghosted",
}

const STATUS_VARIANT: Record<ApplicationStatus, "default" | "secondary" | "destructive" | "outline"> = {
  saved: "outline",
  applied: "secondary",
  interviewing: "default",
  offer: "default",
  rejected: "destructive",
  ghosted: "destructive",
}

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
}
