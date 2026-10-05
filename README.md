# Banco Imobiliário (multijogador)

O banco da partida no celular de cada jogador. O tabuleiro, os peões e os dados continuam na mesa; o app cuida do dinheiro: compra de imóveis, aluguel via "Pix", taxas das empresas, cotas, casas e hotéis, hipoteca, detenção, notícias, falência e o extrato da partida.

- **Criar sala**: quem cria digita o nome e recebe um código de 5 letras e um link `/sala/CODIGO` para mandar no grupo.
- **Entrar na sala**: código e nome. Não há cadastro: cada aparelho guarda um id aleatório e o nome no `localStorage`.
- **Sala de espera**: mostra quem entrou em tempo real; quem criou define o saldo inicial e começa a partida.
- **Na partida**: cada celular mostra a própria carteira, o saldo de todos e de quem é a vez. Só quem está na vez escolhe a casa onde parou e vê os botões de ação; os outros acompanham. Qualquer um abre **Imóveis** (construir, vender, hipotecar os seus), **Mercado** (Jornal e Bolsa), **Banco** (negociar com outro jogador, empréstimo), **Extrato** e **Placar**.
- Quem recebe um pagamento ganha uma notificação, por exemplo: _"Beto pagou o aluguel da Av. 9 de Julho · +$ 60"_.

Regras do Super Banco Imobiliário portadas da versão "da mesa": pró-labore de $ 2.000 ao passar pelo Início, fiança de $ 500 (3 tentativas de dupla), hipoteca com 20% para tirar, e empresas com 10 cotas de $ 200 (quem tem 6 ou mais é dono e recebe dados × $ 500, em dobro se for dono das 6; sem dono, a taxa é dividida pelas cotas). Regras da casa:

- **Construção**: só no imóvel seu onde você parou nesta jogada, na tela da Jogada (no terreno, o site da imobiliária com os 3 padrões da primeira casa; com casas, o aluguel agora e com mais uma construção, e o botão "Construir casa" ou "Construir hotel" com o motivo quando não dá). Sem hipoteca, não precisa do grupo completo, uma construção por vez (por rodada, mesmo tirando dupla) e não no imóvel adquirido nesta rodada (compra, negociação ou falência). Hotel depois de 4 casas no mesmo imóvel. A aba Imóveis não constrói; vender construção vale a qualquer momento, de qualquer imóvel, pela metade do custo.
- **Cotas da empresa**: só ao cair nela e no máximo uma por rodada.
- **Negociação** (aba Banco, a qualquer momento): proponha a outro jogador uma troca de dinheiro, imóveis e cotas. Imóvel com casas não entra; hipotecado entra e continua hipotecado. A proposta fica pendente até ser aceita, recusada ou cancelada (uma por dupla de jogadores) e é validada de novo ao aceitar.
- **Empréstimo** (aba Banco, na sua vez): até 50% do patrimônio líquido (depende do score, abaixo), a partir de $ 1.000 em múltiplos de $ 500. Escolha o valor e veja a **simulação** dos 5 planos (taxa, parcela e total de cada um):
  - **Parcelado em 2x, 3x, 4x ou 5x**: taxa da rodada + 0, 2, 4 ou 6 pp; **Pagamento único no 2º semestre**: + 8 pp. Depois vem o ajuste do score (mínimo 2%). Juros simples sobre o valor (total = valor × (1 + taxa)), travados ao pegar.
  - Parcelas = total ÷ N arredondado para $ 10; a última absorve a diferença (ex.: $ 2.000 a 12% em 3x = $ 750 + $ 750 + $ 740). Uma parcela por semestre do calendário (a cada 3 rodadas), cobrada sozinha no início da vez do jogador na rodada que abre o semestre (rodadas 1 e 4 de cada ano); a primeira só no primeiro início de semestre pelo menos 2 rodadas depois de pegar (pegou na rodada 1 ou 2: rodada 4; na 3, 4 ou 5: rodada 7). 2x a 5x = 2 a 5 semestres; o pagamento único vence no 2º início de semestre pela mesma regra (pegou na rodada 1: rodada 7). Toast e aviso na mesa: _"Parcela 2/4 do empréstimo de Ana: $ 550"_; cada parcela vira uma linha no Extrato). A carteira mostra _"Parcela $ X na rodada N"_ (ou _"na próxima vez"_, em vermelho se o saldo não cobre), e o cartão do Banco, _"Próxima parcela: na rodada N (início do 2º semestre do ano X)"_. Salas antigas com cobrança por rodada passam para o calendário: o que falta é cobrado nos próximos inícios de semestre, uma parcela por semestre (o pagamento único, no próximo).
  - Se o saldo não cobre a parcela, a **penhora** vale só para o valor dela (vende as construções pela metade do custo e toma os imóveis do mais barato para o mais caro, pelo valor de hipoteca, ou 0 se já hipotecado; o que sobrar fica com o jogador). Se nem assim cobrir, falência para o banco.
  - Dá para **quitar antes**, na sua vez, pagando todo o saldo restante (sem desconto de juros). No parcelado não há pagamento parcial avulso.
  - **Pagamento único**: tudo vence no início da sua vez 5 rodadas depois; pode pagar antes, inteiro ou em partes. No vencimento o banco cobra do saldo e, se faltar, faz a penhora do valor todo. Empréstimos de salas antigas (sem plano) seguem o pagamento único.
  - As constantes ficam em `LOAN` e `LOAN_PLANS` (`lib/game/data.ts`).
