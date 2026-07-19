import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../styles/globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "CallWith.ai Dashboard",
  description: "AI Voice Agent Platform",
};

// Root layout: only wraps html/body/fonts.
// The sidebar + shell live in app/(dashboard)/layout.tsx
// The login/auth pages have their own layouts and don't inherit the shell.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${inter.variable} font-sans text-gray-900 dark:text-[#e6edf3] antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
