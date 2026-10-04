# Banco Imobiliário (multijogador)

O banco da partida no celular de cada jogador. O tabuleiro, os peões e os dados continuam na mesa; o app cuida do dinheiro: compra de imóveis, aluguel via "Pix", taxas das empresas, cotas, casas e hotéis, hipoteca, detenção, notícias, falência e o extrato da partida.

- **Criar sala**: quem cria digita o nome e recebe um código de 5 letras e um link `/sala/CODIGO` para mandar no grupo.
- **Entrar na sala**: código e nome. Não há cadastro: cada aparelho guarda um id aleatório e o nome no `localStorage`.
- **Sala de espera**: mostra quem entrou em tempo real; quem criou define o saldo inicial e começa a partida.
- **Na partida**: cada celular mostra a própria carteira, o saldo de todos e de quem é a vez. Só quem está na vez escolhe a casa onde parou e vê os botões de ação; os outros acompanham. Qualquer um abre **Imóveis** (construir, vender, hipotecar os seus), **Banco** (negociar com outro jogador, empréstimo), **Extrato** e **Placar**.
- Quem recebe um pagamento ganha uma notificação, por exemplo: _"Beto pagou o aluguel da Av. 9 de Julho · +$ 60"_.

Regras do Super Banco Imobiliário portadas da versão "da mesa": pró-labore de $ 2.000 ao passar pelo Início, fiança de $ 500 (3 tentativas de dupla), hipoteca com 20% para tirar, e empresas com 10 cotas de $ 200 (quem tem 6 ou mais é dono e recebe dados × $ 500, em dobro se for dono das 6; sem dono, a taxa é dividida pelas cotas). Regras da casa:

- **Construção**: só no imóvel seu onde você parou nesta jogada, na tela da Jogada (no terreno, o site da imobiliária com os 3 padrões da primeira casa; com casas, o aluguel agora e com mais uma construção, e o botão "Construir casa" ou "Construir hotel" com o motivo quando não dá). Sem hipoteca, não precisa do grupo completo, uma construção por vez (por rodada, mesmo tirando dupla) e não no imóvel adquirido nesta rodada (compra, negociação ou falência). Hotel depois de 4 casas no mesmo imóvel. A aba Imóveis não constrói; vender construção vale a qualquer momento, de qualquer imóvel, pela metade do custo.
- **Cotas da empresa**: só ao cair nela e no máximo uma por rodada.
- **Negociação** (aba Banco, a qualquer momento): proponha a outro jogador uma troca de dinheiro, imóveis e cotas. Imóvel com casas não entra; hipotecado entra e continua hipotecado. A proposta fica pendente até ser aceita, recusada ou cancelada (uma por dupla de jogadores) e é validada de novo ao aceitar.
- **Empréstimo** (aba Banco, na sua vez): até 50% do patrimônio líquido (depende do score, abaixo), a partir de $ 1.000 em múltiplos de $ 500. Escolha o valor e veja a **simulação** dos 5 planos (taxa, parcela e total de cada um):
  - **Parcelado em 2x, 3x, 4x ou 5x**: taxa da rodada + 0, 2, 4 ou 6 pp; **Pagamento único em 5 rodadas**: + 8 pp. Depois vem o ajuste do score (mínimo 2%). Juros simples sobre o valor (total = valor × (1 + taxa)), travados ao pegar.
  - Parcelas = total ÷ N arredondado para $ 10; a última absorve a diferença (ex.: $ 2.000 a 12% em 3x = $ 750 + $ 750 + $ 740). Uma parcela é cobrada sozinha no início de cada vez do jogador, a partir da rodada seguinte (toast e aviso na mesa: _"Parcela 2/4 do empréstimo de Ana: $ 550"_; cada parcela vira uma linha no Extrato). A carteira mostra _"Parcela $ X na próxima vez"_ (em vermelho se o saldo não cobre).
  - Se o saldo não cobre a parcela, a **penhora** vale só para o valor dela (vende as construções pela metade do custo e toma os imóveis do mais barato para o mais caro, pelo valor de hipoteca, ou 0 se já hipotecado; o que sobrar fica com o jogador). Se nem assim cobrir, falência para o banco.
  - Dá para **quitar antes**, na sua vez, pagando todo o saldo restante (sem desconto de juros). No parcelado não há pagamento parcial avulso.
  - **Pagamento único**: tudo vence no início da sua vez 5 rodadas depois; pode pagar antes, inteiro ou em partes. No vencimento o banco cobra do saldo e, se faltar, faz a penhora do valor todo. Empréstimos de salas antigas (sem plano) seguem o pagamento único.
  - As constantes ficam em `LOAN` e `LOAN_PLANS` (`lib/game/data.ts`).
