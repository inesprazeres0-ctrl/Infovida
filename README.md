# Infovida

Formulario de solicitacao de simulacao de seguro de vida e painel privado de atendimento.

## Executar localmente

Requer Node.js 20 ou superior.

```sh
npm install
npm start
```

Abra `http://localhost:3000`. O acesso administrativo fica em `http://localhost:3000/infovida-admin.html`; credenciais locais podem ser definidas em um arquivo `.env`, ignorado pelo Git.

O servidor exige `ADMIN_PASSWORD` e `SESSION_SECRET`. Configure essas variaveis no ambiente do servico no Render. Para iniciar localmente, defina ambas no ambiente ou em `.env` antes de executar `npm start`. Sem credenciais Turso, o banco SQLite local fica em `data/infovida.sqlite`; `DB_PATH` pode apontar para outro caminho. Na primeira inicializacao, os contatos existentes em `data/submissions.json` sao importados sem apagar o arquivo original.

Para importar o JSON local para o Turso, coloque `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` no `.env` local e execute:

```sh
npm run migrate:turso
```

O caminho do JSON pode ser passado como argumento opcional. A importacao preserva IDs e pode ser repetida sem duplicar contatos. Nunca versione `.env` ou `data/submissions.json`.

## Publicar no Render

1. Envie este repositorio para o GitHub.
2. Crie um banco no Turso e gere um authentication token. Use a URL `libsql://...` e esse token como `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN`.
3. Antes do deploy, configure essas duas variaveis temporariamente no `.env` local e execute `npm run migrate:turso` para copiar os contatos existentes. Depois da importacao, retire o token local se nao precisar mais dele.
4. No Render, escolha **New > Blueprint** e conecte o repositorio. Em **Environment**, defina `ADMIN_PASSWORD`, `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN`. O Blueprint gera `SESSION_SECRET` automaticamente.
5. Aguarde o deploy e acesse `https://SEU-SERVICO.onrender.com/infovida-admin.html` para entrar no painel.

O servico web do Render pode continuar no plano gratuito porque o banco Turso e remoto. O plano gratuito do Render usa filesystem temporario; o servidor exige as credenciais Turso em producao e nao inicia se elas estiverem ausentes.

O Render gratuito nao monta armazenamento persistente, por isso `data/` e ignorada pelo Git e o JSON local nao acompanha o deploy. O comando de importacao deve ser executado no computador que possui esse arquivo, antes de publicar/deployar a nova versao.

## Privacidade

O formulario solicita consentimento antes do envio. Os dados devem ser acessados apenas por pessoas autorizadas, protegidos por HTTPS em producao e tratados conforme a LGPD. Nunca envie senhas ou chaves para o GitHub.