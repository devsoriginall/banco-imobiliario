// Teste de ponta a ponta da negociação entre jogadores e do empréstimo do banco, no modo local (sem Supabase),
// com dois "celulares" (duas abas do mesmo contexto do navegador).
//
//   npm run build && npm start   # em outro terminal (sem as variáveis do Supabase)
//   PLAYWRIGHT=$(npm root -g)/playwright/index.mjs BASE_URL=http://localhost:3000 node scripts/e2e-negociacao-emprestimo.mjs
import path from 'node:path';

const pwPath = process.env.PLAYWRIGHT || 'playwright';
const { chromium } = await import(pwPath);
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = path.resolve(import.meta.dirname, '../docs/screenshots');

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR' });
const ana = await context.newPage();
const beto = await context.newPage();
const shot = (page, name, fullPage = false) => page.screenshot({ path: path.join(OUT, name), fullPage });
const norm = (t) => t.replace(/\s+/g, ' ').trim();
const wallet = async (page) => norm(await page.getByTestId('wallet-balance').textContent());
const playerBal = async (page, name) => norm(await page.locator(`.player[data-player="${name}"] .bal`).textContent());
const owner = async (page, idx) => (await page.locator(`[data-space="${idx}"]`).getAttribute('aria-label')).split(' · ')[1] || 'ninguém';
const front = (page) => page.bringToFront();
const noToasts = (page) => page.waitForFunction(() => document.querySelectorAll('.toast').length === 0, null, { timeout: 10000 });
const fail = (msg) => {
  console.error('FALHOU:', msg);
  process.exitCode = 1;
};
const expectEq = (got, want, what) => {
  if (got !== want) fail(`${what}: esperado "${want}", veio "${got}"`);
};

// Sala com Ana e Beto
await ana.goto(BASE);
await ana.getByLabel('Seu nome').fill('Ana');
await ana.getByRole('button', { name: 'Criar sala' }).click();
await ana.waitForURL(/\/sala\/[A-Z0-9]{5}$/);
const code = (await ana.getByTestId('room-code').textContent()).trim();
console.log('Sala criada:', code);
await front(beto);
await beto.goto(BASE);
await beto.getByLabel('Seu nome').fill('Beto');
await beto.getByLabel('Código da sala').fill(code);
await beto.getByRole('button', { name: 'Entrar na sala' }).click();
await beto.waitForURL(new RegExp(`/sala/${code}$`));
await front(ana);
await ana.locator('.lobby-p', { hasText: 'Beto' }).waitFor();
await ana.getByRole('button', { name: 'Começar partida' }).click();
await ana.getByText('É a sua vez').waitFor();

// 1. Ana compra a Av. 9 de Julho ($ 1.000)
await ana.locator('[data-space="1"]').click();
await ana.getByRole('button', { name: /Comprar por/ }).click();
await ana.getByRole('button', { name: 'Confirmar Pix' }).click();
await ana.getByRole('button', { name: 'Fechar' }).click();
await ana.getByRole('button', { name: 'Passar a vez' }).click();

// 2. Beto compra a Av. Brasil ($ 750)
await front(beto);
await beto.getByText('É a sua vez').waitFor();
await beto.locator('[data-space="2"]').click();
await beto.getByRole('button', { name: /Comprar por/ }).click();
await beto.getByRole('button', { name: 'Confirmar Pix' }).click();
await beto.getByRole('button', { name: 'Fechar' }).click();
await beto.getByRole('button', { name: 'Passar a vez' }).click();

