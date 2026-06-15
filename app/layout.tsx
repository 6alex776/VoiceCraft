import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'VoiceCraft',
  description: 'Local realtime voice chat stack with Next.js, TEN-style orchestration, and Ollama.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
