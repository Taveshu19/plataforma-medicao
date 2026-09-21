# Área do Empreiteiro — Autenticação e Home — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O empreiteiro abre o sistema no celular, faz login, e vê seu contrato com valor contratado, já aprovado, em aprovação e saldo disponível — todos calculados do banco, nenhum valor digitado.

**Architecture:** Next.js 16 com App Router. A sessão vive em cookies e é renovada por `src/proxy.ts` (o Next 16 renomeou `middleware` para `proxy`). Componentes de servidor leem os dados direto do Postgres via `@supabase/ssr`, com o JWT do usuário — ou seja, a RLS construída no Plano 1 é o que protege cada consulta, e não há camada de autorização na aplicação. Os valores financeiros vêm de uma função SQL única, para que a tela do empreiteiro e a da construtora nunca divirjam.

**Tech Stack:** Next.js 16.3.5, React 19.2.8, `@supabase/ssr`, `@supabase/supabase-js` 2.116, Tailwind 4, Vitest (dados), Playwright (um E2E).

## Global Constraints

- **Next.js 16 tem breaking changes.** O arquivo de interceptação é `src/proxy.ts` exportando `proxy()`, **não** `middleware.ts` com `middleware()` — esta última convenção está deprecada. `cookies()` de `next/headers` é **assíncrono**: sempre `await cookies()`. Antes de escrever qualquer código de framework, consulte `node_modules/next/dist/docs/` — o guia oficial do Supabase na internet ainda ensina a convenção antiga e está errado para esta versão.
- **A autorização é da RLS, não da aplicação.** Nenhuma consulta deve filtrar por `contractor_id` ou `company_id` no código. Se uma consulta precisa desse filtro para estar correta, a policy está errada — conserte a policy.
- **Nunca use a `SERVICE_ROLE_KEY` no código da aplicação.** Ela ignora RLS. Só o seed e os testes a usam.
- **Nada derivável é armazenado.** Saldos e totais vêm de função SQL, nunca de coluna.
- **Quantidade e dinheiro são `numeric(14,4)` no banco.** No TypeScript eles chegam como `string` pelo driver — converta explicitamente e nunca faça aritmética de dinheiro em ponto flutuante na aplicação; a soma é responsabilidade do banco.
- **Mobile-first.** A área do empreiteiro é desenhada para a tela do celular: botões grandes, poucos campos por tela, fonte legível. A referência visual são os mockups descritos na seção 11 do spec.
- **Identificadores em inglês; todo texto de interface em português.**
- Migrations em `supabase/migrations/`, `NNN_descricao.sql`. **Nunca editar migration já commitada.** A próxima livre é a `013`.
- `.env.test`, `.env.local` e `.env*.local` **nunca** commitados — confirme `git ls-files | grep -i env` vazio antes de cada commit.
- Commits em português com prefixo convencional (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).

## Estado herdado do Plano 1

Já existe, testado com 104 testes:

- 12 migrations (`001` a `012`): tenancy, obras, contratos, medições, regra de saldo, máquina de estados, auditoria, reabertura, NF, buckets.
- RLS de **leitura** em todas as tabelas. **Não existem policies de escrita** — todo write hoje passa por `service_role`. Isso é limite de escopo deliberado; as policies de escrita entram no Plano 3, com as telas que precisam delas.
- `supabase/seed.sql` — uma construtora, obra "Residencial Vista Alta" com 20 casas, dois empreiteiros, 4 competências de histórico e o período corrente aberto.
- Helpers de teste: `tests/helpers/db.ts` (`sql<T>()`, `closePool()`), `tests/helpers/auth.ts` (`admin`, `createUser`, `createCompany`, `createScopedUser`, `cleanup()`), `tests/helpers/scenario.ts` (`buildScenario()`, `createMeasurement()`).
- Ambiente: Docker Desktop precisa de `C:\Program Files\Docker\Docker\resources\bin` no PATH. `npm test` roda a suíte; `npm run test:seed` reseta o banco e testa o seed.

---

### Task 1: Clientes Supabase e renovação de sessão

O `proxy.ts` é o que mantém o cookie de sessão válido entre requisições. Sem ele, o usuário é deslogado assim que o token expira.

**Files:**
- Create: `src/lib/supabase/server.ts`, `src/proxy.ts`
- Create: `.env.local` (não commitado), `.env.example` (commitado)
- Modify: `package.json` (dependência `@supabase/ssr`)
- Test: `tests/env.test.ts`

**Interfaces:**
- Produces:
  - `createServerSupabase(): Promise<SupabaseClient>` em `src/lib/supabase/server.ts` — para componentes de servidor. **É assíncrona** porque `cookies()` é assíncrono no Next 16.
  - Não há cliente de navegador nesta fase: a tela de login é componente de cliente mas submete por Server Action, então nada no Plano 2 fala com o Supabase a partir do navegador. Ele entra no Plano 3, quando a tela de preenchimento precisar.
  - `proxy(request: NextRequest): Promise<NextResponse>` em `src/proxy.ts`.

- [ ] **Step 1: Instalar a dependência**

```bash
npm install @supabase/ssr
```

- [ ] **Step 2: Gerar o `.env.local` a partir da stack local**

A stack local emite as chaves. Rode e copie os valores:

```bash
npx supabase status -o env
```

