/* Faxina dos achados que as revisões deixaram registrados.

   Três dos cinco já estavam fechados e ninguém tinha percebido:

   - A constante `URL` que sombreava a classe global em tests/helpers/auth.ts
     virou `SUPABASE_URL` em algum momento.
   - `contract_item_balance` devolver NULL para item inexistente deixou de ser
     alcançável: a checagem de contrato cruzado em `enforce_item_balance` roda
     antes e um item inexistente cai no `is distinct from`, levantando exceção.
   - A validação cross-contract no schema foi fechada por trigger na 007.

   O nome do pacote diferente do nome da pasta fica como está: é exigência do
   npm, que não aceita maiúsculas.

   Resta uma: a função abaixo ficou sem consumidor quando a migration 004
   reescreveu `can_read_contract` para escopar por empresa. Manter função de
   permissão sem uso é convite a alguém reutilizá-la achando que ainda vale — e
   ela é justamente a versão global, sem escopo de empresa, que causou o bug de
   o engenheiro perder acesso aos contratos da própria construtora. */

drop function if exists auth_contractor_ids();