- **Terreno na compra, três padrões de casa na construção**: ao cair num imóvel livre, compra-se só o **terreno**, pelo preço do tabuleiro × bairro ("Terreno à venda"); o aluguel do terreno é o "sem casa" do tabuleiro × bairro. Numa jogada seguinte (não na rodada da compra), ao cair no próprio terreno, o **site da imobiliária** oferece a primeira casa em 3 padrões, como num site de imóveis: **Básica** (80% do custo de construção do tabuleiro, aluguéis com casas a 80%), **Intermediária** (100%) ou **Alto padrão** (130% do custo, aluguéis a 140%), tudo × bairro e arredondado a $ 10. Cada casa tem um anúncio fictício (tipo, m², quartos, suítes, banheiros, vagas e diferenciais como piscina, quintal ou vista) que acompanha o padrão do bairro. "Ver anúncio" (nas 3 opções e no cartão da casa de um imóvel) abre o **anúncio em tela cheia**: galeria de fotos (setas e deslizar, quando há mais de uma), selo do padrão, preço, ficha, bairro, tabela de aluguel do padrão e o botão de construir no rodapé. As fotos reais ficam em `public/casas/<padrão>/` (`basica`, `intermediaria`, `alto`) e são listadas em `lib/game/photos.ts`; cada imóvel começa numa foto escolhida de forma estável. Padrão sem fotos usa a ilustração. As próximas casas (até 4, depois o hotel) seguem o mesmo padrão e custam o mesmo, uma por rodada. Vender construção devolve a metade do custo do padrão; sem casas, o imóvel volta a ser só terreno e a próxima primeira casa escolhe o padrão de novo. Hipoteca só de terreno sem casas, pelo valor do tabuleiro × bairro. Patrimônio = terreno + casas pelo custo do padrão. Negociação só de terrenos (imóvel com casas não entra); na penhora as casas voltam pela metade do custo do padrão e o imóvel tomado volta ao banco como terreno, sem casa. Na falência para outro jogador, o imóvel vai com as casas e o padrão. Salas antigas: padrão guardado num imóvel sem casas é ignorado (é terreno); com casas, mantém o padrão (sem padrão guardado: Intermediária).
- **Valorização do bairro**: cada grupo de cor tem um multiplicador do preço do terreno, do custo das casas, dos aluguéis e da hipoteca (começa em 1,0; vai de 0,5 a 2,0). Aparece como "Bairro valorizado +10%". A função pura `applyNeighbourhoodChange(estado, grupo, pct)` (`lib/game/rules.ts`) é o gancho para as Notícias.
- **Calendário da partida**, igual para todos: 1 ano = 6 rodadas (ano 1 = rodadas 1 a 6, ano 2 = 7 a 12…), 2 semestres de 3 rodadas. O cabeçalho mostra _"Ano 2 · rodada 3 de 6"_. O pró-labore continua no Início (tabuleiro físico), sem ligação com o IR nem com as parcelas.
- **Imposto de renda a cada ano do calendário**: conta como renda o que o jogador recebe de aluguel, taxa de empresa, notícias, dividendos e rendimento da poupança (pró-labore, negociação, empréstimo e vendas não contam). Quando a rodada 6k acaba e começa a 6k+1, o ano fecha para todos ao mesmo tempo e cada um declara na sua primeira vez no ano novo (_"Declaração do ano X"_), uma vez por ano: os primeiros $ 2.000 são isentos e o resto paga 15%. Na **Declaração do IR**, o jogador escolhe **Declarar** (paga ao banco, +20 no score) ou **Sonegar** (não paga agora; 30% de chance de cair na **malha fina**, sorteada na hora: paga imposto + 100% de multa e perde 150 de score; se faltar saldo, paga pelo Pix como qualquer dívida, podendo vender, hipotecar ou falir). Não dá para passar a vez com a declaração pendente. A renda do ano aparece na carteira e no Extrato.
- **Score de crédito** (0 a 1000, começa em 500): parcela paga com o saldo +10 (no máximo 5 parcelas, +50 por empréstimo); parcelado quitado +30 (na última parcela ou quitando antes, se nenhuma parcela precisou de penhora); parcela com penhora −100; pagamento único quitado em dia ou antes +80 (também quando o banco cobra no vencimento e o saldo cobre); pagamento parcial do único +10 (uma vez por rodada, a partir de $ 500); declarar o IR +20; ficar sem saldo para um pagamento obrigatório −30 (aluguel ou imposto ao cair, a menor taxa da empresa, notícia de pagar, aposta da mesa, multa da malha fina; uma vez por jogada); malha fina −150; pagamento único vencido com penhora −200. Faixas: **Ruim** (<300) empresta até 25% do patrimônio líquido com +5 pp de juros, **Regular** (300–599) 50% e taxa da rodada, **Bom** (600–799) 70% e −2 pp, **Excelente** (800+) 90% e −4 pp. Abaixo de 200, o banco não empresta. Medidor na aba Banco e score de cada um no Placar.
- **Juros sorteados por rodada**: no começo de cada rodada o banco sorteia a taxa entre 5%, 8%, 10%, 12%, 15% e 20% (aviso para todos quando muda). Empréstimo novo = taxa da rodada + adicional do plano + ajuste do score (mínimo 2%), travada ao pegar; os que já existem não mudam. O sorteio (taxa e malha fina) usa uma semente guardada no estado da sala, então todos os celulares, a reaplicação depois de conflito e o desfazer chegam ao mesmo resultado.
- **Poupança** (aba Banco): deposite na sua vez e resgate a qualquer momento (até para pagar um aluguel), em múltiplos de $ 100 (ou tudo). No início de cada vez sua rende metade da taxa do banco da rodada, arredondado a $ 10; o rendimento fica na poupança, aparece no Extrato e conta como renda no IR. Entra no patrimônio e no Placar. Quando o banco cobra uma dívida, tira da poupança antes de penhorar; na falência, ela vai ao credor com o saldo.
- **Seguro do imóvel** (aba Imóveis, na sua vez): prêmio de 5% do valor atual (terreno + casas), cobre 10 rodadas (selo _"Segurado até a rodada N"_) e pode ser renovado no último dia ou depois de vencer. Se uma manchete do Jornal derrubar o preço do bairro, o banco paga ao dono segurado o valor perdido. Sem Jornal na sala, não há seguro. As cartas Notícia não têm perdas de imóvel, então o seguro não cobre nenhuma delas.
- **3 duplas seguidas**: o botão mostra a dupla da vez (_"Tirei dupla (2ª seguida)"_); na 3ª, uma confirmação avisa que o jogador vai direto para a detenção e a vez passa.
- **Financiamento na compra** (terreno ou casa): entrada de 20% pelo Pix e o resto nos mesmos planos e taxas do empréstimo (2x a 5x ou pagamento único), com uma parcela por semestre, como no empréstimo. Pede score a partir de 300 (faixa Regular), não usa o limite do empréstimo e vale um por imóvel. Enquanto não quitar, o imóvel fica alienado ao banco (selo _"Financiado · faltam N parcelas"_): não pode ser negociado nem hipotecado. Quitação antecipada na aba Banco. Se uma parcela não for paga (nem com a poupança), o banco retoma o próprio imóvel (as construções nele são vendidas pela metade do custo ao dono), cancela o financiamento e o score cai 100. A dívida dos financiamentos sai do patrimônio líquido.