Escreva `.env.local` **à mão em UTF-8 sem BOM** (redirecionamento do PowerShell grava UTF-16 e quebra a leitura):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<o valor de ANON_KEY>
```

A CLI também emite `PUBLISHABLE_KEY` (formato `sb_publishable_...`). Use `ANON_KEY`; se a versão do `@supabase/ssr` instalada recusar o formato JWT antigo, use a publishable e **registre o desvio no relatório**.

Crie `.env.example` com as mesmas chaves e valores vazios, e commite só esse.

Acrescente ao `.gitignore` se ainda não estiver: `.env.local`.

- [ ] **Step 3: Escrever o teste de configuração**

`tests/env.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { config } from 'dotenv'
import { readFileSync } from 'node:fs'

config({ path: '.env.local' })

describe('configuracao da aplicacao', () => {
  it('tem a URL publica do Supabase apontando para a stack local', () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    expect(url).toBeTruthy()
    expect(new URL(url!).hostname).toMatch(/^(127\.0\.0\.1|localhost)$/)
  })

  it('tem a chave publica do Supabase', () => {
    expect(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY).toBeTruthy()
  })

  it('nao expoe a chave de service role para o navegador', () => {
    const publicas = Object.keys(process.env).filter((k) => k.startsWith('NEXT_PUBLIC_'))
    for (const chave of publicas) {
      expect(process.env[chave]).not.toContain('service_role')
    }
  })

  it('o .env.example esta commitado e nao contem segredo', () => {
    const exemplo = readFileSync('.env.example', 'utf8')
    expect(exemplo).toContain('NEXT_PUBLIC_SUPABASE_URL')
    expect(exemplo).toContain('NEXT_PUBLIC_SUPABASE_ANON_KEY')
    expect(exemplo).not.toMatch(/eyJ|sb_secret|service_role/)
  })
})
```

- [ ] **Step 4: Rodar para ver falhar**

Run: `npm test -- tests/env.test.ts`
Expected: FAIL — `.env.example` ainda não existe ou variáveis ausentes.

- [ ] **Step 5: Escrever o cliente de servidor**

`src/lib/supabase/server.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Cliente para componentes e acoes de servidor.
 * E assincrona porque `cookies()` e assincrono no Next 16.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Componente de servidor nao pode gravar cookie.
            // O proxy ja renovou a sessao nesta requisicao, entao ignorar e seguro.
          }
        },
      },
    },
  )
}
```

- [ ] **Step 6: Escrever o proxy de sessão**

`src/proxy.ts` — **não** `middleware.ts`:

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const ROTAS_PUBLICAS = ['/entrar', '/auth']

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // getUser revalida o token no servidor. Nao troque por getSession,
  // que confia no cookie sem verificar.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const caminho = request.nextUrl.pathname
  const ehPublica = ROTAS_PUBLICAS.some((r) => caminho.startsWith(r))

  if (!user && !ehPublica) {
    const url = request.nextUrl.clone()
    url.pathname = '/entrar'
    return NextResponse.redirect(url)
  }

  if (user && caminho === '/entrar') {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    // tudo, menos estaticos e imagens — senao o redirect bloqueia CSS e JS
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 7: Rodar os testes e verificar a compilação**

```bash
npm test -- tests/env.test.ts
npx tsc --noEmit
```
Expected: 4 testes passando, `tsc` limpo.

- [ ] **Step 8: Commit**

```bash
git add src/lib/supabase src/proxy.ts .env.example .gitignore package.json package-lock.json tests/env.test.ts
git commit -m "feat: clientes Supabase e renovacao de sessao via proxy"
```

---

### Task 2: Usuários de demonstração no seed

Sem usuários no Auth, ninguém consegue logar. O seed do Plano 1 criou empresa, obra e contratos, mas nenhum login.

**Files:**
- Modify: `supabase/seed.sql`
- Test: `tests/seed-usuarios.test.ts`

**Interfaces:**
- Consumes: as tabelas `companies`, `contractors`, `memberships` e o enum `app_role` do Plano 1; o seed existente.
- Produces: quatro usuários com senha `demo1234`, cada um com `profile` e `membership`:
  - `alfa@demo.test` — empreiteiro, vinculado à Empreiteira Alfa
  - `beta@demo.test` — empreiteiro, vinculado à Beta Instalações
  - `engenharia@demo.test` — engenharia, acesso à empresa toda
  - `gerencia@demo.test` — gerência, acesso à empresa toda

- [ ] **Step 1: Escrever o teste**

`tests/seed-usuarios.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config({ path: '.env.test' })

const URL = process.env.API_URL ?? 'http://127.0.0.1:54321'
const ANON = process.env.ANON_KEY!

/* Roda contra o banco recem-resetado, que ja aplicou o seed.
   Nao limpa nada: valida o estado que `supabase db reset` produz. */

beforeAll(async () => {
  const [row] = await sql<{ count: string }>('select count(*) from companies')
  if (Number(row.count) === 0) {
    throw new Error('Banco sem seed. Rode `npx supabase db reset` antes deste teste.')
  }
})

afterAll(async () => {
  await closePool()
})

