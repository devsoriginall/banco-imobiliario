import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { Toasts } from '@/components/Toasts';
import './globals.css';

// Fontes no próprio repositório (variáveis, só latin): o build não depende de baixar do Google Fonts.
const sora = localFont({ src: './fonts/sora.woff2', variable: '--font-sora', weight: '100 800', display: 'swap' });
const dmSans = localFont({ src: './fonts/dm-sans.woff2', variable: '--font-dm-sans', weight: '100 1000', display: 'swap' });

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