- **Jornal da Cidade** (ligado por padrão; quem cria a sala pode desligar no lobby em "Jornal e Bolsa" e jogar com as regras clássicas): no começo da partida e de cada rodada nova (junto com o sorteio dos juros) sai uma edição com uma manchete sorteada de um baralho de 36, sem repetir até acabar (aí embaralha de novo, sem abrir com a última). A edição aparece em tela cheia uma vez em cada celular (masthead, número da edição = rodada, manchete, texto e a caixa **Efeito no jogo**) e fica na aba **Mercado → Jornal** com as edições anteriores. As 32 cartas Notícias continuam iguais (são pessoais). Efeitos:
  - **Bairros** (15): permanentes passam pela valorização do bairro (`applyNeighbourhoodChange`), ex.: metrô na Av. do Estado +20%, shopping na Higienópolis +15%; temporários valem N rodadas e expiram sozinhos, ex.: assaltos na Av. Brasil −15% por 3 rodadas, enchente na Santo Amaro −20% por 2, festival na Paulista +10% por 1. O multiplicador do bairro = permanente × cada temporário ativo (de 0,5 a 2,0), e os selos mostram os dois: _"Bairro valorizado +20% · Assaltos −15% até a rodada 9"_.
  - **Empresas** (13): escândalo (cota −25%), lançamento de sucesso (+20%), aquisição (+30%), multa do governo (−15%), recall (−20%), greve (dividendo zero por 2 rodadas), lucro recorde (dividendo +2 pontos por 2 rodadas), feriadão (cota +10% e taxa da casa +50% por 2 rodadas) etc.
  - **Economia** (8): juros sobem/caem (taxa da rodada ± 2 pontos, mínimo 2%), mercado em alta/baixa (todas as cotas ±10%), boom imobiliário (todos os bairros +5% para sempre), crise imobiliária (−10% por 2 rodadas), temporada de dividendos, investidores estrangeiros.