describe('usuarios de demonstracao', () => {
  it('cria os quatro usuarios com profile', async () => {
    const rows = await sql<{ email: string }>(
      `select u.email from auth.users u
       join profiles p on p.id = u.id
       where u.email like '%@demo.test' order by u.email`,
    )
    expect(rows.map((r) => r.email)).toEqual([
      'alfa@demo.test',
      'beta@demo.test',
      'engenharia@demo.test',
      'gerencia@demo.test',
    ])
  })

  it('vincula cada empreiteiro ao proprio contractor', async () => {
    const rows = await sql<{ email: string; contractor: string }>(
      `select u.email, c.name as contractor
       from auth.users u
       join memberships m on m.user_id = u.id
       join contractors c on c.id = m.contractor_id
       where u.email like '%@demo.test' order by u.email`,
    )
    expect(rows).toHaveLength(2)
    expect(rows[0].email).toBe('alfa@demo.test')
    expect(rows[0].contractor).toContain('Alfa')
    expect(rows[1].email).toBe('beta@demo.test')
    expect(rows[1].contractor).toContain('Beta')
  })

  it('engenharia e gerencia tem acesso a empresa toda, sem contractor', async () => {
    const rows = await sql<{ email: string; role: string; contractor_id: string | null }>(
      `select u.email, m.role::text as role, m.contractor_id
       from auth.users u
       join memberships m on m.user_id = u.id
       where u.email in ('engenharia@demo.test', 'gerencia@demo.test')
       order by u.email`,
    )
    expect(rows.map((r) => r.role)).toEqual(['engenharia', 'gerencia'])
    expect(rows.every((r) => r.contractor_id === null)).toBe(true)
  })

  it('os usuarios conseguem autenticar de verdade com a senha do seed', async () => {
    const client = createClient(URL, ANON, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await client.auth.signInWithPassword({
      email: 'alfa@demo.test',
      password: 'demo1234',
    })
    expect(error).toBeNull()
    expect(data.user?.email).toBe('alfa@demo.test')
  })

  it('o empreiteiro Alfa enxerga apenas o proprio contrato', async () => {
    const client = createClient(URL, ANON, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    await client.auth.signInWithPassword({ email: 'alfa@demo.test', password: 'demo1234' })
    const { data } = await client.from('contracts').select('number')
    expect(data).toHaveLength(1)
    expect(data![0].number).toBe('023/2026')
  })
})
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npx supabase db reset && npx vitest run tests/seed-usuarios.test.ts`
Expected: FAIL — nenhum usuário `@demo.test` existe.

- [ ] **Step 3: Acrescentar os usuários ao seed**

No fim do bloco `do $$ ... $$` de `supabase/seed.sql`, **antes** do `raise notice` final, insira o trecho abaixo. Ele grava direto em `auth.users` porque o seed roda como superusuário; a senha é criptografada com `crypt()` do pgcrypto, que a migration 001 já habilitou.

```sql
  -- Usuarios de demonstracao. Senha de todos: demo1234
  for v_servico in
    select * from (values
      ('alfa@demo.test',       'Jose da Silva',    'empreiteiro'::app_role, v_alfa),
      ('beta@demo.test',       'Marcos Beta',      'empreiteiro'::app_role, v_beta),
      ('engenharia@demo.test', 'Carlos Almeida',   'engenharia'::app_role,  null::uuid),
      ('gerencia@demo.test',   'Patricia Moraes',  'gerencia'::app_role,    null::uuid)
    ) as t(email, nome, papel, contratado)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    )
    values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
      'authenticated', v_servico.email, crypt('demo1234', gen_salt('bf')),
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb
    )
    returning id into v_meas;

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, created_at, updated_at
    )
    values (
      gen_random_uuid(), v_meas, v_meas::text,
      format('{"sub":"%s","email":"%s","email_verified":true}', v_meas, v_servico.email)::jsonb,
      'email', now(), now()
    );

    insert into profiles (id, full_name) values (v_meas, v_servico.nome);

    insert into memberships (user_id, company_id, role, contractor_id)
    values (v_meas, v_company, v_servico.papel, v_servico.contratado);
  end loop;
```

Se a variável `v_meas` já estiver em uso no ponto onde você inserir, declare uma nova (`v_user uuid`) em vez de reaproveitá-la — o importante é não sobrescrever um valor ainda necessário.

- [ ] **Step 4: Aplicar e rodar os testes**

Run: `npx supabase db reset && npx vitest run tests/seed-usuarios.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 5: Confirmar que o seed inteiro continua válido**

Run: `npx vitest run tests/seed.test.ts`
Expected: PASS, 7 testes (os do Plano 1, sem regressão).

- [ ] **Step 6: Registrar o novo arquivo no script de seed**

Em `package.json`, o script `test:seed` roda só `tests/seed.test.ts`. Amplie para os dois, e exclua o novo da suíte principal (que dá `truncate` e apagaria o seed):

```json
"test": "vitest run --exclude tests/seed.test.ts --exclude tests/seed-usuarios.test.ts",
"test:seed": "supabase db reset && vitest run tests/seed.test.ts tests/seed-usuarios.test.ts",
"test:all": "npm run test && npm run test:seed"
```

- [ ] **Step 7: Commit**

```bash
git add supabase/seed.sql tests/seed-usuarios.test.ts package.json
git commit -m "feat: usuarios de demonstracao no seed"
```

---

### Task 3: Resumo financeiro do contrato

Os quatro números da home. Eles precisam fechar: contratado = aprovado + em aprovação + saldo. É a mesma aritmética do mockup (R$ 850.000 = 410.000 + 30.000 + 410.000).

**Files:**
- Create: `supabase/migrations/013_resumo_contrato.sql`
- Test: `tests/resumo.test.ts`

