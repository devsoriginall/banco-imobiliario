// Teste de ponta a ponta da fase 2 (terreno na compra e três padrões de casa na construção, IR a cada volta, score de crédito e juros por rodada),
// no modo local (sem Supabase), com dois "celulares" (duas abas do mesmo contexto do navegador).
//
//   npm run build && npm start   # em outro terminal (sem as variáveis do Supabase)
//   PLAYWRIGHT=$(npm root -g)/playwright/index.mjs BASE_URL=http://localhost:3000 node scripts/e2e-casas-ir-credito.mjs
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
const text = async (loc) => norm(await loc.textContent());
const wallet = (page) => text(page.getByTestId('wallet-balance'));
// a tela inicial só mostra o próprio saldo; o dos outros fica no Placar
const playerBal = async (page, name) => {
  await page.getByRole('tab', { name: /Placar/ }).click();
  const v = await text(page.locator(`.li[data-player="${name}"] .cash`));
  await page.getByRole('tab', { name: /Jogada/ }).click();
  return v;
};
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
// regras clássicas (sem Jornal e Bolsa): os valores esperados abaixo não mudam com as manchetes
await ana.getByRole('checkbox', { name: /Jornal e Bolsa/ }).click();
await ana.waitForFunction(() => !document.querySelector('.toggle-row input').checked);
await ana.getByRole('button', { name: 'Começar partida' }).click();
await ana.getByText('É a sua vez').waitFor();

// 1. Ana cai na Av. 9 de Julho: terreno à venda, um preço só (o do tabuleiro), sem escolher casa
await ana.locator('[data-space="1"]').click();
await ana.getByTestId('lot-offer').waitFor();
const lotPrice = await text(ana.getByTestId('lot-price'));
console.log('Terreno à venda:', lotPrice);
expectEq(lotPrice, '$ 1.000', 'preço do terreno');
expectEq(await ana.locator('.tiers').count(), 0, 'opções de casa na compra');
await noToasts(ana);
await ana.evaluate(() => document.querySelector('[data-testid="lot-offer"]').scrollIntoView({ block: 'center' }));
await ana.waitForTimeout(200);
await shot(ana, 'casas-1-terreno.png');

// 2. Compra o terreno
await ana.getByRole('button', { name: /Comprar terreno por \$\s1\.000/ }).click();
await ana.getByRole('button', { name: 'Confirmar Pix' }).click();
await ana.getByText('Transação efetuada').waitFor();
await shot(ana, 'casas-2-comprovante.png');
await ana.getByRole('button', { name: 'Fechar' }).click();
expectEq(await wallet(ana), '$ 24.000', 'carteira da Ana depois da compra');
await ana.getByRole('button', { name: 'Passar a vez' }).click();

// 3. Beto cai na 9 de Julho e paga o aluguel do terreno ($ 60, o "sem casa" do tabuleiro)
await front(beto);
await beto.getByText('É a sua vez').waitFor();
await noToasts(beto);
await beto.locator('[data-space="1"]').click();
const lotRent = await text(beto.getByTestId('rent-due'));
console.log('Aluguel do terreno para o Beto:', lotRent);
expectEq(lotRent, '$ 60', 'aluguel do terreno');
await beto.getByRole('button', { name: 'Pagar com Pix' }).click();
await beto.getByRole('button', { name: 'Confirmar Pix' }).click();
await beto.getByText('Transação efetuada').waitFor();
await beto.getByRole('button', { name: 'Fechar' }).click();
await beto.getByRole('button', { name: 'Passar a vez' }).click();

const r = { anaCarteira: await wallet(ana), betoCarteira: await wallet(beto), betoVeAna: await playerBal(beto, 'Ana') };
console.log('Depois do aluguel:', JSON.stringify(r));
expectEq(r.anaCarteira, '$ 24.060', 'carteira da Ana');
expectEq(r.betoVeAna, '$ 24.060', 'Ana no celular do Beto');
expectEq(r.betoCarteira, '$ 24.940', 'carteira do Beto');

// 4. Imóveis da Ana mostram o terreno, sem casa
await front(ana);
await ana.getByText('É a sua vez').waitFor();
await noToasts(ana);
await ana.getByRole('tab', { name: /Imóveis/ }).click();
expectEq(await text(ana.getByTestId('tier-1')), 'Terreno', 'terreno em Imóveis');
await ana.getByRole('tab', { name: /Jogada/ }).click();

