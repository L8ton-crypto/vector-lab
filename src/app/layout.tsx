import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "VectorLab - Vector DB Playground",
  description: "Interactive playground for experimenting with vector embeddings and similarity search. Paste text, generate embeddings, visualise vector space, and explore semantic search - all in your browser.",
  openGraph: {
    title: "VectorLab - Vector DB Playground",
    description: "Interactive playground for vector embeddings and similarity search. Zero setup, runs in your browser.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${geist.variable} ${geistMono.variable} antialiased bg-zinc-950 text-zinc-100`}>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
