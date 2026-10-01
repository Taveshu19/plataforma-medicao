import { test, expect, type Page } from '@playwright/test'

async function entrar(page: Page, email: string) {
  await page.goto('/entrar')
  await page.getByLabel('E-mail').fill(email)
  await page.getByLabel('Senha').fill('demo1234')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/entrar'))
}

async function sair(page: Page) {
  await page.context().clearCookies()
}

test('Faturamento Direto: empreiteiro -> engenharia (devolve/aprova) -> administrativo paga', async ({ page }) => {
  const numero = `FD-E2E-${Date.now()}`

  // 1. Empreiteiro envia
  await entrar(page, 'alfa@demo.test')
  await page.getByRole('link', { name: 'Faturamento Direto' }).click()
  await page.getByRole('link', { name: 'Novo faturamento direto' }).click()
  await page.getByLabel('Tipo do faturamento *').selectOption('MATERIAL')
  await page.getByLabel('Número da NF *').fill(numero)
  await page.getByLabel('Valor (R$) *').fill('1850.40')
  await page.getByLabel('Descrição / justificativa *').fill('Fornecimento de material hidráulico referente às Casas 01 a 10.')
  await page.getByLabel('PDF da Nota Fiscal').setInputFiles({
    name: 'nf.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 teste'),
  })
  await page.getByRole('button', { name: 'Enviar para a Engenharia' }).click()
  await expect(page.getByText('Enviado! A Nota Fiscal está aguardando a aprovação da Engenharia.')).toBeVisible()
  const urlDetalhe = page.url()
  const id = urlDetalhe.split('/faturamento-direto/')[1].split('?')[0]
  await sair(page)

  // 2. Engenharia devolve
  await entrar(page, 'engenharia@demo.test')
  await page.goto('/analise/faturamento-direto')
  await expect(page.getByText(numero)).toBeVisible()
  await page.goto(`/analise/faturamento-direto/${id}`)
  await page.getByRole('button', { name: 'Devolver para correção' }).click()
  await page.getByLabel('Justificativa da devolução *').fill('Informe as casas atendidas na NF.')
  await page.getByRole('button', { name: 'Confirmar devolução' }).click()
  await expect(page.getByText('Devolvida para correção pela Engenharia')).toBeVisible()
  await sair(page)

  // 3. Empreiteiro corrige e reenvia
  await entrar(page, 'alfa@demo.test')
  await page.goto(`/faturamento-direto/${id}`)
  await expect(page.getByText('Informe as casas atendidas na NF.').first()).toBeVisible()
  await page.getByLabel('Descrição / justificativa *').fill('Material hidráulico — Casas 01 a 10 (corrigido).')
  await page.getByRole('button', { name: 'Reenviar para a Engenharia' }).click()
  await expect(page.getByText('NF corrigida e reenviada pelo empreiteiro')).toBeVisible()
  await sair(page)

  // 4. Engenharia aprova
  await entrar(page, 'engenharia@demo.test')
  await page.goto(`/analise/faturamento-direto/${id}`)
  await page.getByRole('button', { name: 'Aprovar e enviar ao Administrativo' }).click()
  await expect(page.getByText('Encaminhada ao Administrativo/Faturamento')).toBeVisible()
  await sair(page)

  // 5. Administrativo vê com origem identificada e paga
  await entrar(page, 'gerencia@demo.test')
  await page.goto('/faturamento')
  const card = page.getByTestId(`card-fd-${numero}`)
  await expect(card.getByText('Origem: Faturamento Direto')).toBeVisible()
  await card.getByRole('button', { name: 'Registrar Pagamento' }).click()
  await expect(page.getByText(/Pagamento do FD-.* registrado/)).toBeVisible()
})
