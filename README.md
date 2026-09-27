# Infovida

Formulario de solicitacao de simulacao de seguro de vida e painel privado de atendimento.

## Executar localmente

Requer Node.js 20 ou superior.

```sh
npm install
npm start
```

Abra `http://localhost:3000/seguro-pessoas` para o formulario principal ou `http://localhost:3000/servidor-publico` para o formulario de servidores publicos. A raiz redireciona para o formulario principal. O acesso administrativo fica em `http://localhost:3000/infovida-admin.html`; credenciais locais podem ser definidas em um arquivo `.env`, ignorado pelo Git.

O servidor exige `ADMIN_PASSWORD` e `SESSION_SECRET`. Para iniciar localmente, defina ambas no ambiente ou em `.env` antes de executar `npm start`. Os contatos sao gravados pelo `better-sqlite3` no banco SQLite `data/infovida.sqlite`; `DB_PATH` pode apontar para outro caminho. Esse arquivo e a fonte de verdade local e fica ignorado pelo Git porque contem dados pessoais.

## Publicar no Render

1. Envie este repositorio para o GitHub.
2. No Render, escolha **New > Blueprint** e conecte o repositorio. Em **Environment**, defina `ADMIN_PASSWORD`; o Blueprint gera `SESSION_SECRET` automaticamente.
3. Aguarde o deploy e acesse `https://SEU-SERVICO.onrender.com/infovida-admin.html` para entrar no painel.

O app usa apenas SQLite local e nao exige Turso nem credenciais de banco externo. Atencao: o filesystem do Render Free e temporario, entao contatos gravados no SQLite hospedado podem ser perdidos em reinicios ou novos deploys. Para manter os dados no Render, sera necessario um plano que permita disco persistente e montar um disco em `/var/data`, com `DB_PATH=/var/data/infovida.sqlite`.

## Privacidade

O formulario solicita consentimento antes do envio. Os dados devem ser acessados apenas por pessoas autorizadas, protegidos por HTTPS em producao e tratados conforme a LGPD. Nunca envie senhas ou chaves para o GitHub.