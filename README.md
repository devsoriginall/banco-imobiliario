# Banco Imobiliário (multijogador)

O banco da partida no celular de cada jogador. O tabuleiro, os peões e os dados continuam na mesa; o app cuida do dinheiro: compra de imóveis, aluguel via "Pix", taxas das empresas, cotas, casas e hotéis, hipoteca, detenção, notícias, falência e o extrato da partida.

- **Criar sala**: quem cria digita o nome e recebe um código de 5 letras e um link `/sala/CODIGO` para mandar no grupo.
- **Entrar na sala**: código e nome. Não há cadastro: cada aparelho guarda um id aleatório e o nome no `localStorage`.
- **Sala de espera**: mostra quem entrou em tempo real; quem criou define o saldo inicial e começa a partida.
- **Na partida**: cada celular mostra a própria carteira, o saldo de todos e de quem é a vez. Só quem está na vez escolhe a casa onde parou e vê os botões de ação; os outros acompanham. Qualquer um abre **Imóveis** (construir, vender, hipotecar os seus), **Extrato** e **Placar**.
- Quem recebe um pagamento ganha uma notificação, por exemplo: _"Beto pagou o aluguel da Av. 9 de Julho · +$ 60"_.

Regras do Super Banco Imobiliário portadas da versão "da mesa": pró-labore de $ 2.000 ao passar pelo Início, fiança de $ 500 (3 tentativas de dupla), hipoteca com 20% para tirar, construção em rodízio, e empresas com 10 cotas de $ 200 (quem tem 6 ou mais é dono e recebe dados × $ 500, em dobro se for dono das 6; sem dono, a taxa é dividida pelas cotas).

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
components/             telas: Room, Lobby, Game, PlayView, PropsView, LedgerViews, Modals, Toasts
lib/game/data.ts        40 casas, 6 empresas, 32 cartas Notícia
lib/game/rules.ts       regras (funções puras) + rules.test.ts
lib/room/               Supabase, modo local, sincronização otimista, identidade, notificações
supabase/schema.sql     tabela, RLS e Realtime
scripts/                teste de ponta a ponta com Playwright
docs/screenshots/       telas no celular (390×844)
```
