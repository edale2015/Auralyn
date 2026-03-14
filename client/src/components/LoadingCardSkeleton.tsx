export default function LoadingCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-4 animate-pulse">
          <div className="h-3 w-20 bg-muted rounded mb-3" />
          <div className="h-7 w-16 bg-muted rounded" />
        </div>
      ))}
    </div>
  )
}
