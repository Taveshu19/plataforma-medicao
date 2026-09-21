# Fundação de Dados e Regras — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir o banco de dados completo da plataforma de medição, com isolamento multi-tenant, a regra de saldo, a máquina de estados e a auditoria todos aplicados no Postgres e cobertos por teste.

**Architecture:** Postgres gerenciado pelo Supabase. Toda regra de negócio que protege dinheiro vive no banco — funções, constraints e triggers — porque o cliente roda no celular do empreiteiro e pode ser contornado. O isolamento entre construtoras é Row Level Security, não filtro de aplicação: esquecer um filtro retorna zero linhas em vez de vazar dados. Os testes rodam contra a stack local do Supabase, exercendo as políticas com JWT real de cada papel.

**Tech Stack:** Next.js 15 (App Router, TypeScript), Supabase (Postgres 15, Auth, Storage), Supabase CLI para migrations, Vitest + `pg` + `@supabase/supabase-js` para testes.

## Global Constraints

- **Migrations** ficam em `supabase/migrations/`, nomeadas `NNN_descricao.sql` com numeração sequencial de três dígitos. Nunca editar uma migration já commitada — criar outra.
- **Toda tabela de negócio** carrega `company_id uuid not null references companies(id)`. Sem exceção, mesmo quando o dado seria alcançável por join.
- **Toda tabela de negócio** tem `alter table ... enable row level security` e pelo menos uma policy. Uma tabela sem policy é um bug, não um TODO.
- **Quantidade e dinheiro** usam `numeric(14,4)`. Nunca `float`, `real` ou `double precision`.
- **Nada derivável é armazenado.** Saldo, subtotal e total de medição são sempre calculados. Não criar colunas para eles.
- **`qty_requested` nunca sofre UPDATE** depois que a medição é enviada. Ajuste do aprovador vai em `qty_approved`.
- **Identificadores em inglês, textos em português.** Tabelas e colunas em inglês (`contract_items`, `qty_requested`); mensagens de `raise exception` em português, porque chegam à tela do usuário.
- **Mensagens de erro de saldo** devem informar o máximo permitido, não apenas recusar.
- **Testes** rodam com `supabase start` ativo. Todo teste limpa o que criou.
- **Commits** em português com prefixo convencional: `feat:`, `test:`, `chore:`, `fix:`.

---

### Task 1: Scaffold do projeto e stack local

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`
- Create: `supabase/config.toml` (gerado pela CLI)
- Create: `tests/helpers/db.ts`
- Create: `tests/smoke.test.ts`
- Create: `.env.test`, `.gitignore`

**Interfaces:**
- Consumes: nada.
- Produces: `sql<T>(query: string, params?: unknown[]): Promise<T[]>` em `tests/helpers/db.ts` — usada por todas as tarefas seguintes para consultar o banco como superusuário.

- [ ] **Step 1: Criar o projeto Next.js**

```bash
npx create-next-app@latest . --typescript --app --tailwind --eslint --src-dir --import-alias "@/*" --no-turbopack
```

- [ ] **Step 2: Instalar dependências de banco e teste**

```bash
npm install @supabase/supabase-js
npm install -D vitest pg @types/pg dotenv
```

- [ ] **Step 3: Inicializar o Supabase e subir a stack local**

```bash
npx supabase init
npx supabase start
```

O `supabase start` baixa imagens Docker na primeira vez e demora alguns minutos. Ao final imprime as URLs e chaves locais.

- [ ] **Step 4: Gravar as chaves locais em `.env.test`**

```bash
npx supabase status -o env > .env.test
```

Acrescentar ao `.gitignore`:

```
.env.test
.env*.local
```

- [ ] **Step 5: Criar o helper de banco**

`tests/helpers/db.ts`:

```typescript
import { Pool } from 'pg'
import { config } from 'dotenv'

config({ path: '.env.test' })

export const DB_URL =
  process.env.DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const pool = new Pool({ connectionString: DB_URL })

export async function sql<T = Record<string, unknown>>(
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query(query, params)
  return result.rows as T[]
}

export async function closePool(): Promise<void> {
  await pool.end()
}
```

- [ ] **Step 6: Configurar o Vitest**

`vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 20000,
  },
})
```

`fileParallelism: false` é deliberado: os testes compartilham um único banco local e criar/limpar dados em paralelo gera falsos negativos.

Adicionar ao `package.json`:

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "db:reset": "supabase db reset"
}
```

- [ ] **Step 7: Escrever o teste de fumaça**

`tests/smoke.test.ts`:

```typescript
import { describe, it, expect, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'

afterAll(async () => {
  await closePool()
})

describe('stack local', () => {
  it('conecta no Postgres do Supabase', async () => {
    const rows = await sql<{ ok: number }>('select 1 as ok')
    expect(rows[0].ok).toBe(1)
  })

  it('tem a extensao pgcrypto para gen_random_uuid', async () => {
    const rows = await sql<{ id: string }>('select gen_random_uuid() as id')
    expect(rows[0].id).toMatch(/^[0-9a-f-]{36}$/)
  })
})
```

- [ ] **Step 8: Rodar os testes**

Run: `npm test`
Expected: PASS, 2 testes.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js, Supabase local e Vitest"
```

---

### Task 2: Tenancy — empresas, perfis e vínculos

Estabelece o padrão de RLS que todas as tabelas seguintes copiam. A função auxiliar `auth_company_ids()` é `security definer` de propósito: sem isso, a policy de `memberships` consultaria `memberships`, e o Postgres entraria em recursão infinita.

**Files:**
- Create: `supabase/migrations/001_tenancy.sql`
- Create: `tests/helpers/auth.ts`
- Create: `tests/tenancy.test.ts`

**Interfaces:**
- Consumes: `sql()` da Task 1.
- Produces:
  - Tabelas `companies(id, name, created_at)`, `profiles(id, full_name, phone, created_at)`, `memberships(id, user_id, company_id, role, created_at)`.
  - Enum `app_role` com os valores `admin`, `engenharia`, `coordenacao`, `gerencia`, `financeiro`, `empreiteiro`, `incorporadora`.
  - Função `auth_company_ids() returns setof uuid`.
  - `createUser(email, companyId, role): Promise<{ userId, client }>` em `tests/helpers/auth.ts`, devolvendo um cliente supabase-js já autenticado como aquele usuário.

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/001_tenancy.sql`:

```sql
create extension if not exists pgcrypto;

create table companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  phone      text,
  created_at timestamptz not null default now()
);

create type app_role as enum (
  'admin', 'engenharia', 'coordenacao', 'gerencia',
  'financeiro', 'empreiteiro', 'incorporadora'
);

create table memberships (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  role       app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, company_id, role)
);

create index memberships_user_idx on memberships (user_id);

-- security definer para nao recursar na policy de memberships
create or replace function auth_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from memberships where user_id = auth.uid()
$$;

alter table companies   enable row level security;
alter table profiles    enable row level security;
alter table memberships enable row level security;

create policy companies_select on companies for select
  using (id in (select auth_company_ids()));

create policy profiles_select_self on profiles for select
  using (id = auth.uid());

create policy memberships_select_own on memberships for select
  using (user_id = auth.uid());
```

- [ ] **Step 2: Aplicar a migration**

Run: `npx supabase db reset`
Expected: aplica `001_tenancy.sql` sem erro.

- [ ] **Step 3: Escrever o helper de autenticação**

`tests/helpers/auth.ts`:

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { sql } from './db'

config({ path: '.env.test' })

const URL = process.env.API_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.ANON_KEY!
const SERVICE = process.env.SERVICE_ROLE_KEY!

export const admin = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
})

export interface TestUser {
  userId: string
  client: SupabaseClient
}

/** Cria um usuario de teste, seu profile e um vinculo na empresa. */
export async function createUser(
  email: string,
  companyId: string,
  role: string,
): Promise<TestUser> {
  const password = 'teste-123456'

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw error
  const userId = data.user.id

  await sql('insert into profiles (id, full_name) values ($1, $2)', [userId, email])
  await sql(
    'insert into memberships (user_id, company_id, role) values ($1, $2, $3)',
    [userId, companyId, role],
  )

  const client = createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const signIn = await client.auth.signInWithPassword({ email, password })
  if (signIn.error) throw signIn.error

  return { userId, client }
}

export async function createCompany(name: string): Promise<string> {
  const rows = await sql<{ id: string }>(
    'insert into companies (name) values ($1) returning id',
    [name],
  )
  return rows[0].id
}

/** Remove todos os usuarios de teste e dados de negocio. */
export async function cleanup(): Promise<void> {
  const { data } = await admin.auth.admin.listUsers()
  for (const user of data?.users ?? []) {
    await admin.auth.admin.deleteUser(user.id)
  }
  await sql('truncate companies cascade')
}
```

- [ ] **Step 4: Escrever o teste de isolamento**

`tests/tenancy.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { closePool } from './helpers/db'
import { admin, createCompany, createUser, cleanup, type TestUser } from './helpers/auth'

let empresaA: string
let empresaB: string
let anaDaA: TestUser

