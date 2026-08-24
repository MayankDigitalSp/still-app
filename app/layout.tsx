import './globals.css';
import type { Metadata } from 'next';
export const metadata: Metadata = {
  title:'Still — Meditation & Habits',
  description:'A calm meditation and habit companion.',
  manifest:'/manifest.json',
  themeColor:'#edf1e8'
};
export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="en"><body>{children}</body></html>;
}
