import "./globals.css";
import type { ReactNode } from "react";
import { Bebas_Neue, Plus_Jakarta_Sans } from "next/font/google";

const headingFont = Bebas_Neue({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display"
});

const bodyFont = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body"
});

export const metadata = {
  title: "Muse Admin",
  description: "Back-office Muse Origin Studio"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${bodyFont.variable} ${headingFont.variable}`}>{children}</body>
    </html>
  );
}
