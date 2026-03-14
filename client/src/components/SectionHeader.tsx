import { type ReactNode } from "react"

export default function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex gap-2 items-center">{actions}</div>}
    </div>
  )
}
