// Teste de ponta a ponta da poupança, do seguro do imóvel, do financiamento na compra do terreno e das
// 3 duplas seguidas (detenção), no modo local (sem Supabase), com dois "celulares" (duas abas do mesmo contexto).
//
//   npm run build && npx next start -p 3400   # em outro terminal (sem as variáveis do Supabase)
//   PLAYWRIGHT=$(npm root -g)/playwright/index.mjs BASE_URL=http://localhost:3400 npm run e2e:poupanca
import path from 'node:path';

const pwPath = process.env.PLAYWRIGHT || 'playwright';
const { chromium } = await import(pwPath);
const BASE = process.env.BASE_URL || 'http://localhost:3400';
const OUT = path.resolve(import.meta.dirname, '../docs/screenshots');
const NOVE_JULHO = 1;
const FERIADO = 20;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR' });
const ana = await context.newPage();
const beto = await context.newPage();
const shot = (page, name, fullPage = false) => page.screenshot({ path: path.join(OUT, name), fullPage });
const norm = (t) => t.replace(/\s+/g, ' ').trim();
const num = (t) => Number(norm(t).replace(/[^\d-]/g, ''));
const text = async (loc) => norm(await loc.textContent());
const wallet = async (page) => num(await page.getByTestId('wallet-balance').textContent());
const front = (page) => page.bringToFront();
const brl = (n) => `$ ${n.toLocaleString('pt-BR')}`;
let failed = false;
const check = (cond, msg) => {
  if (!cond) {
    console.error('FALHOU:', msg);
    failed = true;
  }
};
/** Espera os avisos sumirem para a captura de tela ficar limpa. */
const calm = (page) => page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 15000 }).catch(() => {});
/** Fecha a edição do Jornal em tela cheia. */
async function closePaper(page) {
  const btn = page.getByRole('button', { name: 'Fechar o jornal' });
  await btn.waitFor();
  await btn.click();
  await btn.waitFor({ state: 'detached' });
}
const tab = (page, name) => page.getByRole('tab', { name: new RegExp(name) }).click();
const scrollTo = (page, testId) => page.evaluate((id) => document.querySelector(`[data-testid="${id}"]`).scrollIntoView({ block: 'start' }), testId);

// 1. Sala com Ana e Beto, Jornal e Bolsa ligados (o seguro cobre as manchetes)
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
await closePaper(ana);
await front(beto);
await closePaper(beto);

// 2. Poupança: Ana deposita $ 1.000 na sua vez
await front(ana);
await ana.getByText('É a sua vez').waitFor();
const start = await wallet(ana);
await tab(ana, 'Banco');
await ana.getByTestId('savings-card').waitFor();
check((await text(ana.getByTestId('savings-balance'))) === '$ 0', 'poupança começa vazia');
check((await text(ana.getByTestId('savings-deposit-amount'))) === '$ 1.000', 'depósito sugerido de $ 1.000');
await ana.getByTestId('savings-card').getByRole('button', { name: 'Depositar' }).click();
await ana.locator('.sheet').getByText('Depósito na poupança').first().waitFor();
await ana.getByRole('button', { name: 'Confirmar Pix' }).click();
await ana.getByRole('button', { name: 'Fechar' }).click();
check((await text(ana.getByTestId('savings-balance'))) === '$ 1.000', 'poupança com $ 1.000');
check((await wallet(ana)) === start - 1000, 'carteira sem os $ 1.000 depositados');
check((await text(ana.getByTestId('wallet-savings'))) === 'Poupança $ 1.000', 'poupança na carteira');
await calm(ana);
await scrollTo(ana, 'savings-card');
await shot(ana, 'poupanca-1-deposito.png');

