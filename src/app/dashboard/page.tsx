"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Briefcase,
  Users,
  CalendarClock,
  Sparkles,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  FileText,
  Video,
  Phone,
  MapPin,
  CheckCircle2,
  XCircle,
  Send,
  Handshake,
  Eye,
  MoreHorizontal,
  CalendarDays,
  Bot,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { AppLayout } from "@/components/layout/app-layout";
import { useStore } from "@/store/useStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, timeAgo } from "@/lib/utils";

const applicationData = [
  { day: "Jun 30", applications: 12 },
  { day: "Jul 1", applications: 18 },
  { day: "Jul 2", applications: 24 },
  { day: "Jul 3", applications: 15 },
  { day: "Jul 4", applications: 8 },
  { day: "Jul 5", applications: 6 },
  { day: "Jul 6", applications: 22 },
  { day: "Jul 7", applications: 31 },
  { day: "Jul 8", applications: 28 },
  { day: "Jul 9", applications: 35 },
  { day: "Jul 10", applications: 27 },
  { day: "Jul 11", applications: 42 },
  { day: "Jul 12", applications: 38 },
  { day: "Jul 13", applications: 45 },
];

function getScoreColor(score: number): string {
  if (score >= 90) return "text-success";
  if (score >= 75) return "text-primary";
  if (score >= 60) return "text-warning";
  return "text-error";
}

function getScoreIndicatorColor(score: number): string {
  if (score >= 90) return "bg-success";
  if (score >= 75) return "bg-primary";
  if (score >= 60) return "bg-warning";
  return "bg-error";
}

function getStatusBadgeVariant(
  status: string
): "default" | "secondary" | "success" | "warning" | "error" | "info" {
  switch (status) {
    case "Hired":
      return "success";
    case "Offer":
      return "info";
    case "Interview":
      return "default";
    case "Screening":
      return "warning";
    case "Applied":
      return "secondary";
    case "Rejected":
      return "error";
    default:
      return "secondary";
  }
}

function getStatusLabel(status: string): string {
  return status;
}

function getActivityIcon(type: string) {
  switch (type) {
    case "application":
      return <FileText className="h-4 w-4 text-info" />;
    case "interview":
      return <Video className="h-4 w-4 text-primary" />;
    case "offer":
      return <Send className="h-4 w-4 text-warning" />;
    case "hire":
      return <Handshake className="h-4 w-4 text-success" />;
    case "rejection":
      return <XCircle className="h-4 w-4 text-error" />;
    default:
      return <FileText className="h-4 w-4 text-muted" />;
  }
}

function getInterviewTypeIcon(type: string) {
  switch (type) {
    case "Video":
      return <Video className="h-3.5 w-3.5" />;
    case "Phone":
      return <Phone className="h-3.5 w-3.5" />;
    case "On-site":
      return <MapPin className="h-3.5 w-3.5" />;
    case "AI":
      return <Bot className="h-3.5 w-3.5" />;
    case "Technical":
      return <CheckCircle2 className="h-3.5 w-3.5" />;
    default:
      return <CalendarDays className="h-3.5 w-3.5" />;
  }
}

function getInterviewTypeBadgeVariant(
  type: string
): "default" | "secondary" | "success" | "warning" | "error" | "info" {
  switch (type) {
    case "Video":
      return "default";
    case "Phone":
      return "info";
    case "On-site":
      return "success";
    case "AI":
      return "warning";
    case "Technical":
      return "default";
    default:
      return "secondary";
  }
}

function getInterviewTypeLabel(type: string): string {
  return type;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

function ChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-lg">
      <p className="text-xs text-muted mb-1">{label}</p>
      <p className="text-sm font-semibold text-foreground">
        {payload[0].value} applications
      </p>
    </div>
  );
}

