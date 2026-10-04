// Dados do jogo, portados do Banco Imobiliário da Mesa (tabuleiro Super Banco Imobiliário,
// marcas trocadas por empresas fictícias).
import type { CompanySpace, GroupId, LoanPlanId, NewsCard, Settings, Space, StreetSpace, TierId } from './types';

export const GROUPS: Record<GroupId, { name: string; c: string }> = {
  verde: { name: 'Verde', c: '--g-verde' },
  vermelho: { name: 'Vermelho', c: '--g-vermelho' },
  azulclaro: { name: 'Azul claro', c: '--g-azulclaro' },
  roxo: { name: 'Roxo', c: '--g-roxo' },
  azulescuro: { name: 'Azul escuro', c: '--g-azulescuro' },
  laranja: { name: 'Laranja', c: '--g-laranja' },
  amarelo: { name: 'Amarelo', c: '--g-amarelo' },
};

const S = (name: string, group: GroupId, price: number, rent: StreetSpace['rent'], build: number, mortgage: number, city: string, desc: string): StreetSpace => ({
  type: 'street',
  name,
  group,
  price,
  rent,
  build,
  mortgage,
  city,
  desc,
});
const C = (name: string, sector: string, short: string): CompanySpace => ({ type: 'company', name, sector, short, price: 2000 });

