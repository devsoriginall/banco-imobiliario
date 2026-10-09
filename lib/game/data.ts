// Dados do jogo, portados do Banco Imobiliário da Mesa (tabuleiro Super Banco Imobiliário,
// marcas trocadas por empresas fictícias).
import type { CompanySpace, DecisionId, GroupId, Headline, LoanPlanId, NewsCard, Settings, Space, StreetSpace, TierId } from './types';

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

export const PLAYER_COLORS = ['#3D5AFE', '#E8175D', '#C2410C', '#7B2FF7', '#08875A', '#0E7490'];
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
  /** pagamento único: vence no início do semestre de número `unicoSemesters` contado pela regra da 1ª parcela */
  unicoSemesters: 2,
  /** a 1ª cobrança é no primeiro início de semestre pelo menos esta quantidade de rodadas depois de pegar */
  graceRounds: 2,
  /** parcelas arredondadas para múltiplos de (a última absorve a diferença) */
  parcelRound: 10,
};

/**
 * Planos de pagamento do empréstimo. Taxa = Taxa Selic + `addOn` + ajuste do score (mínimo BANK_RATES.minLoanRate),
 * juros simples sobre o principal, travada ao pegar. Parcelado: total ÷ parcelas, uma por semestre do calendário
 * (CALENDAR), no início da vez do jogador na rodada que abre o semestre; a 1ª no primeiro início de semestre pelo
 * menos LOAN.graceRounds rodadas depois de pegar. Pagamento único: tudo no LOAN.unicoSemesters-ésimo início de semestre.
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

/**
 * Calendário da partida, igual para todos: 1 ano = 6 rodadas (ano 1 = rodadas 1 a 6), 2 semestres de 3 rodadas.
 * O IR fecha para todos quando o ano acaba; as parcelas são cobradas no início de cada semestre.
 */
export const CALENDAR = { roundsPerYear: 6, roundsPerSemester: 3 };

