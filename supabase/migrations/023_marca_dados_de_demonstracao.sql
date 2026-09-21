/* Protege os dados de demonstração da limpeza dos testes.

   O `cleanup()` da suíte dava `truncate companies cascade` e apagava todos os
   usuários do Auth. Isso derrubava a demonstração inteira: rodar os testes
   deixava o banco vazio, e quem abrisse o link nesse intervalo não conseguia
   nem entrar. Aconteceu duas vezes em um único dia de trabalho.

   A marca abaixo permite que a limpeza apague só o que os testes criaram.
   Todas as chaves estrangeiras para `companies` cascateiam no delete, então
   remover a empresa de teste leva junto obras, contratos e medições dela. */

alter table companies
  add column if not exists is_demo boolean not null default false;

comment on column companies.is_demo is
  'Empresa de demonstração. A limpeza dos testes nunca a remove.';