- **Bolsa** (aba **Mercado → Bolsa**): cada empresa tem uma cotação que começa em $ 200. A cada rodada nova: variação sorteada de −5% a +5% + manchete + decisões da gerência (somadas), entre $ 50 e $ 1.000, arredondada a $ 10; o histórico das últimas 12 rodadas vira o gráfico.
  - Comprar da empresa continua só ao cair na casa, uma por rodada, mas pela cotação. A taxa da casa = dados × $ 500 × cotação ÷ $ 200 (× os aumentos ativos, arredondada a $ 10; em dobro com as 6 empresas).
  - **Dividendos** a cada semestre (rodadas 4, 7, 10…, no começo da rodada): cotação do dia × rendimento do semestre (3% por rodada × 3 = 9%, mudado por manchetes e decisões que estejam valendo na rodada do pagamento; greve = zero), arredondado a $ 1 por cota, pagos pelo banco a quem tem cotas. Contam como renda do IR e chegam como aviso: _"Dividendos · Você recebeu $ 6 da Vox Telecom"_.
  - **Vender cotas à empresa**: na sua vez, quantas quiser, pela cotação de agora (não conta como renda).
  - Patrimônio e placar valem as cotas pela cotação.
  - A lista mostra cotação, variação na rodada, gráfico, dividendo, dono e as suas cotas; a empresa abre com o gráfico maior, quem tem as cotas, efeitos ativos, manchetes sobre ela e o botão de vender.
  - **Gerência**: o dono (6+ cotas) toma uma decisão por rodada em cada empresa que controla, na sua vez, e todos são avisados. **Investir** (paga $ 1.000: na próxima rodada a cota sobe de 10% a 25%, sorteado), **Dividendo extra** (o banco paga agora 5% da cotação por cota aos cotistas; na próxima rodada a cota cai 10%), **Cortar custos** (dividendo +2 pontos nas 2 rodadas seguintes, com 30% de chance de greve, sorteada no começo da próxima rodada: dividendo zero nela), **Campanha de marketing** (paga $ 500: taxa da casa +50% nesta rodada e na próxima).
  - Tudo usa o sorteio guardado na sala: todos os celulares, a reaplicação e o desfazer chegam à mesma manchete e às mesmas cotações. Salas antigas seguem com as cotas a $ 200 e ganham o Jornal e a Bolsa a partir da próxima rodada.

Os números destas regras ficam em `TIERS`, `HOOD`, `IR`, `CREDIT`, `CREDIT_BANDS`, `BANK_RATES`, `LOAN_PLANS`, `STOCK`, `DECISIONS` e `JORNAL`, e as manchetes em `HEADLINES` (`lib/game/data.ts`); os anúncios das casas em `lib/game/listings.ts`.