/** Imposto de renda a cada ano do calendário (CALENDAR). */
export const IR = {
  /** alíquota sobre a renda do ano acima da isenção */
  rate: 0.15,
  /** os primeiros $ 2.000 de renda do ano são isentos */
  exempt: 2000,
  /** o pró-labore conta como renda? */
  salaryIsIncome: false,
  /** chance de cair na malha fina ao sonegar tudo (declarar renda zero) */
  catchChance: 0.3,
  /** chance mínima de cair na malha fina ao declarar menos: escondendo quase nada; cresce até catchChance com o que escondeu */
  catchMin: 0.1,
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

/** Taxa Selic sorteada no início de cada semestre do calendário (sorteio uniforme) e a menor taxa possível de um empréstimo. */
export const BANK_RATES = { options: [0.05, 0.08, 0.1, 0.12, 0.15, 0.2], minLoanRate: 0.02 };

// ---------- Jornal da Cidade e Bolsa ----------

/** Bolsa: cotação das empresas (começa em SHARE_PRICE e muda a cada rodada). */
export const STOCK = {
  /** limites da cotação */
  min: 50,
  max: 1000,
  /** cotação arredondada para múltiplos de */
  round: 10,
  /** variação sorteada a cada rodada: de −5% a +5% */
  drift: 0.05,
  /** rodadas guardadas no histórico (gráfico) */
  history: 12,
  /** rendimento por rodada; o dividendo é pago a cada semestre (CALENDAR) = cotação × rendimento × 3 rodadas (9%) */
  yield: 0.03,
};

/** Gerência: o dono (6+ cotas) toma uma decisão por rodada em cada empresa que controla, na sua vez. */
export const DECISIONS = {
  /** paga `cost` à empresa: na próxima rodada a cota sobe de `min`% a `max`% (sorteado) */
  investir: { name: 'Investir', cost: 1000, min: 10, max: 25 },
  /** o banco paga agora `rate` × cotação por cota aos cotistas; na próxima rodada a cota muda `nextPct`% */
  dividendo: { name: 'Dividendo extra', rate: 0.05, nextPct: -10 },
  /** rendimento +`pp` pontos nas próximas `rounds` rodadas; `strikeChance` de greve (dividendo zero) na próxima */
  cortar: { name: 'Cortar custos', pp: 2, rounds: 2, strikeChance: 0.3 },
  /** paga `cost`: taxa da casa +`pct`% nesta rodada e nas seguintes, `rounds` rodadas ao todo */
  marketing: { name: 'Campanha de marketing', cost: 500, pct: 50, rounds: 2 },
} as const satisfies Record<DecisionId, { name: string; [k: string]: string | number }>;
export const DECISION_IDS: DecisionId[] = ['investir', 'dividendo', 'cortar', 'marketing'];

/** Jornal da Cidade: quantas edições ficam guardadas. */
export const JORNAL = { keep: 40 };

// empresas pelo índice da casa no tabuleiro
const BA = 3; // Banco Aurora
const HV = 8; // Horizonte Viagens
const RP = 14; // Rede Ponto
const BC = 22; // Bella Cosméticos
const VX = 29; // Vox Telecom
const MA = 36; // Motora Automóveis

/** 36 manchetes do Jornal da Cidade (uma por rodada, sem repetir até acabar o baralho). */
export const HEADLINES: Headline[] = [
  // ----- Bairros -----
  {
    cat: 'bairro',
    tag: 'Assaltos',
    title: 'Onda de assaltos assusta moradores da Av. Brasil',
    body: 'Comerciantes da Av. Brasil, da Av. 9 de Julho e da Av. Beira Mar baixam as portas mais cedo. Imobiliárias já sentem a procura cair.',
    effects: [{ k: 'hood', group: 'verde', pct: -15, rounds: 3 }],
  },
  {
    cat: 'bairro',
    tag: 'Metrô',
    title: 'Metrô vai chegar à Av. do Estado',
    body: 'A nova linha liga a Av. do Estado, a Av. Rio Branco e a Av. do Contorno ao centro. Os terrenos da região disparam.',
    effects: [{ k: 'hood', group: 'vermelho', pct: 20 }],
  },
  {
    cat: 'bairro',
    tag: 'Enchente',
    title: 'Enchente alaga a Av. Santo Amaro',
    body: 'A chuva da madrugada deixou ruas debaixo d’água na Av. Santo Amaro, na Av. Rebouças e na Rua da Consolação. A limpeza deve levar dias.',
    effects: [{ k: 'hood', group: 'azulclaro', pct: -20, rounds: 2 }],
  },
  {
    cat: 'bairro',
    tag: 'Shopping novo',
    title: 'Shopping novo abre as portas na Av. Higienópolis',
    body: 'Com 300 lojas e cinema, o centro de compras promete movimentar o bairro roxo, da Av. Morumbi à Av. Ipiranga.',
    effects: [{ k: 'hood', group: 'roxo', pct: 15 }],
  },
  {
    cat: 'bairro',
    tag: 'Festival',
    title: 'Festival de música fecha a Av. Paulista no fim de semana',
    body: 'Palcos na Av. Paulista, na Faria Lima e na Av. Recife lotam hotéis e restaurantes. A festa acaba na segunda-feira.',
    effects: [{ k: 'hood', group: 'azulescuro', pct: 10, rounds: 1 }],
  },
  {
    cat: 'bairro',
    tag: 'Parque reformado',
    title: 'Parque Ibirapuera ganha reforma completa',
    body: 'Lagos limpos, pista de corrida nova e iluminação: a Av. Ibirapuera, a Oscar Freire e a Av. JK ficam ainda mais disputadas.',
    effects: [{ k: 'hood', group: 'laranja', pct: 10 }],
  },
  {
    cat: 'bairro',
    tag: 'Ressaca',
    title: 'Ressaca fecha a orla da Av. Vieira Souto',
    body: 'Ondas de três metros invadem a pista. A Prefeitura interdita trechos da Vieira Souto e da Av. Niemeyer até o mar acalmar.',
    effects: [{ k: 'hood', group: 'amarelo', pct: -10, rounds: 2 }],
  },
  {
    cat: 'bairro',
    tag: 'Calçadão novo',
    title: 'Calçadão da Av. Beira Mar é revitalizado',
    body: 'Ciclovia, quiosques novos e feirinha reformada atraem turistas para o bairro verde, da Beira Mar à Av. 9 de Julho.',
    effects: [{ k: 'hood', group: 'verde', pct: 10 }],
  },
  {
    cat: 'bairro',
    tag: 'Viaduto interditado',
    title: 'Viaduto interditado trava a Av. do Contorno',
    body: 'Rachaduras na estrutura obrigam o desvio do trânsito. Quem mora no bairro vermelho perde horas no carro.',
    effects: [{ k: 'hood', group: 'vermelho', pct: -10, rounds: 2 }],
  },
  {
    cat: 'bairro',
    tag: 'Polo gastronômico',
    title: 'Rua da Consolação vira polo gastronômico',
    body: 'Chefs premiados abrem casas na Consolação e na Rebouças. O bairro azul claro entra no roteiro de quem sai para jantar.',
    effects: [{ k: 'hood', group: 'azulclaro', pct: 10 }],
  },
  {
    cat: 'bairro',
    tag: 'Apagão',
    title: 'Apagão deixa a Av. São João às escuras',
    body: 'Um transformador queimou e a Av. São João e a Av. Ipiranga ficaram sem luz. A distribuidora promete religar logo.',
    effects: [{ k: 'hood', group: 'roxo', pct: -15, rounds: 1 }],
  },
  {
    cat: 'bairro',
    tag: 'Sede de tecnologia',
    title: 'Gigante da tecnologia muda a sede para a Faria Lima',
    body: 'Cinco mil funcionários vão trabalhar na R. Brig. Faria Lima. Aluguéis da Av. Paulista e da Av. Recife sobem junto.',
    effects: [{ k: 'hood', group: 'azulescuro', pct: 15 }],
  },
  {
    cat: 'bairro',
    tag: 'Obras',
    title: 'Obras intermináveis na Av. Juscelino Kubitschek',
    body: 'Buracos, tapumes e desvios na Av. JK, na Oscar Freire e na Av. Ibirapuera espantam clientes e inquilinos.',
    effects: [{ k: 'hood', group: 'laranja', pct: -10, rounds: 3 }],
  },
  {
    cat: 'bairro',
    tag: 'Réveillon',
    title: 'Réveillon na orla lota a Av. Vieira Souto',
    body: 'Fogos, shows e dois milhões de pessoas: hotéis e apartamentos da Vieira Souto, da Presidente Vargas e da Niemeyer esgotam.',
    effects: [{ k: 'hood', group: 'amarelo', pct: 15, rounds: 1 }],
  },
  {
    cat: 'bairro',
    tag: 'Aterro',
    title: 'Aterro sanitário será construído perto da Av. Niemeyer',
    body: 'Moradores protestam contra o cheiro e o vaivém de caminhões. O bairro amarelo perde valor de vez.',
    effects: [{ k: 'hood', group: 'amarelo', pct: -10 }],
  },
  // ----- Empresas -----
  {
    cat: 'empresa',
    tag: 'Escândalo',
    title: 'Escândalo no Banco Aurora: diretores são afastados',
    body: 'Auditoria encontra contas maquiadas. Investidores correm para vender as cotas do banco.',
    effects: [{ k: 'stock', co: BA, pct: -25 }],
  },
  {
    cat: 'empresa',
    tag: 'Greve',
    title: 'Pilotos da Horizonte Viagens entram em greve',
    body: 'Voos cancelados em todo o país. Sem receita, a companhia aérea suspende os dividendos por duas rodadas.',
    effects: [{ k: 'strike', co: HV, rounds: 2 }],
  },
  {
    cat: 'empresa',
    tag: 'Multa do governo',
    title: 'Governo multa a Rede Ponto por gasolina adulterada',
    body: 'A fiscalização encontrou combustível fora do padrão em 40 postos. A multa é a maior da história do setor.',
    effects: [{ k: 'stock', co: RP, pct: -15 }],
  },
  {
    cat: 'empresa',
    tag: 'Lançamento de sucesso',
    title: 'Novo batom da Bella Cosméticos esgota em um dia',
    body: 'O lançamento virou febre nas redes sociais e as fábricas vão trabalhar em três turnos.',
    effects: [{ k: 'stock', co: BC, pct: 20 }],
  },
  {
    cat: 'empresa',
    tag: 'Aquisição',
    title: 'Vox Telecom compra concorrente e vira a maior do país',
    body: 'A aquisição bilionária dobra o número de clientes da operadora. O mercado comemora.',
    effects: [{ k: 'stock', co: VX, pct: 30 }],
  },
  {
    cat: 'empresa',
    tag: 'Recall',
    title: 'Motora Automóveis faz recall de 200 mil carros',
    body: 'Defeito no freio obriga a montadora a chamar os donos de volta às concessionárias.',
    effects: [{ k: 'stock', co: MA, pct: -20 }],
  },
  {
    cat: 'empresa',
    tag: 'Lucro recorde',
    title: 'Banco Aurora anuncia lucro recorde',
    body: 'Com os juros altos, o banco nunca ganhou tanto. Os acionistas recebem dividendo maior por duas rodadas.',
    effects: [{ k: 'yield', co: BA, pp: 2, rounds: 2 }],
  },
  {
    cat: 'empresa',
    tag: 'Feriadão',
    title: 'Feriadão lota os voos da Horizonte Viagens',
    body: 'Aeroportos cheios e passagens esgotadas. Quem cair na casa da companhia aérea paga mais caro.',
    effects: [
      { k: 'stock', co: HV, pct: 10 },
      { k: 'fee', co: HV, pct: 50, rounds: 2 },
    ],
  },
  {
    cat: 'empresa',
    tag: 'Contrato com o governo',
    title: 'Rede Ponto fecha contrato com frota do governo',
    body: 'Todos os carros oficiais vão abastecer nos postos da rede pelos próximos cinco anos.',
    effects: [{ k: 'stock', co: RP, pct: 15 }],
  },
  {
    cat: 'empresa',
    tag: 'Vigilância sanitária',
    title: 'Vigilância sanitária recolhe produtos da Bella Cosméticos',
    body: 'Um lote de cremes foi reprovado nos testes. A marca tira os produtos das prateleiras.',
    effects: [{ k: 'stock', co: BC, pct: -15 }],
  },
  {
    cat: 'empresa',
    tag: 'Apagão de sinal',
    title: 'Apagão de sinal derruba a Vox Telecom por um dia inteiro',
    body: 'Milhões de clientes ficaram sem celular e internet. O órgão regulador abre investigação.',
    effects: [{ k: 'stock', co: VX, pct: -10 }],
  },
  {
    cat: 'empresa',
    tag: 'Greve',
    title: 'Metalúrgicos param as fábricas da Motora Automóveis',
    body: 'Sem acordo salarial, as linhas de montagem param. Nada de dividendos por duas rodadas.',
    effects: [{ k: 'strike', co: MA, rounds: 2 }],
  },
  {
    cat: 'empresa',
    tag: 'Carro do ano',
    title: 'Carro elétrico da Motora Automóveis é eleito o melhor do ano',
    body: 'A fila de espera já passa de seis meses e as concessionárias abrem pré-venda.',
    effects: [{ k: 'stock', co: MA, pct: 20 }],
  },
  // ----- Economia -----
  {
    cat: 'economia',
    tag: 'Juros sobem',
    title: 'Banco Central sobe os juros',
    body: 'Para segurar a inflação, a taxa básica sobe. Pegar dinheiro emprestado fica mais caro nesta rodada.',
    effects: [{ k: 'rate', pp: 2 }],
  },
  {
    cat: 'economia',
    tag: 'Juros caem',
    title: 'Banco Central corta os juros',
    body: 'Com a inflação sob controle, a taxa básica cai. Boa hora para pegar empréstimo.',
    effects: [{ k: 'rate', pp: -2 }],
  },
  {
    cat: 'economia',
    tag: 'Mercado em alta',
    title: 'Bolsa dispara com otimismo dos investidores',
    body: 'O índice tem a maior alta do ano e todas as empresas da cidade sobem juntas.',
    effects: [{ k: 'stockAll', pct: 10 }],
  },
  {
    cat: 'economia',
    tag: 'Mercado em baixa',
    title: 'Pânico no mercado derruba a Bolsa',
    body: 'Crise lá fora assusta os investidores, que vendem tudo. Todas as cotas caem.',
    effects: [{ k: 'stockAll', pct: -10 }],
  },
  {
    cat: 'economia',
    tag: 'Boom imobiliário',
    title: 'Boom imobiliário: preço do metro quadrado sobe em toda a cidade',
    body: 'Crédito farto e procura alta fazem todos os bairros valorizarem de uma vez.',
    effects: [{ k: 'hoodAll', pct: 5 }],
  },
  {
    cat: 'economia',
    tag: 'Crise imobiliária',
    title: 'Crise imobiliária: lançamentos encalham',
    body: 'Sobram apartamentos à venda e os preços caem em todos os bairros por duas rodadas.',
    effects: [{ k: 'hoodAll', pct: -10, rounds: 2 }],
  },
  {
    cat: 'economia',
    tag: 'Temporada de dividendos',
    title: 'Temporada de dividendos: empresas distribuem lucros',
    body: 'Com o caixa cheio, todas as empresas pagam dividendo maior nesta rodada.',
    effects: [{ k: 'yield', pp: 1, rounds: 1 }],
  },
  {
    cat: 'economia',
    tag: 'Investidores estrangeiros',
    title: 'Investidores estrangeiros chegam à cidade',
    body: 'Fundos de fora compram cotas de todas as empresas e ainda apostam nos imóveis.',
    effects: [
      { k: 'stockAll', pct: 5 },
      { k: 'hoodAll', pct: 5, rounds: 1 },
    ],
  },
];

// ---------- Poupança, seguro, duplas e financiamento ----------

/** Poupança: depósito só na sua vez, resgate a qualquer momento; rende no início de cada vez sua. */
export const SAVINGS = {
  /** depósitos e resgates em múltiplos de (o resgate de tudo vale qualquer valor) */
  step: 100,
  /** rendimento por vez = esta fração da Taxa Selic atual × saldo, arredondado a $ 10 */
  rateShare: 0.5,
};

/** Seguro do imóvel: prêmio sobre o valor atual (terreno + casas), cobre esta quantidade de rodadas. */
export const INSURANCE = { premium: 0.05, rounds: 10 };

/** Duplas seguidas na mesma vez: na 3ª, detenção. */
export const MAX_DOUBLES = 3;

/**
 * Financiamento na compra do terreno ou da casa: entrada de `entrada` × preço pelo Pix, o resto nos planos do
 * empréstimo (LOAN_PLANS, mesma taxa). Não usa o limite do empréstimo, mas pede score a partir da faixa Regular.
 */
export const FINANCE = {
  entrada: 0.2,
  /** score mínimo: início da faixa Regular */
  minScore: CREDIT_BANDS.find((b) => b.id === 'regular')!.from,
};