**Interfaces:**
- Consumes: `contract_items`, `measurements`, `measurement_items` do Plano 1.
- Produces: `contract_summary(p_contract_id uuid)` retornando uma linha com `contracted`, `approved`, `in_review`, `available`, todos `numeric(14,4)`.

- [ ] **Step 1: Escrever o teste**

`tests/resumo.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { sql, closePool } from './helpers/db'
import { cleanup } from './helpers/auth'
import { buildScenario, createMeasurement, type Scenario } from './helpers/scenario'

let s: Scenario

interface Resumo {
  contracted: string
  approved: string
  in_review: string
  available: string
}

async function resumo(): Promise<Resumo> {
  const [row] = await sql<Resumo>('select * from contract_summary($1)', [s.contractId])
  return row
}

beforeEach(async () => {
  await cleanup()
  s = await buildScenario()
})

afterAll(async () => {
  await cleanup()
  await closePool()
})

describe('resumo financeiro do contrato', () => {
  it('sem medicao, o contratado e o total dos itens e o saldo e igual a ele', async () => {
    // Contrapiso 86 x 112 = 9.632 ; Alvenaria 200 x 90 = 18.000
    const r = await resumo()
    expect(Number(r.contracted)).toBe(27632)
    expect(Number(r.approved)).toBe(0)
    expect(Number(r.in_review)).toBe(0)
    expect(Number(r.available)).toBe(27632)
  })

  it('medicao em analise entra em "em aprovacao", nao em "aprovado"', async () => {
    await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    const r = await resumo()
    expect(Number(r.approved)).toBe(0)
    expect(Number(r.in_review)).toBe(2240) // 20 x 112
    expect(Number(r.available)).toBe(27632 - 2240)
  })

  it('medicao em analise ja ajustada usa o valor aprovado pelo engenheiro', async () => {
    await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 18 },
    ])
    const r = await resumo()
    expect(Number(r.in_review)).toBe(2016) // 18 x 112
  })

  it('medicao aprovada entra em "aprovado"', async () => {
    await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 20, approved: 18 },
    ])
    const r = await resumo()
    expect(Number(r.approved)).toBe(2016)
    expect(Number(r.in_review)).toBe(0)
  })

  it('rascunho nao entra em lugar nenhum', async () => {
    await createMeasurement(s, 'RASCUNHO', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    const r = await resumo()
    expect(Number(r.approved)).toBe(0)
    expect(Number(r.in_review)).toBe(0)
    expect(Number(r.available)).toBe(27632)
  })

  it('medicao devolvida nao entra e devolve o saldo', async () => {
    const id = await createMeasurement(s, 'EM_ANALISE', [
      { contractItemId: s.contrapisoId, requested: 20 },
    ])
    expect(Number((await resumo()).in_review)).toBe(2240)
    await sql(`update measurements set status = 'DEVOLVIDA' where id = $1`, [id])
    const r = await resumo()
    expect(Number(r.in_review)).toBe(0)
    expect(Number(r.available)).toBe(27632)
  })

  it('medicao paga continua contando como aprovada', async () => {
    await createMeasurement(s, 'PAGA', [
      { contractItemId: s.contrapisoId, requested: 40, approved: 40 },
    ])
    const r = await resumo()
    expect(Number(r.approved)).toBe(4480) // 40 x 112
  })

  it('os quatro numeros sempre fecham: contratado = aprovado + em aprovacao + saldo', async () => {
    await createMeasurement(s, 'APROVADA', [
      { contractItemId: s.contrapisoId, requested: 30, approved: 30 },
    ])
    await sql(
      `insert into measurement_periods (company_id, project_id, competence, opens_at, closes_at)
       values ($1, $2, '2026-10-01', now() - interval '1 day', now() + interval '9 days')`,
      [s.companyId, s.projectId],
    )
    const [p] = await sql<{ id: string }>(
      `select id from measurement_periods where competence = '2026-10-01' and project_id = $1`,
      [s.projectId],
    )
    const [m] = await sql<{ id: string }>(
      `insert into measurements (company_id, period_id, contract_id, status)
       values ($1, $2, $3, 'EM_ANALISE') returning id`,
      [s.companyId, p.id, s.contractId],
    )
    await sql(
      `insert into measurement_items
         (company_id, measurement_id, contract_item_id, qty_requested)
       values ($1, $2, $3, 25)`,
      [s.companyId, m.id, s.alvenariaId],
    )

    const r = await resumo()
    const soma = Number(r.approved) + Number(r.in_review) + Number(r.available)
    expect(soma).toBeCloseTo(Number(r.contracted), 4)
  })

  it('contrato inexistente devolve zeros, nao nulo', async () => {
    const [row] = await sql<Resumo>(
      'select * from contract_summary($1)',
      ['00000000-0000-0000-0000-000000000000'],
    )
    expect(Number(row.contracted)).toBe(0)
    expect(Number(row.available)).toBe(0)
  })
})
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- tests/resumo.test.ts`
Expected: FAIL com `function contract_summary(uuid) does not exist`.

- [ ] **Step 3: Escrever a migration**

`supabase/migrations/013_resumo_contrato.sql`:

