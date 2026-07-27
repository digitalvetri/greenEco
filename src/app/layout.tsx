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
  // iOS Safari ignores the web manifest entirely for "Add to Home Screen" — it needs
  // its own apple-* meta/link tags, which were completely missing (reported as not
  // being able to add the app to the home screen / it not looking/behaving like an app).
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Green Ecocare",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
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
