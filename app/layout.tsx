import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Who Is Your Reply Guy? 👀",
  description:
    "Find the accounts that reply most to any Twitter/X user. Fun, savage, and highly shareable.",
  openGraph: {
    title: "Who Is Your Reply Guy? 👀",
    description: "Uncover who's camping in someone's replies on Twitter/X.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Who Is Your Reply Guy?",
    description: "Uncover who's camping in someone's replies on Twitter/X.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
