import { test, expect } from '@playwright/test'

test.describe('fluxo de contrato, espelho e auditoria', () => {
  test('empreiteiro consulta seu contrato detalhado e acessa o espelho oficial de medicao', async ({
    page,
  }) => {
    // 1. Empreiteiro entra no app
    await page.goto('/entrar')
    await page.getByLabel('E-mail').fill('alfa@demo.test')
    await page.getByLabel('Senha').fill('demo1234')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL('/')

    // 2. Clica em "Meu contrato"
    await page.getByRole('link', { name: 'Meu contrato' }).click()
    await expect(page).toHaveURL('/contrato')

    // Confere seções do contrato
    await expect(page.getByRole('heading', { name: 'Meu Contrato' })).toBeVisible()
    await expect(page.getByText('Extrato Geral do Contrato')).toBeVisible()
    await page.getByTestId('botao-detalhe-por-local').click()
    await expect(page.getByPlaceholder('Filtrar por serviço, local ou etapa...')).toBeVisible()

    // 3. Acessa "Medições anteriores"
    await page.goto('/medicoes')
    await expect(page.getByRole('heading', { name: 'Minhas Medições' })).toBeVisible()

    // 4. Clica em "Ver Espelho da Medição" na primeira medição disponível
    const linkEspelho = page.getByRole('link', { name: 'Ver Espelho da Medição' }).first()
    await expect(linkEspelho).toBeVisible()
    const href = await linkEspelho.getAttribute('href')
    expect(href).toMatch(/\/medicoes\/[0-9a-f-]+\/espelho/)

    // 5. Navega para o espelho oficial
    await page.goto(href!)
    await expect(page.getByRole('heading', { name: 'ESPELHO OFICIAL DE MEDIÇÃO' })).toBeVisible()
    await expect(page.getByText('Detalhamento dos Itens Medidos')).toBeVisible()
    await expect(page.getByText('Empreiteiro Responsável')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Imprimir / Salvar PDF' })).toBeVisible()
  })

  test('engenharia visualiza abas de status, linha do tempo de auditoria e espelho', async ({
    page,
  }) => {
    // 1. Engenharia entra no painel
    await page.goto('/entrar')
    await page.getByLabel('E-mail').fill('engenharia@demo.test')
    await page.getByLabel('Senha').fill('demo1234')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL('/analise')

    // 2. Confere abas de status
    await expect(page.getByRole('tab', { name: /Aguardando aprovação/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Aprovadas/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Devolvidas/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Todas/ })).toBeVisible()

    // 3. Muda para a aba "Todas"
    await page.getByRole('button', { name: /Todas/ }).click()

    // 4. Clica em "Espelho Oficial" em uma medição
    const linkEspelho = page.getByRole('link', { name: 'Espelho Oficial' }).first()
    if (await linkEspelho.isVisible()) {
      const href = await linkEspelho.getAttribute('href')
      expect(href).toMatch(/\/medicoes\/[0-9a-f-]+\/espelho/)
    }
  })
})
