import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '청빙 작업대',
  description: '담임목사 청빙 서류 종합관리',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