// 3. Financiamento: Ana cai na Av. 9 de Julho e financia o terreno em 4x (entrada de 20% pelo Pix)
await tab(ana, 'Jogada');
await ana.locator(`[data-space="${NOVE_JULHO}"]`).click();
const lotPrice = num(await ana.getByTestId('lot-price').textContent());
const finBtn = ana.getByRole('button', { name: /^Financiar · entrada/ });
const entrada = num((await finBtn.textContent()).split('entrada')[1]);
console.log('Terreno:', brl(lotPrice), 'entrada:', brl(entrada));
check(entrada === Math.round((lotPrice * 0.2) / 10) * 10, 'entrada de 20% do preço');
await finBtn.click();
await ana.getByTestId('finance-chooser').waitFor();
check((await text(ana.getByTestId('finance-entrada'))) === brl(entrada), 'entrada no simulador');
await ana.locator('[data-testid="finance-sim"] .loan-sim-row[data-plan="x4"]').click();
await ana.getByTestId('finance-summary').waitFor();
const finSummary = await text(ana.getByTestId('finance-summary'));
console.log('Resumo:', finSummary);
check(finSummary.includes('4 parcelas semestrais, nas rodadas 4, 7, 10 e 13'), 'parcelas semestrais do financiamento');
await calm(ana);
await ana.evaluate(() => document.querySelector('[data-testid="finance-chooser"]').scrollIntoView({ block: 'start' }));
await shot(ana, 'financiamento-1-planos.png');
await ana.getByRole('button', { name: `Pagar entrada de ${brl(entrada)}` }).click();
await ana.locator('.sheet').getByText('Entrada do financiamento').waitFor();
const pixReason = await text(ana.locator('.sheet .lines'));
console.log('Pix:', pixReason);
check(pixReason.includes(`financia ${brl(lotPrice - entrada)}`), 'motivo do Pix com o valor financiado');
await shot(ana, 'financiamento-2-pix.png');
await ana.getByRole('button', { name: 'Confirmar Pix' }).click();
await ana.getByRole('button', { name: 'Fechar' }).click();
check((await wallet(ana)) === start - 1000 - entrada, 'carteira sem a entrada');
check((await ana.locator('.feed li', { hasText: 'comprou o terreno da Av. 9 de Julho financiado' }).count()) === 1, 'compra financiada no histórico');
await tab(ana, 'Banco');
await ana.getByTestId('financing-card').waitFor();
check((await text(ana.getByTestId(`fin-${NOVE_JULHO}`))).includes('Faltam 4 parcelas'), 'financiamento com 4 parcelas no Banco');
check((await ana.getByTestId('loan-card').getByRole('heading', { name: 'Pedir empréstimo' }).count()) === 1, 'o empréstimo continua livre');
await calm(ana);
await scrollTo(ana, 'financing-card');
await shot(ana, 'financiamento-3-banco.png');

// 4. Seguro: Ana contrata o seguro do terreno na aba Imóveis; o imóvel financiado não pode ser hipotecado
await tab(ana, 'Imóveis');
const insureBtn = ana.getByTestId(`insure-${NOVE_JULHO}`);
const premium = num((await insureBtn.textContent()).replace('Contratar seguro', ''));
console.log('Prêmio do seguro:', brl(premium));
check(premium === Math.round((lotPrice * 0.05) / 10) * 10, 'prêmio de 5% do valor');
check((await ana.getByRole('button', { name: /^Hipotecar/ }).count()) === 0, 'imóvel financiado sem hipoteca');
check((await text(ana.getByTestId(`financed-${NOVE_JULHO}`))) === 'Financiado · faltam 4 parcelas', 'selo do financiamento');
const beforeIns = await wallet(ana);
await insureBtn.click();
await ana.locator('.sheet').getByText('Contratar seguro').first().waitFor();
await ana.getByRole('button', { name: 'Confirmar Pix' }).click();
await ana.getByRole('button', { name: 'Fechar' }).click();
check((await wallet(ana)) === beforeIns - premium, 'carteira sem o prêmio');
const insured = await text(ana.getByTestId(`insured-${NOVE_JULHO}`));
console.log('Selo:', insured);
check(insured === 'Segurado até a rodada 10', 'selo do seguro');
check((await ana.getByTestId(`insure-${NOVE_JULHO}`).count()) === 0, 'seguro ativo não aparece de novo');
await calm(ana);
await shot(ana, 'seguro-1-imoveis.png');

// 5. Negociar: o terreno financiado aparece bloqueado (alienado ao banco)
await tab(ana, 'Banco');
await ana.getByRole('button', { name: 'Negociar com Beto' }).click();
const pick = ana.locator(`.pick[data-pick="${NOVE_JULHO}"]`);
const blockTxt = await text(pick);
console.log('Negociação:', blockTxt);
check(blockTxt.includes('alienado ao banco') && (await pick.isDisabled()), 'terreno financiado bloqueado na negociação');
await calm(ana);
await shot(ana, 'financiamento-4-negociacao.png');
await ana.getByRole('button', { name: 'Cancelar', exact: true }).click();

