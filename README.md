# Banco Imobiliário (multijogador)

O banco da partida no celular de cada jogador. O tabuleiro, os peões e os dados continuam na mesa; o app cuida do dinheiro: compra de imóveis, aluguel via "Pix", taxas das empresas, cotas, casas e hotéis, hipoteca, detenção, notícias, falência e o extrato da partida.

- **Criar sala**: quem cria digita o nome e recebe um código de 5 letras e um link `/sala/CODIGO` para mandar no grupo.
- **Entrar na sala**: código e nome. Não há cadastro: cada aparelho guarda um id aleatório e o nome no `localStorage`.
- **Sala de espera**: mostra quem entrou em tempo real; quem criou define o saldo inicial e começa a partida.
- **Na partida**: cada celular mostra a própria carteira, o saldo de todos e de quem é a vez. Só quem está na vez escolhe a casa onde parou e vê os botões de ação; os outros acompanham. Qualquer um abre **Imóveis** (construir, vender, hipotecar os seus), **Banco** (negociar com outro jogador, empréstimo), **Extrato** e **Placar**.
- Quem recebe um pagamento ganha uma notificação, por exemplo: _"Beto pagou o aluguel da Av. 9 de Julho · +$ 60"_.

Regras do Super Banco Imobiliário portadas da versão "da mesa": pró-labore de $ 2.000 ao passar pelo Início, fiança de $ 500 (3 tentativas de dupla), hipoteca com 20% para tirar, e empresas com 10 cotas de $ 200 (quem tem 6 ou mais é dono e recebe dados × $ 500, em dobro se for dono das 6; sem dono, a taxa é dividida pelas cotas). Regras da casa:

- **Construção**: em qualquer imóvel seu sem hipoteca (não precisa do grupo completo), na sua vez, uma construção por rodada no total e não no imóvel adquirido nesta rodada (compra, negociação ou falência). Hotel depois de 4 casas no mesmo imóvel. Vender construção vale a qualquer momento, de qualquer imóvel, pela metade do custo.
- **Cotas da empresa**: só ao cair nela e no máximo uma por rodada.
- **Negociação** (aba Banco, a qualquer momento): proponha a outro jogador uma troca de dinheiro, imóveis e cotas. Imóvel com casas não entra; hipotecado entra e continua hipotecado. A proposta fica pendente até ser aceita, recusada ou cancelada (uma por dupla de jogadores) e é validada de novo ao aceitar.
- **Empréstimo** (aba Banco, na sua vez): até 50% do patrimônio líquido (depende do score, abaixo), a partir de $ 1.000 em múltiplos de $ 500, juros sobre o valor pela taxa da rodada (abaixo), vence em 5 rodadas; pode pagar antes, inteiro ou em partes. No vencimento, no início da sua vez, o banco cobra do saldo; se faltar, faz a **penhora** (vende as construções pela metade do custo e toma os imóveis do mais barato para o mais caro, pelo valor de hipoteca, ou 0 se já hipotecado; o que sobrar fica com o jogador). Se nem assim cobrir, falência. As constantes ficam em `LOAN` (`lib/game/data.ts`).
- **Três casas na compra**: ao comprar um imóvel livre, escolha uma das 3 casas do terreno, como num site de imóveis: **Básica** (80% do preço do tabuleiro, aluguéis a 80%), **Intermediária** (100%, igual ao tabuleiro) ou **Alto padrão** (130% do preço, aluguéis a 140%). Todos os aluguéis (sem casa, com casas e hotel) e o valor de hipoteca seguem a casa; o custo de construir não muda. Cada casa tem um anúncio fictício (tipo, m², quartos, vagas) que acompanha o padrão do bairro, com ilustração própria. A casa aparece em Imóveis, no aluguel, nos comprovantes e nas negociações, e vai junto na negociação e na falência. Imóvel que volta ao banco (penhora ou falência) fica com a casa: quem comprar depois leva a mesma. Salas antigas: Intermediária.
- **Valorização do bairro**: cada grupo de cor tem um multiplicador de preço, aluguel e hipoteca (começa em 1,0; vai de 0,5 a 2,0). Aparece como "Bairro valorizado +10%". A função pura `applyNeighbourhoodChange(estado, grupo, pct)` (`lib/game/rules.ts`) é o gancho para as Notícias.
- **Imposto de renda a cada volta** (1 volta = 1 ano): conta como renda o que o jogador recebe de aluguel, taxa de empresa e notícias (pró-labore, negociação, empréstimo e vendas não contam). Ao passar ou parar no Início, a renda do ano fecha: os primeiros $ 2.000 são isentos e o resto paga 15%. Na **Declaração do IR**, o jogador escolhe **Declarar** (paga ao banco, +20 no score) ou **Sonegar** (não paga agora; 30% de chance de cair na **malha fina**, sorteada na hora: paga imposto + 100% de multa e perde 150 de score; se faltar saldo, paga pelo Pix como qualquer dívida, podendo vender, hipotecar ou falir). Não dá para passar a vez com a declaração pendente. A renda do ano aparece na carteira e no Extrato.
- **Score de crédito** (0 a 1000, começa em 500): quitar empréstimo em dia ou antes +80 (também quando o banco cobra no vencimento e o saldo cobre); pagamento parcial +10 (uma vez por rodada, a partir de $ 500); declarar o IR +20; ficar sem saldo para um pagamento obrigatório −30 (aluguel ou imposto ao cair, a menor taxa da empresa, notícia de pagar, aposta da mesa, multa da malha fina; uma vez por jogada); malha fina −150; empréstimo vencido com penhora −200. Faixas: **Ruim** (<300) empresta até 25% do patrimônio líquido com +5 pp de juros, **Regular** (300–599) 50% e taxa da rodada, **Bom** (600–799) 70% e −2 pp, **Excelente** (800+) 90% e −4 pp. Abaixo de 200, o banco não empresta. Medidor na aba Banco e score de cada um no Placar.
- **Juros sorteados por rodada**: no começo de cada rodada o banco sorteia a taxa entre 5%, 8%, 10%, 12%, 15% e 20% (aviso para todos quando muda). Empréstimo novo = taxa da rodada + ajuste do score (mínimo 2%), travada ao pegar; os que já existem não mudam. O sorteio (taxa e malha fina) usa uma semente guardada no estado da sala, então todos os celulares, a reaplicação depois de conflito e o desfazer chegam ao mesmo resultado.

Os números destas regras ficam em `TIERS`, `HOOD`, `IR`, `CREDIT`, `CREDIT_BANDS` e `BANK_RATES` (`lib/game/data.ts`); os anúncios das casas em `lib/game/listings.ts`.

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
# negociação e empréstimo
PLAYWRIGHT=$(npm root -g)/playwright/index.mjs BASE_URL=http://localhost:3000 npm run e2e:banco
# três casas, IR e score de crédito
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
lib/game/rules.ts       regras (funções puras) + rules.test.ts e fase2.test.ts
lib/game/listings.ts    anúncios fictícios das 3 casas de cada imóvel
lib/room/               Supabase, modo local, sincronização otimista, identidade, notificações
supabase/schema.sql     tabela, RLS e Realtime
scripts/                teste de ponta a ponta com Playwright
docs/screenshots/       telas no celular (390×844)
```
