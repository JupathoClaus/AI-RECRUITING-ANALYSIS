"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import {
  MagicStar,
  People,
  Chart2,
  Calendar,
  Shield,
  ArrowRight,
  Flash,
} from "iconsax-react"
import Image from "next/image"
import { Swiper, SwiperSlide } from "swiper/react"
import { Autoplay, EffectFade, Navigation, Pagination } from "swiper/modules"
import type { Swiper as SwiperType } from "swiper"

import "swiper/css"
import "swiper/css/effect-fade"
import "swiper/css/pagination"
import "swiper/css/navigation"

const heroSlides = [
  {
    image: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1200&q=80",
    alt: "AI robot conducting a professional interview",
    overlay: "from-blue-600/80 via-indigo-600/60 to-purple-700/80",
  },
  {
    image: "https://images.unsplash.com/photo-1573164713714-d95e436ab8d6?w=1200&q=80",
    alt: "Recruiter collaborating with AI technology",
    overlay: "from-emerald-600/80 via-teal-600/60 to-cyan-700/80",
  },
  {
    image: "https://images.unsplash.com/photo-1560472354-b33ff0c44a43?w=1200&q=80",
    alt: "Professional candidates in virtual AI interview",
    overlay: "from-violet-600/80 via-purple-600/60 to-fuchsia-700/80",
  },
  {
    image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&q=80",
    alt: "Futuristic hiring dashboard with analytics",
    overlay: "from-amber-600/80 via-orange-600/60 to-rose-700/80",
  },
  {
    image: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=1200&q=80",
    alt: "Business professionals collaborating with AI technology",
    overlay: "from-cyan-600/80 via-sky-600/60 to-blue-700/80",
  },
]

const features = [
  {
    icon: MagicStar,
    title: "AI-Powered Screening",
    description: "Automatically rank and filter candidates with intelligent resume analysis and skill matching.",
  },
  {
    icon: People,
    title: "Candidate Pipeline",
    description: "Visual Kanban board to track candidates through every stage of your hiring workflow.",
  },
  {
    icon: Calendar,
    title: "Smart Scheduling",
    description: "AI-driven interview scheduling that finds the best times for interviewers and candidates.",
  },
  {
    icon: Chart2,
    title: "Analytics & Insights",
    description: "Real-time dashboards with hiring metrics, pipeline health, and source effectiveness.",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    description: "Role-based access control, audit logs, and SOC 2 compliant data handling.",
  },
  {
    icon: Flash,
    title: "Automated Workflows",
    description: "Eliminate repetitive tasks with automated notifications, scoring, and report generation.",
  },
]

const stats = [
  { value: "10x", label: "Faster Screening" },
  { value: "94%", label: "Candidate Satisfaction" },
  { value: "60%", label: "Less Time-to-Hire" },
  { value: "3x", label: "More Qualified Leads" },
]

