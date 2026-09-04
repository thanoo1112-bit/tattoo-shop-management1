import type { Metadata } from "next";
import { Bebas_Neue, Prompt, Caveat } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/components/AppContext";

const bebasNeue = Bebas_Neue({
  weight: ["400"],
  subsets: ["latin"],
  variable: "--font-bebas",
  display: "swap",
});

const prompt = Prompt({
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin", "thai"],
  variable: "--font-prompt",
  display: "swap",
});

const caveat = Caveat({
  weight: ["400", "600", "700"],
  subsets: ["latin"],
  variable: "--font-caveat",
  display: "swap",
});

export const metadata: Metadata = {
  title: "157 TATTOO — Traditional Craft & Flash Tattoo Studio",
  description: "Web Application สำหรับร้านสัก 157 TATTOO — Ink, Aged Flash Paper & Traditional Craft",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html 
      lang="th" 
      className={`dark bg-studio-main text-studio-primary ${bebasNeue.variable} ${prompt.variable} ${caveat.variable}`}
    >
      <body className="min-h-screen bg-studio-main text-studio-primary font-sans antialiased selection:bg-studio-red selection:text-studio-paper">
        <AppProvider>
          {children}
        </AppProvider>
      </body>
    </html>
  );
}
