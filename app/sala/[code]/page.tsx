import type { Metadata } from 'next';
import { Room } from '@/components/Room';

export async function generateMetadata({ params }: PageProps<'/sala/[code]'>): Promise<Metadata> {
  const { code } = await params;
  return { title: `Sala ${code.toUpperCase()} · Banco Imobiliário` };
}

export default async function SalaPage({ params }: PageProps<'/sala/[code]'>) {
  const { code } = await params;
  return <Room code={code.toUpperCase()} />;
}
