import type { Metadata } from "next";
import "./globals.css";
import "./experience.css";
export const metadata: Metadata = {
  title: {
    default: "LUX HealthPay — Clear claims. Connected care.",
    template: "%s | LUX HealthPay",
  },
  description:
    "Structured healthcare claims, insurer-controlled review and traceable payment records for Liberia.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