// 5. IR: cenário de um ano com mais renda (como se a Ana tivesse recebido mais $ 6.000 de aluguéis no ano).
// Grava direto na sala do modo local e avisa as abas, como faria outro celular.
await ana.evaluate((code) => {
  const k = `bi-room:${code}`;
  const snap = JSON.parse(localStorage.getItem(k));
  const p = snap.state.players.find((x) => x.name === 'Ana');
  p.income = (p.income || 0) + 6000;
  snap.version += 1;
  localStorage.setItem(k, JSON.stringify(snap));
  new BroadcastChannel('banco-imobiliario-rooms').postMessage({ code });
}, code);
await ana.getByTestId('wallet-income').filter({ hasText: '6.060' }).waitFor();
// Ana completa a volta parando no Início: renda de $ 6.060, isenção de $ 2.000, IR de 15% = $ 609
await ana.locator('[data-space="0"]').click();
await ana.getByRole('dialog', { name: 'Declaração do IR' }).waitFor();
const tax = await text(ana.getByTestId('ir-tax'));
console.log('IR do ano 1:', tax);
expectEq(tax, '$ 609', 'imposto do ano');
await noToasts(ana);
await shot(ana, 'ir-1-declaracao.png');
await ana.getByRole('button', { name: /Declarar e pagar/ }).click();
await ana.getByRole('button', { name: 'Confirmar Pix' }).click();
await ana.locator('.sheet').getByText('Imposto de renda pago').waitFor();
await shot(ana, 'ir-2-comprovante.png');
await ana.getByRole('button', { name: 'Fechar' }).click();
const ir = { anaCarteira: await wallet(ana), renda: await text(ana.getByTestId('wallet-income')) };
console.log('Depois do IR:', JSON.stringify(ir));
expectEq(ir.anaCarteira, '$ 25.451', 'carteira depois do pró-labore e do IR'); // 24.060 + 2.000 − 609
expectEq(ir.renda, 'Renda no ano 2: $ 0', 'renda do novo ano');

// 6. Ana tira dupla e cai no próprio terreno: o site da imobiliária oferece a primeira casa em 3 padrões
await ana.getByRole('button', { name: 'Tirei dupla: jogar de novo' }).click();
await ana.locator('[data-space="1"]').click();
const offer = ana.getByTestId('build-offer');
await offer.waitFor();
await ana.locator('.tiers').waitFor();
const prices = {
  basica: await text(ana.getByTestId('tier-price-basica')),
  intermediaria: await text(ana.getByTestId('tier-price-intermediaria')),
  alto: await text(ana.getByTestId('tier-price-alto')),
};
console.log('Primeira casa (custo de construção $ 500 × padrão):', JSON.stringify(prices));
expectEq(prices.basica, '$ 400', 'casa Básica');
expectEq(prices.intermediaria, '$ 500', 'casa Intermediária');
expectEq(prices.alto, '$ 650', 'casa Alto padrão');
await ana.locator('.tier[data-tier="alto"]').click();
await noToasts(ana);
await ana.evaluate(() => document.querySelector('[data-testid="build-offer"]').scrollIntoView({ block: 'start' }));
await ana.waitForTimeout(200);
await shot(ana, 'casas-5-site-imobiliaria.png');
// cada opção abre o anúncio em tela cheia (foto real do padrão, ficha, bairro, aluguel e o botão de construir)
await ana.getByRole('button', { name: 'Ver anúncio da casa Básica' }).click();
const sheet = ana.getByTestId('house-sheet');
await sheet.waitFor();
await sheet.getByTestId('hs-img').waitFor();
await ana.waitForFunction(() => [...document.querySelectorAll('[data-testid="hs-img"]')].every((i) => i.complete && i.naturalWidth > 0));
expectEq(await text(sheet.getByTestId('hs-tier')), 'Casa Básica', 'selo do anúncio');
expectEq(await text(sheet.getByTestId('hs-price')), '$ 400', 'preço no anúncio');
await shot(ana, 'casas-7-anuncio-basica.png');
await sheet.getByRole('button', { name: 'Fechar anúncio' }).click();
await ana.getByRole('button', { name: 'Ver anúncio da casa Alto padrão' }).click();
await sheet.getByTestId('hs-img').waitFor();
await ana.waitForFunction(() => [...document.querySelectorAll('[data-testid="hs-img"]')].every((i) => i.complete && i.naturalWidth > 0));
const ad = { tier: await text(sheet.getByTestId('hs-tier')), price: await text(sheet.getByTestId('hs-price')), rents: await text(sheet.getByTestId('hs-rents')) };
console.log('Anúncio Alto padrão:', JSON.stringify(ad));
expectEq(ad.price, '$ 650', 'preço do Alto padrão no anúncio');
if (!ad.rents.includes('1 casa$ 420')) fail('aluguel com 1 casa no anúncio');
await shot(ana, 'casas-8-anuncio-alto.png');
await sheet.getByRole('button', { name: /Construir casa Alto padrão · \$\s650/ }).click();
await ana.getByRole('button', { name: 'Confirmar Pix' }).click();
await ana.getByText('Transação efetuada').waitFor();
const receiptTier = await text(ana.getByTestId('receipt-tier'));
console.log('Comprovante:', receiptTier);
if (!receiptTier.startsWith('Alto padrão · ')) fail('casa no comprovante');
await shot(ana, 'casas-6-comprovante-casa.png');
await ana.getByRole('button', { name: 'Fechar' }).click();
const built = { why: await text(ana.getByTestId('build-why')), carteira: await wallet(ana) };
console.log('Depois de construir:', JSON.stringify(built));
expectEq(built.why, 'Sem construir agora: você já construiu nesta rodada.', 'motivo depois de construir');
expectEq(built.carteira, '$ 24.801', 'carteira depois de construir');
if (!(await ana.getByTestId('rent-table').textContent()).includes('1 casa · atual')) fail('aluguel atual com 1 casa');
await ana.getByRole('tab', { name: /Imóveis/ }).click();
expectEq(await ana.getByRole('button', { name: /^(Casa|Hotel) \$/ }).count(), 0, 'botão de construir em Imóveis');
expectEq(await text(ana.getByTestId('build-hint-1')), 'Para construir, caia no imóvel', 'dica em Imóveis');
expectEq(await text(ana.getByTestId('tier-1')), 'Casa Alto padrão', 'casa em Imóveis');
await shot(ana, 'casas-4-imoveis.png');

