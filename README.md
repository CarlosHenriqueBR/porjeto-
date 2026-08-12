# Central Operation

Painel interno da operação, em React 19 + TypeScript. Quatro pilares:

| Pilar | O que faz |
| --- | --- |
| **Dashboard** | A maquete da empresa: os quatro pilares num olhar, alertas do que está quebrado, lucro do dia e do mês, gráficos e a carga de cada setor. |
| **Finanças** | Entradas e saídas categorizadas, contas a pagar e a receber com vencimento, despesas recorrentes e **DRE mensal** completo (receita bruta → deduções → mídia → margem de contribuição → lucro líquido). |
| **Logística** | Quadro estilo Trello com raia por setor (Edição/Design, Desenvolvimento, Tráfego, Copy, Financeiro), responsável, prioridade, prazo e SLA. |
| **Tráfego** | Domínios com flag de status, contas de anúncio, estruturas e as métricas diárias — manuais ou puxadas da UTMify. |

Mais um **cofre de acessos** criptografado, **histórico auditado** de tudo e
**permissões por pilar**.

Tudo atualiza em tempo real: quando alguém troca uma flag ou move um cartão, as
outras telas se redesenham em ~3 segundos, sem ninguém apertar F5.

---

## 1. Rodar na sua máquina

```bash
npm install
npm run dev      # http://localhost:3000
npm run demo     # (opcional) preenche com dados de exemplo
npm run seed     # zera o banco e recria os 3 sócios
```

Acessos iniciais (senha em `SEED_PASSWORD`, padrão `Operacao@2026`):

| Pessoa | E-mail | Perfil |
| --- | --- | --- |
| Artur Maia | `artur@operacao.com` | owner |
| Carlos Henrique | `carlos@operacao.com` | owner |
| Elisson | `elisson@operacao.com` | owner |

O sistema exige a troca da senha no primeiro acesso de cada um.

Outros comandos:

```bash
npm run build      # gera public/build (é o que a Vercel roda)
npm run typecheck  # tsc --noEmit
```

---

## 2. Subir na Vercel

```bash
npm i -g vercel
vercel            # preview
vercel --prod     # produção
```

Ou conecte o repositório pelo painel. O `vercel.json` já diz tudo: build com
`npm run build`, saída em `public/`, funções em `api/` e o cron diário.

### 2.1 Banco de dados (obrigatório em produção)

O disco da Vercel é somente-leitura e efêmero: um `db.json` gravado lá some no
próximo deploy. O formato continua sendo um único JSON — só muda onde ele mora.

**Upstash Redis (grátis, ~2 minutos):**

