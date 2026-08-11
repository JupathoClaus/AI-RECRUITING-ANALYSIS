import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme-context";
import { AuthProvider } from "@/lib/auth-context";
import { FloatingAIAssistant } from "@/components/ai-assistant";

export const metadata: Metadata = {
  title: "AI Recruiter - AI Recruitment Operating System",
  description: "Enterprise-grade AI-powered recruitment platform",
  icons: {
    icon: "/ai-recruiter-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          id="theme-script"
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("ai-recruiter-theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme:dark)").matches))document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>
          <AuthProvider>
            {children}
            <FloatingAIAssistant />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