```sql
/* Os quatro numeros da home do empreiteiro.
   Espelha a regra de saldo da migration 006, mas em valor em vez de quantidade:
   consomem APROVADA/NF_ENVIADA/NF_APROVADA/PAGA (como aprovado) e EM_ANALISE
   (como em aprovacao). RASCUNHO, DEVOLVIDA e CANCELADA nao entram.
   Em medicao viva vale o aprovado quando existir; senao, o solicitado. */
create or replace function contract_summary(p_contract_id uuid)
returns table (
  contracted numeric,
  approved   numeric,
  in_review  numeric,
  available  numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with itens as (
    select id, quantity * unit_price as valor
    from contract_items
    where contract_id = p_contract_id
  ),
  consumo as (
    select
      coalesce(sum(
        case when m.status in ('APROVADA','NF_ENVIADA','NF_APROVADA','PAGA')
             then coalesce(mi.qty_approved, mi.qty_requested) * ci.unit_price
             else 0 end
      ), 0) as aprovado,
      coalesce(sum(
        case when m.status = 'EM_ANALISE'
             then coalesce(mi.qty_approved, mi.qty_requested) * ci.unit_price
             else 0 end
      ), 0) as em_analise
    from measurement_items mi
    join measurements m  on m.id = mi.measurement_id
    join contract_items ci on ci.id = mi.contract_item_id
    where ci.contract_id = p_contract_id
  )
  select
    coalesce((select sum(valor) from itens), 0)                                  as contracted,
    consumo.aprovado                                                              as approved,
    consumo.em_analise                                                            as in_review,
    coalesce((select sum(valor) from itens), 0) - consumo.aprovado - consumo.em_analise
                                                                                  as available
  from consumo
$$;
```

`security definer` aqui é deliberado e alinhado com `can_read_contract()` da migration 003: a função precisa enxergar todas as medições que consomem o contrato para o total fechar, mesmo quando o chamador não enxerga alguma delas. Quem controla **qual contrato** pode ser consultado é a RLS de `contracts`, exercida na Task 5.

- [ ] **Step 4: Aplicar e rodar os testes**

Run: `npx supabase db reset && npm test -- tests/resumo.test.ts`
Expected: PASS, 9 testes.

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS, sem regressão nos 97 anteriores.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/013_resumo_contrato.sql tests/resumo.test.ts
git commit -m "feat: resumo financeiro do contrato"
```

---

### Task 4: Tela de login

**Files:**
- Create: `src/app/entrar/page.tsx`, `src/app/entrar/acoes.ts`
- Modify: `src/app/layout.tsx`, `src/app/globals.css`
- Test: manual nesta task; o E2E vem na Task 6.

**Interfaces:**
- Consumes: `createServerSupabase()` da Task 1; os usuários da Task 2.
- Produces: rota `/entrar`; Server Action `entrar(_estadoAnterior, formData)` em `src/app/entrar/acoes.ts`, que devolve `{ erro: string } | never` (redireciona em caso de sucesso).

- [ ] **Step 1: Ajustar o layout raiz para mobile**

`src/app/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Medição',
  description: 'Medição de empreiteiros',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh bg-slate-50 text-slate-900 antialiased">{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: Escrever a Server Action de login**

`src/app/entrar/acoes.ts`:

```typescript
'use server'

import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'

export interface EstadoLogin {
  erro?: string
}

export async function entrar(
  _estadoAnterior: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const email = String(formData.get('email') ?? '').trim()
  const senha = String(formData.get('senha') ?? '')

  if (!email || !senha) {
    return { erro: 'Informe o e-mail e a senha.' }
  }

  const supabase = await createServerSupabase()
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha })

  if (error) {
    // Nao diferencie "e-mail nao existe" de "senha errada":
    // isso permitiria descobrir quais e-mails estao cadastrados.
    return { erro: 'E-mail ou senha incorretos.' }
  }

  redirect('/')
}
```

- [ ] **Step 3: Escrever a tela**

`src/app/entrar/page.tsx`:

```tsx
'use client'

import { useActionState } from 'react'
import { entrar, type EstadoLogin } from './acoes'

const ESTADO_INICIAL: EstadoLogin = {}

export default function Entrar() {
  const [estado, acao, pendente] = useActionState(entrar, ESTADO_INICIAL)

  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-3xl font-bold tracking-tight">Medição</h1>
        <p className="mt-2 text-slate-600">Entre para ver seu contrato e enviar sua medição.</p>

        <form action={acao} className="mt-10 space-y-5">
          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-slate-900"
            />
          </div>

          <div>
            <label htmlFor="senha" className="block text-sm font-medium">
              Senha
            </label>
            <input
              id="senha"
              name="senha"
              type="password"
              autoComplete="current-password"
              required
              className="mt-2 block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base outline-none focus:border-slate-900"
            />
          </div>

          {estado.erro && (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {estado.erro}
            </p>
          )}

          <button
            type="submit"
            disabled={pendente}
            className="w-full rounded-xl bg-slate-900 px-4 py-4 text-base font-semibold text-white disabled:opacity-60"
          >
            {pendente ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </main>
  )
}
```

Os campos usam `text-base` (16px) de propósito: fonte menor faz o Safari do iPhone dar zoom automático ao focar o campo, o que atrapalha em obra.

- [ ] **Step 4: Verificar manualmente**

```bash
npm run dev
```

Abra `http://localhost:3000` — deve redirecionar para `/entrar`. Entre com `alfa@demo.test` / `demo1234`. Deve redirecionar para `/`. Tente uma senha errada e confirme a mensagem genérica.