beforeAll(async () => {
  await cleanup()
  empresaA = await createCompany('Construtora A')
  empresaB = await createCompany('Construtora B')
  anaDaA = await createUser('ana@a.test', empresaA, 'engenharia')
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('isolamento entre construtoras', () => {
  it('usuario enxerga a propria empresa', async () => {
    const { data } = await anaDaA.client.from('companies').select('id, name')
    expect(data).toHaveLength(1)
    expect(data![0].id).toBe(empresaA)
  })

  it('usuario nao enxerga a empresa vizinha nem consultando pelo id', async () => {
    const { data } = await anaDaA.client
      .from('companies')
      .select('id')
      .eq('id', empresaB)
    expect(data).toEqual([])
  })

  it('usuario so enxerga os proprios vinculos', async () => {
    const outro = await createUser('bruno@b.test', empresaB, 'engenharia')
    const { data } = await anaDaA.client.from('memberships').select('user_id')
    expect(data!.every((row) => row.user_id === anaDaA.userId)).toBe(true)
    expect(data!.some((row) => row.user_id === outro.userId)).toBe(false)
  })

  it('service role enxerga tudo, para o seed funcionar', async () => {
    const { data } = await admin.from('companies').select('id')
    expect(data!.length).toBeGreaterThanOrEqual(2)
  })
})
```

- [ ] **Step 5: Rodar os testes**

Run: `npm test -- tests/tenancy.test.ts`
Expected: PASS, 4 testes.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/001_tenancy.sql tests/helpers/auth.ts tests/tenancy.test.ts
git commit -m "feat: tenancy com empresas, perfis, vinculos e RLS"
```

---

### Task 3: Estrutura da obra e escopo por obra

O `membership` ganha `project_id` e `contractor_id`. `project_id` nulo significa acesso a toda a empresa; preenchido, restringe a uma obra — é assim que a incorporadora aprova uma obra sem enxergar o resto da construtora.

**Files:**
- Create: `supabase/migrations/002_obras.sql`
- Create: `tests/obras.test.ts`
- Modify: `tests/helpers/auth.ts` (acrescentar `createScopedUser`)

**Interfaces:**
- Consumes: `companies`, `memberships`, `auth_company_ids()` da Task 2.
- Produces:
  - `projects(id, company_id, name, unit_label, approval_levels, created_at)` — `unit_label` guarda "casa", "apartamento" ou "pavimento".
  - `contractors(id, company_id, name, document, created_at)`
  - `stages(id, company_id, project_id, name, position)`
  - `unit_types(id, company_id, project_id, name, area)`
  - `units(id, company_id, stage_id, unit_type_id, name, position)`
  - Função `auth_project_ids() returns setof uuid`.
  - `createScopedUser(email, companyId, projectId, role)` em `tests/helpers/auth.ts`.

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/002_obras.sql`:

```sql
create table projects (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  name            text not null,
  unit_label      text not null default 'casa',
  approval_levels int  not null default 3 check (approval_levels between 1 and 5),
  created_at      timestamptz not null default now()
);

create table contractors (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name       text not null,
  document   text,
  created_at timestamptz not null default now()
);

create table stages (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  name       text not null,
  position   int  not null default 0
);

create table unit_types (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  name       text not null,
  area       numeric(14,4)
);

create table units (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  stage_id      uuid not null references stages(id) on delete cascade,
  unit_type_id  uuid references unit_types(id),
  name          text not null,
  position      int  not null default 0,
  unique (stage_id, name)
);

-- escopo por obra: null = acesso a toda a empresa
alter table memberships add column project_id    uuid references projects(id) on delete cascade;
alter table memberships add column contractor_id uuid references contractors(id) on delete cascade;

create or replace function auth_project_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from projects p
  join memberships m on m.company_id = p.company_id and m.user_id = auth.uid()
  where m.project_id is null or m.project_id = p.id
$$;

alter table projects    enable row level security;
alter table contractors enable row level security;
alter table stages      enable row level security;
alter table unit_types  enable row level security;
alter table units       enable row level security;

create policy projects_select on projects for select
  using (id in (select auth_project_ids()));

create policy contractors_select on contractors for select
  using (company_id in (select auth_company_ids()));

create policy stages_select on stages for select
  using (project_id in (select auth_project_ids()));

create policy unit_types_select on unit_types for select
  using (project_id in (select auth_project_ids()));

create policy units_select on units for select
  using (stage_id in (select id from stages where project_id in (select auth_project_ids())));
```

- [ ] **Step 2: Aplicar a migration**

Run: `npx supabase db reset`
Expected: aplica 001 e 002 sem erro.

- [ ] **Step 3: Acrescentar `createScopedUser` ao helper**

Adicionar ao fim de `tests/helpers/auth.ts`:

```typescript
/** Cria usuario cujo acesso e limitado a uma unica obra. */
export async function createScopedUser(
  email: string,
  companyId: string,
  projectId: string,
  role: string,
): Promise<TestUser> {
  const user = await createUser(email, companyId, role)
  await sql('update memberships set project_id = $1 where user_id = $2', [
    projectId,
    user.userId,
  ])
  return user
}
```

- [ ] **Step 4: Escrever o teste de escopo por obra**

`tests/obras.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { createCompany, createUser, createScopedUser, cleanup, type TestUser } from './helpers/auth'

let empresa: string
let obraNorte: string
let obraSul: string
let gerente: TestUser
let incorporadora: TestUser

beforeAll(async () => {
  await cleanup()
  empresa = await createCompany('Construtora Vista')

  const obras = await sql<{ id: string; name: string }>(
    `insert into projects (company_id, name, unit_label)
     values ($1, 'Residencial Norte', 'casa'), ($1, 'Residencial Sul', 'apartamento')
     returning id, name`,
    [empresa],
  )
  obraNorte = obras.find((o) => o.name === 'Residencial Norte')!.id
  obraSul = obras.find((o) => o.name === 'Residencial Sul')!.id

  gerente = await createUser('gerente@vista.test', empresa, 'gerencia')
  incorporadora = await createScopedUser('inc@externa.test', empresa, obraNorte, 'incorporadora')
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('escopo de acesso por obra', () => {
  it('usuario da empresa enxerga todas as obras dela', async () => {
    const { data } = await gerente.client.from('projects').select('id')
    expect(data).toHaveLength(2)
  })

  it('aprovador externo enxerga somente a obra vinculada', async () => {
    const { data } = await incorporadora.client.from('projects').select('id, name')
    expect(data).toHaveLength(1)
    expect(data![0].id).toBe(obraNorte)
  })

  it('aprovador externo nao alcanca a outra obra nem pelo id', async () => {
    const { data } = await incorporadora.client
      .from('projects')
      .select('id')
      .eq('id', obraSul)
    expect(data).toEqual([])
  })

  it('o rotulo do local e configuravel por obra', async () => {
    const { data } = await gerente.client
      .from('projects')
      .select('name, unit_label')
      .order('name')
    expect(data!.map((p) => p.unit_label)).toEqual(['casa', 'apartamento'])
  })

  it('a obra nasce com tres niveis de aprovacao', async () => {
    const rows = await sql<{ approval_levels: number }>(
      'select approval_levels from projects where id = $1',
      [obraNorte],
    )
    expect(rows[0].approval_levels).toBe(3)
  })
})
```

- [ ] **Step 5: Rodar os testes**

Run: `npm test -- tests/obras.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/002_obras.sql tests/obras.test.ts tests/helpers/auth.ts
git commit -m "feat: obras, etapas, tipologias, locais e escopo de acesso por obra"
```

---

### Task 4: Contrato e itens

`unit_id` é anulável de propósito: contrato de empreitada global não tem local. `addendum_id` nulo significa item do contrato original; preenchido, item que veio de aditivo — é assim que o aditivo não altera o histórico.

**Files:**
- Create: `supabase/migrations/003_contratos.sql`
- Create: `tests/contratos.test.ts`

**Interfaces:**
- Consumes: `companies`, `projects`, `contractors`, `units`, `auth_project_ids()`.
- Produces:
  - `contracts(id, company_id, project_id, contractor_id, number, description, starts_on, ends_on, created_at)`
  - `contract_addendums(id, company_id, contract_id, number, description, created_at)`
  - `contract_items(id, company_id, contract_id, addendum_id, unit_id, service_name, service_group, unit, quantity, unit_price, created_at)`
  - Enum `measurement_unit` com `m2, m3, ml, un, pt, vb, kg, ton, h, diaria, pct`.
  - Função `auth_contractor_ids() returns setof uuid`.
  - Coluna `projects.measurement_input_mode` (`quantidade` ou `percentual`) — modo de digitação padrão da construtora.
  - `qty_from_percent(p_item_id uuid, p_percent numeric) returns numeric` e `percent_from_qty(p_item_id uuid, p_qty numeric) returns numeric` — conversão nos dois sentidos, sempre sobre a quantidade **do local**.

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/003_contratos.sql`:

```sql
create type measurement_unit as enum (
  'm2', 'm3', 'ml', 'un', 'pt', 'vb', 'kg', 'ton', 'h', 'diaria', 'pct'
);

create table contracts (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  project_id    uuid not null references projects(id) on delete cascade,
  contractor_id uuid not null references contractors(id) on delete cascade,
  number        text not null,
  description   text,
  starts_on     date,
  ends_on       date,
  created_at    timestamptz not null default now(),
  unique (project_id, number)
);

create table contract_addendums (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  contract_id uuid not null references contracts(id) on delete cascade,
  number      text not null,
  description text,
  created_at  timestamptz not null default now(),
  unique (contract_id, number)
);

create table contract_items (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  contract_id   uuid not null references contracts(id) on delete cascade,
  addendum_id   uuid references contract_addendums(id),
  unit_id       uuid references units(id),
  service_name  text not null,
  service_group text,
  unit          measurement_unit not null,
  quantity      numeric(14,4) not null check (quantity > 0),
  unit_price    numeric(14,4) not null check (unit_price >= 0),
  created_at    timestamptz not null default now()
);

create index contract_items_contract_idx on contract_items (contract_id);
create index contract_items_unit_idx     on contract_items (unit_id);

create or replace function auth_contractor_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select contractor_id from memberships
  where user_id = auth.uid() and contractor_id is not null
$$;

/* Um usuario e "empreiteiro" quando tem ao menos um vinculo com contractor_id.
   Empreiteiro so alcanca os proprios contratos; os demais papeis alcancam
   todos os contratos das obras que enxergam. */
create or replace function can_read_contract(p_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from contracts c
    where c.id = p_contract_id
      and c.project_id in (select auth_project_ids())
      and (
        not exists (select 1 from memberships m
                    where m.user_id = auth.uid() and m.contractor_id is not null)
        or c.contractor_id in (select auth_contractor_ids())
      )
  )
$$;

alter table contracts          enable row level security;
alter table contract_addendums enable row level security;
alter table contract_items     enable row level security;

create policy contracts_select on contracts for select
  using (can_read_contract(id));

create policy contract_addendums_select on contract_addendums for select
  using (can_read_contract(contract_id));

create policy contract_items_select on contract_items for select
  using (can_read_contract(contract_id));

/* Modo de digitacao padrao da construtora. O empreiteiro pode alternar
   por linha, mas a tela abre no modo que a obra definir. */
create type input_mode as enum ('quantidade', 'percentual');

alter table projects add column measurement_input_mode input_mode not null default 'quantidade';

/* Percentual e SEMPRE relativo a quantidade do item daquele local,
   nunca ao total do contrato. Contrato com 2.000 m2 de alvenaria e
   pavimento com 200 m2: 10% sao 20 m2, nao 200. */
create or replace function qty_from_percent(p_item_id uuid, p_percent numeric)
returns numeric
language sql
stable
as $$
  select round(ci.quantity * p_percent / 100.0, 4)
  from contract_items ci where ci.id = p_item_id
$$;

create or replace function percent_from_qty(p_item_id uuid, p_qty numeric)
returns numeric
language sql
stable
as $$
  select round(p_qty * 100.0 / ci.quantity, 4)
  from contract_items ci where ci.id = p_item_id
$$;
```

- [ ] **Step 2: Aplicar a migration**

Run: `npx supabase db reset`
Expected: aplica 001 a 003 sem erro.

- [ ] **Step 3: Escrever o teste**

`tests/contratos.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { createCompany, createUser, cleanup, type TestUser } from './helpers/auth'

let empresa: string
let obra: string
let contratoAlfa: string
let contratoBeta: string
let empreiteiroAlfa: TestUser
let engenheiro: TestUser

async function novoContrato(nome: string, numero: string): Promise<string> {
  const [contractor] = await sql<{ id: string }>(
    'insert into contractors (company_id, name) values ($1, $2) returning id',
    [empresa, nome],
  )
  const [contract] = await sql<{ id: string }>(
    `insert into contracts (company_id, project_id, contractor_id, number)
     values ($1, $2, $3, $4) returning id`,
    [empresa, obra, contractor.id, numero],
  )
  return contract.id
}

beforeAll(async () => {
  await cleanup()
  empresa = await createCompany('Construtora Vista')
  const [p] = await sql<{ id: string }>(
    `insert into projects (company_id, name) values ($1, 'Vista Alta') returning id`,
    [empresa],
  )
  obra = p.id

  contratoAlfa = await novoContrato('Empreiteira Alfa', '023/2026')
  contratoBeta = await novoContrato('Empreiteira Beta', '024/2026')

  engenheiro = await createUser('eng@vista.test', empresa, 'engenharia')
  empreiteiroAlfa = await createUser('alfa@alfa.test', empresa, 'empreiteiro')
  const [alfa] = await sql<{ contractor_id: string }>(
    'select contractor_id from contracts where id = $1',
    [contratoAlfa],
  )
  await sql('update memberships set contractor_id = $1 where user_id = $2', [
    alfa.contractor_id,
    empreiteiroAlfa.userId,
  ])

  await sql(
    `insert into contract_items
       (company_id, contract_id, service_name, unit, quantity, unit_price)
     values ($1, $2, 'Contrapiso', 'm2', 86, 112),
            ($1, $3, 'Alvenaria', 'm2', 200, 90)`,
    [empresa, contratoAlfa, contratoBeta],
  )
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('acesso a contratos', () => {
  it('engenharia enxerga os contratos de todos os empreiteiros da obra', async () => {
    const { data } = await engenheiro.client.from('contracts').select('id')
    expect(data).toHaveLength(2)
  })

  it('empreiteiro enxerga apenas o proprio contrato', async () => {
    const { data } = await empreiteiroAlfa.client.from('contracts').select('id')
    expect(data).toHaveLength(1)
    expect(data![0].id).toBe(contratoAlfa)
  })

  it('empreiteiro nao alcanca o contrato do concorrente nem pelo id', async () => {
    const { data } = await empreiteiroAlfa.client
      .from('contracts')
      .select('id')
      .eq('id', contratoBeta)
    expect(data).toEqual([])
  })

  it('empreiteiro nao enxerga os itens do contrato do concorrente', async () => {
    const { data } = await empreiteiroAlfa.client
      .from('contract_items')
      .select('service_name')
    expect(data!.map((i) => i.service_name)).toEqual(['Contrapiso'])
  })
})

describe('modelagem de itens', () => {
  it('aceita item sem local, para empreitada global', async () => {
    const rows = await sql<{ id: string }>(
      `insert into contract_items
         (company_id, contract_id, service_name, unit, quantity, unit_price)
       values ($1, $2, 'Mobilizacao', 'pct', 100, 1000) returning id`,
      [empresa, contratoAlfa],
    )
    expect(rows[0].id).toBeTruthy()
  })

  it('recusa quantidade zero ou negativa', async () => {
    await expect(
      sql(
        `insert into contract_items
           (company_id, contract_id, service_name, unit, quantity, unit_price)
         values ($1, $2, 'Invalido', 'm2', 0, 10)`,
        [empresa, contratoAlfa],
      ),
    ).rejects.toThrow()
  })

  it('converte percentual em quantidade sobre o item do local', async () => {
    // Alvenaria: 200 m2 no local. 10% sao 20 m2.
    const [item] = await sql<{ id: string }>(
      `select id from contract_items where contract_id = $1 and service_name = 'Alvenaria'`,
      [contratoBeta],
    )
    const [row] = await sql<{ qty: string }>('select qty_from_percent($1, 10) as qty', [item.id])
    expect(Number(row.qty)).toBe(20)
  })

  it('converte quantidade em percentual no sentido inverso', async () => {
    const [item] = await sql<{ id: string }>(
      `select id from contract_items where contract_id = $1 and service_name = 'Alvenaria'`,
      [contratoBeta],
    )
    const [row] = await sql<{ pct: string }>('select percent_from_qty($1, 20) as pct', [item.id])
    expect(Number(row.pct)).toBe(10)
  })

  it('a conversao ignora o total do contrato e usa so o item do local', async () => {
    // Dois locais do mesmo servico: 200 m2 e 50 m2. 10% de cada da 20 e 5.
    const [outroLocal] = await sql<{ id: string }>(
      `insert into contract_items
         (company_id, contract_id, service_name, unit, quantity, unit_price)
       values ($1, $2, 'Alvenaria', 'm2', 50, 90) returning id`,
      [empresa, contratoBeta],
    )
    const [row] = await sql<{ qty: string }>('select qty_from_percent($1, 10) as qty', [
      outroLocal.id,
    ])
    expect(Number(row.qty)).toBe(5)
  })

  it('a obra nasce no modo quantidade', async () => {
    const [row] = await sql<{ measurement_input_mode: string }>(
      'select measurement_input_mode from projects where id = $1',
      [obra],
    )
    expect(row.measurement_input_mode).toBe('quantidade')
  })

  it('item de aditivo convive com o item original do mesmo servico', async () => {
    const [aditivo] = await sql<{ id: string }>(
      `insert into contract_addendums (company_id, contract_id, number)
       values ($1, $2, 'AD-01') returning id`,
      [empresa, contratoAlfa],
    )
    await sql(
      `insert into contract_items
         (company_id, contract_id, addendum_id, service_name, unit, quantity, unit_price)
       values ($1, $2, $3, 'Contrapiso', 'm2', 30, 112)`,
      [empresa, contratoAlfa, aditivo.id],
    )
    const rows = await sql<{ count: string }>(
      `select count(*) from contract_items
       where contract_id = $1 and service_name = 'Contrapiso'`,
      [contratoAlfa],
    )
    expect(Number(rows[0].count)).toBe(2)
  })
})
```

- [ ] **Step 4: Rodar os testes**

Run: `npm test -- tests/contratos.test.ts`
Expected: PASS, 11 testes.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/003_contratos.sql tests/contratos.test.ts
git commit -m "feat: contratos, aditivos, itens e conversao percentual por local"
```

---

### Task 5: Períodos, medições e itens de medição

**Files:**
- Create: `supabase/migrations/005_medicoes.sql`
- Create: `tests/medicoes.test.ts`

**Interfaces:**
- Consumes: `contracts`, `contract_items`, `can_read_contract()`.
- Produces:
  - Enum `measurement_status`: `RASCUNHO, EM_ANALISE, DEVOLVIDA, APROVADA, NF_ENVIADA, NF_APROVADA, PAGA, CANCELADA`.
  - `measurement_periods(id, company_id, project_id, competence, opens_at, closes_at)` — `competence` é `date`, sempre o dia 1 do mês.
  - `measurements(id, company_id, period_id, contract_id, status, current_level, protocol, submitted_at, version, created_at)`
  - `measurement_items(id, company_id, measurement_id, contract_item_id, qty_requested, qty_approved, notes, created_at)`
  - Função `next_protocol(p_measurement_id uuid) returns text` no formato `MED-AAAA-MM-NNN`.

- [ ] **Step 1: Escrever a migration**

`supabase/migrations/005_medicoes.sql`:

```sql
create type measurement_status as enum (
  'RASCUNHO', 'EM_ANALISE', 'DEVOLVIDA', 'APROVADA',
  'NF_ENVIADA', 'NF_APROVADA', 'PAGA', 'CANCELADA'
);

create table measurement_periods (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  competence date not null,
  opens_at   timestamptz not null,
  closes_at  timestamptz not null,
  created_at timestamptz not null default now(),
  unique (project_id, competence),
  check (closes_at > opens_at)
);

create table measurements (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references companies(id) on delete cascade,
  period_id     uuid not null references measurement_periods(id) on delete cascade,
  contract_id   uuid not null references contracts(id) on delete cascade,
  status        measurement_status not null default 'RASCUNHO',
  current_level int not null default 0,
  protocol      text unique,
  submitted_at  timestamptz,
  version       int not null default 1,
  created_at    timestamptz not null default now()
);

-- uma medicao viva por contrato/periodo; cancelada libera o par
create unique index measurements_one_active
  on measurements (period_id, contract_id)
  where status <> 'CANCELADA';

create table measurement_items (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references companies(id) on delete cascade,
  measurement_id   uuid not null references measurements(id) on delete cascade,
  contract_item_id uuid not null references contract_items(id) on delete cascade,
  qty_requested    numeric(14,4) not null check (qty_requested > 0),
  qty_approved     numeric(14,4) check (qty_approved >= 0),
  notes            text,
  created_at       timestamptz not null default now(),
  unique (measurement_id, contract_item_id)
);

create index measurement_items_item_idx on measurement_items (contract_item_id);

create or replace function next_protocol(p_measurement_id uuid)
returns text
language plpgsql
stable
as $$
declare
  v_competence date;
  v_project    uuid;
  v_seq        int;
begin
  select p.competence, p.project_id
    into v_competence, v_project
  from measurements m
  join measurement_periods p on p.id = m.period_id
  where m.id = p_measurement_id;

  if v_competence is null then
    raise exception 'Medicao nao encontrada.';
  end if;

  select count(*) + 1 into v_seq
  from measurements m
  join measurement_periods p on p.id = m.period_id
  where p.project_id = v_project
    and p.competence = v_competence
    and m.protocol is not null;

  return 'MED-' || to_char(v_competence, 'YYYY-MM') || '-' || lpad(v_seq::text, 3, '0');
end $$;

alter table measurement_periods enable row level security;
alter table measurements        enable row level security;
alter table measurement_items   enable row level security;

create policy periods_select on measurement_periods for select
  using (project_id in (select auth_project_ids()));

create policy measurements_select on measurements for select
  using (can_read_contract(contract_id));

create policy measurement_items_select on measurement_items for select
  using (measurement_id in (select id from measurements where can_read_contract(contract_id)));
```

- [ ] **Step 2: Aplicar a migration**

Run: `npx supabase db reset`
Expected: aplica 001 a 005 sem erro.

- [ ] **Step 3: Extrair o helper de cenário**

As próximas tarefas todas precisam de uma obra com contrato e itens. Criar `tests/helpers/scenario.ts`:

```typescript
import { sql } from './db'
import { createCompany } from './auth'

export interface Scenario {
  companyId: string
  projectId: string
  contractorId: string
  contractId: string
  periodId: string
  /** Contrapiso: 86 m2 a R$ 112,00 */
  contrapisoId: string
  /** Alvenaria: 200 m2 a R$ 90,00 */
  alvenariaId: string
  unitId: string
}

/** Uma construtora, uma obra, um empreiteiro, um contrato, dois servicos. */
export async function buildScenario(): Promise<Scenario> {
  const companyId = await createCompany('Construtora Vista')

  const [project] = await sql<{ id: string }>(
    `insert into projects (company_id, name, unit_label, approval_levels)
     values ($1, 'Residencial Vista Alta', 'casa', 3) returning id`,
    [companyId],
  )
  const [stage] = await sql<{ id: string }>(
    `insert into stages (company_id, project_id, name) values ($1, $2, 'Casas 01 a 20')
     returning id`,
    [companyId, project.id],
  )
  const [unit] = await sql<{ id: string }>(
    `insert into units (company_id, stage_id, name) values ($1, $2, 'Casa 07')
     returning id`,
    [companyId, stage.id],
  )
  const [contractor] = await sql<{ id: string }>(
    `insert into contractors (company_id, name) values ($1, 'Empreiteira Alfa')
     returning id`,
    [companyId],
  )
  const [contract] = await sql<{ id: string }>(
    `insert into contracts (company_id, project_id, contractor_id, number)
     values ($1, $2, $3, '023/2026') returning id`,
    [companyId, project.id, contractor.id],
  )
  const items = await sql<{ id: string; service_name: string }>(
    `insert into contract_items
       (company_id, contract_id, unit_id, service_name, unit, quantity, unit_price)
     values ($1, $2, $3, 'Contrapiso', 'm2', 86, 112),
            ($1, $2, $3, 'Alvenaria', 'm2', 200, 90)
     returning id, service_name`,
    [companyId, contract.id, unit.id],
  )
  const [period] = await sql<{ id: string }>(
    `insert into measurement_periods (company_id, project_id, competence, opens_at, closes_at)
     values ($1, $2, '2026-09-01', '2026-09-01 00:00+00', '2026-09-10 23:59+00')
     returning id`,
    [companyId, project.id],
  )

  return {
    companyId,
    projectId: project.id,
    contractorId: contractor.id,
    contractId: contract.id,
    periodId: period.id,
    unitId: unit.id,
    contrapisoId: items.find((i) => i.service_name === 'Contrapiso')!.id,
    alvenariaId: items.find((i) => i.service_name === 'Alvenaria')!.id,
  }
}

/** Cria uma medicao no status informado, com os itens dados. */
export async function createMeasurement(
  s: Scenario,
  status: string,
  items: Array<{ contractItemId: string; requested: number; approved?: number }>,
): Promise<string> {
  const [m] = await sql<{ id: string }>(
    `insert into measurements (company_id, period_id, contract_id, status)
     values ($1, $2, $3, $4::measurement_status) returning id`,
    [s.companyId, s.periodId, s.contractId, status],
  )
  for (const item of items) {
    await sql(
      `insert into measurement_items
         (company_id, measurement_id, contract_item_id, qty_requested, qty_approved)
       values ($1, $2, $3, $4, $5)`,
      [s.companyId, m.id, item.contractItemId, item.requested, item.approved ?? null],
    )
  }
  return m.id
}
```

- [ ] **Step 4: Escrever o teste**

`tests/medicoes.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup } from './helpers/auth'
import { buildScenario, createMeasurement, type Scenario } from './helpers/scenario'

let s: Scenario

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('medicoes', () => {
  it('nasce em rascunho, sem protocolo e no nivel zero', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [])
    const [m] = await sql<{ status: string; protocol: string | null; current_level: number }>(
      'select status, protocol, current_level from measurements where id = $1',
      [id],
    )
    expect(m.status).toBe('RASCUNHO')
    expect(m.protocol).toBeNull()
    expect(m.current_level).toBe(0)
  })

  it('impede duas medicoes vivas para o mesmo contrato no mesmo periodo', async () => {
    await createMeasurement(s, 'RASCUNHO', [])
    await expect(createMeasurement(s, 'RASCUNHO', [])).rejects.toThrow()
  })

  it('libera o periodo quando a medicao anterior foi cancelada', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [])
    await sql(`update measurements set status = 'CANCELADA' where id = $1`, [id])
    const nova = await createMeasurement(s, 'RASCUNHO', [])
    expect(nova).toBeTruthy()
  })

  it('impede o mesmo item de contrato duas vezes na mesma medicao', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 10 },
    ])
    await expect(
      sql(
        `insert into measurement_items
           (company_id, measurement_id, contract_item_id, qty_requested)
         values ($1, $2, $3, 5)`,
        [s.companyId, id, s.contrapisoId],
      ),
    ).rejects.toThrow()
  })

  it('gera protocolo no formato MED-AAAA-MM-NNN', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [])
    const [row] = await sql<{ protocol: string }>('select next_protocol($1) as protocol', [id])
    expect(row.protocol).toBe('MED-2026-09-001')
  })
})
```

- [ ] **Step 5: Rodar os testes**

Run: `npm test -- tests/medicoes.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/005_medicoes.sql tests/medicoes.test.ts tests/helpers/scenario.ts
git commit -m "feat: periodos, medicoes, itens de medicao e protocolo"
```

---

### Task 6: A regra de saldo

O coração do produto. Uma medição consome saldo quando está em análise ou já aprovada; rascunho, devolvida e cancelada não consomem. Dentro de uma medição em análise, vale o que o aprovador escreveu em `qty_approved`; se ele ainda não mexeu, vale o solicitado.

O parâmetro `p_exclude_measurement` existe porque, ao validar um item, a própria medição não pode contar contra si mesma.

**Files:**
- Create: `supabase/migrations/006_saldo.sql`
- Create: `tests/saldo.test.ts`

**Interfaces:**
- Consumes: `contract_items`, `measurements`, `measurement_items`.
- Produces:
  - `contract_item_balance(p_item_id uuid, p_exclude_measurement uuid default null) returns numeric`
  - Trigger `measurement_items_balance` em `measurement_items`, que recusa quantidade acima do saldo em INSERT e UPDATE.

- [ ] **Step 1: Escrever o teste da função, que ainda não existe**

> **Correcao aplicada durante a execucao:** os dois testes do bloco *bloqueio de
> saldo* que criam uma segunda medicao apos uma ja aprovada nao podem usar o
> mesmo periodo — isso colide com o indice unico parcial `measurements_one_active`
> da Task 5, e o INSERT morre por duplicate key antes de chegar ao trigger de
> saldo. A segunda medicao precisa nascer na competencia seguinte (helper
> `createMeasurementInNewPeriod`), o que tambem modela melhor a realidade:
> mede-se de novo no mes seguinte.

`tests/saldo.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup } from './helpers/auth'
import { buildScenario, createMeasurement, type Scenario } from './helpers/scenario'

