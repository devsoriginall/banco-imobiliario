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
// a tela inicial só mostra o próprio saldo; o dos outros fica no Placar
const playerBal = async (page, name) => {
  await page.getByRole('tab', { name: /Placar/ }).click();
  const v = await norm(await page.locator(`.li[data-player="${name}"] .cash`).textContent());
  await page.getByRole('tab', { name: /Jogada/ }).click();
  return v;
};
// dono no tabuleiro (na vez do próprio jogador, o tabuleiro fica atrás do "Corrigir casa")
const owner = async (page, idx) => {
  const sp = page.locator(`[data-space="${idx}"]`);
  if (!(await sp.count())) await page.getByTestId('manual-move').click();
  return (await sp.getAttribute('aria-label')).split(' · ')[1] || 'ninguém';
};
const front = (page) => page.bringToFront();
/**
 * Anda com o peão do jogador da vez até a casa `idx`: digita a soma dos dados quando a casa está de 2 a 12 casas
 * à frente (com `dupla`, só soma par); senão usa o "Corrigir casa / mover manualmente".
 */
async function irPara(page, idx, { dupla = false } = {}) {
  const pos = Number(await page.getByTestId('turn').getAttribute('data-pos'));
  const d = (idx - pos + 40) % 40;
  if (d >= 2 && d <= 12 && (!dupla || d % 2 === 0)) {
    await page.locator(`.sum[data-sum="${d}"]`).click();
    if (dupla) await page.getByTestId('double-toggle').click();
    await page.getByTestId('roll-btn').click();
  } else {
    await page.getByTestId('manual-move').click();
    await page.locator(`[data-space="${idx}"]`).click();
  }
  await page.getByTestId('landed').waitFor();
}
const noToasts = (page) => page.waitForFunction(() => document.querySelectorAll('.toast').length === 0, null, { timeout: 10000 });
const fail = (msg) => {
  console.error('FALHOU:', msg);
  process.exitCode = 1;
};
const brl = (n) => `$ ${n.toLocaleString('pt-BR')}`;
const expect = (cond, what) => {
  if (!cond) fail(what);
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
// regras clássicas (sem Jornal e Bolsa): os valores esperados abaixo não mudam com as manchetes
await ana.getByRole('checkbox', { name: /Jornal e Bolsa/ }).click();
await ana.waitForFunction(() => !document.querySelector('.toggle-row input').checked);
await ana.getByRole('button', { name: 'Começar partida' }).click();
await ana.getByText('É a sua vez').waitFor();

// 1. Ana compra a Av. 9 de Julho ($ 1.000)
await irPara(ana, 1);
await ana.getByRole('button', { name: /Comprar .*por/ }).click();
await ana.getByRole('button', { name: 'Confirmar Pix' }).click();
await ana.getByRole('button', { name: 'Fechar' }).click();
await ana.getByRole('button', { name: 'Passar a vez' }).click();

// 2. Beto compra a Av. Brasil ($ 750)
await front(beto);
await beto.getByText('É a sua vez').waitFor();
await irPara(beto, 2);
await beto.getByRole('button', { name: /Comprar .*por/ }).click();
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

// Regra da casa: em Imóveis não se constrói (só caindo no imóvel, na tela da Jogada)
await front(ana);
await ana.getByRole('tab', { name: /Imóveis/ }).click();
const hint = norm(await ana.getByTestId('build-hint-2').textContent());
console.log('Construção na Av. Brasil:', hint);
expectEq(hint, 'Para construir, caia no imóvel', 'dica de construção em Imóveis');
expectEq(await ana.getByRole('button', { name: /^(Casa|Hotel) \$/ }).count(), 0, 'botão de construir em Imóveis');

// 7. Ana pede $ 2.000, vê a simulação dos 5 planos e pega em 4x
await front(ana);
await ana.waitForTimeout(4700); // deixa as notificações sumirem
await ana.getByRole('tab', { name: /Banco/ }).click();
await ana.getByRole('button', { name: /Mais .* no empréstimo/ }).click();
await ana.getByRole('button', { name: /Mais .* no empréstimo/ }).click();
expectEq(norm(await ana.getByTestId('loan-amount').textContent()), '$ 2.000', 'valor do empréstimo');
const parse = (t) => Number(t.replace(/[^\d,]/g, '').replace(',', '.'));
// a taxa da rodada é sorteada e ajustada pelo score: confere a simulação com a "sua taxa" (2x) + adicional de cada plano
const baseRate = parse(norm(await ana.getByTestId('my-rate').textContent())) / 100;
const sim = await ana.locator('.loan-sim-row').evaluateAll((rows) => rows.map((r) => ({ plan: r.dataset.plan, cells: [...r.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim()) })));
console.log('Simulação:', JSON.stringify(sim));
expectEq(sim.map((r) => r.plan).join(','), 'x2,x3,x4,x5,unico', 'planos da simulação');
const addOn = { x2: 0, x3: 0.02, x4: 0.04, x5: 0.06, unico: 0.08 };
const parcelsOf = (total, k) => {
  const b = Math.round(total / k / 10) * 10;
  return [...Array(k - 1).fill(b), total - b * (k - 1)];
};
for (const r of sim) {
  const rate = Math.max(0.02, Math.round((baseRate + addOn[r.plan]) * 10000) / 10000);
  const total = 2000 + Math.round(2000 * rate);
  expectEq(r.cells[1], `${Math.round(rate * 1000) / 10}%`.replace('.', ','), `taxa do plano ${r.plan}`);
  expectEq(r.cells[3], brl(total), `total do plano ${r.plan}`);
  if (r.plan !== 'unico') expect(r.cells[2].startsWith(brl(parcelsOf(total, Number(r.plan[1]))[0])), `parcela do plano ${r.plan}: ${r.cells[2]}`);
}
const rate4 = Math.max(0.02, Math.round((baseRate + 0.04) * 10000) / 10000);
const total = 2000 + Math.round(2000 * rate4);
const parcels = parcelsOf(total, 4);
console.log('4x:', `${rate4 * 100}%`, 'total', brl(total), 'parcelas', parcels.map(brl).join(' + '));
await ana.locator('.loan-sim-row[data-plan="x4"]').click();
await ana.evaluate(() => document.querySelector('[data-testid="loan-sim"]').scrollIntoView({ block: 'center' }));
await ana.waitForTimeout(200);
await shot(ana, 'parcelas-1-simulacao.png');
// calendário: 1 parcela por semestre (rodadas 1, 4, 7…), a 1ª no primeiro início de semestre ≥ 2 rodadas depois de pegar
const roundNow = async (page) => Number(norm(await page.locator('.top .meta').first().textContent()).match(/Rodada (\d+)/)[1]);
const semStart = (r) => Math.ceil((r - 1) / 3) * 3 + 1;
const takenRound = await roundNow(ana);
const first = semStart(takenRound + 2);
console.log('Empréstimo na rodada', takenRound, '· 1ª parcela na rodada', first);
const summary = norm(await ana.getByTestId('loan-plan-summary').textContent());
expect(summary.includes(`4 parcelas semestrais, nas rodadas ${first}, ${first + 3}, ${first + 6} e ${first + 9}`), `resumo do plano 4x: ${summary}`);
await ana.evaluate(() => window.scrollBy(0, document.querySelector('[data-testid="loan-sim"]').getBoundingClientRect().top - 70));
await ana.waitForTimeout(200);
await shot(ana, 'parcelas-semestre-1-planos.png');
await ana.getByRole('button', { name: 'Pegar $ 2.000 em 4x' }).click();
await ana.getByText('Empréstimo liberado').waitFor();
await ana.waitForTimeout(400);
await shot(ana, 'parcelas-2-liberado.png');
await ana.getByRole('button', { name: 'Fechar' }).click();
const l = {
  anaCarteira: await wallet(ana),
  parcela: norm(await ana.getByTestId('wallet-debt').textContent()),
  deve: norm(await ana.getByTestId('loan-owed').textContent()),
  progresso: norm(await ana.getByTestId('loan-progress').textContent()),
};
console.log('Com o empréstimo:', JSON.stringify(l));
expectEq(l.anaCarteira, '$ 25.500', 'carteira com o empréstimo');
expectEq(l.parcela, first === takenRound + 1 ? `Parcela ${brl(parcels[0])} na próxima vez` : `Parcela ${brl(parcels[0])} na rodada ${first}`, 'parcela no cabeçalho');
expectEq(l.deve, brl(total), 'saldo devedor');
expectEq(l.progresso, '0 de 4 pagas', 'parcelas pagas');
await noToasts(ana);
await ana.evaluate(() => document.querySelector('[data-testid="loan-card"]').scrollIntoView({ block: 'start' }));
await shot(ana, 'parcelas-3-cartao.png');

// 8. Passa a vez (Ana e Beto param no Feriado) até a parcela 1/4 ser cobrada no início da vez da Ana, na rodada `first`
const passTurn = async (page) => {
  await page.getByRole('tab', { name: /Jogada/ }).click();
  await irPara(page, 20);
  await page.getByRole('button', { name: 'Passar a vez' }).click();
};
for (let r = takenRound; r < first; r++) {
  await front(ana);
  await ana.getByRole('tab', { name: /Jogada/ }).click();
  await ana.getByText('É a sua vez').waitFor();
  await noToasts(ana);
  if (r > takenRound) expectEq(await wallet(ana), '$ 25.500', `nada cobrado na rodada ${r}`);
  await passTurn(ana);
  await front(beto);
  await beto.getByText('É a sua vez').waitFor();
  await noToasts(beto);
  if (r < first - 1) await passTurn(beto);
}
expectEq(norm(await beto.getByTestId('turn').textContent()).includes('É a sua vez'), true, 'vez do Beto antes da cobrança');
await passTurn(beto);
const parcelToast = `Parcela 1/4 do empréstimo de Ana: ${brl(parcels[0])}`;
await beto.locator('.toast', { hasText: 'Parcela 1/4' }).waitFor({ timeout: 5000 });
expectEq(norm(await beto.locator('.toast', { hasText: 'Parcela 1/4' }).first().textContent()).includes(parcelToast), true, 'aviso da parcela no Beto');
await front(ana);
const anaToast = ana.locator('.toast', { hasText: 'Parcela 1/4' });
await anaToast.waitFor({ timeout: 5000 });
expectEq(norm(await anaToast.first().textContent()).includes(parcelToast), true, 'aviso da parcela na Ana');
await ana.getByText('É a sua vez').waitFor();
await ana.waitForTimeout(800); // espera a animação das notificações
await shot(ana, 'parcelas-4-parcela-cobrada.png');
const c = {
  anaCarteira: await wallet(ana),
  betoVeAna: await playerBal(beto, 'Ana'),
  parcela: norm(await ana.getByTestId('wallet-debt').textContent()),
  feed: (await ana.locator('.feed li').allTextContents()).map(norm).some((x) => x.includes(parcelToast)),
};
console.log('Depois da parcela 1:', JSON.stringify(c));
expectEq(c.anaCarteira, brl(25500 - parcels[0]), 'carteira depois da parcela');
expectEq(c.betoVeAna, brl(25500 - parcels[0]), 'Ana no celular do Beto depois da parcela');
expectEq(c.parcela, `Parcela ${brl(parcels[1])} na rodada ${first + 3}`, 'próxima parcela no cabeçalho');
if (!c.feed) fail('parcela no histórico da mesa');
await noToasts(ana);
await ana.getByRole('tab', { name: /Extrato/ }).click();
await ana.getByText('Parcela 1/4 do empréstimo').first().waitFor();
await shot(ana, 'parcelas-5-extrato.png');

// 9. Ana quita o saldo restante (sem desconto de juros)
await ana.getByRole('tab', { name: /Banco/ }).click();
const left = total - parcels[0];
expectEq(norm(await ana.getByTestId('loan-owed').textContent()), brl(left), 'saldo devedor depois da parcela');
expectEq(norm(await ana.getByTestId('loan-progress').textContent()), '1 de 4 pagas', 'parcelas pagas depois da cobrança');
await ana.evaluate(() => document.querySelector('[data-testid="loan-card"]').scrollIntoView({ block: 'start' }));
await shot(ana, 'parcelas-6-uma-paga.png');
await ana.getByRole('button', { name: `Quitar ${brl(left)}` }).click();
await ana.getByRole('button', { name: 'Confirmar Pix' }).click();
await ana.locator('.sheet').getByText('Pagamento ao banco').waitFor();
await shot(ana, 'parcelas-7-quitado.png');
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
expectEq(q.anaCarteira, brl(25500 - total), 'carteira depois de quitar');
expectEq(q.betoVeAna, brl(25500 - total), 'Ana no celular do Beto depois de quitar');
if (!q.semDivida) fail('a dívida continua no cabeçalho');

await browser.close();
console.log(process.exitCode ? 'Resultado: FALHOU' : 'Resultado: OK');