await ana.getByRole('tab', { name: /Extrato/ }).click();
await ana.getByTestId('income-box').waitFor();
await shot(ana, 'ir-3-extrato.png');

// 7. Banco: taxa da rodada e score (500 + 20 por declarar o IR)
await ana.getByRole('tab', { name: /Banco/ }).click();
const bank = {
  taxa: await text(ana.getByTestId('bank-rate')),
  score: await text(ana.getByTestId('credit-score')),
  faixa: await text(ana.getByTestId('credit-band')),
  sua: await text(ana.getByTestId('my-rate')),
};
console.log('Banco:', JSON.stringify(bank));
if (!/^Taxa do banco nesta rodada: (5|8|10|12|15|20)%$/.test(bank.taxa)) fail(`taxa da rodada: ${bank.taxa}`);
expectEq(bank.score, '520', 'score depois de declarar');
expectEq(bank.faixa, 'Regular', 'faixa do score');
expectEq(bank.sua, bank.taxa.split(': ')[1], 'taxa do empréstimo com score Regular');
await noToasts(ana);
await ana.getByTestId('bank-rate-card').scrollIntoViewIfNeeded();
await ana.evaluate(() => document.querySelector('[data-testid="bank-rate-card"]').scrollIntoView({ block: 'start' }));
await shot(ana, 'credito-1-banco.png');
await ana.getByTestId('loan-card').scrollIntoViewIfNeeded();
await ana.waitForTimeout(200);
await shot(ana, 'credito-2-emprestimo.png');

// 8. Ana passa a vez; Beto cai na 9 de Julho e paga o aluguel da casa Alto padrão (300 × 140% = $ 420)
await ana.getByRole('tab', { name: /Jogada/ }).click();
await ana.getByRole('button', { name: 'Passar a vez' }).click();
await front(beto);
await beto.getByText('É a sua vez').waitFor();
await noToasts(beto);
await beto.locator('[data-space="1"]').click();
const rent = await text(beto.getByTestId('rent-due'));
console.log('Aluguel da casa para o Beto:', rent);
expectEq(rent, '$ 420', 'aluguel com 1 casa Alto padrão');
await beto.evaluate(() => document.querySelector('[data-testid="house-owned"]').scrollIntoView({ block: 'start' }));
await beto.waitForTimeout(200);
await shot(beto, 'casas-3-aluguel.png');
// o cartão da casa abre o mesmo anúncio
await beto.getByTestId('house-owned').click();
await beto.getByTestId('house-sheet').waitFor();
expectEq(await text(beto.getByTestId('hs-tier')), 'Casa Alto padrão', 'anúncio pelo cartão da casa');
await beto.getByTestId('house-sheet').getByRole('button', { name: 'Fechar', exact: true }).click();
await beto.getByRole('button', { name: 'Pagar com Pix' }).click();
await beto.getByRole('button', { name: 'Confirmar Pix' }).click();
await beto.getByText('Transação efetuada').waitFor();
await beto.getByRole('button', { name: 'Fechar' }).click();
expectEq(await playerBal(beto, 'Ana'), '$ 25.221', 'Ana depois do aluguel da casa');

// 9. Placar no celular do Beto mostra o score de cada um
await front(beto);
await noToasts(beto);
await beto.getByRole('tab', { name: /Placar/ }).click();
const pills = await beto.locator('.credit-pill').allTextContents();
console.log('Placar:', JSON.stringify(pills.map(norm)));
if (!pills.map(norm).includes('Score 520 · Regular')) fail('score da Ana no placar');
await shot(beto, 'credito-3-placar.png');

await browser.close();
console.log(process.exitCode ? 'Resultado: FALHOU' : 'Resultado: OK');
