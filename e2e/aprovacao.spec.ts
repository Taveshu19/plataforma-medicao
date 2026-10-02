import { test, expect } from '@playwright/test'
import { resetAlfaCurrentMeasurement } from './helpers/db'

test.describe('ciclo completo empreiteiro x engenharia (ajuste, devolucao e aprovacao)', () => {
  test.beforeEach(async () => {
    await resetAlfaCurrentMeasurement()
  })

  test('fluxo: envio pelo empreiteiro -> ajuste e devolucao pela engenharia -> reenviada -> aprovada', async ({
    page,
  }) => {
    // 1. Empreiteiro Alfa faz login e envia medição
    await page.goto('/entrar')
    await page.getByLabel('E-mail').fill('alfa@demo.test')
    await page.getByLabel('Senha').fill('demo1234')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL('/')

    await page.getByRole('link', { name: 'Fazer minha medição' }).click()
    await expect(page).toHaveURL('/medicao')

    // Entra na Casa 01 e preenche Contrapiso
    await page.getByRole('link', { name: /Casa 01/ }).first().click()
    const contrapisoCard = page.getByTestId(/^linha-servico-/).filter({ hasText: 'Contrapiso' })
    await contrapisoCard.getByRole('spinbutton').fill('20')
    await page.getByRole('button', { name: 'Salvar e voltar aos locais' }).click()

    await expect(page).toHaveURL('/medicao')
    await page.getByRole('link', { name: /Revisar e Enviar/ }).click()
    await expect(page).toHaveURL('/medicao/revisao')

    await page.getByRole('button', { name: /Enviar medição para aprovação/ }).click()
    await page.getByRole('button', { name: 'Sim, confirmar e enviar' }).click()

    await expect(page.getByRole('heading', { name: 'Medição enviada com sucesso!' })).toBeVisible()
    const protocoloElem = page.getByTestId('protocolo-medicao')
    const protocolo = (await protocoloElem.textContent())?.trim() ?? ''
    expect(protocolo).toMatch(/^MED-\d{4}-\d{2}-\d{3}$/)

    await page.getByRole('link', { name: 'Voltar para o início' }).click()
    await page.getByRole('button', { name: 'Sair' }).click()
    await expect(page).toHaveURL(/\/entrar$/)

    // 2. Engenharia faz login e acessa o painel de análise
    await page.getByLabel('E-mail').fill('engenharia@demo.test')
    await page.getByLabel('Senha').fill('demo1234')
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page).toHaveURL('/analise')
    await expect(page.getByRole('heading', { name: 'Central de Controle' })).toBeVisible()
    await expect(page.getByText(protocolo)).toBeVisible()

    // 3. Entra nos detalhes da medição
    await page
      .getByTestId(`card-medicao-${protocolo}`)
      .getByRole('link', { name: 'Analisar medição' })
      .click()
    await expect(page).toHaveURL(/\/analise\/.+$/)
    await expect(page.getByRole('heading', { name: protocolo })).toBeVisible()

    // 4. Ajusta a quantidade aprovada de 20 para 15
    const inputAprovado = page.getByLabel('Quantidade Aprovada:').first()
    await inputAprovado.fill('15')
    await page.getByRole('button', { name: 'Salvar ajustes' }).click()
    await expect(page.getByText('Ajustes salvos com sucesso!')).toBeVisible()

    // 5. Devolve com motivo
    await page.getByRole('button', { name: 'Devolver com motivo' }).click()
    await page.getByPlaceholder(/Descreva as correções necessárias/).fill('Favor rever o contrapiso da Casa 01')
    await page.getByRole('button', { name: 'Confirmar Devolução' }).click()

    await expect(page).toHaveURL('/analise')
    await page.getByRole('button', { name: 'Sair' }).click()
    await expect(page).toHaveURL(/\/entrar$/)

    // 6. Empreiteiro Alfa faz login e confere histórico
    await page.getByLabel('E-mail').fill('alfa@demo.test')
    await page.getByLabel('Senha').fill('demo1234')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL('/')

    await page.getByRole('link', { name: 'Medições anteriores' }).click()
    await expect(page).toHaveURL('/medicoes')
    await expect(page.getByText(protocolo)).toBeVisible()
    await expect(page.getByText('Devolvida', { exact: true })).toBeVisible()
    await expect(page.getByText(/Favor rever o contrapiso da Casa 01/)).toBeVisible()

    // 7. Clica em corrigir e reenviar medição
    await page.getByRole('link', { name: 'Revisar e corrigir medição' }).click()
    await expect(page).toHaveURL('/medicao')
    await page.getByRole('link', { name: /Revisar e Enviar/ }).click()
    await page.getByRole('button', { name: /Enviar medição para aprovação/ }).click()
    await page.getByRole('button', { name: 'Sim, confirmar e enviar' }).click()
    await expect(page.getByRole('heading', { name: 'Medição enviada com sucesso!' })).toBeVisible()

    await page.getByRole('link', { name: 'Voltar para o início' }).click()
    await page.getByRole('button', { name: 'Sair' }).click()

    // 8. Engenharia entra novamente e aprova
    await page.getByLabel('E-mail').fill('engenharia@demo.test')
    await page.getByLabel('Senha').fill('demo1234')
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page).toHaveURL('/analise')
    await page
      .getByTestId(`card-medicao-${protocolo}`)
      .getByRole('link', { name: 'Analisar medição' })
      .click()
    await expect(page.getByRole('heading', { name: protocolo })).toBeVisible()

    await page.getByRole('button', { name: 'Aprovar medição' }).click()
    await expect(page).toHaveURL('/analise')
  })
})