Rode também `npx tsc --noEmit` e confirme limpo.

- [ ] **Step 5: Commit**

```bash
git add src/app/entrar src/app/layout.tsx
git commit -m "feat: tela de login do empreiteiro"
```

---

### Task 5: Home do empreiteiro

**Files:**
- Create: `src/app/formato.ts`, `src/app/page.tsx`, `src/app/contexto.ts`, `src/app/sair/route.ts`
- Create: `src/components/Dinheiro.tsx`
- Test: `tests/contexto.test.ts`

**Interfaces:**
- Consumes: `createServerSupabase()` (Task 1), `contract_summary()` (Task 3), usuários do seed (Task 2).
- Produces:
  - `carregarContexto(): Promise<ContextoEmpreiteiro | null>` em `src/app/contexto.ts`, onde
    `ContextoEmpreiteiro = { nome: string; obra: string; contratoId: string; contratoNumero: string; descricao: string | null; resumo: Resumo; periodo: Periodo | null }`,
    `Resumo = { contratado: number; aprovado: number; emAprovacao: number; disponivel: number }`,
    `Periodo = { competencia: string; fechaEm: string }`.
  - `formatarReais(valor: number): string` e `competenciaPorExtenso(competencia: string): string` em **`src/app/formato.ts`**.

**Por que `formato.ts` existe separado:** `contexto.ts` importa `next/headers` (via o cliente de servidor). Um teste do Vitest rodando em ambiente node que importasse `contexto.ts` explodiria no carregamento do módulo. As funções puras ficam num arquivo sem nenhuma dependência de framework, e é dele que o teste importa.

- [ ] **Step 1: Escrever o teste do formatador e da regra de contexto**

`tests/contexto.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { formatarReais, competenciaPorExtenso } from '../src/app/formato'

describe('formatacao de dinheiro', () => {
  it('formata em reais com duas casas', () => {
    expect(formatarReais(850000)).toBe('R$ 850.000,00')
  })

  it('formata zero', () => {
    expect(formatarReais(0)).toBe('R$ 0,00')
  })

  it('formata centavos', () => {
    expect(formatarReais(2240.5)).toBe('R$ 2.240,50')
  })
})

describe('competencia por extenso', () => {
  it('traduz a data da competencia para mes e ano', () => {
    expect(competenciaPorExtenso('2026-09-01')).toBe('Setembro/2026')
  })

  it('funciona em dezembro', () => {
    expect(competenciaPorExtenso('2026-12-01')).toBe('Dezembro/2026')
  })
})
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `npm test -- tests/contexto.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Escrever as funções de formatação**

`src/app/formato.ts` — sem nenhum import de framework, para ser testável em node puro:

```typescript
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

export function competenciaPorExtenso(competencia: string): string {
  const [ano, mes] = competencia.split('-')
  return `${MESES[Number(mes) - 1]}/${ano}`
}

export function formatarReais(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor)
}
```

O `Intl.NumberFormat` em pt-BR usa espaço não separável entre `R$` e o número. Se a asserção do teste falhar por isso, compare com ` ` em vez de espaço comum — não troque a formatação, que é a correta para o Brasil.

- [ ] **Step 4: Escrever o módulo de contexto**

`src/app/contexto.ts`:

```typescript
import { createServerSupabase } from '@/lib/supabase/server'

export { formatarReais, competenciaPorExtenso } from './formato'

export interface Resumo {
  contratado: number
  aprovado: number
  emAprovacao: number
  disponivel: number
}

export interface Periodo {
  competencia: string
  fechaEm: string
}

export interface ContextoEmpreiteiro {
  nome: string
  obra: string
  contratoId: string
  contratoNumero: string
  descricao: string | null
  resumo: Resumo
  periodo: Periodo | null
}

/**
 * Carrega tudo que a home precisa.
 * Nao filtra por empreiteiro: a RLS do Plano 1 ja garante que este usuario
 * so enxerga o proprio contrato. Se aparecer mais de um, o usuario tem
 * mais de um contrato e mostramos o primeiro — o seletor vem depois.
 */
export async function carregarContexto(): Promise<ContextoEmpreiteiro | null> {
  const supabase = await createServerSupabase()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: perfil } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const { data: contratos } = await supabase
    .from('contracts')
    .select('id, number, description, project_id, projects(name)')
    .order('number')
    .limit(1)

  const contrato = contratos?.[0]
  if (!contrato) return null

  const { data: resumoLinhas } = await supabase.rpc('contract_summary', {
    p_contract_id: contrato.id,
  })
  const linha = Array.isArray(resumoLinhas) ? resumoLinhas[0] : resumoLinhas

  const { data: periodos } = await supabase
    .from('measurement_periods')
    .select('competence, closes_at')
    .eq('project_id', contrato.project_id)
    .lte('opens_at', new Date().toISOString())
    .gte('closes_at', new Date().toISOString())
    .order('competence', { ascending: false })
    .limit(1)

  const periodo = periodos?.[0]
  const obra = (contrato as { projects?: { name?: string } }).projects?.name ?? 'Obra'

  return {
    nome: perfil?.full_name ?? user.email ?? 'Empreiteiro',
    obra,
    contratoId: contrato.id,
    contratoNumero: contrato.number,
    descricao: contrato.description,
    resumo: {
      contratado: Number(linha?.contracted ?? 0),
      aprovado: Number(linha?.approved ?? 0),
      emAprovacao: Number(linha?.in_review ?? 0),
      disponivel: Number(linha?.available ?? 0),
    },
    periodo: periodo
      ? { competencia: periodo.competence, fechaEm: periodo.closes_at }
      : null,
  }
}
```

