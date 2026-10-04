import type { Metadata, Viewport } from 'next';
import { DM_Sans, Sora } from 'next/font/google';
import { Toasts } from '@/components/Toasts';
import './globals.css';

const sora = Sora({ variable: '--font-sora', subsets: ['latin'], weight: ['500', '600', '700'] });
const dmSans = DM_Sans({ variable: '--font-dm-sans', subsets: ['latin'], weight: ['400', '500', '600', '700'] });

export const metadata: Metadata = {
  title: 'Banco Imobiliário',
  description: 'O banco da partida no celular de cada jogador: Pix, aluguel, cotas e extrato em tempo real.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FFFFFF',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR" data-theme="light" className={`${sora.variable} ${dmSans.variable}`}>
      <body>
        <Toasts>{children}</Toasts>
      </body>
    </html>
  );
}
