// Teste de ponta a ponta do Jornal da Cidade e da Bolsa no modo local (sem Supabase), com dois "celulares"
// (duas abas do mesmo contexto). Ana compra uma cota da Vox Telecom ao cair na casa, a rodada passa, sai a
// edição 2 do Jornal (sem dividendos: eles são semestrais), a sala pula para o início do 2º semestre (rodada 4),
// Ana recebe os dividendos do semestre e vende a cota de volta à empresa na Bolsa.
//
//   npm run build && npx next start -p 3100   # em outro terminal (sem as variáveis do Supabase)
//   PLAYWRIGHT=$(npm root -g)/playwright/index.mjs BASE_URL=http://localhost:3100 npm run e2e:mercado
import path from 'node:path';

const pwPath = process.env.PLAYWRIGHT || 'playwright';
const { chromium } = await import(pwPath);
const BASE = process.env.BASE_URL || 'http://localhost:3100';
const OUT = path.resolve(import.meta.dirname, '../docs/screenshots');
const VOX = 29;
const FERIADO = 20;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'pt-BR' });
const ana = await context.newPage();
const beto = await context.newPage();
const shot = (page, name, fullPage = false) => page.screenshot({ path: path.join(OUT, name), fullPage });
const norm = (t) => t.replace(/\s+/g, ' ').trim();
const num = (t) => Number(norm(t).replace(/[^\d-]/g, ''));
const wallet = async (page) => num(await page.getByTestId('wallet-balance').textContent());
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
let failed = false;
const check = (cond, msg) => {
  if (!cond) {
    console.error('FALHOU:', msg);
    failed = true;
  }
};
/** Espera os avisos sumirem para a captura de tela ficar limpa. */
async function calm(page) {
  await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 15000 }).catch(() => {});
}
/** Fecha a edição do Jornal em tela cheia, se estiver aberta. */
async function closePaper(page) {
  const btn = page.getByRole('button', { name: 'Fechar o jornal' });
  await btn.waitFor();
  await btn.click();
  await btn.waitFor({ state: 'detached' });
}

// 1. Ana cria a sala, Beto entra, Ana começa (Jornal e Bolsa ligados por padrão)
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
check(await ana.getByRole('checkbox', { name: /Jornal e Bolsa/ }).isChecked(), 'Jornal e Bolsa ligados por padrão');
await ana.getByRole('button', { name: 'Começar partida' }).click();

// 2. Edição 1 em tela cheia para os dois
await ana.getByText('Edição nº 1').waitFor();
await calm(ana);
await shot(ana, 'jornal-1-edicao.png');
const head1 = norm(await ana.locator('.paper-head').first().textContent());
console.log('Edição 1:', head1);
await closePaper(ana);
await front(beto);
await beto.getByText('Edição nº 1').waitFor();
check(norm(await beto.locator('.paper-head').first().textContent()) === head1, 'Beto vê a mesma manchete');
await closePaper(beto);

// 3. Ana cai na Vox Telecom e compra 1 cota pela cotação
await front(ana);
await ana.getByText('É a sua vez').waitFor();
const start = await wallet(ana);
await irPara(ana, VOX);
const buyBtn = ana.getByRole('button', { name: /Comprar 1 cota por/ });
await buyBtn.waitFor();
const price1 = num((await buyBtn.textContent()).split('por')[1]);
await calm(ana);
await shot(ana, 'bolsa-1-compra-na-casa.png');
await buyBtn.click();
await ana.getByRole('button', { name: 'Confirmar Pix' }).click();
await ana.getByText('Transação efetuada').waitFor();
await ana.getByRole('button', { name: 'Fechar' }).click();
check((await wallet(ana)) === start - price1, `cota comprada por ${price1}`);
await ana.getByRole('button', { name: 'Passar a vez' }).click();