let s: Scenario

async function saldo(itemId: string, excluir?: string): Promise<number> {
  const [row] = await sql<{ balance: string }>(
    'select contract_item_balance($1, $2) as balance',
    [itemId, excluir ?? null],
  )
  return Number(row.balance)
}

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('calculo de saldo', () => {
  it('sem medicao alguma, o saldo e a quantidade contratada', async () => {
    expect(await saldo(s.contrapisoId)).toBe(86)
  })

  it('rascunho nao consome saldo', async () => {
    await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    expect(await saldo(s.contrapisoId)).toBe(86)
  })

  it('medicao em analise consome pelo solicitado', async () => {
    await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    expect(await saldo(s.contrapisoId)).toBe(66)
  })

  it('medicao em analise ja ajustada consome pelo aprovado', async () => {
    await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 18 },
    ])
    expect(await saldo(s.contrapisoId)).toBe(68)
  })

  it('medicao aprovada consome pelo aprovado', async () => {
    await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 18 },
    ])
    expect(await saldo(s.contrapisoId)).toBe(68)
  })

  it('medicao devolvida devolve o saldo', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    expect(await saldo(s.contrapisoId)).toBe(66)
    await sql(`update measurements set status = 'DEVOLVIDA' where id = $1`, [id])
    expect(await saldo(s.contrapisoId)).toBe(86)
  })

  it('medicao cancelada devolve o saldo', async () => {
    const id = await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 20 },
    ])
    await sql(`update measurements set status = 'CANCELADA' where id = $1`, [id])
    expect(await saldo(s.contrapisoId)).toBe(86)
  })

  it('medicoes ja pagas continuam consumindo saldo', async () => {
    await createMeasurement(s, 'PAGA', [
      { contractItemId: s.contrapisoId, requested: 40, approved: 40 },
    ])
    expect(await saldo(s.contrapisoId)).toBe(46)
  })

  it('excluir uma medicao do calculo ignora o consumo dela', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    expect(await saldo(s.contrapisoId, id)).toBe(86)
  })

  it('saldos de itens diferentes nao se misturam', async () => {
    await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 20 },
    ])
    expect(await saldo(s.alvenariaId)).toBe(200)
  })
})

