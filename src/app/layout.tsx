import type { Metadata } from "next";
import { DM_Sans, Space_Mono, Bebas_Neue } from "next/font/google";
import "./globals.css";
import "@/styles/velocity-theme.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { BrandProvider } from "@/components/providers/BrandProvider";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-mono",
  display: "swap",
});

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

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
      <body className={`${dmSans.variable} ${spaceMono.variable} ${bebasNeue.variable}`}>
        <ThemeProvider defaultTheme="dark">
          <BrandProvider>{children}</BrandProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