// 4. Beto passa a vez: começa a rodada 2 e sai a edição 2, sem dividendos (pagos só no início do semestre)
await front(beto);
await beto.getByText('É a sua vez').waitFor();
await irPara(beto, FERIADO);
await beto.getByRole('button', { name: 'Passar a vez' }).click();
await beto.getByText('Edição nº 2').waitFor();
await closePaper(beto);
await front(ana);
await ana.getByText('Edição nº 2').waitFor();
await calm(ana);
await shot(ana, 'jornal-2-nova-rodada.png');
await closePaper(ana);
check((await wallet(ana)) === start - price1, 'sem dividendos na rodada 2');
await ana.getByRole('tab', { name: /Mercado/ }).click();
await ana.getByRole('radio', { name: 'Bolsa' }).click();
const bolsaTxt = norm(await ana.getByTestId('stock-list').locator('xpath=..').textContent());
check(bolsaTxt.includes('Dividendos pagos a cada semestre (rodadas 4, 7, 10…)') && bolsaTxt.includes('o próximo é na rodada 4'), 'texto dos dividendos semestrais');
check(norm(await ana.locator(`[data-stock="${VOX}"]`).textContent()).includes('/cota na rodada 4'), 'próximo dividendo na lista');
await ana.getByRole('tab', { name: /Jogada/ }).click();
// Ana cai de novo na própria empresa (sem passar pelo Início) e passa a vez
await irPara(ana, VOX);
await ana.getByRole('button', { name: 'Passar a vez' }).click();
// a sala pula para o fim da rodada 3 (como se as rodadas 2 e 3 tivessem passado sem novidade): grava direto na sala do
// modo local e avisa as abas, como faria outro celular
await front(beto);
await beto.getByText('É a sua vez').waitFor();
await beto.evaluate((code) => {
  const k = `bi-room:${code}`;
  const snap = JSON.parse(localStorage.getItem(k));
  snap.state.round = 3;
  snap.state.prev = null;
  snap.version += 1;
  localStorage.setItem(k, JSON.stringify(snap));
  new BroadcastChannel('banco-imobiliario-rooms').postMessage({ code });
}, code);
await beto.getByText('Rodada 3', { exact: false }).first().waitFor();
await irPara(beto, FERIADO);
await beto.getByRole('button', { name: 'Passar a vez' }).click();
await beto.getByText('Edição nº 4').waitFor();
await closePaper(beto);
// 5. Rodada 4 (início do 2º semestre): Ana recebe os dividendos do semestre (9% da cotação por cota)
await front(ana);
await ana.getByText('Edição nº 4').waitFor();
const effect4 = norm(await ana.locator('.paper-effect').first().textContent());
const divToast = ana.locator('.toast', { hasText: 'Dividendos' });
await divToast.waitFor();
const divText = norm(await divToast.textContent());
console.log('Toast:', divText);
await ana.waitForTimeout(300);
await shot(ana, 'bolsa-0-aviso-dividendos.png');
await calm(ana);
await closePaper(ana);
const afterDiv = await wallet(ana);
const div = afterDiv - (start - price1);
check(div > 0 && divText.includes(`$ ${div}`) && divText.includes('Vox Telecom'), `dividendo de ${div} na carteira e no aviso`);

// 6. Aba Mercado: histórico do Jornal e a Bolsa
await ana.getByRole('tab', { name: /Mercado/ }).click();
await ana.getByRole('radio', { name: 'Jornal' }).click();
await ana.getByTestId('jornal-edition').waitFor();
await ana.waitForTimeout(200);
await calm(ana);
await ana.getByTestId('jornal-edition').scrollIntoViewIfNeeded();
await shot(ana, 'jornal-3-edicoes.png');
check((await ana.getByTestId('jornal-history').locator('.li').count()) === 2, 'duas edições anteriores no histórico');
await ana.getByRole('radio', { name: 'Bolsa' }).click();
await ana.getByTestId('stock-list').waitFor();
await ana.waitForTimeout(200);
await ana.locator('.seg').scrollIntoViewIfNeeded();
await ana.evaluate(() => window.scrollBy(0, document.querySelector('.seg').getBoundingClientRect().top - 12));
await shot(ana, 'bolsa-2-lista.png');
await ana.locator(`[data-stock="${VOX}"]`).click();
await ana.getByTestId('stock-detail').waitFor();
await ana.waitForTimeout(200);
await ana.evaluate(() => window.scrollBy(0, document.querySelector('.back-btn').getBoundingClientRect().top - 12));
await shot(ana, 'bolsa-3-empresa.png');
await ana.getByTestId('sell-card').scrollIntoViewIfNeeded();
await shot(ana, 'bolsa-4-vender.png');

// 7. Ana vende a cota de volta à empresa pela cotação de agora
const sellBtn = ana.getByRole('button', { name: /Vender 1 cota por/ });
const price2 = num((await sellBtn.textContent()).split('por')[1]);
await sellBtn.click();
await ana.getByText('Cotas vendidas').waitFor();
await ana.waitForTimeout(200);
await shot(ana, 'bolsa-5-comprovante-venda.png');
await ana.getByRole('button', { name: 'Fechar' }).click();
check((await wallet(ana)) === afterDiv + price2, `cota vendida por ${price2}`);
check((await ana.getByTestId('sell-card').count()) === 0, 'sem cotas para vender depois da venda');

// 8. Extrato: dividendo e venda
await ana.getByRole('tab', { name: /Extrato/ }).click();
const txt = norm(await ana.getByTestId('tx-list').textContent());
check(txt.includes('Dividendos do semestre da Vox Telecom: 1 cota'), 'dividendo no extrato');
// o dividendo do semestre = cotação da rodada 4 × 9%: a venda foi na mesma rodada, pela mesma cotação
if (!/[Dd]ividendo/.test(effect4)) check(div === Math.round(price2 * 0.09), `dividendo de 9% da cotação (${div} de ${price2})`);
else console.log('Manchete da rodada 4 mexe nos dividendos:', effect4);
check(txt.includes('Venda de 1 cota da Vox Telecom à empresa'), 'venda no extrato');
await shot(ana, 'bolsa-6-extrato.png');

console.log('Valores:', { start, price1, div, price2, final: await wallet(ana) });
console.log(failed ? 'Resultado: FALHOU' : 'Resultado: OK');
if (failed) process.exitCode = 1;
await browser.close();
