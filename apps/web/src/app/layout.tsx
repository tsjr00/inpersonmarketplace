import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { EnvironmentBanner } from "@/components/layout/EnvironmentBanner";
import { WebVitals } from "@/components/layout/WebVitals";
import { SentryInit } from "@/components/layout/SentryInit";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: 'Local Market - Local Marketplace Platform',
  description: 'Specialized marketplace platforms for in-person businesses. Join our verified vendor network and grow your local customer base.',
  keywords: 'marketplace, vendors, local business, food trucks, farmers market',
  openGraph: {
    title: 'Local Market',
    description: 'Local Marketplace Platform',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL!} />
        <link rel="manifest" href="/api/manifest" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/api/apple-touch-icon" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {/* Safe: inline SW registration script — no user-supplied content */}
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(function(){})}`,
          }}
        />
        <SentryInit />
        <EnvironmentBanner />
        <WebVitals />
        {children}
      </body>
    </html>
  );
}