export default function LandingPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      router.replace("/dashboard")
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (user) return null

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-[160px] max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center">
            <div className="flex h-[135px] w-[135px] items-center justify-center overflow-hidden">
              <img src="/ai-recruiter-logo.png" alt="AI Recruiter" className="h-full w-full object-contain" />
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Sign In</Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/5" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 py-16 sm:py-20 lg:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left: Text Content */}
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary mb-8">
                <MagicStar className="h-3.5 w-3.5" />
                AI-Powered Recruitment Platform
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.1]">
                Hire the best talent,
                <br />
                <span className="text-primary">powered by AI</span>
              </h1>
              <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto lg:mx-0 leading-relaxed">
                Streamline your recruitment workflow with intelligent candidate screening,
                automated scheduling, and real-time analytics — all in one platform.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row items-center lg:justify-start justify-center gap-4">
                <Link href="/register">
                  <Button size="lg" className="text-base px-8 gap-2">
                    Start Hiring Smarter
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/login">
                  <Button variant="outline" size="lg" className="text-base px-8">
                    Sign In to Dashboard
                  </Button>
                </Link>
              </div>

              {/* Stats */}
              <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <p className="text-2xl sm:text-3xl font-bold text-foreground">{stat.value}</p>
                    <p className="mt-1 text-xs sm:text-sm text-muted-foreground">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Slideshow */}
            <div className="relative animate-fade-in">
              <div className="hero-slideshow relative rounded-3xl overflow-hidden shadow-2xl border border-border/50 bg-surface aspect-[4/3]">
                <Swiper
                  modules={[Autoplay, EffectFade, Pagination, Navigation]}
                  effect="fade"
                  fadeEffect={{ crossFade: true }}
                  autoplay={{ delay: 4500, disableOnInteraction: false, pauseOnMouseEnter: true }}
                  pagination={{ clickable: true }}
                  navigation={{
                    nextEl: ".hero-swiper-next",
                    prevEl: ".hero-swiper-prev",
                  }}
                  loop
                  speed={800}
                  className="absolute inset-0"
                >
                  {heroSlides.map((slide, i) => (
                    <SwiperSlide key={i}>
                      <div className="absolute inset-0">
                        {/* Ken Burns zoom effect */}
                        <div className="absolute inset-0 animate-[kenBurns_8s_ease-in-out_infinite_alternate]" style={{ animationDelay: `${i * 1.6}s` }}>
                          <Image
                            src={slide.image}
                            alt={slide.alt}
                            fill
                            sizes="(max-width: 768px) 100vw, 50vw"
                            className="object-cover"
                            priority={i === 0}
                            loading={i === 0 ? "eager" : "lazy"}
                          />
                          {/* Gradient overlay for readability */}
                          <div className={`absolute inset-0 bg-gradient-to-br ${slide.overlay}`} />
                          {/* Subtle grid pattern overlay */}
                          <div className="absolute inset-0 opacity-[0.03]" style={{
                            backgroundImage: `linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)`,
                            backgroundSize: '40px 40px'
                          }} />
                        </div>
                        {/* Bottom gradient for glass cards */}
                        <div className="absolute bottom-0 left-0 right-0 h-1/3 bg-gradient-to-t from-black/40 to-transparent" />
                      </div>
                    </SwiperSlide>
                  ))}
                </Swiper>

                {/* Navigation Arrows */}
                <button
                  className="hero-swiper-prev absolute left-3 top-1/2 -translate-y-1/2 z-20 flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-md bg-white/15 border border-white/20 text-white shadow-lg transition-all duration-200 hover:bg-white/25 hover:scale-105 cursor-pointer"
                  aria-label="Previous slide"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  className="hero-swiper-next absolute right-3 top-1/2 -translate-y-1/2 z-20 flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-md bg-white/15 border border-white/20 text-white shadow-lg transition-all duration-200 hover:bg-white/25 hover:scale-105 cursor-pointer"
                  aria-label="Next slide"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Floating glass cards */}
                <div className="absolute top-6 left-6 right-6 z-10 pointer-events-none">
                  <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl px-4 py-3 shadow-lg animate-[fadeInDown_1s_ease-out_0.5s_both]">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-emerald-400/20 flex items-center justify-center">
                        <div className="h-3 w-3 rounded-full bg-emerald-400 animate-pulse" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">AI Interview in Progress</p>
                        <p className="text-xs text-white/70">Analyzing candidate responses...</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-6 left-6 right-6 z-10 pointer-events-none">
                  <div className="flex gap-3">
                    <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl px-4 py-3 shadow-lg flex-1 animate-[fadeInUp_1s_ease-out_0.8s_both]">
                      <p className="text-lg font-bold text-white">98%</p>
                      <p className="text-xs text-white/70">Match Accuracy</p>
                    </div>
                    <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl px-4 py-3 shadow-lg flex-1 animate-[fadeInUp_1s_ease-out_1s_both]">
                      <p className="text-lg font-bold text-white">2.4s</p>
                      <p className="text-xs text-white/70">Avg. Screen Time</p>
                    </div>
                    <div className="backdrop-blur-xl bg-white/10 border border-white/20 rounded-xl px-4 py-3 shadow-lg flex-1 animate-[fadeInUp_1s_ease-out_1.2s_both]">
                      <p className="text-lg font-bold text-white">500+</p>
                      <p className="text-xs text-white/70">Candidates Today</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-surface/50">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Everything you need to hire
            </h2>
            <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
              From sourcing to onboarding, AI Recruiter gives your team the tools to find and hire exceptional talent.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-xl border border-border bg-background p-6 transition-all duration-200 hover:shadow-lg hover:border-primary/20"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4 transition-transform duration-200 group-hover:scale-110">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-24 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
            Ready to transform your hiring?
          </h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
            Join hundreds of companies using AI Recruiter to build exceptional teams faster.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/register">
              <Button size="lg" className="text-base px-8 gap-2">
                Create Free Account
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-surface/30">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 flex flex-col items-center gap-6">
          <Link href="/" className="flex flex-col items-center">
            <div className="flex h-[140px] w-[140px] sm:h-[160px] sm:w-[160px] md:h-[180px] md:w-[180px] lg:h-[200px] lg:w-[200px] items-center justify-center overflow-hidden mb-6">
              <img src="/ai-recruiter-logo.png" alt="AI Recruiter" className="h-full w-full object-contain" />
            </div>
          </Link>
          <p className="text-sm text-muted text-center">
            &copy; {new Date().getFullYear()} AI Recruiter. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
