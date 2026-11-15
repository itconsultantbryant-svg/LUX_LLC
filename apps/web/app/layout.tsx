import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import "./site.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "LUX HealthPay — Verify the care. Pay the provider.",
    template: "%s | LUX HealthPay",
  },
  description:
    "A Liberia-first platform that connects insurers, healthcare providers and Orange Money in one verified claims and payment workflow.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={poppins.variable}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
