import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { Hydrate } from "@/components/hydration";
import { Toaster } from "@/components/toast";
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
  title: { default: "WorkshopPOS", template: "%s · WorkshopPOS" },
  description: "End-to-end point of sale and job card system for car workshops.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-slate-50 text-slate-900">
        <Suspense>
          <Hydrate>{children}</Hydrate>
        </Suspense>
        <Toaster />
      </body>
    </html>
  );
}
