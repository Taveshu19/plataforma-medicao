import { test, expect } from '@playwright/test'

test.describe('fluxo de medicao do empreiteiro (mobile)', () => {
  test('fluxo completo: home -> medicao -> preenchimento com metragem e % -> revisao -> envio com protocolo', async ({
    page,
  }) => {
    // 1. Login como empreiteiro Alfa
    await page.goto('/entrar')
    await page.getByLabel('E-mail').fill('alfa@demo.test')
    await page.getByLabel('Senha').fill('demo1234')
    await page.getByRole('button', { name: 'Entrar' }).click()

    await expect(page).toHaveURL('/')
    await expect(page.getByRole('heading', { name: 'Jose da Silva' })).toBeVisible()

    // 2. Clica em Fazer minha medição
    const botaoMedicao = page.getByRole('link', { name: 'Fazer minha medição' })
    await expect(botaoMedicao).toBeVisible()
    await botaoMedicao.click()

    await expect(page).toHaveURL('/medicao')
    await expect(page.getByRole('heading', { name: 'Medição do Mês' })).toBeVisible()

    // 3. Testa busca por local
    const campoBusca = page.getByPlaceholder('Buscar por casa, bloco ou etapa...')
    await expect(campoBusca).toBeVisible()
    await campoBusca.fill('Casa 01')
    await expect(page.getByRole('link', { name: /Casa 01/ })).toBeVisible()

    // 4. Entra na Casa 01
    await page.getByRole('link', { name: /Casa 01/ }).first().click()
    await expect(page).toHaveURL(/\/medicao\/local\/.+$/)
    await expect(page.getByRole('heading', { name: 'Casa 01' })).toBeVisible()

    // 5. Preenche Contrapiso em metragem
    const contrapisoCard = page.getByTestId(/^linha-servico-/).filter({ hasText: 'Contrapiso' })
    await expect(contrapisoCard).toBeVisible()
    const contrapisoInput = contrapisoCard.getByRole('spinbutton')
    await contrapisoInput.fill('20')

    // 6. Preenche Reboco interno usando porcentagem
    const rebocoCard = page.getByTestId(/^linha-servico-/).filter({ hasText: 'Reboco interno' })
    await expect(rebocoCard).toBeVisible()
    // Clica no botão '%'
    await rebocoCard.getByRole('button', { name: '%' }).click()
    const rebocoInput = rebocoCard.getByRole('spinbutton')
    await rebocoInput.fill('25')

    // 7. Validação de bloqueio por saldo excedido
    const pinturaCard = page.getByTestId(/^linha-servico-/).filter({ hasText: 'Pintura interna' })
    const pinturaInput = pinturaCard.getByRole('spinbutton')
    await pinturaInput.fill('99999')
    // Mensagem de erro de saldo deve aparecer
    await expect(page.locator('p[role="alert"]')).toContainText('excede o saldo disponível')
    // Botão de salvar deve estar desabilitado com aviso
    await expect(
      page.getByRole('button', { name: 'Corrija os valores com saldo excedido' }),
    ).toBeDisabled()

    // Corrige o valor para 0 ou limpa
    await pinturaInput.fill('')

    // 8. Salva o local
    const botaoSalvar = page.getByRole('button', { name: 'Salvar e voltar aos locais' })
    await expect(botaoSalvar).toBeEnabled()
    await botaoSalvar.click()

    // 9. Retorna para a tela de etapas e locais
    await expect(page).toHaveURL('/medicao')
    // Casa 01 agora deve estar com badge Preenchido
    await expect(
      page.getByRole('link', { name: /Casa 01/ }).getByText('Preenchido', { exact: true }),
    ).toBeVisible()

    // 10. Clica em Revisar e Enviar
    const botaoRevisar = page.getByRole('link', { name: /Revisar e Enviar/ })
    await expect(botaoRevisar).toBeVisible()
    await botaoRevisar.click()

    // 11. Tela de revisão
    await expect(page).toHaveURL('/medicao/revisao')
    await expect(page.getByRole('heading', { name: 'Revisão da Medição' })).toBeVisible()
    await expect(page.getByText('Casa 01')).toBeVisible()
    await expect(page.getByText('Contrapiso')).toBeVisible()
    await expect(page.getByText('Reboco interno')).toBeVisible()

    // 12. Envio com confirmação
    const botaoEnviar = page.getByRole('button', { name: /Enviar medição para aprovação/ })
    await expect(botaoEnviar).toBeVisible()
    await botaoEnviar.click()

    // Modal de confirmação
    await expect(page.getByRole('heading', { name: 'Confirmar envio da medição?' })).toBeVisible()
    await page.getByRole('button', { name: 'Sim, confirmar e enviar' }).click()

    // 13. Tela de sucesso com protocolo
    await expect(page.getByRole('heading', { name: 'Medição enviada com sucesso!' })).toBeVisible()
    const protocoloElem = page.getByTestId('protocolo-medicao')
    await expect(protocoloElem).toBeVisible()
    const protocoloTexto = await protocoloElem.textContent()
    expect(protocoloTexto).toMatch(/^MED-\d{4}-\d{2}-\d{3}$/)

    // 14. Retorna para o início e confere atualização
    await page.getByRole('link', { name: 'Voltar para o início' }).click()
    await expect(page).toHaveURL('/')
    await expect(page.getByText('Residencial Vista Alta')).toBeVisible()
  })
})