export default function DashboardPage() {
  const { jobs, candidates, interviews, activities } = useStore();

  const stats = useMemo(() => {
    const activeJobs = jobs.filter((j) => j.status === "Active").length;
    const totalCandidates = candidates.length;

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const interviewsThisWeek = interviews.filter(
      (i) =>
        i.status === "Scheduled" &&
        i.scheduledAt >= weekStart &&
        i.scheduledAt < weekEnd
    ).length;

    const avgScore =
      candidates.length > 0
        ? Math.round(
            candidates.reduce((sum, c) => sum + c.aiScore, 0) /
              candidates.length
          )
        : 0;

    return { activeJobs, totalCandidates, interviewsThisWeek, avgScore };
  }, [jobs, candidates, interviews]);

  const pipelineData = useMemo(() => {
    const stages = ["Applied", "Screening", "Interview", "Offer", "Hired", "Rejected"];
    return stages.map((stage) => ({
      stage: getStatusLabel(stage),
      count: candidates.filter((c) => c.status === stage).length,
    }));
  }, [candidates]);

  const topCandidates = useMemo(
    () =>
      [...candidates]
        .filter((c) => c.status !== "Rejected" && c.status !== "Hired")
        .sort((a, b) => b.aiScore - a.aiScore)
        .slice(0, 5),
    [candidates]
  );

  const upcomingInterviews = useMemo(
    () =>
      interviews
        .filter((i) => i.status === "Scheduled")
        .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime())
        .slice(0, 5),
    [interviews]
  );

  const kpiCards = [
    {
      label: "Total Open Positions",
      value: stats.activeJobs.toString(),
      trend: "+2",
      trendLabel: "from last month",
      up: true,
      icon: <Briefcase className="h-5 w-5" />,
      color: "text-primary",
      accent: "border-l-primary",
    },
    {
      label: "Total Candidates",
      value: stats.totalCandidates.toString(),
      trend: "+18%",
      trendLabel: "from last month",
      up: true,
      icon: <Users className="h-5 w-5" />,
      color: "text-info",
      accent: "border-l-info",
    },
    {
      label: "Interviews This Week",
      value: stats.interviewsThisWeek.toString(),
      trend: "+4",
      trendLabel: "vs last week",
      up: true,
      icon: <CalendarClock className="h-5 w-5" />,
      color: "text-warning",
      accent: "border-l-warning",
    },
    {
      label: "Avg AI Score",
      value: stats.avgScore.toString(),
      trend: "+3.2",
      trendLabel: "from last month",
      up: true,
      icon: <Sparkles className="h-5 w-5" />,
      color: "text-success",
      accent: "border-l-success",
    },
  ];

  return (
    <AppLayout
      title="Dashboard"
      description="Welcome back, Sarah. Here's your recruitment overview."
    >
      <div className="space-y-6">
        {/* KPI Stats Row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpiCards.map((card) => (
            <Card
              key={card.label}
              className={cn("group relative overflow-hidden transition-all duration-200 hover:shadow-xl border-l-4", card.accent)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <p className="text-sm text-muted font-semibold uppercase tracking-wide">
                      {card.label}
                    </p>
                    <p className="text-3xl font-bold tracking-tight text-foreground">
                      {card.value}
                    </p>
                    <div className="flex items-center gap-1">
                      {card.up ? (
                        <TrendingUp className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <TrendingDown className="h-3.5 w-3.5 text-error" />
                      )}
                      <span
                        className={cn(
                          "text-xs font-semibold",
                          card.up ? "text-success" : "text-error"
                        )}
                      >
                        {card.trend}
                      </span>
                      <span className="text-xs text-muted">
                        {card.trendLabel}
                      </span>
                    </div>
                  </div>
                  <div className={cn("shrink-0 transition-transform duration-200 group-hover:scale-110", card.color)}>
                    {card.icon}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Applications Over Time */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">
                    Applications Over Time
                  </CardTitle>
                  <p className="text-sm text-muted mt-1">
                    Last 14 days
                  </p>
                </div>
                <Badge variant="secondary" className="text-xs">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  +23% trend
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={applicationData}
                    margin={{ top: 5, right: 10, left: -10, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="applicationGradient"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#6366f1"
                          stopOpacity={0.3}
                        />
                        <stop
                          offset="95%"
                          stopColor="#6366f1"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e2e8f0"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="day"
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
                    />
                    <RechartsTooltip content={<ChartTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="applications"
                      stroke="#6366f1"
                      strokeWidth={2}
                      fill="url(#applicationGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Pipeline Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Pipeline Distribution
              </CardTitle>
              <p className="text-sm text-muted mt-1">
                Candidates by stage
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={pipelineData}
                    margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#e2e8f0"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="stage"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      dy={8}
                      interval={0}
                      angle={-30}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: "#64748b", fontSize: 12 }}
                      dx={-4}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "#ffffff",
                        border: "1px solid #e2e8f0",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      itemStyle={{ color: "#0f172a" }}
                      cursor={{ fill: "rgba(99, 102, 241, 0.08)" }}
                    />
                    <Bar
                      dataKey="count"
                      fill="#6366f1"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Activity Feed + Upcoming Interviews */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Recent Activity */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Recent Activity</CardTitle>
                <Link
                  href="/activities"
                  className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
                >
                  View All
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                {activities.map((activity, index) => {
                  const candidate = candidates.find(
                    (c) => c.name === activity.candidateName
                  );
                  return (
                    <div key={activity.id}>
                      <div className="flex items-start gap-3 py-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-elevated mt-0.5">
                          {getActivityIcon(activity.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground leading-relaxed">
                            <span className="font-medium">
                              {activity.candidateName}
                            </span>{" "}
                            <span className="text-muted">
                              {activity.message}
                            </span>{" "}
                            <span className="font-medium text-foreground">
                              {candidate?.jobTitle || "a position"}
                            </span>
                          </p>
                          <p className="text-xs text-muted mt-0.5">
                            {timeAgo(activity.timestamp)}
                          </p>
                        </div>
                      </div>
                      {index < activities.length - 1 && (
                        <Separator className="opacity-50" />
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Interviews */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Upcoming Interviews
                </CardTitle>
                <Link
                  href="/interviews"
                  className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
                >
                  View All
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                {upcomingInterviews.map((interview, index) => (
                  <div key={interview.id}>
                    <div className="flex items-start gap-3 py-3">
                      <Avatar className="h-9 w-9 mt-0.5">
                        <span className="text-xs font-medium">
                          {interview.candidateName
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </span>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground truncate">
                            {interview.candidateName}
                          </p>
                          <Badge
                            variant={getInterviewTypeBadgeVariant(
                              interview.type
                            )}
                            className="shrink-0 text-[10px] px-1.5 py-0"
                          >
                            {getInterviewTypeIcon(interview.type)}
                            <span className="ml-0.5">
                              {getInterviewTypeLabel(interview.type)}
                            </span>
                          </Badge>
                        </div>
                        <p className="text-xs text-muted truncate mt-0.5">
                          {interview.jobTitle}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <CalendarDays className="h-3 w-3 text-muted" />
                          <p className="text-xs text-muted-foreground">
                            {interview.scheduledAt.toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}{" "}
                            at{" "}
                            {interview.scheduledAt.toLocaleTimeString("en-US", {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                    {index < upcomingInterviews.length - 1 && (
                      <Separator className="opacity-50" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Candidates */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Top Candidates</CardTitle>
                <p className="text-sm text-muted mt-1">
                  Ranked by AI assessment score
                </p>
              </div>
              <Link
                href="/candidates"
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-transparent px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-hover"
              >
                View All Candidates
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Candidate</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Position
                  </TableHead>
                  <TableHead>AI Score</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Status
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topCandidates.map((candidate) => (
                  <TableRow key={candidate.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <span className="text-[10px] font-medium">
                            {candidate.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </span>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {candidate.name}
                          </p>
                          <p className="text-xs text-muted truncate sm:hidden">
                            {candidate.jobTitle}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <p className="text-sm text-muted-foreground truncate max-w-[180px]">
                        {candidate.jobTitle}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3 min-w-[120px]">
                        <span
                          className={cn(
                            "text-sm font-semibold tabular-nums",
                            getScoreColor(candidate.aiScore)
                          )}
                        >
                          {candidate.aiScore}
                        </span>
                        <Progress
                          value={candidate.aiScore}
                          className="h-1.5 w-16"
                          indicatorClassName={getScoreIndicatorColor(
                            candidate.aiScore
                          )}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant={getStatusBadgeVariant(candidate.status)}>
                        {getStatusLabel(candidate.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="View profile"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="More options"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