export const SPACES: Space[] = [
  { type: 'start', name: 'Início' },
  S('Av. 9 de Julho', 'verde', 1000, [60, 300, 900, 2700, 4000, 5000], 500, 500, 'São Paulo', 'Liga o centro à região dos Jardins, passando sob o MASP.'),
  S('Av. Brasil', 'verde', 750, [40, 200, 600, 1800, 3200, 4500], 500, 500, 'Rio de Janeiro', 'A maior avenida do Rio, cortando a zona norte até a zona oeste.'),
  C('Banco Aurora', 'Banco', 'BA'),
  S('Av. Beira Mar', 'verde', 600, [20, 100, 300, 900, 1600, 2500], 500, 500, 'Fortaleza', 'Calçadão à beira do mar, com feirinha e jangadas.'),
  S('Av. Rio Branco', 'vermelho', 2400, [200, 1000, 3000, 7500, 9250, 11000], 1500, 1200, 'Rio de Janeiro', 'Coração do centro histórico do Rio, perto da Cinelândia.'),
  { type: 'news', name: 'Notícias' },
  S('Av. do Estado', 'vermelho', 2200, [180, 900, 2500, 7000, 8750, 10500], 1500, 1100, 'São Paulo', 'Grande eixo viário ao lado do Rio Tamanduateí.'),
  C('Horizonte Viagens', 'Companhia aérea', 'HV'),
  S('Av. do Contorno', 'vermelho', 2200, [180, 900, 2500, 7000, 8750, 10500], 1500, 1100, 'Belo Horizonte', 'Contorna o centro planejado de Belo Horizonte.'),
  { type: 'jail', name: 'Prisão / Visitas' },
  { type: 'news', name: 'Notícias' },
  S('Av. Rebouças', 'azulclaro', 2000, [160, 800, 2200, 6000, 8000, 10000], 1000, 1000, 'São Paulo', 'Liga a Av. Paulista a Pinheiros, cheia de clínicas e lojas.'),
  S('Av. Santo Amaro', 'azulclaro', 1800, [140, 700, 2000, 5500, 7500, 9500], 1000, 1000, 'São Paulo', 'Eixo comercial da zona sul paulistana.'),
  C('Rede Ponto', 'Combustíveis', 'RP'),
  S('Rua da Consolação', 'azulclaro', 1800, [140, 700, 2000, 5500, 7500, 9500], 1000, 1000, 'São Paulo', 'Vai do centro à Paulista, com bares e teatros pelo caminho.'),
  { type: 'refund', name: 'Restituição de IR', amount: 2000 },
  S('Av. Morumbi', 'roxo', 4000, [500, 2000, 6000, 14000, 17000, 20000], 2000, 2000, 'São Paulo', 'Bairro de mansões e do estádio do Morumbi.'),
  S('Av. Higienópolis', 'roxo', 3500, [350, 1750, 5000, 11000, 13000, 15000], 2000, 1750, 'São Paulo', 'Bairro arborizado de prédios clássicos.'),
  S('Av. São João', 'roxo', 1200, [80, 400, 1000, 3000, 4500, 6000], 500, 600, 'São Paulo', 'Avenida histórica do centro, eternizada em Sampa.'),
  { type: 'free', name: 'Feriado' },
  S('Av. Ipiranga', 'roxo', 1000, [60, 300, 900, 2700, 4000, 5000], 500, 500, 'São Paulo', 'Cruza a São João no cruzamento mais famoso da cidade.'),
  C('Bella Cosméticos', 'Cosméticos', 'BC'),
  { type: 'tax', name: 'Receita Federal', amount: 2000 },
  { type: 'news', name: 'Notícias' },
  S('R. Brig. Faria Lima', 'azulescuro', 1400, [100, 500, 1500, 4500, 6250, 7500], 1000, 700, 'São Paulo', 'Endereço de bancos e empresas de tecnologia.'),
  S('Av. Paulista', 'azulescuro', 1600, [120, 600, 1800, 5000, 7000, 9000], 1000, 800, 'São Paulo', 'Coração financeiro de São Paulo, com o vão livre do MASP.'),
  { type: 'news', name: 'Notícias' },
  S('Av. Recife', 'azulescuro', 1400, [100, 500, 1500, 4500, 6250, 7500], 1000, 700, 'Recife', 'Grande avenida da zona sul do Recife.'),
  C('Vox Telecom', 'Telefonia', 'VX'),
  { type: 'gotojail', name: 'Vá para a detenção' },
  S('Av. Juscelino Kubitschek', 'laranja', 3200, [280, 1500, 4500, 10000, 12000, 14000], 2000, 1600, 'São Paulo', 'Avenida de torres corporativas no Itaim Bibi.'),
  { type: 'news', name: 'Notícias' },
  S('Rua Oscar Freire', 'laranja', 3000, [260, 1300, 3900, 9000, 11000, 12750], 2000, 1500, 'São Paulo', 'Rua das grifes e cafés nos Jardins.'),
  S('Av. Ibirapuera', 'laranja', 3000, [260, 1300, 3900, 9000, 11000, 12750], 2000, 1500, 'São Paulo', 'Passa ao lado do parque mais visitado da cidade.'),
  S('Av. Vieira Souto', 'amarelo', 2800, [260, 1300, 3600, 8500, 10250, 12000], 1500, 1400, 'Rio de Janeiro', 'Orla de Ipanema, um dos metros quadrados mais caros do país.'),
  C('Motora Automóveis', 'Montadora', 'MA'),
  S('Av. Presidente Vargas', 'amarelo', 2600, [220, 1100, 3300, 8000, 9750, 11500], 1500, 1300, 'Rio de Janeiro', 'Avenida monumental do centro do Rio.'),
  { type: 'news', name: 'Notícias' },
  S('Av. Niemeyer', 'amarelo', 2600, [220, 1100, 3300, 8000, 9750, 11500], 1500, 1300, 'Rio de Janeiro', 'Estrada à beira do penhasco entre o Leblon e São Conrado.'),
];

export const COMPANY_IDX: number[] = SPACES.map((s, i) => (s.type === 'company' ? i : -1)).filter((i) => i >= 0);
export const SHARE_PRICE = 200;
export const SHARES = 10;
export const CONTROL = 6;
export const COMPANY_RATE = 500;
export const JAIL_POS = 10;

