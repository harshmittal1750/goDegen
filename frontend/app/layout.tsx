import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import {
  Space_Grotesk,
  Orbitron,
  JetBrains_Mono,
  Stalinist_One,
} from "next/font/google";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

const orbitron = Orbitron({
  subsets: ["latin"],
  variable: "--font-orbitron",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

const stalinistOne = Stalinist_One({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-stalinist-one",
});

export const metadata: Metadata = {
  title: "Blockchain Data Dashboard",
  description: "Real-time blockchain data monitoring",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <title>GoDegen AI Trading</title>
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${spaceGrotesk.variable} ${orbitron.variable} ${jetbrainsMono.variable} ${stalinistOne.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
