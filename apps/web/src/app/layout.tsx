import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { EnvironmentBanner } from "@/components/layout/EnvironmentBanner";
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
  title: 'FastWrks Marketplace - Connect Vendors with Local Customers',
  description: 'Specialized marketplace platforms for in-person businesses. Join our verified vendor network and grow your local customer base.',
  keywords: 'marketplace, vendors, local business, food trucks, farmers market',
  openGraph: {
    title: 'FastWrks Marketplace',
    description: 'Connect Vendors with Local Customers',
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
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').catch(function(){})}`,
          }}
        />
        <EnvironmentBanner />
        {children}
      </body>
    </html>
  );
}
