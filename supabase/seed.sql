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
  values (v_company, 'Empreeteira Alfa Servicos Civis', '12.345.678/0001-90')
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

    -- cria inicialmente como EM_ANALISE para inserir os itens
    insert into measurements
      (company_id, period_id, contract_id, status, current_level, protocol, submitted_at)
    values
      (v_company, v_period, v_ct_alfa, 'EM_ANALISE', 3,
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

    -- atualiza para o status final do historico
    update measurements set status = v_status::measurement_status where id = v_meas;

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
