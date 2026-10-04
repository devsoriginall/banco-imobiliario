// Teste de ponta a ponta no modo local (sem Supabase), com dois "celulares" (duas abas do mesmo contexto,
// porque o BroadcastChannel não atravessa contextos diferentes do navegador).
//
//   npm run build && npm start   # em outro terminal (sem as variáveis do Supabase)
//   PLAYWRIGHT=$(npm root -g)/playwright/index.mjs BASE_URL=http://localhost:3000 node scripts/e2e-dois-jogadores.mjs
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
const norm = (t) => t.replace(/\s+/g, ' ').trim(); // o app usa espaço não separável nos valores
const wallet = async (page) => norm(await page.getByTestId('wallet-balance').textContent());
const playerBal = async (page, name) => norm(await page.locator(`.player[data-player="${name}"] .bal`).textContent());
// cada celular fica em primeiro plano quando é usado (abas em segundo plano têm os timers pausados)
const front = (page) => page.bringToFront();
const fail = (msg) => {
  console.error('FALHOU:', msg);
  process.exitCode = 1;
};

// 1. Ana cria a sala
await ana.goto(BASE);
await ana.getByLabel('Seu nome').fill('Ana');
await shot(ana, '01-inicio.png');
await ana.getByRole('button', { name: 'Criar sala' }).click();
await ana.waitForURL(/\/sala\/[A-Z0-9]{5}$/);
const code = (await ana.getByTestId('room-code').textContent()).trim();
console.log('Sala criada:', code);

// 2. Beto entra pelo código
await front(beto);
await beto.goto(BASE);
await beto.getByLabel('Seu nome').fill('Beto');
await beto.getByLabel('Código da sala').fill(code);
await beto.getByRole('button', { name: 'Entrar na sala' }).click();
await beto.waitForURL(new RegExp(`/sala/${code}$`));
await front(ana);
await ana.locator('.lobby-p', { hasText: 'Beto' }).waitFor();
await shot(ana, '02-sala-de-espera.png', true);

// 3. Ana começa a partida
// regras clássicas (sem Jornal e Bolsa): os valores esperados abaixo não mudam com as manchetes
await ana.getByRole('checkbox', { name: /Jornal e Bolsa/ }).click();
await ana.waitForFunction(() => !document.querySelector('.toggle-row input').checked);
await ana.getByRole('button', { name: 'Começar partida' }).click();
await ana.getByText('É a sua vez').waitFor();
await beto.getByText('Vez de').waitFor();
await ana.waitForTimeout(400);
await shot(ana, '03-vez-da-ana.png');

// 4. Ana cai na Av. 9 de Julho e compra
await ana.locator('[data-space="1"]').click();
await ana.getByRole('button', { name: /Comprar terreno por \$\s1\.000/ }).click();
await shot(ana, '05-pix-compra.png');
await ana.getByRole('button', { name: 'Confirmar Pix' }).click();
await ana.getByText('Transação efetuada').waitFor();
await shot(ana, '06-comprovante-compra.png');
await ana.getByRole('button', { name: 'Fechar' }).click();
await front(beto);
await beto.getByText('Ana comprou o terreno da Av. 9 de Julho').first().waitFor();
await shot(beto, '04-beto-assistindo.png');
await front(ana);
await ana.getByRole('button', { name: 'Passar a vez' }).click();

// 5. Beto cai na Av. 9 de Julho e paga o aluguel via Pix
await front(beto);
await beto.getByText('É a sua vez').waitFor();
await beto.locator('[data-space="1"]').click();
await beto.getByRole('button', { name: 'Pagar com Pix' }).click();
await shot(beto, '07-pix-aluguel.png');
const toast = ana.locator('.toast', { hasText: 'pagou o aluguel' });
await beto.getByRole('button', { name: 'Confirmar Pix' }).click();
await beto.getByText('Transação efetuada').waitFor();
await shot(beto, '08-comprovante-aluguel.png');

// 6. Ana recebe a notificação
await front(ana);
await toast.waitFor({ timeout: 5000 });
const toastText = norm(await toast.innerText());
console.log('Toast na Ana:', toastText);
await ana.waitForTimeout(400); // fim da animação de entrada
await shot(ana, '09-ana-recebe-toast.png');
if (!toastText.includes('Beto pagou o aluguel da Av. 9 de Julho · +$ 60')) fail('texto do toast');

// 7. Saldos nos dois celulares
await front(beto);
await beto.getByRole('button', { name: 'Fechar' }).click();
const r = {
  anaCarteira: await wallet(ana),
  betoCarteira: await wallet(beto),
  anaVeBeto: await playerBal(ana, 'Beto'),
  betoVeAna: await playerBal(beto, 'Ana'),
};
console.log('Saldos:', JSON.stringify(r));
if (r.anaCarteira !== '$ 24.060' || r.betoVeAna !== '$ 24.060') fail('saldo da Ana');
if (r.betoCarteira !== '$ 24.940' || r.anaVeBeto !== '$ 24.940') fail('saldo do Beto');

// Telas extras (depois que as notificações somem)
await ana.waitForTimeout(4700);
await front(beto);
await beto.getByRole('tab', { name: /Extrato/ }).click();
await shot(beto, '10-extrato.png');
await front(ana);
await ana.getByRole('tab', { name: /Imóveis/ }).click();
await shot(ana, '11-imoveis.png');
await ana.emulateMedia({ colorScheme: 'dark' });
await ana.getByRole('tab', { name: /Placar/ }).click();
await shot(ana, '12-placar-escuro.png');

await browser.close();
console.log(process.exitCode ? 'Resultado: FALHOU' : 'Resultado: OK');
