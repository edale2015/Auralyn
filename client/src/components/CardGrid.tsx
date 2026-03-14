import { type ReactNode } from "react"
import { cn } from "@/lib/utils"

export default function CardGrid({
  children,
  cols = 4,
}: {
  children: ReactNode
  cols?: 2 | 3 | 4 | 5 | 6
}) {
  const colClass = {
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-3",
    4: "grid-cols-2 md:grid-cols-4",
    5: "grid-cols-2 md:grid-cols-5",
    6: "grid-cols-2 md:grid-cols-6",
  }[cols]

  return (
    <div className={cn("grid gap-3", colClass)}>
      {children}
    </div>
  )
}
