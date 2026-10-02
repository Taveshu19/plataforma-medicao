import { test, expect } from '@playwright/test'
import { resetAlfaCurrentMeasurement } from './helpers/db'

test.describe('ciclo fiscal e financeiro (emissao de NF, aprovacao e pagamento)', () => {
  test.beforeEach(async () => {
    await resetAlfaCurrentMeasurement()
  })

  test('fluxo: medicao aprovada -> empreiteiro anexa NF -> construtora aprova NF -> construtora liquida pagamento -> extrato atualizado', async ({
    page,
  }) => {
    test.setTimeout(60_000)
    // 1. Empreiteiro Alfa submete medição
    await page.goto('/entrar')
    await page.getByLabel('E-mail').fill('alfa@demo.test')
    await page.getByLabel('Senha').fill('demo1234')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL('/')

    await page.getByRole('link', { name: 'Fazer minha medição' }).click()
    await expect(page).toHaveURL('/medicao')

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

    // 2. Engenharia aprova no nível 1
    await page.getByLabel('E-mail').fill('engenharia@demo.test')
    await page.getByLabel('Senha').fill('demo1234')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL('/analise')

    await page.getByTestId(`card-medicao-${protocolo}`).getByRole('link', { name: 'Analisar medição' }).click()
    await page.getByRole('button', { name: 'Aprovar medição' }).click()
    await expect(page).toHaveURL('/analise')
    await page.getByRole('button', { name: 'Sair' }).click()

    // 3. Gerência aprova nos níveis restantes até status APROVADA
    await page.getByLabel('E-mail').fill('gerencia@demo.test')
    await page.getByLabel('Senha').fill('demo1234')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL('/analise')

    // O seed tem três níveis. Aguardar o cartão evita pular aprovações
    // enquanto o estado de carregamento ainda está sendo exibido.
    for (const nivel of [2, 3]) {
      const card = page.getByTestId(`card-medicao-${protocolo}`)
      await expect(card).toBeVisible()
      await expect(card.getByText(`Nível ${nivel} • Aguardando aprovação`)).toBeVisible()
      await card.getByRole('link', { name: 'Analisar medição' }).click()
      await page.getByRole('button', { name: 'Aprovar medição' }).click()
      await expect(page).toHaveURL('/analise')
    }

    await page.getByRole('button', { name: 'Sair' }).click()

    // 4. Empreiteiro Alfa acessa histórico e emite a Nota Fiscal
    await page.getByLabel('E-mail').fill('alfa@demo.test')
    await page.getByLabel('Senha').fill('demo1234')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL('/')

    await page.getByRole('link', { name: 'Medições anteriores' }).click()
    await expect(page).toHaveURL('/medicoes')
    await expect(page.getByText(protocolo)).toBeVisible()

    const cardMedicao = page.locator('article', { hasText: protocolo })
    await expect(cardMedicao.getByText('Medição aprovada – faturamento liberado', { exact: true })).toBeVisible()

    const botaoEmitirNF = cardMedicao.getByRole('link', { name: 'Enviar Nota Fiscal' })
    await expect(botaoEmitirNF).toBeVisible()
    await botaoEmitirNF.click()

    await expect(page).toHaveURL(/\/medicoes\/.+\/nf$/)
    await expect(page.getByRole('heading', { name: 'Enviar Nota Fiscal' })).toBeVisible()

    // Preenche formulário da NF
    await page.getByLabel('Número da Nota Fiscal *').fill('NF-8820')
    await page.getByLabel('Anexo do PDF da Nota Fiscal').setInputFiles({
      name: 'nf-8820.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 teste'),
    })
    await page.getByRole('button', { name: 'Enviar Nota Fiscal' }).click()

    await expect(page.getByRole('heading', { name: 'Nota Fiscal enviada com sucesso!' })).toBeVisible()
    await page.getByRole('link', { name: 'Voltar para Minhas Medições' }).last().click()
    await expect(page).toHaveURL('/medicoes')
    await expect(page.getByText('Nota Fiscal enviada • Em conferência pelo financeiro')).toBeVisible()

    await page.getByRole('link', { name: 'Voltar para o início' }).click()
    await page.getByRole('button', { name: 'Sair' }).click()

    // 5. Construtora (Gerência/Financeiro) acessa /faturamento
    await page.getByLabel('E-mail').fill('gerencia@demo.test')
    await page.getByLabel('Senha').fill('demo1234')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL('/analise')

    await page.getByRole('link', { name: 'Faturamento e NFs' }).click()
    await expect(page).toHaveURL('/faturamento')
    await expect(page.getByRole('heading', { name: 'Painel de Faturamento e Notas Fiscais' })).toBeVisible()

    const cardNF = page.getByTestId('card-faturamento-NF-8820')
    await expect(cardNF).toBeVisible()
    await expect(cardNF.getByText('Em conferência')).toBeVisible()

    // Aprova a NF
    await cardNF.getByRole('button', { name: 'Aprovar NF' }).click()
    await expect(page.getByText(/aprovada com sucesso/i)).toBeVisible()
    await expect(cardNF.getByText('NF Aprovada')).toBeVisible()

    // Liquida / Registra Pagamento
    await cardNF.getByRole('button', { name: 'Registrar Pagamento' }).click()
    await expect(page.getByText(/Pagamento da Nota Fiscal.+registrado com sucesso/i)).toBeVisible()

    await page.getByRole('button', { name: 'Sair' }).click()

    // 6. Empreiteiro Alfa confere status PAGA
    await page.getByLabel('E-mail').fill('alfa@demo.test')
    await page.getByLabel('Senha').fill('demo1234')
    await page.getByRole('button', { name: 'Entrar' }).click()
    await expect(page).toHaveURL('/')

    await page.getByRole('link', { name: 'Medições anteriores' }).click()
    await expect(page).toHaveURL('/medicoes')
    await expect(page.getByText(protocolo)).toBeVisible()

    const cardMedicaoFinal = page.locator('article', { hasText: protocolo })
    await expect(cardMedicaoFinal.getByText('Paga', { exact: true })).toBeVisible()
    await expect(cardMedicaoFinal.getByText('✓ Pagamento realizado com sucesso')).toBeVisible()
  })
})
