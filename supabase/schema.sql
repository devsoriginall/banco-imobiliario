-- Banco Imobiliário: uma linha por sala, com o estado inteiro da partida em JSON.
-- Rode no Supabase em SQL Editor → New query → Run.

create table if not exists public.rooms (
  code        text primary key check (code ~ '^[A-Z0-9]{5}$'),
  state       jsonb not null,
  version     integer not null default 1,
  updated_at  timestamptz not null default now()
);

-- Segurança: o app não tem contas, então a chave anon pode ler, criar e atualizar salas.
-- Aceitável para um jogo entre amigos (quem tem o código da sala consegue mexer nela).
-- Não há política de DELETE: ninguém apaga salas pelo app.
alter table public.rooms enable row level security;

drop policy if exists "rooms: anon lê" on public.rooms;
create policy "rooms: anon lê" on public.rooms
  for select to anon, authenticated using (true);

drop policy if exists "rooms: anon cria" on public.rooms;
create policy "rooms: anon cria" on public.rooms
  for insert to anon, authenticated with check (true);

drop policy if exists "rooms: anon atualiza" on public.rooms;
create policy "rooms: anon atualiza" on public.rooms
  for update to anon, authenticated using (true) with check (true);

grant select, insert, update on public.rooms to anon, authenticated;

-- Realtime: avisa os celulares a cada mudança na linha da sala.
do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception when duplicate_object then null;
end $$;

-- Faz a API do Supabase enxergar a tabela nova na hora.
notify pgrst, 'reload schema';

-- Opcional: apagar salas paradas há mais de 30 dias (rode quando quiser, ou agende com pg_cron).
-- delete from public.rooms where updated_at < now() - interval '30 days';