- [ ] **Step 5: Rodar os testes**

Run: `npm test -- tests/contexto.test.ts`
Expected: PASS, 5 testes.

- [ ] **Step 6: Escrever o componente de valor**

`src/components/Dinheiro.tsx`:

```tsx
import { formatarReais } from '@/app/formato'

export function Dinheiro({
  rotulo,
  valor,
  destaque = false,
  cor = 'neutro',
}: {
  rotulo: string
  valor: number
  destaque?: boolean
  cor?: 'neutro' | 'positivo' | 'atencao'
}) {
  const cores = {
    neutro: 'text-slate-900',
    positivo: 'text-emerald-700',
    atencao: 'text-amber-700',
  } as const

  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <span className="text-sm text-slate-600">{rotulo}</span>
      <span
        className={`tabular-nums ${cores[cor]} ${
          destaque ? 'text-2xl font-bold' : 'text-lg font-semibold'
        }`}
      >
        {formatarReais(valor)}
      </span>
    </div>
  )
}
```

`tabular-nums` alinha os dígitos em coluna — sem isso, valores empilhados ficam desalinhados e a tela parece desleixada.

- [ ] **Step 7: Escrever a rota de saída**

`src/app/sair/route.ts`:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabase()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/entrar', request.url), { status: 303 })
}
```

- [ ] **Step 8: Escrever a home**

`src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { carregarContexto } from './contexto'
import { competenciaPorExtenso } from './formato'
import { Dinheiro } from '@/components/Dinheiro'

