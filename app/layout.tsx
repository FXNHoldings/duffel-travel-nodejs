import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { Urbanist } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"]
});

const urbanist = Urbanist({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-heading"
});

export const metadata: Metadata = {
  title: "Duffel Travel Starter",
  description: "Starter app for flight and stay search built on Duffel."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${outfit.className} ${urbanist.variable}`}>{children}</body>
    </html>
  );
}
