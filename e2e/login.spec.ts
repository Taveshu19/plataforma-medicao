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

    await expect(page.locator('p[role="alert"]')).toHaveText('E-mail ou senha incorretos.')
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
