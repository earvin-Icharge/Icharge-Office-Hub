import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  title: { default: "iCharge Office Hub", template: "%s · iCharge Office Hub" },
  description: "Work and HR app for iCharge staff",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#16210F",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale === "zh-Hans" ? "zh-Hans" : "en"} className={`${inter.variable} ${poppins.variable}`}>
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
