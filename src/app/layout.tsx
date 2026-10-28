import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/lib/theme-context";
import { AuthProvider } from "@/lib/auth-context";
import { FloatingAIAssistant } from "@/components/ai-assistant";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
  // Preload only the weights actually used in the design system
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "TalentAI | Recruitment workspace",
  description: "TalentAI recruitment workspace for structured hiring decisions.",
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
    <html lang="en" suppressHydrationWarning className={inter.variable}>
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