// 32 cartas Notícia (valores das cartas do jogo; marcas trocadas por genéricas)
export const NEWS: NewsCard[] = [
  { k: 'pay', v: 1000, t: 'Você investiu em fundos do banco e o resultado não veio.' },
  { k: 'pay', v: 1000, t: 'Você estacionou o carro em local proibido.' },
  { k: 'pay', v: 150, t: 'Sua operadora de celular está sem sinal aqui. Para telefonar, pague.' },
  { k: 'pay', v: 200, t: 'Preocupado com o futuro, você fez um aporte na previdência.' },
  { k: 'pay', v: 200, t: 'Chegou o feriado e você levou a família para a praia.' },
  { k: 'pay', v: 220, t: 'As tarifas da sua operadora de celular estão muito altas.' },
  { k: 'pay', v: 300, t: 'Ver a surpresa da sua filha com o presente não tem preço. Pagou no cartão.' },
  { k: 'pay', v: 300, t: 'Pagou caro pela troca de óleo.' },
  { k: 'pay', v: 400, t: 'Você não usou o cinto de segurança.' },
  { k: 'pay', v: 500, t: 'Você vai abrir sua loja e não podem faltar os produtos de beleza.' },
  { k: 'pay', v: 500, t: 'Gostou tanto do roteiro de ecoturismo que ficou mais 2 dias.' },
  { k: 'pay', v: 500, t: 'O posto onde você abasteceu tinha gasolina adulterada. Pague o conserto.' },
  { k: 'pay', v: 90, t: 'Chegou a nova linha de produtos de beleza e você já está na fila.' },
  { k: 'pay', v: 250, t: 'Você parcelou uma compra no cartão e pagou a primeira parcela.' },
  { k: 'pay', v: 300, t: 'Comprou um presente especial para sua filha no cartão de crédito.' },
  { k: 'get', v: 1500, t: 'Com o cartão de débito você tem mais segurança e ganhou um bônus.' },
  { k: 'get', v: 1000, t: 'Você recarregou o celular e ganhou ainda mais créditos.' },
  { k: 'get', v: 1000, t: 'Seu carro foi roubado, mas você tinha seguro auto.' },
  { k: 'get', v: 1000, t: 'Você comprou um carro econômico e vai poupar combustível e manutenção.' },
  { k: 'get', v: 1500, t: 'Seu cartão de crédito tem muitos benefícios para aproveitar.' },
  { k: 'get', v: 200, t: 'Você juntou pontos no programa do posto e trocou por combustível.' },
  { k: 'get', v: 450, t: 'Ganhou um roteiro de viagem. Escolha o destino e faça as malas.' },
  { k: 'get', v: 500, t: 'Você ganhou a promoção de uma marca de cosméticos.' },
  { k: 'get', v: 500, t: 'Você ganhou a promoção da operadora e recebeu créditos.' },
  { k: 'get', v: 500, t: 'Você ganhou a promoção do posto: tanque cheio até o fim do ano.' },
  { k: 'each', v: 500, t: 'Você fez uma aposta com todos os jogadores da mesa e venceu.' },
  { k: 'get', v: 600, t: 'Você passou no teste para o novo comercial de produtos de beleza.' },
  { k: 'get', v: 750, t: 'Você venceu um concurso de personalização de carros.' },
  { k: 'get', v: 800, t: 'Você ganhou um concurso cultural e vai conhecer todo o litoral brasileiro.' },
  { k: 'get', v: 800, t: 'Parabéns! Você foi sorteado no título de capitalização.' },
  { k: 'free', v: 0, t: 'Utilize este cartão para se livrar da prisão. Guarde até precisar.' },
  { k: 'jail', v: 0, t: 'Vá para a prisão. Não passe pelo Início.' },
];

export const PLAYER_COLORS = ['#0B6E50', '#1F4E79', '#B45309', '#7C3AED', '#BE185D', '#0E7490'];
export const MAX_PLAYERS = 6;
export const DEFAULTS: Settings = { start: 25000, salary: 2000, bail: 500, mortgageRate: 0.2 };

/** Empréstimo do banco (mude aqui para ajustar a regra). */
export const LOAN = {
  /** limite = esta fração do patrimônio líquido (patrimônio − dívida atual) */
  limitRate: 0.5,
  /** menor empréstimo */
  min: 1000,
  /** valores em múltiplos de */
  step: 500,
  /** juros simples sobre o principal, cobrados uma vez */
  interest: 0.1,
  /** pagamento único: vence no início da vez do jogador, esta quantidade de rodadas depois de pegar */
  rounds: 5,
  /** parcelas arredondadas para múltiplos de (a última absorve a diferença) */
  parcelRound: 10,
};

/**
 * Planos de pagamento do empréstimo. Taxa = taxa da rodada + `addOn` + ajuste do score (mínimo BANK_RATES.minLoanRate),
 * juros simples sobre o principal, travada ao pegar. Parcelado: total ÷ parcelas, uma no início de cada vez do jogador
 * a partir da rodada seguinte. Pagamento único: tudo no início da vez, LOAN.rounds rodadas depois.
 */