export default async function Home() {
  const contexto = await carregarContexto()
  if (!contexto) redirect('/entrar')

  const { nome, obra, contratoNumero, descricao, resumo, periodo } = contexto

  return (
    <main className="mx-auto w-full max-w-md px-5 pb-16 pt-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-600">Olá,</p>
          <h1 className="text-2xl font-bold tracking-tight">{nome}</h1>
        </div>
        <form action="/sair" method="post">
          <button type="submit" className="text-sm text-slate-500 underline underline-offset-4">
            Sair
          </button>
        </form>
      </header>

      <section className="mt-8 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Obra</p>
        <p className="mt-1 text-lg font-semibold">{obra}</p>
        <p className="mt-3 text-sm text-slate-600">
          Contrato {contratoNumero}
          {descricao ? ` — ${descricao}` : ''}
        </p>

        <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          <Dinheiro rotulo="Valor contratado" valor={resumo.contratado} />
          <Dinheiro rotulo="Já aprovado" valor={resumo.aprovado} cor="positivo" />
          <Dinheiro rotulo="Em aprovação" valor={resumo.emAprovacao} cor="atencao" />
          <Dinheiro rotulo="Saldo a medir" valor={resumo.disponivel} destaque />
        </div>
      </section>

      {periodo ? (
        <section className="mt-5 rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-200">
          <p className="text-sm font-semibold text-emerald-900">
            Medição de {competenciaPorExtenso(periodo.competencia)} aberta
          </p>
          <p className="mt-1 text-sm text-emerald-800">
            Você pode enviar até{' '}
            {new Date(periodo.fechaEm).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })}
            .
          </p>
        </section>
      ) : (
        <section className="mt-5 rounded-2xl bg-slate-100 p-5 ring-1 ring-slate-200">
          <p className="text-sm font-medium text-slate-700">
            Não há período de medição aberto no momento.
          </p>
        </section>
      )}

      <nav className="mt-8 space-y-3">
        <button
          type="button"
          disabled
          className="w-full rounded-xl bg-slate-900 px-4 py-5 text-base font-semibold text-white disabled:opacity-40"
        >
          Fazer minha medição
        </button>
        <button
          type="button"
          disabled
          className="w-full rounded-xl bg-white px-4 py-5 text-base font-semibold text-slate-900 ring-1 ring-slate-300 disabled:opacity-40"
        >
          Medições anteriores
        </button>
        <button
          type="button"
          disabled
          className="w-full rounded-xl bg-white px-4 py-5 text-base font-semibold text-slate-900 ring-1 ring-slate-300 disabled:opacity-40"
        >
          Meu contrato
        </button>
      </nav>

      <p className="mt-6 text-center text-xs text-slate-500">
        As três ações acima entram nos próximos planos.
      </p>
    </main>
  )
}
```

Os três botões ficam desabilitados de propósito: eles mostram o destino do produto sem fingir que já funciona. Botão que não faz nada ao ser tocado é pior que botão visivelmente desabilitado.

- [ ] **Step 9: Verificar manualmente**

```bash
npx supabase db reset   # garante o seed com usuarios
npm run dev
```

Entre como `alfa@demo.test` / `demo1234`. Confirme que os quatro valores aparecem, que somam corretamente (aprovado + em aprovação + saldo = contratado), e que o período de medição aparece como aberto.

Entre como `beta@demo.test` e confirme que os números são **outros** — é a prova de que a RLS está filtrando por empreiteiro e não estamos mostrando dados do vizinho.

Rode `npx tsc --noEmit` e confirme limpo.

- [ ] **Step 10: Commit**

```bash
git add src/app/page.tsx src/app/contexto.ts src/app/formato.ts src/app/sair src/components tests/contexto.test.ts
git commit -m "feat: home do empreiteiro com resumo do contrato"
```

---

### Task 6: E2E do fluxo login → home

Os testes anteriores provam o banco e as funções puras. Nenhum prova que a aplicação inteira se conecta. Este prova.

**Files:**
- Create: `playwright.config.ts`, `e2e/login.spec.ts`
- Modify: `package.json`, `.gitignore`

**Interfaces:**
- Consumes: tudo das tarefas 1 a 5.
- Produces: script `npm run e2e`.

- [ ] **Step 1: Instalar o Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

Acrescente ao `.gitignore`:

```
/test-results
/playwright-report
/blob-report
```

- [ ] **Step 2: Configurar**

`playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'celular', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000/entrar',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
```

O projeto usa o perfil de um celular real, não um desktop estreito — é para o celular que esta área foi desenhada.

- [ ] **Step 3: Escrever o teste**

`e2e/login.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test.describe('acesso do empreiteiro', () => {
  test('quem nao esta logado e mandado para a tela de entrada', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/entrar$/)
    await expect(page.getByRole('heading', { name: 'Medição' })).toBeVisible()
  })

  test('senha errada mostra mensagem generica e nao entra', async ({ page }) => {
    await page.goto('/entrar')
    await page.getByLabel('E-mail').fill('alfa@demo.test')
    await page.getByLabel('Senha').fill('senha-errada')
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page.getByRole('alert')).toHaveText('E-mail ou senha incorretos.')
    await expect(page).toHaveURL(/\/entrar$/)
  })

  test('o empreiteiro entra e ve o proprio contrato com os quatro valores', async ({ page }) => {
    await page.goto('/entrar')
    await page.getByLabel('E-mail').fill('alfa@demo.test')
    await page.getByLabel('Senha').fill('demo1234')
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: 'Jose da Silva' })).toBeVisible()
    await expect(page.getByText('Residencial Vista Alta')).toBeVisible()
    await expect(page.getByText('Valor contratado')).toBeVisible()
    await expect(page.getByText('Já aprovado')).toBeVisible()
    await expect(page.getByText('Em aprovação')).toBeVisible()
    await expect(page.getByText('Saldo a medir')).toBeVisible()
  })

  test('empreiteiros diferentes veem contratos diferentes', async ({ page }) => {
    await page.goto('/entrar')
    await page.getByLabel('E-mail').fill('alfa@demo.test')
    await page.getByLabel('Senha').fill('demo1234')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL('/')
    const contratoAlfa = await page.getByText(/^Contrato /).textContent()

    await page.getByRole('button', { name: 'Sair' }).click()
    await expect(page).toHaveURL(/\/entrar$/)

    await page.getByLabel('E-mail').fill('beta@demo.test')
    await page.getByLabel('Senha').fill('demo1234')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL('/')
    const contratoBeta = await page.getByText(/^Contrato /).textContent()

    expect(contratoAlfa).not.toBe(contratoBeta)
  })

  test('sair encerra a sessao de verdade', async ({ page }) => {
    await page.goto('/entrar')
    await page.getByLabel('E-mail').fill('alfa@demo.test')
    await page.getByLabel('Senha').fill('demo1234')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL('/')

    await page.getByRole('button', { name: 'Sair' }).click()
    await expect(page).toHaveURL(/\/entrar$/)

    // voltar pela URL nao pode restaurar a sessao
    await page.goto('/')
    await expect(page).toHaveURL(/\/entrar$/)
  })
})
```

- [ ] **Step 4: Registrar o script**

Em `package.json`:

```json
"e2e": "playwright test"
```

- [ ] **Step 5: Rodar**

```bash
npx supabase db reset
npm run e2e
```
Expected: PASS, 5 testes.

Se o `webServer` não subir, confirme que `.env.local` existe e está em UTF-8 — o Next lê essas variáveis no boot e falha silenciosamente com UTF-16.

- [ ] **Step 6: Rodar tudo**

```bash
npm run test:all
npm run e2e
```
Expected: toda a suíte de dados e o E2E passando.

- [ ] **Step 7: Commit**

```bash
git add playwright.config.ts e2e package.json package-lock.json .gitignore
git commit -m "test: e2e do fluxo de login e home"
```

---

## Verificação final

- [ ] `npm run test:all` passa (dados + seed)
- [ ] `npm run e2e` passa (5 testes no perfil de celular)
- [ ] `npx tsc --noEmit` limpo
- [ ] `git ls-files | grep -i env` devolve só `.env.example`
- [ ] Nenhuma ocorrência de `SERVICE_ROLE` em `src/`:

```bash
grep -rn "SERVICE_ROLE\|service_role" src/ || echo "limpo"
```
Expected: `limpo`.

- [ ] Nenhuma consulta em `src/` filtra por `contractor_id` ou `company_id` — a RLS faz isso:

```bash
grep -rn "contractor_id\|company_id" src/ || echo "limpo"
```
Expected: `limpo`.

## O que este plano deliberadamente não entrega

Os três botões da home ficam desabilitados. Não há navegação de etapa/local, tela de preenchimento, histórico nem NF — isso é o Plano 3 e o Plano 4. Também não há policies de escrita: a home é somente leitura, e criá-las agora sem tela que as exercite seria código não testado.
