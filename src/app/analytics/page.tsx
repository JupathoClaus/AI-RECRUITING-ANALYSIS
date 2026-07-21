"use client"

import { useMemo, useState } from "react"
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
  ArrowUp2,
  Flash,
  Warning2,
  Calendar,
  Briefcase,
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
import { Button } from "@/components/ui/button"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import { cn, formatNumber } from "@/lib/utils"

const DEPT_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#3b82f6", "#ef4444", "#a855f7"]
const SOURCE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#3b82f6", "#a855f7"]

const applicationsByDept = [
  { name: "Engineering", value: 106, color: "#6366f1" },
  { name: "Product", value: 27, color: "#22c55e" },
  { name: "Design", value: 12, color: "#f59e0b" },
  { name: "Data", value: 0, color: "#3b82f6" },
  { name: "Marketing", value: 7, color: "#a855f7" },
]

const hiringFunnel = [
  { stage: "Applied", count: 143 },
  { stage: "Screened", count: 98 },
  { stage: "Interviewed", count: 52 },
  { stage: "Offered", count: 18 },
  { stage: "Hired", count: 9 },
]

const timeToHireTrend = [
  { month: "Feb", days: 32 },
  { month: "Mar", days: 28 },
  { month: "Apr", days: 35 },
  { month: "May", days: 26 },
  { month: "Jun", days: 23 },
  { month: "Jul", days: 21 },
]

const sourceBreakdown = [
  { name: "LinkedIn", value: 48 },
  { name: "Indeed", value: 32 },
  { name: "Referral", value: 28 },
  { name: "Website", value: 21 },
  { name: "Other", value: 14 },
]

const deptPerformance = [
  { dept: "Engineering", open: 4, applications: 106, avgScore: 84, timeToHire: 28 },
  { dept: "Product", open: 1, applications: 27, avgScore: 81, timeToHire: 32 },
  { dept: "Design", open: 1, applications: 12, avgScore: 85, timeToHire: 25 },
  { dept: "Marketing", open: 1, applications: 7, avgScore: 82, timeToHire: 18 },
]

const aiInsights = [
  {
    icon: Clock,
    title: "Engineering roles take 15% longer to fill",
    description: "Senior engineering positions average 32 days to hire compared to 26 days for other departments. Consider expanding sourcing channels for these roles.",
    type: "warning",
  },
  {
    icon: Flag,
    title: "Referrals yield the highest-quality candidates",
    description: "Referred candidates score an average of 89 on AI assessments versus 76 from job boards. Increasing the referral bonus could improve quality further.",
    type: "success",
  },
  {
        icon: MagicStar,

    title: "AI screening accuracy improved 6% this quarter",
    description: "Model v2.3 shows 94% correlation with final hiring decisions. The NLP update has reduced false positives in engineering screenings by 12%.",
    type: "info",
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

function FunnelTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const total = hiringFunnel[0].count
  const pct = Math.round((payload[0].value / total) * 100)
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-lg">
      <p className="text-xs text-muted mb-1">{payload[0].name}</p>
      <p className="text-sm font-semibold text-foreground">{payload[0].value} candidates</p>
      <p className="text-xs text-muted">{pct}% of total</p>
    </div>
  )
}

export default function AnalyticsPage() {
  const { jobs, candidates } = useStore()
  const [dateRange, setDateRange] = useState("this-quarter")

  const totalApplications = useMemo(
    () => candidates.length + jobs.reduce((sum, j) => sum + j.applicants, 0),
    [candidates, jobs]
  )

  const keyMetrics = useMemo(
    () => [
      {
        label: "Total Applications",
        value: formatNumber(totalApplications),
        trend: "+18.5%",
        trendLabel: "vs last quarter",
        up: true,
        icon: People,
        color: "text-primary",
        accent: "border-l-primary",
      },
      {
        label: "Avg Time to Hire",
        value: "23 days",
        trend: "-4 days",
        trendLabel: "vs last quarter",
        up: true,
        icon: Clock,
        color: "text-info",
        accent: "border-l-info",
      },
      {
        label: "Offer Acceptance Rate",
        value: "78%",
        trend: "+5.3%",
        trendLabel: "vs last quarter",
        up: true,
        icon: TickCircle,
        color: "text-success",
        accent: "border-l-success",
      },
      {
        label: "AI Screening Accuracy",
        value: "94%",
        trend: "+6%",
        trendLabel: "this quarter",
        up: true,
    icon: MagicStar,
        color: "text-warning",
        accent: "border-l-warning",
      },
    ],
    [totalApplications]
  )

  const totalFunnel = hiringFunnel[0].count

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
        {/* Key Metrics */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {keyMetrics.map((metric) => (
            <Card
              key={metric.label}
              className={cn("group relative overflow-hidden transition-all duration-200 hover:shadow-xl border-l-4", metric.accent)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <p className="text-sm text-muted font-semibold uppercase tracking-wide">{metric.label}</p>
                    <p className="text-3xl font-bold tracking-tight text-foreground">{metric.value}</p>
                    <div className="flex items-center gap-1">
                      {metric.up ? (
                        <TrendUp className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <TrendDown className="h-3.5 w-3.5 text-error" />
                      )}
                      <span className={cn("text-xs font-semibold", metric.up ? "text-success" : "text-error")}>
                        {metric.trend}
                      </span>
                      <span className="text-xs text-muted">{metric.trendLabel}</span>
                    </div>
                  </div>
                  <div className={cn("shrink-0 transition-transform duration-200 group-hover:scale-110", metric.color)}>
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
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={applicationsByDept.filter((d) => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {applicationsByDept
                        .filter((d) => d.value > 0)
                        .map((entry) => (
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
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {hiringFunnel.map((stage, i) => (
                  <div key={stage.stage} className="text-center">
                    <p className="text-lg font-bold text-foreground">{stage.count}</p>
                    <p className="text-xs text-muted truncate">{stage.stage}</p>
                    <p className="text-[10px] text-muted mt-0.5">
                      {Math.round((stage.count / totalFunnel) * 100)}%
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
                      domain={[15, 40]}
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
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {sourceBreakdown.map((source) => (
                  <div key={source.name} className="text-center">
                    <p className="text-lg font-bold text-foreground">{source.value}</p>
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
              <div>
                <CardTitle className="text-base">Department Performance</CardTitle>
                <CardDescription>Key hiring metrics by department</CardDescription>
              </div>
              <Buildings className="h-4 w-4 text-muted" />
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
                  {deptPerformance.map((dept) => {
                    const scorePercent = dept.avgScore
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
                                scorePercent >= 85
                                  ? "text-success"
                                  : scorePercent >= 75
                                    ? "text-primary"
                                    : "text-warning"
                              )}
                            >
                              {dept.avgScore}
                            </span>
                            <Progress value={scorePercent} className="h-1.5 w-12" />
                          </div>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <p className="text-sm text-foreground tabular-nums">{dept.timeToHire}d</p>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={
                              dept.timeToHire <= 25
                                ? "success"
                                : dept.timeToHire <= 30
                                  ? "warning"
                                  : "error"
                            }
                          >
                            {dept.timeToHire <= 25
                              ? "Fast"
                              : dept.timeToHire <= 30
                                ? "Average"
                                : "Slow"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
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
