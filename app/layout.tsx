import type { Metadata, Viewport } from "next";
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

const SITE_URL = "https://paper-summarizer-neon.vercel.app";
const TITLE = "Paper Summarizer";
const DESCRIPTION =
  "Retrieval-augmented Q&A over PDFs. Upload a paper, ask questions, and get answers with citations to the source paragraphs.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s · Paper Summarizer",
  },
  description: DESCRIPTION,
  applicationName: TITLE,
  authors: [{ name: "Henry Myos" }],
  keywords: [
    "RAG",
    "Retrieval-Augmented Generation",
    "PDF Q&A",
    "Claude",
    "Supabase",
    "Next.js",
    "Voyage AI",
    "pgvector",
  ],
  robots: { index: true, follow: true },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: SITE_URL,
    siteName: TITLE,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
