"use client"

import { AppLayout } from "@/components/layout/app-layout"
import { ApplicationWorkspace } from "@/components/recruitment/application-workspace"

export default function ApplicationWorkspacePage() {
  return <AppLayout title="Application workspace" description="Candidate, job, screening, workflow, and history in one place."><ApplicationWorkspace /></AppLayout>
}