// 3. Ana propõe: dá a Av. 9 de Julho + $ 500 e pede a Av. Brasil
await noToasts(beto);
await beto.evaluate(() => window.scrollTo(0, 0));
await front(ana);
await ana.getByText('É a sua vez').waitFor();
await noToasts(ana);
await ana.getByRole('tab', { name: /Banco/ }).click();
await ana.getByRole('button', { name: 'Negociar com Beto' }).click();
await ana.locator('.pick[data-pick="1"]').click();
await ana.getByLabel(/^Dinheiro \(saldo de você/).fill('500');
await ana.locator('.pick[data-pick="2"]').click();
await ana.getByTestId('trade-summary').waitFor();
console.log('Resumo da proposta:', norm(await ana.getByTestId('trade-summary').textContent()));
await shot(ana, 'negociacao-1-proposta.png');
await ana.getByRole('button', { name: 'Enviar proposta' }).click();
await ana.getByTestId('trade-outgoing').waitFor();

// 4. Beto recebe a proposta (notificação + cartão) e aceita
await front(beto);
const propToast = beto.locator('.toast', { hasText: 'Proposta de Ana' });
await propToast.waitFor({ timeout: 5000 });
await beto.getByTestId('trade-incoming').waitFor();
await beto.getByTestId('trade-incoming').scrollIntoViewIfNeeded();
await beto.waitForTimeout(400);
await shot(beto, 'negociacao-2-beto-recebe.png');
await beto.getByTestId('trade-incoming').getByRole('button', { name: 'Aceitar' }).click();
await beto.getByText('Negociação fechada', { exact: true }).first().waitFor();
await beto.locator('.sheet').getByText('Negociação fechada').waitFor();
await shot(beto, 'negociacao-3-comprovante-beto.png');
await beto.getByRole('button', { name: 'Fechar' }).click();

// 5. Ana vê a notificação e o comprovante
await front(ana);
const closedToast = ana.locator('.toast', { hasText: 'Negociação fechada com Beto' });
await closedToast.waitFor({ timeout: 5000 });
await ana.locator('.sheet').getByText('Negociação fechada').waitFor();
await ana.waitForTimeout(400);
await shot(ana, 'negociacao-4-ana-notificada.png');
await ana.getByRole('button', { name: 'Fechar' }).click();

// 6. Dono dos imóveis e saldos nos dois celulares
await ana.getByRole('tab', { name: /Jogada/ }).click();
await front(beto);
await beto.getByRole('tab', { name: /Jogada/ }).click();
const t = {
  anaCarteira: await wallet(ana),
  betoCarteira: await wallet(beto),
  anaVeBeto: await playerBal(ana, 'Beto'),
  betoVeAna: await playerBal(beto, 'Ana'),
  noveJulhoNaAna: await owner(ana, 1),
  noveJulhoNoBeto: await owner(beto, 1),
  brasilNaAna: await owner(ana, 2),
  brasilNoBeto: await owner(beto, 2),
};
console.log('Depois da negociação:', JSON.stringify(t));
expectEq(t.anaCarteira, '$ 23.500', 'carteira da Ana');
expectEq(t.betoVeAna, '$ 23.500', 'Ana no celular do Beto');
expectEq(t.betoCarteira, '$ 24.750', 'carteira do Beto');
expectEq(t.anaVeBeto, '$ 24.750', 'Beto no celular da Ana');
for (const k of ['noveJulhoNaAna', 'noveJulhoNoBeto']) expectEq(t[k], 'Beto', k);
for (const k of ['brasilNaAna', 'brasilNoBeto']) expectEq(t[k], 'Ana', k);

// 7. Ana pega $ 2.000 emprestado
await front(ana);
await ana.waitForTimeout(4700); // deixa as notificações sumirem
await ana.getByRole('tab', { name: /Banco/ }).click();
await ana.getByRole('button', { name: /Mais .* no empréstimo/ }).click();
await ana.getByRole('button', { name: /Mais .* no empréstimo/ }).click();
expectEq(norm(await ana.getByTestId('loan-amount').textContent()), '$ 2.000', 'valor do empréstimo');
await shot(ana, 'emprestimo-1-pedido.png');
await ana.getByRole('button', { name: /Pegar .* emprestado/ }).click();
await ana.getByText('Empréstimo liberado').waitFor();
await ana.waitForTimeout(400);
await shot(ana, 'emprestimo-2-liberado.png');
await ana.getByRole('button', { name: 'Fechar' }).click();
const l = {
  anaCarteira: await wallet(ana),
  divida: norm(await ana.getByTestId('wallet-debt').textContent()),
  deve: norm(await ana.getByTestId('loan-owed').textContent()),
};
console.log('Com o empréstimo:', JSON.stringify(l));
expectEq(l.anaCarteira, '$ 25.500', 'carteira com o empréstimo');
expectEq(l.divida, 'Dívida $ 2.200 · vence em 5 rodadas', 'dívida no cabeçalho');
expectEq(l.deve, '$ 2.200', 'valor devido');
await noToasts(ana);
await shot(ana, 'emprestimo-3-divida.png');

// 8. Ana quita (principal + juros)
await ana.getByRole('button', { name: /Quitar/ }).click();
await ana.getByRole('button', { name: 'Confirmar Pix' }).click();
await ana.locator('.sheet').getByText('Pagamento ao banco').waitFor();
await shot(ana, 'emprestimo-4-quitado.png');
await ana.getByRole('button', { name: 'Fechar' }).click();
await ana.getByRole('heading', { name: 'Pedir empréstimo' }).waitFor();
await front(beto);
await beto.waitForTimeout(300);
const q = {
  anaCarteira: await wallet(ana),
  betoVeAna: await playerBal(beto, 'Ana'),
  semDivida: (await ana.getByTestId('wallet-debt').count()) === 0,
};
console.log('Depois de quitar:', JSON.stringify(q));
expectEq(q.anaCarteira, '$ 23.300', 'carteira depois de quitar');
expectEq(q.betoVeAna, '$ 23.300', 'Ana no celular do Beto depois de quitar');
if (!q.semDivida) fail('a dívida continua no cabeçalho');

await browser.close();
console.log(process.exitCode ? 'Resultado: FALHOU' : 'Resultado: OK');
