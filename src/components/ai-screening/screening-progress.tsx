'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Clock, FileSearch, Brain } from 'lucide-react'

interface Props {
  workflowState: string
}

const STAGES: Record<string, { icon: typeof Loader2; label: string }> = {
  WAITING_FOR_EXTRACTION: { icon: FileSearch, label: 'Reading resume' },
  REQUESTING_SCREENING: { icon: Clock, label: 'Screening queued' },
  SCREENING_PENDING: { icon: Clock, label: 'Screening queued' },
  SCREENING_RUNNING: { icon: Brain, label: 'Evaluating job-related qualifications' },
}

export function ScreeningProgress({ workflowState }: Props) {
  const stage = STAGES[workflowState]
  if (!stage) return null

  const Icon = stage.icon

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div className="animate-pulse">
            <Icon className="h-8 w-8 text-blue-500" />
          </div>
          <div>
            <p className="font-medium">{stage.label}</p>
            <p className="text-sm text-muted-foreground">
              This may take a moment. The page will update automatically.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