export const LOAN_PLANS: { id: LoanPlanId; name: string; short: string; parcels: number; addOn: number }[] = [
  { id: 'x2', name: 'Parcelado em 2x', short: '2x', parcels: 2, addOn: 0 },
  { id: 'x3', name: 'Parcelado em 3x', short: '3x', parcels: 3, addOn: 0.02 },
  { id: 'x4', name: 'Parcelado em 4x', short: '4x', parcels: 4, addOn: 0.04 },
  { id: 'x5', name: 'Parcelado em 5x', short: '5x', parcels: 5, addOn: 0.06 },
  { id: 'unico', name: 'Pagamento único', short: 'Único', parcels: 1, addOn: 0.08 },
];

// ---------- Fase 2: casas, valorização, IR, score de crédito e juros por rodada ----------

/**
 * As 3 casas que se pode construir no terreno (a primeira casa escolhe o padrão; as seguintes e o hotel seguem o mesmo).
 * `build`: multiplicador do custo de construção do tabuleiro; `rent`: multiplicador dos aluguéis com casas e hotel.
 * O terreno (sem casa) não tem padrão: preço, aluguel "sem casa" e hipoteca do tabuleiro × bairro.
 */
export const TIERS: Record<TierId, { name: string; build: number; rent: number }> = {
  basica: { name: 'Básica', build: 0.8, rent: 0.8 },
  intermediaria: { name: 'Intermediária', build: 1, rent: 1 },
  alto: { name: 'Alto padrão', build: 1.3, rent: 1.4 },
};
export const TIER_IDS: TierId[] = ['basica', 'intermediaria', 'alto'];
/** Padrão de casas de salas antigas sem padrão guardado e de construções sem escolha: a Intermediária custa o do tabuleiro. */
export const DEFAULT_TIER: TierId = 'intermediaria';

/** Valorização do bairro (grupo de cor): multiplicador do preço e dos aluguéis, começa em 1,0. */
export const HOOD = { start: 1, min: 0.5, max: 2 };

/** Imposto de renda a cada volta (1 volta = 1 ano). */
export const IR = {
  /** alíquota sobre a renda do ano acima da isenção */
  rate: 0.15,
  /** os primeiros $ 2.000 de renda do ano são isentos */
  exempt: 2000,
  /** o pró-labore conta como renda? */
  salaryIsIncome: false,
  /** chance de cair na malha fina ao sonegar */
  catchChance: 0.3,
  /** multa sobre o imposto quando cai na malha fina (1 = 100%) */
  fine: 1,
};

/** Score de crédito (0 a 1000). */
export const CREDIT = {
  start: 500,
  min: 0,
  max: 1000,
  /** pagamento único quitado em dia ou antes (também quando o banco cobra no vencimento e o saldo cobre) */
  loanPaid: 80,
  partialPay: 10,
  /** pagamento único vencido com penhora */
  penhora: -200,
  /** parcela paga em dia com o saldo (no máximo 5 parcelas: até +50 por empréstimo) */
  parcelPaid: 10,
  /** parcelado quitado (última parcela ou quitação antecipada), se nenhuma parcela precisou de penhora */
  parcelLoanPaid: 30,
  /** parcela que precisou de penhora */
  parcelPenhora: -100,
  malhaFina: -150,
  irDeclared: 20,
  shortfall: -30,
  /** abaixo deste score o banco não empresta */
  noLoanBelow: 200,
};

/** Faixas do score: a partir de `from`, limite do empréstimo (fração do patrimônio líquido) e ajuste da taxa (pontos percentuais). */
export const CREDIT_BANDS: { id: 'ruim' | 'regular' | 'bom' | 'excelente'; name: string; from: number; limitRate: number; rateOffset: number }[] = [
  { id: 'ruim', name: 'Ruim', from: 0, limitRate: 0.25, rateOffset: 0.05 },
  { id: 'regular', name: 'Regular', from: 300, limitRate: 0.5, rateOffset: 0 },
  { id: 'bom', name: 'Bom', from: 600, limitRate: 0.7, rateOffset: -0.02 },
  { id: 'excelente', name: 'Excelente', from: 800, limitRate: 0.9, rateOffset: -0.04 },
];

/** Juros sorteados no começo de cada rodada (sorteio uniforme) e a menor taxa possível de um empréstimo. */
export const BANK_RATES = { options: [0.05, 0.08, 0.1, 0.12, 0.15, 0.2], minLoanRate: 0.02 };
