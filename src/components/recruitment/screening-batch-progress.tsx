import { CheckCircle2, CircleAlert, LoaderCircle } from "lucide-react"
import { Progress } from "@/components/ui/progress"
import type { BulkBatchProgress } from "@/lib/api/ai-screening.api"

export function ScreeningBatchProgress({ batch }: { batch: BulkBatchProgress }) {
  const resolved = batch.completed + batch.failed + batch.skipped
  const percent = batch.total > 0 ? Math.round((resolved / batch.total) * 100) : 0
  const isComplete = batch.status === "COMPLETED" || resolved >= batch.total

  return (
    <section className="rounded-xl border border-border bg-surface-elevated p-4" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Bulk screening</p>
          <p className="mt-1 text-xs text-muted">Live status from the screening batch queue.</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
          {isComplete ? <CheckCircle2 className="h-4 w-4 text-success" /> : <LoaderCircle className="h-4 w-4 animate-spin" />}
          {isComplete ? "Complete" : "Processing"}
        </div>
      </div>
      <Progress value={percent} className="mt-4 h-2" />
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <span className="text-muted">Completed <strong className="text-foreground">{batch.completed}</strong></span>
        <span className="text-muted">Processing <strong className="text-foreground">{batch.pending}</strong></span>
        <span className="text-muted">Skipped <strong className="text-foreground">{batch.skipped}</strong></span>
        <span className="flex items-center gap-1 text-muted">{batch.failed > 0 && <CircleAlert className="h-3.5 w-3.5 text-error" />}Failed <strong className="text-foreground">{batch.failed}</strong></span>
      </div>
    </section>
  )
}
