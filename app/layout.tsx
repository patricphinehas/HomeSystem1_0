import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Sidebar } from "./sidebar";
import { DevAnnotator } from "./agentation";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Home System",
  description: "Household inventory and stock tracking.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full md:flex md:h-full">
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 py-8 md:overflow-y-auto md:px-10">
          <div className="mx-auto max-w-4xl">{children}</div>
        </main>
        <DevAnnotator />
      </body>
    </html>
  );
}
