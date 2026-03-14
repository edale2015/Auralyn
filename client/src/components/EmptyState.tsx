export default function EmptyState({
  icon = "📭",
  title,
  description,
  action,
}: {
  icon?: string
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center text-muted-foreground">
      <span className="text-4xl mb-4">{icon}</span>
      <p className="text-sm font-medium text-foreground mb-1">{title}</p>
      {description && <p className="text-xs max-w-xs">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 text-xs px-3 py-1.5 rounded border bg-background hover:bg-muted transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