1. [console.upstash.com](https://console.upstash.com) → Create Database → região `sa-east-1` (São Paulo).
2. Copie **UPSTASH_REDIS_REST_URL** e **UPSTASH_REDIS_REST_TOKEN**.
3. Na Vercel → Settings → Environment Variables, cole como `KV_REST_API_URL` e `KV_REST_API_TOKEN`.

Alternativa: crie um Blob Store e defina `BLOB_READ_WRITE_TOKEN`.

### 2.2 Variáveis de ambiente

| Variável | Para quê |
| --- | --- |
| `SESSION_SECRET` | assina o cookie de sessão — **obrigatória** |
| `VAULT_SECRET` | chave de criptografia do cofre — **obrigatória** |
| `SEED_PASSWORD` | senha inicial (só na primeira execução) |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | banco em produção |
| `CRON_SECRET` | protege o cron diário |
| `INGEST_TOKEN` | permite push externo de faturamento |
| `UTMIFY_MCP_URL` | servidor MCP da UTMify (seção 5) |

> **Trocar `VAULT_SECRET` depois de já ter senhas salvas torna essas senhas
> ilegíveis.** Defina antes de cadastrar o primeiro acesso no cofre.

---

## 3. Como o tempo real funciona

Cada tela consulta `GET /api/state?v=<versão>` a cada 3 segundos. Toda escrita
incrementa a versão do banco; quando a versão muda, a resposta traz o estado
novo e o React redesenha só o que mudou. Se nada mudou, a resposta é
`{changed:false}` — alguns bytes. Sua própria ação aparece na hora, sem esperar
o ciclo.

Isso funciona em serverless (a Vercel não mantém websocket aberto de graça) e
consome praticamente nada com três pessoas usando o dia todo.

---

## 4. Permissões

Dois perfis:

- **owner** — acesso total, pode criar pessoas e mexer em permissões. Os três sócios nascem assim.
- **member** — você marca quais pilares ele enxerga (Dashboard, Finanças, Logística, Tráfego, Cofre, Configurações).

O bloqueio é no servidor, não só na tela: `/api/state` **não envia** os dados dos
pilares que a pessoa não tem, e `/api/mutate` recusa a ação com 403. Um editor de
vídeo com acesso só à Logística nunca recebe faturamento nem senha, nem
inspecionando a resposta da API.

Precisa existir sempre pelo menos um owner ativo — o sistema recusa a mudança que
deixaria a operação sem dono.

---

## 5. Integração com a UTMify

A API pública da UTMify (`api.utmify.com.br/api-credentials/orders`) só **recebe**
vendas — não há endpoint documentado para ler faturamento. Por isso existem três
caminhos, nessa ordem de preferência:

### Caminho A — servidor MCP (o link que você tem)

1. Na Vercel, defina `UTMIFY_MCP_URL` com a URL completa do MCP, incluindo o token.
2. Abra **Configurações → Descobrir ferramentas MCP**. O sistema conecta, lista as
   ferramentas do servidor e mostra os parâmetros de cada uma.
3. Coloque o nome da ferramenta de métricas em `UTMIFY_MCP_TOOL`. Se ela pedir
   argumentos diferentes do padrão, use `UTMIFY_MCP_ARGS`, por exemplo:
   `{"startDate":"{date}","endDate":"{date}"}`.
4. Se os campos não forem detectados sozinhos, fixe os caminhos com
   `UTMIFY_FIELD_REVENUE`, `UTMIFY_FIELD_ADSPEND` e `UTMIFY_FIELD_PROFIT`.

Sem o passo 3, o sistema escolhe a ferramenta mais provável pelo nome/descrição e
procura os valores por nome de campo (`revenue`, `faturamento`, `adSpend`,
`gasto`, `lucro`…). Costuma acertar, mas fixar é mais seguro.

### Caminho B — endpoint REST próprio

`UTMIFY_METRICS_URL=https://.../metrics?date={date}` + `UTMIFY_TOKEN=...`

### Caminho C — push externo (n8n, Make, script)

```bash
curl -X POST https://SEU-APP.vercel.app/api/sync-utmify \
  -H "x-ingest-token: SEU_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"date":"2026-08-11","revenue":15000,"adSpend":6000,"otherCost":900}'
```

Aceita vários dias de uma vez: `{"days":[{...},{...}]}`.

O cron da Vercel chama `/api/sync-utmify` todo dia às **03:00 de Brasília**. Dá
para disparar na mão em Configurações → Sincronizar agora.

---

## 6. Como o DRE é montado

Faturamento e mídia entram por **duas fontes que se somam sem duplicar**:

- **Métricas de Tráfego** (`metrics`) — o que a UTMify informa ou o que você lança no dia.
- **Lançamentos do Financeiro** (`entries`) — todo o resto.

Cada categoria de lançamento pertence a um grupo, e o grupo decide a linha do DRE:

| Grupo | Categorias | Linha |
| --- | --- | --- |
| `receita` | Vendas, Outras receitas, Aporte | Receita bruta |
| `deducao` | Taxa de gateway, Chargeback, Reembolso, Imposto | (−) Deduções |
| `trafego` | Tráfego (mídia) | (−) Custo de mídia |
| `operacao` | Equipe, Ferramentas, Infra, Contas, Pró-labore, Outros | (−) Despesas operacionais |

Por isso o formulário avisa quando você escolhe *Vendas* ou *Tráfego*: use essas
categorias apenas para o que **não** está nas métricas diárias, senão o valor
conta duas vezes.

---

## 7. Segurança

- Senhas com **scrypt** (salt por usuário), nunca em texto puro.
- Sessão em cookie **HttpOnly + SameSite=Lax + Secure**, assinado com HMAC-SHA256, 7 dias.
- **Rate limit** no login por conta (8 erros / 10 min) e por IP (40 / 10 min).
  Só tentativa errada consome — o erro de uma pessoa não tranca a equipe inteira.
- Cofre com **AES-256-GCM**. As senhas nunca trafegam na listagem: aparecem uma
  por vez, somem em 45 s, e **cada visualização vira registro no histórico**.
- Permissões aplicadas no servidor (ver seção 4).
- `X-Frame-Options: DENY`, `noindex`, zero CDN externo, zero rastreador.

---

## 8. Estrutura

```
public/index.html          casca da SPA
src/
  main.tsx  App.tsx        boot e roteamento
  styles.css               design system (cores, componentes, responsivo)
  types.ts                 contratos de dados
  lib/
    api.ts                 cliente HTTP + tradução dos erros
    router.ts              roteador por hash (useSyncExternalStore)
    format.ts              moeda, datas, iniciais
    calc.ts                séries, DRE, contas em aberto, carga por setor
    model.ts               listas de status, categorias, rótulos
  store/AppContext.tsx     estado global, polling de 3 s, toasts
  components/
    Layout.tsx             sidebar, topbar, notificações, tabbar mobile
    ui.tsx                 Card, Tile, Modal, Field, Select, Chip, useForm…
    charts.tsx             gráficos SVG próprios, com hover e tooltip
    Icon.tsx               ícones
  pages/                   Login, Dashboard, Financas, Logistica, Trafego,
                           Cofre, Historico, Config
api/
  login.js  logout.js      autenticação
  state.js                 snapshot + versão (o que o polling consulta)
  mutate.js                todas as escritas, por ação, com log e notificação
  vault-reveal.js          revela um segredo (auditado)
  sync-utmify.js           cron + descoberta MCP + ingest
  _lib/                    store (banco), crypto, http, modelo, cliente MCP
scripts/
  dev.mjs                  build em watch + API igual à da Vercel
  build.mjs                bundle de produção (esbuild)
  seed.mjs  demo.mjs       banco zerado / dados de exemplo
```

**Para adicionar um campo:** acrescente na ação correspondente em
`api/mutate.js`, no tipo em `src/types.ts` e no formulário da página. O banco não
tem schema fixo — campo novo aparece sozinho.

**Para adicionar um setor:** Configurações → Setores. Não precisa mexer no código.

**Para adicionar uma categoria financeira:** edite `CATEGORIES` nos dois lugares
(`api/_lib/model.js` e `src/lib/model.ts`) escolhendo o grupo do DRE.
