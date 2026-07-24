"use client"

import { useMemo, useState, useEffect } from "react"
import {
  Chart2 as BarChartIcon,
  Chart as PieChartIcon,
  TrendUp,
  TrendDown,
  Clock,
  TickCircle,
  Flag,
  MagicStar,
  People,
  Buildings,
} from "iconsax-react"
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { AppLayout } from "@/components/layout/app-layout"
import { useStore } from "@/store/useStore"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { cn, formatNumber } from "@/lib/utils"
import type { DeptPerformance } from "@/lib/api/analytics.api"
import { Skeleton } from "@/components/ui/skeleton"

const DEPT_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#3b82f6", "#ef4444", "#a855f7"]

const aiInsights = [
  {
    icon: Clock,
    title: "Engineering roles take 15% longer to fill",
    description: "Senior engineering positions average 32 days to hire compared to 26 days for other departments. Consider expanding sourcing channels for these roles.",
    type: "warning" as const,
  },
  {
    icon: Flag,
    title: "Referrals yield the highest-quality candidates",
    description: "Referred candidates score an average of 89 on AI assessments versus 76 from job boards. Increasing the referral bonus could improve quality further.",
    type: "success" as const,
  },
  {
    icon: MagicStar,
    title: "AI screening accuracy improved 6% this quarter",
    description: "Model v2.3 shows 94% correlation with final hiring decisions. The NLP update has reduced false positives in engineering screenings by 12%.",
    type: "info" as const,
  },
]

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; name?: string; color?: string }>
  label?: string
}

function ChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-lg">
      <p className="text-xs text-muted mb-1">{label ?? payload[0].name}</p>
      <p className="text-sm font-semibold text-foreground">{payload[0].value}</p>
    </div>
  )
}

function FunnelTooltip({ active, payload }: CustomTooltipProps & { funnelTotal?: number }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-lg">
      <p className="text-xs text-muted mb-1">{payload[0].name}</p>
      <p className="text-sm font-semibold text-foreground">{payload[0].value} candidates</p>
    </div>
  )
}

function toAppDeptData(depts: DeptPerformance[]): { name: string; value: number; color: string }[] {
  return depts
    .filter((d) => d.applications > 0)
    .map((d, i) => ({
      name: d.dept,
      value: d.applications,
      color: DEPT_COLORS[i % DEPT_COLORS.length],
    }))
}

function computeDateFrom(range: string): string | undefined {
  const now = new Date()
  switch (range) {
    case "this-week":
      now.setDate(now.getDate() - 7)
      return now.toISOString()
    case "this-month":
      now.setMonth(now.getMonth() - 1)
      return now.toISOString()
    case "this-quarter":
      now.setMonth(now.getMonth() - 3)
      return now.toISOString()
    case "this-year":
      now.setFullYear(now.getFullYear() - 1)
      return now.toISOString()
    default:
      return undefined
  }
}

