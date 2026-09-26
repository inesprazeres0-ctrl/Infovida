# Infovida

Formulario de solicitacao de simulacao de seguro de vida e painel privado de atendimento.

## Executar localmente

Requer Node.js 20 ou superior.

```sh
npm install
npm start
```

Abra `http://localhost:3000`. O acesso administrativo fica em `http://localhost:3000/infovida-admin.html`; credenciais locais podem ser definidas em um arquivo `.env`, ignorado pelo Git.

O servidor exige `ADMIN_PASSWORD` e `SESSION_SECRET`. Configure essas variaveis no ambiente do servico no Render. Para iniciar localmente, defina ambas no ambiente ou em `.env` antes de executar `npm start`. O banco SQLite local fica em `data/infovida.sqlite`; `DB_PATH` pode apontar para outro caminho. Na primeira inicializacao, os contatos existentes em `data/submissions.json` sao importados sem apagar o arquivo original.

## Publicar no Render

1. Envie este repositorio para o GitHub.
2. No Render, escolha **New > Blueprint** e conecte o repositorio. O `render.yaml` cria o servico Node e monta um disco persistente em `/var/data` para o SQLite.
3. Em **Environment**, defina `ADMIN_PASSWORD` com a senha escolhida. O Blueprint gera `SESSION_SECRET` automaticamente e define `DB_PATH=/var/data/infovida.sqlite`; mantenha as credenciais secretas.
4. Aguarde o deploy e acesse `https://SEU-SERVICO.onrender.com/infovida-admin.html` para entrar no painel.

O disco persistente do Render requer um servico pago e gera custo mensal. O plano gratuito nao oferece armazenamento persistente: nao use o SQLite em filesystem temporario para contatos reais, pois os dados podem ser perdidos em reinicios ou deploys. Configure backups e retencao conforme a politica da empresa.

Antes de trocar uma instalacao existente, exporte os contatos do PostgreSQL antigo. A importacao automatica cobre somente `data/submissions.json` presente no disco da instancia; a pasta `data/` e ignorada pelo Git e os registros do PostgreSQL remoto nao sao copiados automaticamente para o SQLite.

## Privacidade

O formulario solicita consentimento antes do envio. Os dados devem ser acessados apenas por pessoas autorizadas, protegidos por HTTPS em producao e tratados conforme a LGPD. Nunca envie senhas ou chaves para o GitHub.