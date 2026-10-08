import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KULT Events · Registration",
  description:
    "Register for KULT Events on 24 October at Talk of the Town, Edappally.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
