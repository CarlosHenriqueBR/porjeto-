-- ===========================================================================
-- Central Operation — setup do Supabase
-- Cole tudo isto no SQL Editor do seu projeto e clique em Run. Roda uma vez só.
-- ===========================================================================

-- 1) A tabela. O sistema inteiro vive numa linha, numa coluna JSONB.
create table if not exists public.central_db (
  id         text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- 2) RLS ligada e SEM políticas: a chave anon (a que vaza no navegador) não
--    consegue ler nem escrever nada. Só a service_role, usada no servidor.
alter table public.central_db enable row level security;

-- 3) Estado inicial: os 3 sócios como owners, senha Operacao@2026,
--    com troca obrigatória no primeiro acesso. As senhas são hashes scrypt.
insert into public.central_db (id, data, updated_at)
values ('central-db', $seed${"version":1,"updatedAt":"2026-08-12T02:05:17.796Z","users":[{"id":"u_seed1","name":"Artur Maia","email":"artur@operacao.com","role":"owner","perms":{"dashboard":true,"financas":true,"logistica":true,"trafego":true,"cofre":true,"config":true},"active":true,"passHash":"scrypt$LH6-2kCldh1AWX9_fEOvsw$pzub7_op40n_kmcznDt74XTsUEiM4ZJCJMuQFAtr92w","mustChangePassword":true,"createdAt":"2026-08-12T02:05:17.797Z"},{"id":"u_seed2","name":"Carlos Henrique","email":"carlos@operacao.com","role":"owner","perms":{"dashboard":true,"financas":true,"logistica":true,"trafego":true,"cofre":true,"config":true},"active":true,"passHash":"scrypt$Z7J_njRGXiTGCwKyzftXkQ$OgytRM71Y-z0Uq6OGbZeC7Q646rtsuZRL34M4En0v-4","mustChangePassword":true,"createdAt":"2026-08-12T02:05:17.797Z"},{"id":"u_seed3","name":"Elisson","email":"elisson@operacao.com","role":"owner","perms":{"dashboard":true,"financas":true,"logistica":true,"trafego":true,"cofre":true,"config":true},"active":true,"passHash":"scrypt$MkYycOfqGoxSz3cO-lG6gw$nFR6IXkPQsW5bLm32Hi7Kgw0NqkyNsJvRuj4pOUklrc","mustChangePassword":true,"createdAt":"2026-08-12T02:05:17.797Z"}],"sectors":[{"id":"edicao","name":"Edição / Design","color":"#9085e9","sla":2},{"id":"dev","name":"Desenvolvimento","color":"#3987e5","sla":3},{"id":"trafego","name":"Tráfego","color":"#199e70","sla":1},{"id":"copy","name":"Copy","color":"#d95926","sla":2},{"id":"financeiro","name":"Financeiro","color":"#c98500","sla":3}],"domains":[],"accounts":[],"structures":[],"metrics":[],"entries":[],"tasks":[],"vault":[],"activities":[{"id":"a_seed","ts":"2026-08-12T02:05:17.797Z","userId":"system","userName":"Sistema","entity":"sistema","entityId":null,"action":"seed","pillar":null,"message":"Central Operation inicializada com os 3 sócios como owners."}],"notifications":[],"settings":{"utmifyLastSync":null,"currency":"BRL","companyName":"Central Operation"}}$seed$::jsonb, now())
on conflict (id) do nothing;

-- 4) Conferência
select
  jsonb_array_length(data->'users')   as usuarios,
  jsonb_array_length(data->'sectors') as setores
from public.central_db where id = 'central-db';
