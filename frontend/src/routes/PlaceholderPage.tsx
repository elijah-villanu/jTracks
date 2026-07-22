interface PlaceholderPageProps {
  title: string
  description: string
}

/**
 * Generic placeholder for routes that exist as nav shell in F1 but get
 * built out in later milestones (F7 Analytics, F6 Profile/Settings).
 */
export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
