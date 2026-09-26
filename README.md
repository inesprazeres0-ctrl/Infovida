# Infovida

Formulario de solicitacao de simulacao de seguro de vida e painel privado de atendimento.

## Executar localmente

Requer Node.js 20 ou superior.

```sh
npm install
npm start
```

Abra `http://localhost:3000`. O acesso administrativo fica em `http://localhost:3000/infovida-admin.html`; a senha local fica no arquivo `.env`, que e ignorado pelo Git.

O servidor exige `ADMIN_PASSWORD` e `SESSION_SECRET`. Configure essas variaveis no ambiente do servico no Render. Para iniciar localmente, defina ambas no terminal antes de executar `npm start`. Sem `DATABASE_URL`, os contatos sao guardados em `data/submissions.json`, que nao e versionado. Para usar PostgreSQL localmente, defina tambem `DATABASE_URL` no ambiente.

## Publicar no Render

1. Envie este repositorio para o GitHub.
2. No Render, escolha **New > Blueprint** e conecte o repositorio. O `render.yaml` cria o servico Node e o PostgreSQL.
3. Em **Environment**, defina `ADMIN_PASSWORD` com a senha escolhida. O Blueprint gera `SESSION_SECRET` automaticamente; mantenha esse valor secreto. `DATABASE_URL` e conectado ao banco criado pelo Blueprint.
4. Aguarde o deploy e acesse `https://SEU-SERVICO.onrender.com/infovida-admin.html` para entrar no painel.

O Render Free pode suspender o servico apos inatividade e os planos gratuitos de banco possuem limites e prazo de expiracao definidos pelo Render. Para armazenar dados pessoais em producao, escolha um plano de PostgreSQL com persistencia adequada e configure backups e retencao conforme a politica da empresa.

## Privacidade

O formulario solicita consentimento antes do envio. Os dados devem ser acessados apenas por pessoas autorizadas, protegidos por HTTPS em producao e tratados conforme a LGPD. Nunca envie senhas ou chaves para o GitHub.