- **Terreno na compra, três padrões de casa na construção**: ao cair num imóvel livre, compra-se só o **terreno**, pelo preço do tabuleiro × bairro ("Terreno à venda"); o aluguel do terreno é o "sem casa" do tabuleiro × bairro. Numa jogada seguinte (não na rodada da compra), ao cair no próprio terreno, o **site da imobiliária** oferece a primeira casa em 3 padrões, como num site de imóveis: **Básica** (80% do custo de construção do tabuleiro, aluguéis com casas a 80%), **Intermediária** (100%) ou **Alto padrão** (130% do custo, aluguéis a 140%), tudo × bairro e arredondado a $ 10. Cada casa tem um anúncio fictício (tipo, m², quartos, suítes, banheiros, vagas e diferenciais como piscina, quintal ou vista) que acompanha o padrão do bairro. "Ver anúncio" (nas 3 opções e no cartão da casa de um imóvel) abre o **anúncio em tela cheia**: galeria de fotos (setas e deslizar, quando há mais de uma), selo do padrão, preço, ficha, bairro, tabela de aluguel do padrão e o botão de construir no rodapé. As fotos reais ficam em `public/casas/<padrão>/` (`basica`, `intermediaria`, `alto`) e são listadas em `lib/game/photos.ts`; cada imóvel começa numa foto escolhida de forma estável. Padrão sem fotos usa a ilustração. As próximas casas (até 4, depois o hotel) seguem o mesmo padrão e custam o mesmo, uma por rodada. Vender construção devolve a metade do custo do padrão; sem casas, o imóvel volta a ser só terreno e a próxima primeira casa escolhe o padrão de novo. Hipoteca só de terreno sem casas, pelo valor do tabuleiro × bairro. Patrimônio = terreno + casas pelo custo do padrão. Negociação só de terrenos (imóvel com casas não entra); na penhora as casas voltam pela metade do custo do padrão e o imóvel tomado volta ao banco como terreno, sem casa. Na falência para outro jogador, o imóvel vai com as casas e o padrão. Salas antigas: padrão guardado num imóvel sem casas é ignorado (é terreno); com casas, mantém o padrão (sem padrão guardado: Intermediária).
- **Valorização do bairro**: cada grupo de cor tem um multiplicador do preço do terreno, do custo das casas, dos aluguéis e da hipoteca (começa em 1,0; vai de 0,5 a 2,0). Aparece como "Bairro valorizado +10%". A função pura `applyNeighbourhoodChange(estado, grupo, pct)` (`lib/game/rules.ts`) é o gancho para as Notícias.
- **Imposto de renda a cada volta** (1 volta = 1 ano): conta como renda o que o jogador recebe de aluguel, taxa de empresa e notícias (pró-labore, negociação, empréstimo e vendas não contam). Ao passar ou parar no Início, a renda do ano fecha: os primeiros $ 2.000 são isentos e o resto paga 15%. Na **Declaração do IR**, o jogador escolhe **Declarar** (paga ao banco, +20 no score) ou **Sonegar** (não paga agora; 30% de chance de cair na **malha fina**, sorteada na hora: paga imposto + 100% de multa e perde 150 de score; se faltar saldo, paga pelo Pix como qualquer dívida, podendo vender, hipotecar ou falir). Não dá para passar a vez com a declaração pendente. A renda do ano aparece na carteira e no Extrato.
- **Score de crédito** (0 a 1000, começa em 500): parcela paga com o saldo +10 (no máximo 5 parcelas, +50 por empréstimo); parcelado quitado +30 (na última parcela ou quitando antes, se nenhuma parcela precisou de penhora); parcela com penhora −100; pagamento único quitado em dia ou antes +80 (também quando o banco cobra no vencimento e o saldo cobre); pagamento parcial do único +10 (uma vez por rodada, a partir de $ 500); declarar o IR +20; ficar sem saldo para um pagamento obrigatório −30 (aluguel ou imposto ao cair, a menor taxa da empresa, notícia de pagar, aposta da mesa, multa da malha fina; uma vez por jogada); malha fina −150; pagamento único vencido com penhora −200. Faixas: **Ruim** (<300) empresta até 25% do patrimônio líquido com +5 pp de juros, **Regular** (300–599) 50% e taxa da rodada, **Bom** (600–799) 70% e −2 pp, **Excelente** (800+) 90% e −4 pp. Abaixo de 200, o banco não empresta. Medidor na aba Banco e score de cada um no Placar.
- **Juros sorteados por rodada**: no começo de cada rodada o banco sorteia a taxa entre 5%, 8%, 10%, 12%, 15% e 20% (aviso para todos quando muda). Empréstimo novo = taxa da rodada + adicional do plano + ajuste do score (mínimo 2%), travada ao pegar; os que já existem não mudam. O sorteio (taxa e malha fina) usa uma semente guardada no estado da sala, então todos os celulares, a reaplicação depois de conflito e o desfazer chegam ao mesmo resultado.

Os números destas regras ficam em `TIERS`, `HOOD`, `IR`, `CREDIT`, `CREDIT_BANDS`, `BANK_RATES` e `LOAN_PLANS` (`lib/game/data.ts`); os anúncios das casas em `lib/game/listings.ts`.

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
```

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
components/             telas: Room, Lobby, Game, PlayView, PropsView, BankView, TradeViews, LedgerViews, Modals, Toasts, HouseArt, Credit
lib/game/data.ts        40 casas, 6 empresas, 32 cartas Notícia
lib/game/rules.ts       regras (funções puras) + rules.test.ts, fase2.test.ts e parcelas.test.ts
lib/game/listings.ts    anúncios fictícios dos 3 padrões de casa de cada imóvel
lib/game/photos.ts      fotos reais das casas por padrão (arquivos em public/casas/)
lib/room/               Supabase, modo local, sincronização otimista, identidade, notificações
supabase/schema.sql     tabela, RLS e Realtime
scripts/                teste de ponta a ponta com Playwright
docs/screenshots/       telas no celular (390×844)
```
