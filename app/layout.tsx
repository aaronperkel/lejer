import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lejer",
  description: "Split household bills with your roommates.",
};

// Themes (data-theme / data-color-scheme from the household) and fonts land in phase 5.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
