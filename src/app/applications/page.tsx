"use client"

import { AppLayout } from "@/components/layout/app-layout"
import { ApplicationListView } from "@/components/recruitment/application-list-view"

export default function ApplicationsPage() {
  return <AppLayout title="Applications" description="Review applications across jobs and take recruiter-led actions."><ApplicationListView /></AppLayout>
}
