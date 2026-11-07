import type { Metadata, Viewport } from "next";
import { Inter, Source_Code_Pro } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const sourceCode = Source_Code_Pro({ subsets: ["latin"], variable: "--font-source-code" });

export const metadata: Metadata = {
  title: { default: "GreenBranch", template: "%s · GreenBranch" },
  description:
    "Runs your test suite, asks a model for a small edit for each failure, keeps only the edits the tests confirm, and opens a pull request.",
};

export const viewport: Viewport = {
  themeColor: "#131413",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${sourceCode.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