export default function AnalyticsPage() {
  const {
    analyticsOverview,
    analyticsFunnel,
    analyticsDepartments,
    analyticsSources,
    analyticsTimeToHire,
    analyticsLoading,
    analyticsError,
    fetchAnalytics,
  } = useStore()
  const [dateRange, setDateRange] = useState("this-quarter")

  useEffect(() => {
    fetchAnalytics(computeDateFrom(dateRange))
  }, [dateRange, fetchAnalytics])

  const applicationsByDept = useMemo(() => toAppDeptData(analyticsDepartments), [analyticsDepartments])

  const hiringFunnel = analyticsFunnel

  const timeToHireTrend = analyticsTimeToHire

  const sourceBreakdown = analyticsSources

  const deptPerformance = analyticsDepartments

  const overview = analyticsOverview

  const keyMetrics = useMemo(
    () => [
      {
        label: "Total Applications",
        value: overview ? formatNumber(overview.totalApplications) : "—",
        trend: "—",
        trendLabel: "vs last quarter",
        up: true,
        icon: People,
        color: "text-primary",
        accent: "border-l-primary",
      },
      {
        label: "Avg Time to Hire",
        value: overview?.avgTimeToHire != null ? `${overview.avgTimeToHire} days` : "—",
        trend: "—",
        trendLabel: "vs last quarter",
        up: true,
        icon: Clock,
        color: "text-info",
        accent: "border-l-info",
      },
      {
        label: "Selection Rate",
        value: overview?.selectionRate != null ? `${overview.selectionRate}%` : "—",
        trend: "—",
        trendLabel: "vs last quarter",
        up: true,
        icon: TickCircle,
        color: "text-success",
        accent: "border-l-success",
      },
      {
        label: "AI Screening Accuracy",
        value: "—",
        trend: "—",
        trendLabel: "this quarter",
        up: true,
        icon: MagicStar,
        color: "text-warning",
        accent: "border-l-warning",
      },
    ],
    [overview]
  )

  const totalFunnel = hiringFunnel.length > 0 ? hiringFunnel[0].count : 0

  if (analyticsLoading && !analyticsOverview) {
    return (
      <AppLayout title="Analytics & Reporting" description="Loading analytics...">
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="p-5"><Skeleton className="h-4 w-24 mb-2" /><Skeleton className="h-8 w-16" /></CardContent></Card>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card><CardContent className="p-5"><Skeleton className="h-[300px] w-full" /></CardContent></Card>
            <Card><CardContent className="p-5"><Skeleton className="h-[300px] w-full" /></CardContent></Card>
            <Card><CardContent className="p-5"><Skeleton className="h-[300px] w-full" /></CardContent></Card>
            <Card><CardContent className="p-5"><Skeleton className="h-[300px] w-full" /></CardContent></Card>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout
      title="Analytics & Reporting"
      description="Track recruitment performance with data-driven insights."
      actions={
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="this-week">This Week</SelectItem>
            <SelectItem value="this-month">This Month</SelectItem>
            <SelectItem value="this-quarter">This Quarter</SelectItem>
            <SelectItem value="this-year">This Year</SelectItem>
          </SelectContent>
        </Select>
      }
    >
      <div className="space-y-6">
        {analyticsError && (
          <div className="rounded-lg border border-error/20 bg-error/5 px-4 py-3 text-sm text-error animate-fade-in">
            {analyticsError}
          </div>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {keyMetrics.map((metric) => (
            <Card
              key={metric.label}
              className={cn("group relative overflow-hidden transition-all duration-200 hover:shadow-xl border-l-4 h-full flex flex-col", metric.accent)}
            >
              <CardContent className="flex h-full flex-col p-5">
                <div className="flex items-start justify-between">
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="min-h-[48px]">
                      <p className="text-sm text-muted font-semibold uppercase tracking-wide">{metric.label}</p>
                    </div>
                    <div className="min-h-[56px] flex items-start">
                      <p className="text-3xl font-bold leading-none tracking-tight text-foreground">{metric.value}</p>
                    </div>
                    <div className="mt-auto flex min-h-[24px] items-center gap-1 whitespace-nowrap">
                      {metric.up ? (
                        <TrendUp className="h-3.5 w-3.5 text-success shrink-0" />
                      ) : (
                        <TrendDown className="h-3.5 w-3.5 text-error shrink-0" />
                      )}
                      <span className={cn("text-xs font-semibold leading-none", metric.up ? "text-success" : "text-error")}>
                        {metric.trend}
                      </span>
                      <span className="text-xs text-muted leading-none">{metric.trendLabel}</span>
                    </div>
                  </div>
                  <div className={cn("shrink-0 transition-transform duration-200 group-hover:scale-110 ml-3", metric.color)}>
                    <metric.icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Grid 2x2 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Applications by Department */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Applications by Department</CardTitle>
                  <CardDescription>Distribution across departments</CardDescription>
                </div>
                <PieChartIcon className="h-4 w-4 text-muted" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                {applicationsByDept.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm text-muted">No data</div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={applicationsByDept}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {applicationsByDept.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} stroke="transparent" />
                      ))}
                    </Pie>
                    <RechartsTooltip content={<ChartTooltip />} />
                    <Legend
                      verticalAlign="bottom"
                      height={36}
                      formatter={(value) => (
                        <span className="text-xs text-muted">{value}</span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Hiring Funnel */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Hiring Funnel</CardTitle>
                  <CardDescription>Conversion through each stage</CardDescription>
                </div>
                <BarChartIcon className="h-4 w-4 text-muted" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                {hiringFunnel.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm text-muted">No data</div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={hiringFunnel}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 50, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="stage"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#64748b", fontSize: 12 }}
                    />
                    <RechartsTooltip content={<FunnelTooltip />} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={24}>
                      {hiringFunnel.map((entry, i) => (
                        <Cell
                          key={entry.stage}
                          fill={DEPT_COLORS[i]}
                          fillOpacity={0.3 + (i / hiringFunnel.length) * 0.7}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                )}
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {hiringFunnel.map((stage) => (
                  <div key={stage.stage} className="text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <TickCircle className="text-muted-foreground" size={14} />
                      <p className="text-lg font-bold text-foreground">{stage.count}</p>
                    </div>
                    <p className="text-xs text-muted truncate">{stage.stage}</p>
                    <p className="text-[10px] text-muted mt-0.5">
                      {totalFunnel > 0 ? Math.round((stage.count / totalFunnel) * 100) : 0}%
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Time to Hire Trend */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Time to Hire Trend</CardTitle>
                  <CardDescription>Average days to fill (6 months)</CardDescription>
                </div>
                <TrendDown className="h-4 w-4 text-success" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                {timeToHireTrend.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm text-muted">No data</div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeToHireTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="month"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      dy={8}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      dx={-4}
                      domain={[0, "auto"]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      labelStyle={{ color: "#64748b" }}
                      itemStyle={{ color: "#0f172a" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="days"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={{ fill: "#6366f1", strokeWidth: 0, r: 4 }}
                      activeDot={{ fill: "#6366f1", stroke: "#ffffff", strokeWidth: 2, r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Source Breakdown */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Source Breakdown</CardTitle>
                  <CardDescription>Candidates by source channel</CardDescription>
                </div>
                <People className="h-4 w-4 text-muted" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                {sourceBreakdown.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm text-muted">No data</div>
                ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sourceBreakdown} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      dy={8}
                    />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} dx={-4} />
                    <RechartsTooltip content={<ChartTooltip />} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={48}>
                      {sourceBreakdown.map((entry) => (
                        <Cell key={entry.name} fill={entry.name === "LinkedIn" ? "#6366f1" : "#cbd5e1"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                )}
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {sourceBreakdown.map((source) => (
                  <div key={source.name} className="text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      <People className="text-muted-foreground" size={14} />
                      <p className="text-lg font-bold text-foreground">{source.value}</p>
                    </div>
                    <p className="text-xs text-muted truncate">{source.name}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Department Performance Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Buildings className="text-muted-foreground" size={16} />
                <div>
                  <CardTitle className="text-base">Department Performance</CardTitle>
                  <CardDescription>Key hiring metrics by department</CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Department</TableHead>
                    <TableHead className="hidden sm:table-cell">Open Positions</TableHead>
                    <TableHead>Applications</TableHead>
                    <TableHead className="hidden md:table-cell">Avg AI Score</TableHead>
                    <TableHead className="hidden lg:table-cell">Time to Hire</TableHead>
                    <TableHead className="text-right">Performance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deptPerformance.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted py-8">No department data</TableCell>
                    </TableRow>
                  ) : (
                  deptPerformance.map((dept) => {
                    const scorePercent = dept.avgScore ?? 50
                    return (
                      <TableRow key={dept.dept}>
                        <TableCell>
                          <p className="text-sm font-medium text-foreground">{dept.dept}</p>
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="secondary" className="font-mono">
                            {dept.open}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-foreground tabular-nums">{dept.applications}</p>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "text-sm font-semibold tabular-nums",
                                dept.avgScore != null
                                  ? scorePercent >= 85
                                    ? "text-success"
                                    : scorePercent >= 75
                                      ? "text-primary"
                                      : "text-warning"
                                  : "text-muted"
                              )}
                            >
                              {dept.avgScore != null ? dept.avgScore : "—"}
                            </span>
                            {dept.avgScore != null && (
                              <Progress value={scorePercent} className="h-1.5 w-12" />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <p className="text-sm text-foreground tabular-nums">{dept.timeToHire != null ? `${dept.timeToHire}d` : "—"}</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={
                              dept.timeToHire != null
                                ? dept.timeToHire <= 25
                                  ? "success"
                                  : dept.timeToHire <= 30
                                    ? "warning"
                                    : "error"
                                : "secondary"
                            }
                          >
                            {dept.timeToHire != null
                              ? dept.timeToHire <= 25
                                ? "Fast"
                                : dept.timeToHire <= 30
                                  ? "Average"
                                  : "Slow"
                              : "—"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* AI Insights Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">AI Insights</CardTitle>
                <CardDescription>Intelligence-driven recruitment recommendations</CardDescription>
              </div>
              <MagicStar className="h-4 w-4 text-warning" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {aiInsights.map((insight) => (
                <div
                  key={insight.title}
                  className={cn(
                    "rounded-lg border p-4 transition-all duration-200 hover:border-border/80",
                    insight.type === "warning" && "border-warning-muted/30",
                    insight.type === "success" && "border-success-muted/30",
                    insight.type === "info" && "border-info-muted/30"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                        insight.type === "warning" && "bg-warning-muted text-warning",
                        insight.type === "success" && "bg-success-muted text-success",
                        insight.type === "info" && "bg-info-muted text-info"
                      )}
                    >
                      <insight.icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="space-y-1.5">
                      <h4 className="text-sm font-semibold text-foreground leading-snug">{insight.title}</h4>
                      <p className="text-xs text-muted leading-relaxed">{insight.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  )
}