describe('bloqueio de saldo', () => {
  it('recusa medicao acima do saldo e informa o maximo permitido', async () => {
    await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 70, approved: 70 },
    ])
    await expect(
      createMeasurement(s, 'RASCUNHO', [
        { contractItemId: s.contrapisoId, requested: 20 },
      ]),
    ).rejects.toThrow(/16/)
  })

  it('aceita medicao exatamente igual ao saldo', async () => {
    await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 70, approved: 70 },
    ])
    const id = await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 16 },
    ])
    expect(id).toBeTruthy()
  })

  it('aprovador pode aumentar a quantidade dentro do saldo', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await sql(
      `update measurement_items set qty_approved = 30
       where measurement_id = $1 and contract_item_id = $2`,
      [id, s.contrapisoId],
    )
    expect(await saldo(s.contrapisoId)).toBe(56)
  })

  it('aprovador nao pode aumentar alem do saldo do item', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await expect(
      sql(
        `update measurement_items set qty_approved = 100
         where measurement_id = $1 and contract_item_id = $2`,
        [id, s.contrapisoId],
      ),
    ).rejects.toThrow(/86/)
  })
})
```

- [ ] **Step 2: Rodar o teste para ver falhar**

Run: `npm test -- tests/saldo.test.ts`
Expected: FAIL com `function contract_item_balance(uuid, uuid) does not exist`.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/006_saldo.sql`:

```sql
/* Saldo de um item de contrato.
   Consomem saldo: EM_ANALISE, APROVADA, NF_ENVIADA, NF_APROVADA, PAGA.
   Nao consomem:   RASCUNHO, DEVOLVIDA, CANCELADA.
   Em medicao viva, vale o aprovado quando existir; senao, o solicitado. */
create or replace function contract_item_balance(
  p_item_id uuid,
  p_exclude_measurement uuid default null
)
returns numeric
language sql
stable
as $$
  select ci.quantity - coalesce((
    select sum(coalesce(mi.qty_approved, mi.qty_requested))
    from measurement_items mi
    join measurements m on m.id = mi.measurement_id
    where mi.contract_item_id = ci.id
      and m.status in ('EM_ANALISE', 'APROVADA', 'NF_ENVIADA', 'NF_APROVADA', 'PAGA')
      and (p_exclude_measurement is null or m.id <> p_exclude_measurement)
  ), 0)
  from contract_items ci
  where ci.id = p_item_id
$$;

create or replace function enforce_item_balance()
returns trigger
language plpgsql
as $$
declare
  v_status  measurement_status;
  v_qty     numeric;
  v_balance numeric;
begin
  select status into v_status from measurements where id = new.measurement_id;

  -- medicao morta nao disputa saldo
  if v_status = 'CANCELADA' then
    return new;
  end if;

  v_qty     := coalesce(new.qty_approved, new.qty_requested);
  v_balance := contract_item_balance(new.contract_item_id, new.measurement_id);

  if v_qty > v_balance then
    raise exception
      'Quantidade superior ao saldo disponivel. O maximo permitido e %.',
      trim(trailing '.' from trim(trailing '0' from v_balance::text))
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger measurement_items_balance
  before insert or update of qty_requested, qty_approved on measurement_items
  for each row execute function enforce_item_balance();
```

- [ ] **Step 4: Aplicar e rodar os testes**

Run: `npx supabase db reset && npm test -- tests/saldo.test.ts`
Expected: PASS, 14 testes.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/006_saldo.sql tests/saldo.test.ts
git commit -m "feat: regra de saldo calculada e bloqueio por trigger"
```

> **Rodada de correção 1 (pós-revisão):** a regra de 006 só revalidava o saldo
> quando um `measurement_item` era inserido/alterado. Uma medição podia
> acumular itens como `RASCUNHO` (não consome) e só depois ter o *status* da
> medição promovido via `UPDATE measurements SET status = ...` — update que não
> toca `measurement_items` e por isso não disparava checagem nenhuma. Duas
> medições assim, promovidas em sequência, furavam o saldo sem passar por
> nenhum caminho bloqueado (reproduzido: saldo foi a -86 num item de 86 m²).
> Também foram corrigidos: corrida entre transações concorrentes (faltava
> `for update` na linha do `contract_item`), o trigger não disparava ao trocar
> `contract_item_id`/`measurement_id` (lista de colunas do `update of` era
> curta demais), nada validava que o item pertence ao contrato da medição, e
> `contract_item_balance()` não era `security definer`. Tudo isso está em
> `supabase/migrations/007_saldo_na_transicao.sql`, com testes adicionais em
> `tests/saldo.test.ts`. Por isso `007` passou a ser desta correção, e as
> migrations das tasks seguintes foram renumeradas (+1) abaixo.

---

### Task 7: Máquina de estados e níveis de aprovação

Os níveis vêm de `approval_levels`, uma linha por etapa da cadeia. Trocar uma obra de três para quatro níveis é inserir uma linha, não mexer em código.

**Files:**
- Create: `supabase/migrations/008_fluxo.sql`
- Create: `tests/fluxo.test.ts`

**Interfaces:**
- Consumes: `measurements`, `measurement_periods`, `projects`, `next_protocol()`.
- Produces:
  - `approval_levels(id, company_id, project_id, level, label, role)`
  - `submit_measurement(p_measurement_id uuid) returns text` — devolve o protocolo gerado.
  - `approve_measurement(p_measurement_id uuid) returns measurement_status`
  - `return_measurement(p_measurement_id uuid, p_reason text) returns void`

- [ ] **Step 1: Escrever o teste, que ainda falha**

`tests/fluxo.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup } from './helpers/auth'
import { buildScenario, createMeasurement, type Scenario } from './helpers/scenario'

let s: Scenario

async function estado(id: string): Promise<{ status: string; current_level: number }> {
  const [row] = await sql<{ status: string; current_level: number }>(
    'select status, current_level from measurements where id = $1',
    [id],
  )
  return row
}

async function medicaoPronta(): Promise<string> {
  return createMeasurement(s, 'RASCUNHO', [
    { contractItemId: s.contrapisoId, requested: 20 },
  ])
}

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()
  await sql(
    `insert into approval_levels (company_id, project_id, level, label, role) values
       ($1, $2, 1, 'Engenharia',  'engenharia'),
       ($1, $2, 2, 'Coordenacao', 'coordenacao'),
       ($1, $2, 3, 'Gerencia',    'gerencia')`,
    [s.companyId, s.projectId],
  )
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('envio', () => {
  it('leva a medicao para o nivel 1 e gera protocolo', async () => {
    const id = await medicaoPronta()
    const [row] = await sql<{ protocol: string }>('select submit_measurement($1) as protocol', [id])
    expect(row.protocol).toBe('MED-2026-09-001')
    expect(await estado(id)).toEqual({ status: 'EM_ANALISE', current_level: 1 })
  })

  it('recusa medicao sem nenhum item', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [])
    await expect(sql('select submit_measurement($1)', [id])).rejects.toThrow(/nenhum item/i)
  })

  it('recusa envio de medicao que ja esta em analise', async () => {
    const id = await medicaoPronta()
    await sql('select submit_measurement($1)', [id])
    await expect(sql('select submit_measurement($1)', [id])).rejects.toThrow(/nao pode ser enviada/i)
  })
})

