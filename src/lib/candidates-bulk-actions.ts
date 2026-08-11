// Truthful bulk-action feedback. The bulk "Move to Screening Stage" action
// only transitions the pipeline stage — it never runs AI screening — so the
// wording must never claim screening was performed.

export interface BulkActionFeedback {
  type: "success" | "warning"
  message: string
}

export function buildBulkActionFeedback(
  action: string,
  succeeded: number,
  attempted: number
): BulkActionFeedback | null {
  if (attempted === 0) {
    return {
      type: "warning",
      message: "No selected candidate had an application that could be updated.",
    }
  }
  const failed = attempted - succeeded
  if (failed > 0) {
    return {
      type: "warning",
      message: `Moved ${succeeded} of ${attempted} candidate(s); ${failed} could not be updated.`,
    }
  }
  switch (action) {
    case "move-to-screening":
      return {
        type: "success",
        message: `Moved ${succeeded} candidate(s) to the Screening stage. AI screening was not run.`,
      }
    case "reject":
      return { type: "success", message: `Rejected ${succeeded} candidate(s).` }
    case "interview":
      return { type: "success", message: `Moved ${succeeded} candidate(s) to the Interview stage.` }
    default:
      return { type: "success", message: `Updated ${succeeded} candidate(s).` }
  }
}
