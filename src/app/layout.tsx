import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { env } from "@/lib/env";
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
  title: "Green Ecocare CRM",
  description: "CRM for Green Ecocare Private Limited — wastewater treatment plant projects",
  manifest: "/manifest.webmanifest",
};

export const viewport = {
  themeColor: "#0f7a4d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const shell = (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );

  // ClerkProvider requires a publishable key — only mount it when Clerk is active.
  return env.authMode === "clerk" ? <ClerkProvider>{shell}</ClerkProvider> : shell;
}