describe('aprovacao em cadeia', () => {
  it('avanca um nivel por aprovacao ate o ultimo', async () => {
    const id = await medicaoPronta()
    await sql('select submit_measurement($1)', [id])

    await sql('select approve_measurement($1)', [id])
    expect(await estado(id)).toEqual({ status: 'EM_ANALISE', current_level: 2 })

    await sql('select approve_measurement($1)', [id])
    expect(await estado(id)).toEqual({ status: 'EM_ANALISE', current_level: 3 })

    await sql('select approve_measurement($1)', [id])
    expect((await estado(id)).status).toBe('APROVADA')
  })

  it('obra de nivel unico aprova de uma vez', async () => {
    await sql('delete from approval_levels where project_id = $1 and level > 1', [s.projectId])
    await sql('update projects set approval_levels = 1 where id = $1', [s.projectId])

    const id = await medicaoPronta()
    await sql('select submit_measurement($1)', [id])
    await sql('select approve_measurement($1)', [id])
    expect((await estado(id)).status).toBe('APROVADA')
  })

  it('obra com incorporadora exige um nivel a mais', async () => {
    await sql(
      `insert into approval_levels (company_id, project_id, level, label, role)
       values ($1, $2, 4, 'Incorporadora', 'incorporadora')`,
      [s.companyId, s.projectId],
    )
    const id = await medicaoPronta()
    await sql('select submit_measurement($1)', [id])
    for (let i = 0; i < 3; i++) await sql('select approve_measurement($1)', [id])
    expect(await estado(id)).toEqual({ status: 'EM_ANALISE', current_level: 4 })
    await sql('select approve_measurement($1)', [id])
    expect((await estado(id)).status).toBe('APROVADA')
  })

  it('recusa aprovacao de medicao que nao esta em analise', async () => {
    const id = await medicaoPronta()
    await expect(sql('select approve_measurement($1)', [id])).rejects.toThrow(/nao esta em analise/i)
  })
})

describe('devolucao', () => {
  it('exige motivo', async () => {
    const id = await medicaoPronta()
    await sql('select submit_measurement($1)', [id])
    await expect(sql('select return_measurement($1, $2)', [id, '  '])).rejects.toThrow(/motivo/i)
  })

  it('devolve para o empreiteiro e zera o nivel', async () => {
    const id = await medicaoPronta()
    await sql('select submit_measurement($1)', [id])
    await sql('select return_measurement($1, $2)', [id, 'Fachada da Casa 07 nao confere.'])
    expect(await estado(id)).toEqual({ status: 'DEVOLVIDA', current_level: 0 })
  })

  it('reenvio depois da devolucao recomeca no nivel 1, mesmo se a gerencia devolveu', async () => {
    const id = await medicaoPronta()
    await sql('select submit_measurement($1)', [id])
    await sql('select approve_measurement($1)', [id])
    await sql('select approve_measurement($1)', [id])
    expect((await estado(id)).current_level).toBe(3)

    await sql('select return_measurement($1, $2)', [id, 'Revisar quantidades.'])
    await sql('select submit_measurement($1)', [id])
    expect(await estado(id)).toEqual({ status: 'EM_ANALISE', current_level: 1 })
  })

  it('reenvio preserva o protocolo original', async () => {
    const id = await medicaoPronta()
    const [primeiro] = await sql<{ protocol: string }>(
      'select submit_measurement($1) as protocol', [id],
    )
    await sql('select return_measurement($1, $2)', [id, 'Revisar.'])
    const [segundo] = await sql<{ protocol: string }>(
      'select submit_measurement($1) as protocol', [id],
    )
    expect(segundo.protocol).toBe(primeiro.protocol)
  })
})
```

- [ ] **Step 2: Rodar o teste para ver falhar**

Run: `npm test -- tests/fluxo.test.ts`
Expected: FAIL com `relation "approval_levels" does not exist`.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/008_fluxo.sql`:

```sql
create table approval_levels (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  level      int not null check (level >= 1),
  label      text not null,
  role       app_role not null,
  unique (project_id, level)
);

alter table approval_levels enable row level security;

create policy approval_levels_select on approval_levels for select
  using (project_id in (select auth_project_ids()));

create or replace function submit_measurement(p_measurement_id uuid)
returns text
language plpgsql
as $$
declare
  v_status   measurement_status;
  v_protocol text;
  v_items    int;
begin
  select status, protocol into v_status, v_protocol
  from measurements where id = p_measurement_id;

  if v_status is null then
    raise exception 'Medicao nao encontrada.';
  end if;

  if v_status not in ('RASCUNHO', 'DEVOLVIDA') then
    raise exception 'Medicao nao pode ser enviada no status %.', v_status;
  end if;

  select count(*) into v_items
  from measurement_items where measurement_id = p_measurement_id;

  if v_items = 0 then
    raise exception 'Medicao sem nenhum item preenchido.';
  end if;

  -- protocolo nasce no primeiro envio e sobrevive a devolucoes
  if v_protocol is null then
    v_protocol := next_protocol(p_measurement_id);
  end if;

  update measurements
  set status        = 'EM_ANALISE',
      current_level = 1,
      protocol      = v_protocol,
      submitted_at  = coalesce(submitted_at, now()),
      version       = version + 1
  where id = p_measurement_id;

  return v_protocol;
end $$;

create or replace function approve_measurement(p_measurement_id uuid)
returns measurement_status
language plpgsql
as $$
declare
  v_status    measurement_status;
  v_level     int;
  v_max_level int;
  v_new       measurement_status;
begin
  select m.status, m.current_level into v_status, v_level
  from measurements m where m.id = p_measurement_id;

  if v_status is distinct from 'EM_ANALISE' then
    raise exception 'Medicao nao esta em analise (status atual: %).', v_status;
  end if;

  select max(al.level) into v_max_level
  from approval_levels al
  join measurements m      on m.id = p_measurement_id
  join measurement_periods p on p.id = m.period_id
  where al.project_id = p.project_id;

  if v_max_level is null then
    raise exception 'Obra sem niveis de aprovacao configurados.';
  end if;

  if v_level >= v_max_level then
    v_new := 'APROVADA';
    update measurements set status = v_new, current_level = v_max_level,
                            version = version + 1
    where id = p_measurement_id;
  else
    v_new := 'EM_ANALISE';
    update measurements set current_level = v_level + 1, version = version + 1
    where id = p_measurement_id;
  end if;

  return v_new;
end $$;

create or replace function return_measurement(p_measurement_id uuid, p_reason text)
returns void
language plpgsql
as $$
declare
  v_status measurement_status;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A devolucao exige um motivo.';
  end if;

  select status into v_status from measurements where id = p_measurement_id;

  if v_status is distinct from 'EM_ANALISE' then
    raise exception 'Somente medicao em analise pode ser devolvida (status atual: %).', v_status;
  end if;

  update measurements
  set status = 'DEVOLVIDA', current_level = 0, version = version + 1
  where id = p_measurement_id;
end $$;
```

- [ ] **Step 4: Aplicar e rodar os testes**

Run: `npx supabase db reset && npm test -- tests/fluxo.test.ts`
Expected: PASS, 11 testes.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/008_fluxo.sql tests/fluxo.test.ts
git commit -m "feat: maquina de estados e niveis de aprovacao configuraveis"
```

---

### Task 8: Auditoria

Grava toda mudança relevante com valor anterior e novo. O teste mais importante é o último: `qty_requested` sobrevive intacta a qualquer número de ajustes.

**Files:**
- Create: `supabase/migrations/009_auditoria.sql`
- Create: `tests/auditoria.test.ts`

**Interfaces:**
- Consumes: `measurements`, `measurement_items`, funções da Task 7.
- Produces:
  - `audit_log(id, company_id, measurement_id, actor_id, action, entity, entity_id, old_value, new_value, level, reason, created_at)`
  - Trigger `measurement_items_audit` em `measurement_items` (UPDATE de `qty_approved`).
  - Trigger `measurements_audit` em `measurements` (UPDATE de `status` ou `current_level`).

- [ ] **Step 1: Escrever o teste**

`tests/auditoria.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup } from './helpers/auth'
import { buildScenario, createMeasurement, type Scenario } from './helpers/scenario'

let s: Scenario
let medicao: string

interface Entrada {
  action: string
  old_value: string | null
  new_value: string | null
  level: number | null
  reason: string | null
}