## Rodar no computador

Precisa do Node 20 ou mais novo.

```bash
npm install
npm run dev        # http://localhost:3000
```

Sem as variáveis do Supabase, o app entra no **modo local de teste** (aparece uma faixa avisando): a sala fica no `localStorage` e as abas do mesmo navegador se sincronizam pelo `BroadcastChannel`. Abra duas abas, crie a sala numa e entre pela outra. Nesse modo, cada aba é um jogador diferente.

Outros comandos:

```bash
npm test           # testes das regras (vitest)
npm run lint
npm run build && npm start
# teste de ponta a ponta com dois jogadores (Playwright; servidor rodando sem Supabase)
PLAYWRIGHT=$(npm root -g)/playwright/index.mjs BASE_URL=http://localhost:3000 npm run e2e
# negociação e empréstimo parcelado (pega $ 2.000 em 4x, espera a 1ª parcela e quita)
PLAYWRIGHT=$(npm root -g)/playwright/index.mjs BASE_URL=http://localhost:3000 npm run e2e:banco
# terreno e três padrões de casa, IR e score de crédito
PLAYWRIGHT=$(npm root -g)/playwright/index.mjs BASE_URL=http://localhost:3000 npm run e2e:fase2
# Jornal e Bolsa: edição da rodada, compra de cota ao cair, dividendos e venda à empresa
PLAYWRIGHT=$(npm root -g)/playwright/index.mjs BASE_URL=http://localhost:3000 npm run e2e:mercado
# poupança, seguro, financiamento do terreno e 3 duplas seguidas
PLAYWRIGHT=$(npm root -g)/playwright/index.mjs BASE_URL=http://localhost:3000 npm run e2e:poupanca
```

Os três primeiros testes de ponta a ponta desligam o Jornal e a Bolsa no lobby, porque conferem valores exatos.

## Configurar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com) (o plano gratuito basta).
2. Em **SQL Editor**, cole e rode o conteúdo de [`supabase/schema.sql`](supabase/schema.sql). Ele cria a tabela `rooms`, as políticas de acesso e liga o Realtime na tabela.
3. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**.
4. Copie `.env.example` para `.env.local` e preencha:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   ```

5. Reinicie o `npm run dev`. A faixa do modo local some.

> **Sobre segurança:** não há contas. As políticas (RLS) deixam a chave anon ler, criar e atualizar qualquer sala; quem souber um código consegue mexer naquela partida. É aceitável para um jogo entre amigos, não para guardar nada importante. Não há política de exclusão.

## Publicar na Vercel

1. Suba este repositório para o GitHub.
2. Na [Vercel](https://vercel.com/new), importe o repositório (o framework Next.js é detectado sozinho).
3. Em **Environment Variables**, adicione `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Faça o deploy e mande o link da sala para a turma.

## Como funciona

- **Uma linha por sala** na tabela `rooms (code, state jsonb, version, updated_at)`. Todos os celulares assinam as mudanças dessa linha pelo Supabase Realtime.
- **Regras puras** em `lib/game/rules.ts`: `applyAction(estado, ação, { actor })` devolve o novo estado ou lança `RuleError`. Cada celular aplica a ação localmente e grava com `update ... where version = esperada`; se outro celular gravou antes, relê a sala e reaplica a mesma ação (`lib/room/sync.ts`).
- **Desfazer**: guarda o estado anterior à última ação; só quem fez a ação pode desfazer.

```
app/                    páginas (início e /sala/[code])
components/             telas: Room, Lobby, Game, PlayView, PropsView, MercadoView, BankView, TradeViews, LedgerViews, Modals, Toasts, HouseArt, Credit
lib/game/data.ts        40 casas, 6 empresas, 32 cartas Notícia, 36 manchetes do Jornal
lib/game/rules.ts       regras (funções puras) + rules.test.ts, fase2.test.ts, parcelas.test.ts e jornal-bolsa.test.ts
lib/game/listings.ts    anúncios fictícios dos 3 padrões de casa de cada imóvel
lib/game/photos.ts      fotos reais das casas por padrão (arquivos em public/casas/)
lib/room/               Supabase, modo local, sincronização otimista, identidade, notificações
supabase/schema.sql     tabela, RLS e Realtime
scripts/                teste de ponta a ponta com Playwright
docs/screenshots/       telas no celular (390×844)
```
