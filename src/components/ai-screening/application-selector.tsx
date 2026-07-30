'use client'

import { useState, useEffect, useCallback } from 'react'
import { fetchApplications, ApplicationListItem } from '@/lib/api/applications.api'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'

interface ApplicationItem {
  id: string
  candidateName: string
  jobTitle: string
  status: string
  createdAt: string
}

interface Props {
  onSelect: (applicationId: string) => void
  selectedId: string | null
}

export function ApplicationSelector({ onSelect, selectedId }: Props) {
  const [applications, setApplications] = useState<ApplicationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchApplications({ limit: 50, sortBy: 'createdAt', sortOrder: 'desc' })
      const items: ApplicationItem[] = (result.data ?? []).map((app: ApplicationListItem) => ({
        id: app.id,
        candidateName: app.candidate ? `${app.candidate.firstName} ${app.candidate.lastName}`.trim() : 'Unknown',
        jobTitle: app.job?.title ?? 'Unknown',
        status: app.status ?? 'DRAFT',
        createdAt: app.createdAt,
      }))
      setApplications(items)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load applications')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  const filtered = search
    ? applications.filter(a =>
        a.candidateName.toLowerCase().includes(search.toLowerCase()) ||
        a.jobTitle.toLowerCase().includes(search.toLowerCase())
      )
    : applications

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <EmptyState
        title="Failed to load applications"
        description={error}
        action={<Button onClick={load}>Retry</Button>}
      />
    )
  }

  if (applications.length === 0) {
    return (
      <EmptyState
        title="No applications found"
        description="Create a candidate and application first."
      />
    )
  }

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search by candidate or job title..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search applications"
      />
      <div className="max-h-96 overflow-y-auto space-y-1">
        {filtered.map((app) => (
          <button
            key={app.id}
            onClick={() => onSelect(app.id)}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              selectedId === app.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-950' : 'border-border hover:bg-accent'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">{app.candidateName}</div>
                <div className="text-sm text-muted-foreground">{app.jobTitle}</div>
              </div>
              <Badge variant="outline">{app.status}</Badge>
            </div>
          </button>
        ))}
      </div>
      <div className="text-sm text-muted-foreground">
        {filtered.length} application{filtered.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
