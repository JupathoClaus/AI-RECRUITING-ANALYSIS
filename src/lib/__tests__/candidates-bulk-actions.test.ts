/**
 * Bulk-action feedback must be truthful: the "Move to Screening Stage" action
 * only transitions the pipeline stage, so the wording must never claim AI
 * screening was run, and partial failures must report exact counts.
 */

import { describe, it, expect } from "vitest"
import { buildBulkActionFeedback } from "@/lib/candidates-bulk-actions"

describe("buildBulkActionFeedback", () => {
  it("never claims AI screening was run for the stage-move action", () => {
    const f = buildBulkActionFeedback("move-to-screening", 3, 3)
    expect(f?.type).toBe("success")
    expect(f?.message).toContain("Moved 3 candidate(s) to the Screening stage")
    expect(f?.message.toLowerCase()).toContain("ai screening was not run")
  })

  it("reports partial failure counts accurately", () => {
    const f = buildBulkActionFeedback("move-to-screening", 2, 5)
    expect(f?.type).toBe("warning")
    expect(f?.message).toContain("Moved 2 of 5 candidate(s); 3 could not be updated")
  })

  it("warns when nothing could be updated", () => {
    const f = buildBulkActionFeedback("move-to-screening", 0, 0)
    expect(f?.type).toBe("warning")
    expect(f?.message).toContain("No selected candidate had an application")
  })

  it("uses accurate wording for reject and interview", () => {
    expect(buildBulkActionFeedback("reject", 2, 2)?.message).toBe("Rejected 2 candidate(s).")
    expect(buildBulkActionFeedback("interview", 1, 1)?.message).toBe(
      "Moved 1 candidate(s) to the Interview stage."
    )
  })
})
