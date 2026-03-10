import type { Metadata } from "next";
import { Geist, Geist_Mono, DM_Sans } from "next/font/google";
import NextTopLoader from 'nextjs-toploader';
import { ThemeProvider } from '@/components/theme-provider';
import "./globals.css";

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' });

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SignalShare | Peer-to-Peer File Transfer in Browser | Direct LAN & Relay Sharing",
  description: "Transmit files instantly using direct peer-to-peer connections over local networks. No accounts, no uploads. Generate temporary relay links when needed.",
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={dmSans.variable} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <NextTopLoader color="#00dbd3" showSpinner={false} />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

