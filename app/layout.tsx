import { Fraunces, Public_Sans } from "next/font/google";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap" });
const sans = Public_Sans({ subsets: ["latin"], variable: "--font-public", display: "swap" });

export const metadata = {
  title: "Sales Factory",
  description: "A sample sales workspace with calls, coaching, nudges, and a quote. Nothing is sent.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