// 6. 3 duplas seguidas: Ana tira dupla duas vezes; na terceira, confirmação e detenção
await tab(ana, 'Jogada');
await ana.getByRole('button', { name: 'Tirei dupla: jogar de novo' }).click();
await ana.locator(`[data-space="${FERIADO}"]`).click();
const second = ana.getByTestId('double-btn');
check((await text(second)) === 'Tirei dupla (2ª seguida)', 'botão da 2ª dupla');
await calm(ana);
await ana.evaluate(() => document.querySelector('[data-testid="double-btn"]').scrollIntoView({ block: 'center' }));
await shot(ana, 'duplas-1-segunda.png');
await second.click();
await ana.locator(`[data-space="${FERIADO}"]`).click();
check((await text(ana.getByTestId('double-btn'))) === 'Tirei dupla (3ª seguida)', 'botão da 3ª dupla');
await ana.getByTestId('double-btn').click();
await ana.getByRole('heading', { name: '3ª dupla seguida' }).waitFor();
await calm(ana);
await shot(ana, 'duplas-2-confirmacao.png');
await ana.getByRole('button', { name: 'Tirei a 3ª dupla: ir para a detenção' }).click();
await ana.locator('.feed li', { hasText: 'Ana tirou 3 duplas seguidas e foi para a detenção' }).waitFor();
check((await text(ana.locator('.player[data-player="Ana"] .name'))) === 'Ana · detido', 'Ana detida');
check((await ana.getByText('Vez de').count()) > 0, 'a vez passou para o Beto');
await ana.evaluate(() => window.scrollTo(0, 0));
await calm(ana);
await shot(ana, 'duplas-3-detencao.png');
await front(beto);
await beto.locator('.toast', { hasText: 'Ana tirou 3 duplas seguidas' }).waitFor({ timeout: 8000 });
await beto.getByText('É a sua vez').waitFor();

// 7. Fora da vez, Ana resgata $ 100 da poupança
await front(ana);
await tab(ana, 'Banco');
const beforeOut = await wallet(ana);
check((await ana.getByTestId('savings-card').getByRole('button', { name: 'Depositar' }).count()) === 0, 'sem depósito fora da vez');
await ana.getByTestId('savings-card').getByRole('button', { name: 'Resgatar', exact: true }).click();
await ana.locator('.sheet').getByText('Resgate da poupança').first().waitFor();
await shot(ana, 'poupanca-2-resgate.png');
await ana.getByRole('button', { name: 'Fechar' }).click();
check((await wallet(ana)) === beforeOut + 100, 'resgate de $ 100 na carteira');
check((await text(ana.getByTestId('savings-balance'))) === '$ 900', 'poupança com $ 900');

// 8. Beto passa a vez: rodada 2, a poupança da Ana rende; a 1ª parcela do financiamento só vem na rodada 4 (semestre)
await front(beto);
await beto.locator(`[data-space="${FERIADO}"]`).click();
await beto.getByRole('button', { name: 'Passar a vez' }).click();
await closePaper(beto);
await front(ana);
await closePaper(ana);
await tab(ana, 'Jogada');
await ana.getByText('Você está na detenção').waitFor();
await tab(ana, 'Banco');
const saved = num(await ana.getByTestId('savings-balance').textContent());
console.log('Poupança depois de render:', brl(saved));
check(saved > 900 && saved % 10 === 0, 'poupança rendeu (múltiplo de $ 10)');
const finCard = await text(ana.getByTestId(`fin-${NOVE_JULHO}`));
check(finCard.includes('Faltam 4 parcelas'), 'nenhuma parcela cobrada na rodada 2');
check(finCard.includes('Próxima parcela (1/4)') && finCard.includes('na rodada 4 (início do 2º semestre do ano 1)'), `próxima parcela no cartão: ${finCard}`);
await calm(ana);
await scrollTo(ana, 'savings-card');
await shot(ana, 'poupanca-3-rendimento.png');
await tab(ana, 'Extrato');
await ana.getByRole('button', { name: 'Só os meus' }).click();
await ana.getByText('Rendimento da poupança').first().waitFor();
check((await ana.getByText('Parcela 1/4 do financiamento da Av. 9 de Julho').count()) === 0, 'nenhuma parcela no extrato antes do semestre');
await calm(ana);
await shot(ana, 'poupanca-4-extrato.png');
await tab(ana, 'Placar');
check((await text(ana.locator('.li[data-player="Ana"] .main'))).includes(`poupança ${brl(saved)}`), 'poupança no Placar');
await shot(ana, 'poupanca-5-placar.png');

await browser.close();
if (failed) process.exitCode = 1;
console.log(failed ? 'Resultado: FALHOU' : 'Resultado: OK');
