export const money = (n: number) => '$\u00a0' + Math.round(n).toLocaleString('pt-BR');

export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const initial = (name: string) => (name || '?').trim().charAt(0).toUpperCase() || '?';