async function trilha(): Promise<Entrada[]> {
  return sql<Entrada>(
    `select action, old_value, new_value, level, reason
     from audit_log where measurement_id = $1 order by created_at, id`,
    [medicao],
  )
}

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()
  await sql(
    `insert into approval_levels (company_id, project_id, level, label, role) values
       ($1, $2, 1, 'Engenharia', 'engenharia'),
       ($1, $2, 2, 'Gerencia',   'gerencia')`,
    [s.companyId, s.projectId],
  )
  medicao = await createMeasurement(s, 'RASCUNHO', [
    { contractItemId: s.contrapisoId, requested: 20 },
  ])
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('trilha de auditoria', () => {
  it('registra o envio', async () => {
    await sql('select submit_measurement($1)', [medicao])
    const entradas = await trilha()
    expect(entradas.some((e) => e.action === 'ENVIADA')).toBe(true)
  })

  it('registra o ajuste de quantidade com valor anterior e novo', async () => {
    await sql('select submit_measurement($1)', [medicao])
    await sql(
      `update measurement_items set qty_approved = 18
       where measurement_id = $1 and contract_item_id = $2`,
      [medicao, s.contrapisoId],
    )
    const ajuste = (await trilha()).find((e) => e.action === 'QUANTIDADE_AJUSTADA')
    expect(ajuste).toBeDefined()
    expect(Number(ajuste!.old_value)).toBe(20)
    expect(Number(ajuste!.new_value)).toBe(18)
    expect(ajuste!.level).toBe(1)
  })

  it('registra o nivel correto quando quem ajusta e a gerencia', async () => {
    await sql('select submit_measurement($1)', [medicao])
    await sql('select approve_measurement($1)', [medicao])
    await sql(
      `update measurement_items set qty_approved = 15
       where measurement_id = $1 and contract_item_id = $2`,
      [medicao, s.contrapisoId],
    )
    const ajuste = (await trilha()).filter((e) => e.action === 'QUANTIDADE_AJUSTADA').pop()
    expect(ajuste!.level).toBe(2)
  })

  it('registra a devolucao com o motivo', async () => {
    await sql('select submit_measurement($1)', [medicao])
    await sql('select return_measurement($1, $2)', [medicao, 'Fachada nao confere.'])
    const devolucao = (await trilha()).find((e) => e.action === 'DEVOLVIDA')
    expect(devolucao!.reason).toBe('Fachada nao confere.')
  })

  it('registra cada aprovacao da cadeia', async () => {
    await sql('select submit_measurement($1)', [medicao])
    await sql('select approve_measurement($1)', [medicao])
    await sql('select approve_measurement($1)', [medicao])
    const aprovacoes = (await trilha()).filter((e) => e.action === 'APROVADA')
    expect(aprovacoes).toHaveLength(2)
  })

  it('a quantidade solicitada sobrevive intacta a varios ajustes', async () => {
    await sql('select submit_measurement($1)', [medicao])
    for (const q of [18, 16, 19]) {
      await sql(
        `update measurement_items set qty_approved = $3
         where measurement_id = $1 and contract_item_id = $2`,
        [medicao, s.contrapisoId, q],
      )
    }
    const [item] = await sql<{ qty_requested: string; qty_approved: string }>(
      `select qty_requested, qty_approved from measurement_items
       where measurement_id = $1 and contract_item_id = $2`,
      [medicao, s.contrapisoId],
    )
    expect(Number(item.qty_requested)).toBe(20)
    expect(Number(item.qty_approved)).toBe(19)
    expect((await trilha()).filter((e) => e.action === 'QUANTIDADE_AJUSTADA')).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Rodar o teste para ver falhar**

Run: `npm test -- tests/auditoria.test.ts`
Expected: FAIL com `relation "audit_log" does not exist`.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/009_auditoria.sql`:

```sql
create table audit_log (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  measurement_id uuid references measurements(id) on delete cascade,
  actor_id       uuid,
  action         text not null,
  entity         text not null,
  entity_id      uuid,
  old_value      text,
  new_value      text,
  level          int,
  reason         text,
  created_at     timestamptz not null default clock_timestamp()
);

create index audit_log_measurement_idx on audit_log (measurement_id, created_at);

alter table audit_log enable row level security;

create policy audit_log_select on audit_log for select
  using (measurement_id in (select id from measurements where can_read_contract(contract_id)));

create or replace function log_item_adjustment()
returns trigger
language plpgsql
as $$
declare
  v_level int;
begin
  if new.qty_approved is not distinct from old.qty_approved then
    return new;
  end if;

  select current_level into v_level from measurements where id = new.measurement_id;

  insert into audit_log
    (company_id, measurement_id, actor_id, action, entity, entity_id,
     old_value, new_value, level)
  values
    (new.company_id, new.measurement_id, auth.uid(), 'QUANTIDADE_AJUSTADA',
     'measurement_item', new.id,
     coalesce(old.qty_approved, old.qty_requested)::text,
     new.qty_approved::text,
     v_level);

  return new;
end $$;

create trigger measurement_items_audit
  after update of qty_approved on measurement_items
  for each row execute function log_item_adjustment();

create or replace function log_measurement_change()
returns trigger
language plpgsql
as $$
declare
  v_action text;
begin
  if new.status is not distinct from old.status
     and new.current_level is not distinct from old.current_level then
    return new;
  end if;

  v_action := case
    when new.status = 'EM_ANALISE' and old.status in ('RASCUNHO', 'DEVOLVIDA') then 'ENVIADA'
    when new.status = 'DEVOLVIDA'  then 'DEVOLVIDA'
    when new.status = 'CANCELADA'  then 'CANCELADA'
    when new.status = 'EM_ANALISE' and new.current_level > old.current_level then 'APROVADA'
    when new.status = 'APROVADA'   then 'APROVADA'
    else 'STATUS_ALTERADO'
  end;

  insert into audit_log
    (company_id, measurement_id, actor_id, action, entity, entity_id,
     old_value, new_value, level)
  values
    (new.company_id, new.id, auth.uid(), v_action, 'measurement', new.id,
     old.status::text, new.status::text, old.current_level);

  return new;
end $$;

create trigger measurements_audit
  after update of status, current_level on measurements
  for each row execute function log_measurement_change();

/* A devolucao precisa gravar o motivo, que o trigger generico nao enxerga. */
create or replace function return_measurement(p_measurement_id uuid, p_reason text)
returns void
language plpgsql
as $$
declare
  v_status measurement_status;
  v_company uuid;
  v_level  int;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A devolucao exige um motivo.';
  end if;

  select status, company_id, current_level
    into v_status, v_company, v_level
  from measurements where id = p_measurement_id;

  if v_status is distinct from 'EM_ANALISE' then
    raise exception 'Somente medicao em analise pode ser devolvida (status atual: %).', v_status;
  end if;

  update measurements
  set status = 'DEVOLVIDA', current_level = 0, version = version + 1
  where id = p_measurement_id;

  update audit_log
  set reason = p_reason
  where id = (
    select id from audit_log
    where measurement_id = p_measurement_id and action = 'DEVOLVIDA'
    order by created_at desc limit 1
  );
end $$;
```

- [ ] **Step 4: Aplicar e rodar os testes**

Run: `npx supabase db reset && npm test -- tests/auditoria.test.ts`
Expected: PASS, 6 testes.

- [ ] **Step 5: Rodar a suíte inteira, para garantir que a auditoria não quebrou nada**

Run: `npm test`
Expected: PASS em todos os arquivos.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/009_auditoria.sql tests/auditoria.test.ts
git commit -m "feat: trilha de auditoria de ajustes, aprovacoes e devolucoes"
```

---

### Task 9: Reabertura de período

A reabertura é por empreiteiro. Mudar `closes_at` do período reabriria para os 18 empreiteiros da obra — por isso vira registro próprio.

**Files:**
- Create: `supabase/migrations/010_reabertura.sql`
- Create: `tests/reabertura.test.ts`

**Interfaces:**
- Consumes: `measurement_periods`, `contractors`, `measurements`.
- Produces:
  - `period_reopenings(id, company_id, period_id, contractor_id, reopened_until, authorized_by, reason, created_at)`
  - `is_period_open(p_period_id uuid, p_contractor_id uuid) returns boolean`
  - `reopen_period(p_period_id uuid, p_contractor_id uuid, p_until timestamptz, p_reason text) returns uuid`
  - Trigger que impede INSERT/UPDATE em `measurement_items` de medição cujo período está fechado.

- [ ] **Step 1: Escrever o teste**

`tests/reabertura.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup } from './helpers/auth'
import { buildScenario, createMeasurement, type Scenario } from './helpers/scenario'

let s: Scenario
let outroContratado: string

async function fecharPeriodo(): Promise<void> {
  await sql(
    `update measurement_periods set closes_at = now() - interval '1 day' where id = $1`,
    [s.periodId],
  )
}

async function aberto(contractorId: string): Promise<boolean> {
  const [row] = await sql<{ open: boolean }>('select is_period_open($1, $2) as open', [
    s.periodId,
    contractorId,
  ])
  return row.open
}

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()
  const [c] = await sql<{ id: string }>(
    `insert into contractors (company_id, name) values ($1, 'Empreiteira Beta') returning id`,
    [s.companyId],
  )
  outroContratado = c.id
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('janela de medicao', () => {
  it('periodo dentro do prazo esta aberto', async () => {
    await sql(
      `update measurement_periods set opens_at = now() - interval '1 day',
                                      closes_at = now() + interval '1 day'
       where id = $1`,
      [s.periodId],
    )
    expect(await aberto(s.contractorId)).toBe(true)
  })

  it('periodo vencido esta fechado', async () => {
    await fecharPeriodo()
    expect(await aberto(s.contractorId)).toBe(false)
  })

  it('bloqueia edicao de medicao com periodo fechado', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [])
    await fecharPeriodo()
    await expect(
      sql(
        `insert into measurement_items
           (company_id, measurement_id, contract_item_id, qty_requested)
         values ($1, $2, $3, 10)`,
        [s.companyId, id, s.contrapisoId],
      ),
    ).rejects.toThrow(/periodo/i)
  })
})

describe('reabertura', () => {
  it('reabre somente para o empreiteiro indicado', async () => {
    await fecharPeriodo()
    await sql('select reopen_period($1, $2, $3, $4)', [
      s.periodId,
      s.contractorId,
      new Date(Date.now() + 86400000).toISOString(),
      'Atraso na entrega do relatorio de campo.',
    ])
    expect(await aberto(s.contractorId)).toBe(true)
    expect(await aberto(outroContratado)).toBe(false)
  })

  it('exige motivo', async () => {
    await fecharPeriodo()
    await expect(
      sql('select reopen_period($1, $2, $3, $4)', [
        s.periodId,
        s.contractorId,
        new Date(Date.now() + 86400000).toISOString(),
        '',
      ]),
    ).rejects.toThrow(/motivo/i)
  })

  it('reabertura vencida nao vale mais', async () => {
    await fecharPeriodo()
    await sql(
      `insert into period_reopenings
         (company_id, period_id, contractor_id, reopened_until, reason)
       values ($1, $2, $3, now() - interval '1 hour', 'Expirada')`,
      [s.companyId, s.periodId, s.contractorId],
    )
    expect(await aberto(s.contractorId)).toBe(false)
  })

  it('reabertura libera edicao do rascunho', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [])
    await fecharPeriodo()
    await sql('select reopen_period($1, $2, $3, $4)', [
      s.periodId,
      s.contractorId,
      new Date(Date.now() + 86400000).toISOString(),
      'Reabertura autorizada pela gerencia.',
    ])
    await sql(
      `insert into measurement_items
         (company_id, measurement_id, contract_item_id, qty_requested)
       values ($1, $2, $3, 10)`,
      [s.companyId, id, s.contrapisoId],
    )
    const rows = await sql('select 1 from measurement_items where measurement_id = $1', [id])
    expect(rows).toHaveLength(1)
  })

  it('reabertura nao ressuscita medicao aprovada', async () => {
    const id = await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 20 },
    ])
    await fecharPeriodo()
    await sql('select reopen_period($1, $2, $3, $4)', [
      s.periodId,
      s.contractorId,
      new Date(Date.now() + 86400000).toISOString(),
      'Reabertura autorizada.',
    ])
    await expect(
      sql(
        `update measurement_items set qty_requested = 30
         where measurement_id = $1 and contract_item_id = $2`,
        [id, s.contrapisoId],
      ),
    ).rejects.toThrow(/aprovada/i)
  })

  it('registra quem reabriu e por que', async () => {
    await fecharPeriodo()
    await sql('select reopen_period($1, $2, $3, $4)', [
      s.periodId,
      s.contractorId,
      new Date(Date.now() + 86400000).toISOString(),
      'Falha de conexao na obra.',
    ])
    const [row] = await sql<{ reason: string; contractor_id: string }>(
      'select reason, contractor_id from period_reopenings where period_id = $1',
      [s.periodId],
    )
    expect(row.reason).toBe('Falha de conexao na obra.')
    expect(row.contractor_id).toBe(s.contractorId)
  })
})
```

- [ ] **Step 2: Rodar o teste para ver falhar**

Run: `npm test -- tests/reabertura.test.ts`
Expected: FAIL com `function is_period_open(uuid, uuid) does not exist`.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/010_reabertura.sql`:

```sql
create table period_reopenings (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  period_id      uuid not null references measurement_periods(id) on delete cascade,
  contractor_id  uuid not null references contractors(id) on delete cascade,
  reopened_until timestamptz not null,
  authorized_by  uuid,
  reason         text not null,
  created_at     timestamptz not null default now()
);

create index period_reopenings_lookup
  on period_reopenings (period_id, contractor_id, reopened_until);

alter table period_reopenings enable row level security;

create policy period_reopenings_select on period_reopenings for select
  using (period_id in (select id from measurement_periods
                       where project_id in (select auth_project_ids())));

create or replace function is_period_open(p_period_id uuid, p_contractor_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from measurement_periods
    where id = p_period_id and now() between opens_at and closes_at
  )
  or exists (
    select 1 from period_reopenings
    where period_id = p_period_id
      and contractor_id = p_contractor_id
      and reopened_until > now()
  )
$$;

create or replace function reopen_period(
  p_period_id     uuid,
  p_contractor_id uuid,
  p_until         timestamptz,
  p_reason        text
)
returns uuid
language plpgsql
as $$
declare
  v_company uuid;
  v_id      uuid;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'A reabertura exige um motivo.';
  end if;

  if p_until <= now() then
    raise exception 'A reabertura precisa de uma data futura.';
  end if;

  select company_id into v_company from measurement_periods where id = p_period_id;
  if v_company is null then
    raise exception 'Periodo nao encontrado.';
  end if;

  insert into period_reopenings
    (company_id, period_id, contractor_id, reopened_until, authorized_by, reason)
  values (v_company, p_period_id, p_contractor_id, p_until, auth.uid(), p_reason)
  returning id into v_id;

  return v_id;
end $$;

/* Rascunho e devolvida so mudam com periodo aberto.
   Medicao ja enviada nao volta a ser editada pelo empreiteiro. */
create or replace function enforce_period_open()
returns trigger
language plpgsql
as $$
declare
  v_status       measurement_status;
  v_period       uuid;
  v_contractor   uuid;
begin
  select m.status, m.period_id, c.contractor_id
    into v_status, v_period, v_contractor
  from measurements m
  join contracts c on c.id = m.contract_id
  where m.id = new.measurement_id;

  -- ajuste do aprovador acontece com a medicao em analise, fora da janela
  if v_status in ('EM_ANALISE') then
    return new;
  end if;

  if v_status in ('APROVADA', 'NF_ENVIADA', 'NF_APROVADA', 'PAGA') then
    raise exception 'Medicao ja aprovada nao pode ser alterada.';
  end if;

  if not is_period_open(v_period, v_contractor) then
    raise exception 'O periodo de medicao esta encerrado.';
  end if;

  return new;
end $$;

create trigger measurement_items_period
  before insert or update of qty_requested on measurement_items
  for each row execute function enforce_period_open();
```

- [ ] **Step 4: Ajustar o cenário de teste, que agora esbarra na janela**

`buildScenario` cria o período de setembro de 2026, que já está encerrado. Em `tests/helpers/scenario.ts`, trocar a inserção do período por uma janela sempre aberta:

```typescript
  const [period] = await sql<{ id: string }>(
    `insert into measurement_periods (company_id, project_id, competence, opens_at, closes_at)
     values ($1, $2, '2026-09-01', now() - interval '1 day', now() + interval '9 days')
     returning id`,
    [companyId, project.id],
  )
```

A competência continua sendo setembro de 2026, então o protocolo esperado nos testes da Task 5 não muda.

- [ ] **Step 5: Aplicar e rodar a suíte inteira**

Run: `npx supabase db reset && npm test`
Expected: PASS em todos os arquivos, incluindo os 7 novos de reabertura.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/010_reabertura.sql tests/reabertura.test.ts tests/helpers/scenario.ts
git commit -m "feat: janela de medicao e reabertura por empreiteiro"
```

---

### Task 10: Anexos, nota fiscal e buckets

**Files:**
- Create: `supabase/migrations/011_anexos_nf.sql`
- Create: `tests/nf.test.ts`

**Interfaces:**
- Consumes: `measurements`, `measurement_items`, `projects`.
- Produces:
  - `attachments(id, company_id, measurement_id, measurement_item_id, bucket, path, mime_type, size_bytes, created_at)`
  - `invoices(id, company_id, measurement_id, number, issued_on, amount, status, pdf_path, xml_path, created_at)`
  - `measurement_total(p_measurement_id uuid, p_approved boolean) returns numeric`
  - `submit_invoice(p_measurement_id uuid, p_number text, p_issued_on date, p_amount numeric, p_pdf text, p_xml text) returns uuid`
  - Coluna `projects.invoice_tolerance` — divergência aceita entre NF e aprovado; `0` bloqueia qualquer diferença.

- [ ] **Step 1: Escrever o teste**

`tests/nf.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup } from './helpers/auth'
import { buildScenario, createMeasurement, type Scenario } from './helpers/scenario'

let s: Scenario

async function medicaoAprovada(): Promise<string> {
  const id = await createMeasurement(s, 'RASCUNHO', [
    { contractItemId: s.contrapisoId, requested: 20 },
  ])
  await sql('select submit_measurement($1)', [id])
  await sql(
    `update measurement_items set qty_approved = 18
     where measurement_id = $1 and contract_item_id = $2`,
    [id, s.contrapisoId],
  )
  await sql('select approve_measurement($1)', [id])
  return id
}

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()
  await sql(
    `insert into approval_levels (company_id, project_id, level, label, role)
     values ($1, $2, 1, 'Engenharia', 'engenharia')`,
    [s.companyId, s.projectId],
  )
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('total da medicao', () => {
  it('soma o solicitado quando pedido o total solicitado', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 20 },
      { contractItemId: s.alvenariaId, requested: 30 },
    ])
    const [row] = await sql<{ total: string }>(
      'select measurement_total($1, false) as total', [id],
    )
    // 20 x 112 + 30 x 90 = 2240 + 2700
    expect(Number(row.total)).toBe(4940)
  })

  it('soma o aprovado quando pedido o total aprovado', async () => {
    const id = await medicaoAprovada()
    const [row] = await sql<{ total: string }>(
      'select measurement_total($1, true) as total', [id],
    )
    expect(Number(row.total)).toBe(2016) // 18 x 112
  })
})

describe('nota fiscal', () => {
  it('aceita NF com valor igual ao aprovado', async () => {
    const id = await medicaoAprovada()
    await sql('select submit_invoice($1, $2, $3, $4, $5, $6)', [
      id, '1234', '2026-09-15', 2016, 'nf/1234.pdf', 'nf/1234.xml',
    ])
    const [m] = await sql<{ status: string }>(
      'select status from measurements where id = $1', [id],
    )
    expect(m.status).toBe('NF_ENVIADA')
  })

  it('recusa NF divergente quando a obra nao tolera diferenca', async () => {
    const id = await medicaoAprovada()
    await expect(
      sql('select submit_invoice($1, $2, $3, $4, $5, $6)', [
        id, '1234', '2026-09-15', 2500, 'nf/1234.pdf', null,
      ]),
    ).rejects.toThrow(/2016/)
  })

  it('aceita divergencia dentro da tolerancia configurada', async () => {
    await sql('update projects set invoice_tolerance = 10 where id = $1', [s.projectId])
    const id = await medicaoAprovada()
    await sql('select submit_invoice($1, $2, $3, $4, $5, $6)', [
      id, '1234', '2026-09-15', 2020, 'nf/1234.pdf', null,
    ])
    const [m] = await sql<{ status: string }>(
      'select status from measurements where id = $1', [id],
    )
    expect(m.status).toBe('NF_ENVIADA')
  })

  it('recusa NF de medicao que nao foi aprovada', async () => {
    const id = await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    await expect(
      sql('select submit_invoice($1, $2, $3, $4, $5, $6)', [
        id, '1234', '2026-09-15', 100, 'nf/1234.pdf', null,
      ]),
    ).rejects.toThrow(/aprovada/i)
  })

  it('registra o envio da NF na auditoria', async () => {
    const id = await medicaoAprovada()
    await sql('select submit_invoice($1, $2, $3, $4, $5, $6)', [
      id, '1234', '2026-09-15', 2016, 'nf/1234.pdf', null,
    ])
    const rows = await sql<{ action: string }>(
      `select action from audit_log where measurement_id = $1 and action = 'NF_ENVIADA'`,
      [id],
    )
    expect(rows).toHaveLength(1)
  })
})

describe('anexos', () => {
  it('guarda o caminho do arquivo com a empresa no prefixo', async () => {
    const id = await medicaoAprovada()
    const caminho = `${s.companyId}/medicoes/${id}/foto.jpg`
    await sql(
      `insert into attachments (company_id, measurement_id, bucket, path, mime_type, size_bytes)
       values ($1, $2, 'medicao-fotos', $3, 'image/jpeg', 120000)`,
      [s.companyId, id, caminho],
    )
    const [row] = await sql<{ path: string }>(
      'select path from attachments where measurement_id = $1', [id],
    )
    expect(row.path.startsWith(s.companyId)).toBe(true)
  })
})
```

- [ ] **Step 2: Rodar o teste para ver falhar**

Run: `npm test -- tests/nf.test.ts`
Expected: FAIL com `function measurement_total(uuid, boolean) does not exist`.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/011_anexos_nf.sql`:

```sql
alter table projects add column invoice_tolerance numeric(14,4) not null default 0;

create table attachments (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references companies(id) on delete cascade,
  measurement_id      uuid references measurements(id) on delete cascade,
  measurement_item_id uuid references measurement_items(id) on delete cascade,
  bucket              text not null,
  path                text not null unique,
  mime_type           text not null,
  size_bytes          bigint not null check (size_bytes > 0),
  created_at          timestamptz not null default now()
);

create type invoice_status as enum ('RECEBIDA', 'EM_CONFERENCIA', 'APROVADA', 'REJEITADA', 'PAGA');

create table invoices (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  measurement_id uuid not null references measurements(id) on delete cascade,
  number         text not null,
  issued_on      date not null,
  amount         numeric(14,4) not null check (amount > 0),
  status         invoice_status not null default 'RECEBIDA',
  pdf_path       text,
  xml_path       text,
  created_at     timestamptz not null default now(),
  unique (measurement_id, number)
);

alter table attachments enable row level security;
alter table invoices    enable row level security;

create policy attachments_select on attachments for select
  using (measurement_id in (select id from measurements where can_read_contract(contract_id)));

create policy invoices_select on invoices for select
  using (measurement_id in (select id from measurements where can_read_contract(contract_id)));

/* p_approved = true soma o aprovado; false soma o solicitado. */
create or replace function measurement_total(p_measurement_id uuid, p_approved boolean)
returns numeric
language sql
stable
as $$
  select coalesce(sum(
    case when p_approved then coalesce(mi.qty_approved, 0) else mi.qty_requested end
    * ci.unit_price
  ), 0)
  from measurement_items mi
  join contract_items ci on ci.id = mi.contract_item_id
  where mi.measurement_id = p_measurement_id
$$;

create or replace function submit_invoice(
  p_measurement_id uuid,
  p_number         text,
  p_issued_on      date,
  p_amount         numeric,
  p_pdf            text,
  p_xml            text
)
returns uuid
language plpgsql
as $$
declare
  v_status    measurement_status;
  v_company   uuid;
  v_approved  numeric;
  v_tolerance numeric;
  v_id        uuid;
begin
  select m.status, m.company_id, p.invoice_tolerance
    into v_status, v_company, v_tolerance
  from measurements m
  join measurement_periods mp on mp.id = m.period_id
  join projects p on p.id = mp.project_id
  where m.id = p_measurement_id;

  if v_status is null then
    raise exception 'Medicao nao encontrada.';
  end if;

  if v_status <> 'APROVADA' then
    raise exception 'A nota fiscal so pode ser enviada para medicao aprovada (status atual: %).',
      v_status;
  end if;

  v_approved := measurement_total(p_measurement_id, true);

  if abs(p_amount - v_approved) > v_tolerance then
    raise exception
      'Valor da nota (%) diverge do valor aprovado (%). Diferenca aceita: %.',
      p_amount, v_approved, v_tolerance
      using errcode = 'check_violation';
  end if;

  insert into invoices
    (company_id, measurement_id, number, issued_on, amount, pdf_path, xml_path)
  values
    (v_company, p_measurement_id, p_number, p_issued_on, p_amount, p_pdf, p_xml)
  returning id into v_id;

  update measurements
  set status = 'NF_ENVIADA', version = version + 1
  where id = p_measurement_id;

  insert into audit_log
    (company_id, measurement_id, actor_id, action, entity, entity_id, new_value)
  values
    (v_company, p_measurement_id, auth.uid(), 'NF_ENVIADA', 'invoice', v_id, p_amount::text);

  return v_id;
end $$;
```

- [ ] **Step 4: Criar os buckets de storage**

`supabase/migrations/012_buckets.sql`:

```sql
insert into storage.buckets (id, name, public)
values ('medicao-fotos', 'medicao-fotos', false),
       ('notas-fiscais', 'notas-fiscais', false),
       ('contratos-docs', 'contratos-docs', false)
on conflict (id) do nothing;

/* O primeiro segmento do caminho e sempre o company_id.
   Assim a RLS de storage reusa o mesmo isolamento das tabelas. */
create policy storage_select_own_company on storage.objects for select
  using (
    bucket_id in ('medicao-fotos', 'notas-fiscais', 'contratos-docs')
    and (storage.foldername(name))[1]::uuid in (select auth_company_ids())
  );

create policy storage_insert_own_company on storage.objects for insert
  with check (
    bucket_id in ('medicao-fotos', 'notas-fiscais', 'contratos-docs')
    and (storage.foldername(name))[1]::uuid in (select auth_company_ids())
  );
```

- [ ] **Step 5: Aplicar e rodar os testes**

Run: `npx supabase db reset && npm test -- tests/nf.test.ts`
Expected: PASS, 8 testes.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/011_anexos_nf.sql supabase/migrations/012_buckets.sql tests/nf.test.ts
git commit -m "feat: anexos, nota fiscal com tolerancia e buckets isolados"
```

---

### Task 11: Seed de demonstração

Este é o material de venda. Precisa parecer uma obra real: histórico de medições passadas em estados diferentes, uma medição em análise e um período aberto esperando o empreiteiro.

**Files:**
- Create: `supabase/seed.sql`
- Create: `tests/seed.test.ts`

**Interfaces:**
- Consumes: todas as tabelas e funções anteriores.
- Produces: banco populado com uma construtora, uma obra de 20 casas, dois empreiteiros, contratos com 6 serviços por casa, quatro competências de histórico e o período corrente aberto.

- [ ] **Step 1: Escrever o teste do seed**

`tests/seed.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'

/* Este arquivo roda contra o banco recem-resetado, que ja aplicou o seed.
   Nao limpa nada: valida o estado que `supabase db reset` produz. */

beforeAll(async () => {
  const rows = await sql<{ count: string }>('select count(*) from companies')
  if (Number(rows[0].count) === 0) {
    throw new Error('Banco sem seed. Rode `npx supabase db reset` antes deste teste.')
  }
})

afterAll(async () => {
  await closePool()
})

describe('seed de demonstracao', () => {
  it('cria uma construtora com uma obra de 20 casas', async () => {
    const [row] = await sql<{ count: string }>(
      `select count(*) from units u
       join stages s on s.id = u.stage_id
       join projects p on p.id = s.project_id
       where p.name = 'Residencial Vista Alta'`,
    )
    expect(Number(row.count)).toBe(20)
  })

  it('cria dois empreiteiros com contrato', async () => {
    const [row] = await sql<{ count: string }>('select count(*) from contracts')
    expect(Number(row.count)).toBe(2)
  })

  it('cria itens de contrato para todas as casas', async () => {
    const [row] = await sql<{ count: string }>('select count(*) from contract_items')
    expect(Number(row.count)).toBeGreaterThanOrEqual(120) // 20 casas x 6 servicos
  })

  it('tem o periodo corrente aberto', async () => {
    const [row] = await sql<{ count: string }>(
      'select count(*) from measurement_periods where now() between opens_at and closes_at',
    )
    expect(Number(row.count)).toBe(1)
  })

  it('tem historico com medicoes em estados variados', async () => {
    const rows = await sql<{ status: string }>(
      'select distinct status::text as status from measurements',
    )
    const estados = rows.map((r) => r.status)
    expect(estados).toContain('PAGA')
    expect(estados).toContain('APROVADA')
    expect(estados).toContain('EM_ANALISE')
  })

  it('os saldos batem com o historico', async () => {
    const rows = await sql<{ service_name: string; quantity: string; balance: string }>(
      `select ci.service_name, ci.quantity, contract_item_balance(ci.id) as balance
       from contract_items ci
       order by ci.created_at
       limit 20`,
    )
    for (const row of rows) {
      expect(Number(row.balance)).toBeGreaterThanOrEqual(0)
      expect(Number(row.balance)).toBeLessThanOrEqual(Number(row.quantity))
    }
  })

  it('nenhum item de contrato ficou com saldo negativo', async () => {
    const [row] = await sql<{ count: string }>(
      'select count(*) from contract_items ci where contract_item_balance(ci.id) < 0',
    )
    expect(Number(row.count)).toBe(0)
  })
})
```

- [ ] **Step 2: Rodar o teste para ver falhar**

Run: `npx supabase db reset && npm test -- tests/seed.test.ts`
Expected: FAIL com "Banco sem seed".

- [ ] **Step 3: Escrever o seed**

`supabase/seed.sql`:

```sql
/* Seed de demonstracao. Roda automaticamente em `supabase db reset`.
   Uma construtora, uma obra de 20 casas, dois empreiteiros,
   quatro competencias de historico e o periodo corrente aberto. */

do $$
declare
  v_company   uuid;
  v_project   uuid;
  v_stage     uuid;
  v_type      uuid;
  v_alfa      uuid;
  v_beta      uuid;
  v_ct_alfa   uuid;
  v_ct_beta   uuid;
  v_unit      uuid;
  v_period    uuid;
  v_meas      uuid;
  v_item      uuid;
  i           int;
  m           int;
  v_comp      date;
  v_status    text;
  v_servico   record;
begin
  insert into companies (name) values ('Construtora Vista Ltda') returning id into v_company;

  insert into projects (company_id, name, unit_label, approval_levels,
                        invoice_tolerance, measurement_input_mode)
  values (v_company, 'Residencial Vista Alta', 'casa', 3, 0, 'quantidade')
  returning id into v_project;

  insert into approval_levels (company_id, project_id, level, label, role) values
    (v_company, v_project, 1, 'Engenharia',  'engenharia'),
    (v_company, v_project, 2, 'Coordenacao', 'coordenacao'),
    (v_company, v_project, 3, 'Gerencia',    'gerencia');

  insert into stages (company_id, project_id, name, position)
  values (v_company, v_project, 'Casas 01 a 20', 1)
  returning id into v_stage;

  insert into unit_types (company_id, project_id, name, area)
  values (v_company, v_project, 'Tipologia padrao', 70)
  returning id into v_type;

  insert into contractors (company_id, name, document)
  values (v_company, 'Empreiteira Alfa Servicos Civis', '12.345.678/0001-90')
  returning id into v_alfa;

  insert into contractors (company_id, name, document)
  values (v_company, 'Beta Instalacoes', '98.765.432/0001-10')
  returning id into v_beta;

  insert into contracts (company_id, project_id, contractor_id, number, description,
                         starts_on, ends_on)
  values (v_company, v_project, v_alfa, '023/2026', 'Servicos civis - alvenaria e acabamento',
          '2026-01-05', '2026-12-20')
  returning id into v_ct_alfa;

  insert into contracts (company_id, project_id, contractor_id, number, description,
                         starts_on, ends_on)
  values (v_company, v_project, v_beta, '024/2026', 'Instalacoes hidraulicas e eletricas',
          '2026-02-01', '2026-12-20')
  returning id into v_ct_beta;

  -- 20 casas, cada uma com 4 servicos da Alfa e 2 da Beta
  for i in 1..20 loop
    insert into units (company_id, stage_id, unit_type_id, name, position)
    values (v_company, v_stage, v_type, 'Casa ' || lpad(i::text, 2, '0'), i)
    returning id into v_unit;

    for v_servico in
      select * from (values
        ('Contrapiso',           'Pisos',        'm2'::measurement_unit,  86.0, 112.0, v_ct_alfa),
        ('Reboco interno',       'Revestimento', 'm2'::measurement_unit, 120.0,  90.0, v_ct_alfa),
        ('Pintura interna',      'Pintura',      'm2'::measurement_unit, 120.0,  65.0, v_ct_alfa),
        ('Esquadrias',           'Esquadrias',   'un'::measurement_unit,  12.0, 380.0, v_ct_alfa),
        ('Instalacao eletrica',  'Instalacoes',  'pt'::measurement_unit,  45.0, 150.0, v_ct_beta),
        ('Instalacao hidraulica','Instalacoes',  'pt'::measurement_unit,  35.0, 140.0, v_ct_beta)
      ) as t(nome, grupo, un, qtd, preco, contrato)
    loop
      insert into contract_items
        (company_id, contract_id, unit_id, service_name, service_group, unit, quantity, unit_price)
      values
        (v_company, v_servico.contrato, v_unit, v_servico.nome, v_servico.grupo,
         v_servico.un, v_servico.qtd, v_servico.preco);
    end loop;
  end loop;

  -- quatro competencias de historico, encerradas
  m := 0;
  foreach v_comp in array array['2026-05-01','2026-06-01','2026-07-01','2026-08-01']::date[]
  loop
    m := m + 1;
    v_status := case m
      when 1 then 'PAGA'
      when 2 then 'PAGA'
      when 3 then 'NF_APROVADA'
      else 'APROVADA'
    end;

    insert into measurement_periods (company_id, project_id, competence, opens_at, closes_at)
    values (v_company, v_project, v_comp, v_comp, v_comp + interval '9 days 23 hours')
    returning id into v_period;

    insert into measurements
      (company_id, period_id, contract_id, status, current_level, protocol, submitted_at)
    values
      (v_company, v_period, v_ct_alfa, v_status::measurement_status, 3,
       'MED-' || to_char(v_comp, 'YYYY-MM') || '-001', v_comp + interval '8 days')
    returning id into v_meas;

    -- mede 15% do contratado de cada servico da Alfa nas 8 primeiras casas
    for v_item in
      select ci.id from contract_items ci
      join units u on u.id = ci.unit_id
      where ci.contract_id = v_ct_alfa and u.position <= 8
    loop
      insert into measurement_items
        (company_id, measurement_id, contract_item_id, qty_requested, qty_approved)
      select v_company, v_meas, ci.id,
             round(ci.quantity * 0.15, 2), round(ci.quantity * 0.15, 2)
      from contract_items ci where ci.id = v_item;
    end loop;

    if v_status in ('PAGA', 'NF_APROVADA') then
      insert into invoices
        (company_id, measurement_id, number, issued_on, amount, status, pdf_path)
      values
        (v_company, v_meas, (5000 + m)::text, v_comp + interval '12 days',
         measurement_total(v_meas, true),
         case when v_status = 'PAGA' then 'PAGA' else 'APROVADA' end::invoice_status,
         v_company || '/notas/' || (5000 + m) || '.pdf');
    end if;
  end loop;

  -- competencia corrente: periodo aberto, esperando o empreiteiro
  insert into measurement_periods (company_id, project_id, competence, opens_at, closes_at)
  values (v_company, v_project, date_trunc('month', now())::date,
          now() - interval '2 days', now() + interval '7 days')
  returning id into v_period;

  -- a Beta ja enviou e esta em analise na coordenacao
  insert into measurements
    (company_id, period_id, contract_id, status, current_level, protocol, submitted_at)
  values
    (v_company, v_period, v_ct_beta, 'EM_ANALISE', 2,
     'MED-' || to_char(now(), 'YYYY-MM') || '-002', now() - interval '1 day')
  returning id into v_meas;

  for v_item in
    select ci.id from contract_items ci
    join units u on u.id = ci.unit_id
    where ci.contract_id = v_ct_beta and u.position <= 5
  loop
    insert into measurement_items
      (company_id, measurement_id, contract_item_id, qty_requested)
    select v_company, v_meas, ci.id, round(ci.quantity * 0.20, 2)
    from contract_items ci where ci.id = v_item;
  end loop;

  raise notice 'Seed aplicado: empresa %, obra %', v_company, v_project;
end $$;
```

- [ ] **Step 4: Aplicar e rodar o teste do seed**

Run: `npx supabase db reset && npm test -- tests/seed.test.ts`
Expected: PASS, 7 testes.

- [ ] **Step 5: Rodar a suíte inteira**

Os testes de cenário usam `cleanup()`, que dá `truncate companies cascade` e apaga o seed. Rodar o seed por último:

Run: `npx supabase db reset && npm test -- --exclude tests/seed.test.ts && npx supabase db reset && npm test -- tests/seed.test.ts`
Expected: PASS em ambas as passadas.

Registrar isso no `package.json`:

```json
"scripts": {
  "test": "vitest run --exclude tests/seed.test.ts",
  "test:seed": "supabase db reset && vitest run tests/seed.test.ts",
  "test:all": "npm run test && npm run test:seed"
}
```

- [ ] **Step 6: Commit**

```bash
git add supabase/seed.sql tests/seed.test.ts package.json
git commit -m "feat: seed de demonstracao com historico e periodo aberto"
```

---

## Verificação final

- [ ] `npm run test:all` passa inteiro
- [ ] `npx supabase db reset` aplica as 12 migrations sem erro
- [ ] Toda tabela de negócio tem RLS habilitada:

```bash
psql "$DB_URL" -c "
select tablename from pg_tables t
where schemaname = 'public'
  and not exists (
    select 1 from pg_class c
    where c.relname = t.tablename and c.relrowsecurity
  );"
```
Expected: zero linhas.

- [ ] Toda tabela com RLS tem ao menos uma policy:

```bash
psql "$DB_URL" -c "
select c.relname from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relrowsecurity
  and not exists (select 1 from pg_policies p where p.tablename = c.relname);"
```
Expected: zero linhas.

## O que este plano deliberadamente não entrega

Nenhuma tela. Nenhuma rota do Next.js. Nenhum componente. O app criado na Task 1 permanece com a página padrão do `create-next-app`. As telas vêm nos planos 2 e 3, e vão consumir exatamente as funções e políticas construídas aqui.
