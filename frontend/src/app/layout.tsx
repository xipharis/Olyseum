import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import { GeistMono } from "geist/font/mono";
import { SiteFooter } from "@/components/site-footer";
import { CookieBanner } from "@/components/cookie-banner";
import { Providers } from "@/components/providers";
import { TopBar, TestnetStrip } from "@/components/shell";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], weight: ["300", "400", "500", "600"], variable: "--font-dm-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Olyseum — Trade the odds on what happens next", template: "%s · Olyseum" },
  description: "Olyseum is a prediction market on Monad. Buy YES or NO on real-world questions, with optional leverage. Explore the testnet.",
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" }],
  colorScheme: "light dark",
};

// Applies a saved theme before first paint so a dark-mode viewer never sees a white flash.
const THEME_SCRIPT = `try{var t=localStorage.getItem("olyseum-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body>
        <Providers>
          <TopBar />
          <TestnetStrip />
          {children}
          <SiteFooter />
          <CookieBanner />
        </Providers>
      </body>
    </html>
  );
}
