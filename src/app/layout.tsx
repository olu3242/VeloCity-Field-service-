import type { Metadata } from "next";
import { Bebas_Neue, DM_Sans, Space_Mono } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "@/components/theme";
import { velocityThemeScript } from "@/config/theme";
import "./globals.css";
import "@/styles/velocity-theme.css";

const bebasNeue = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bebas",
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
});
const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
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
    <html lang="en" className="dark theme-dark" data-theme="dark" suppressHydrationWarning>
      <head>
        <Script id="velocity-theme-init" strategy="beforeInteractive">
          {velocityThemeScript}
        </Script>
      </head>
      <body className={`${bebasNeue.variable} ${dmSans.variable} ${spaceMono.variable}`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
