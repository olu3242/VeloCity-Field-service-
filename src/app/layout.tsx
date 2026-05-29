import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "@/styles/velocity-theme.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { BrandProvider } from "@/components/providers/BrandProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "VeloCity Field Service",
  description: "Your trusted local service, delivered at velocity. AI-powered field service platform.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider defaultTheme="dark">
          <BrandProvider>{children}</BrandProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
