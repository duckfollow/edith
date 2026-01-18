import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { ActionButtons } from "@/components/layout/action-buttons";
import { SidebarProvider } from "@/contexts/sidebar-context";

export const metadata: Metadata = {
  title: "Edith - Local Photos",
  description: "Your simple, local-first media platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-white h-screen flex overflow-hidden font-sans`}
      >
        <SidebarProvider>
          <Sidebar />

          <div className="flex-1 flex flex-col min-w-0 h-full md:ml-[240px] bg-white">
            <TopBar />
            <ActionButtons />
            <main className="flex-1 overflow-y-auto mt-28 px-4 sm:px-6 md:px-8 lg:px-12 py-6 md:py-8">
              {children}
            </main>
          </div>
        </SidebarProvider>
      </body>
    </html>
  );
}
