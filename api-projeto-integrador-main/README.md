# Florescer — acompanhamento de ciclo com MySQL e Prisma

Aplicação web em Vite/TypeScript com API Node.js/Express. Contas, perfil e registros do calendário são armazenados em MySQL por meio do Prisma ORM 7.

## Requisitos

- Node.js 20 ou 22 LTS e npm.
- MySQL 8 ou MariaDB acessível.
- Banco vazio chamado `florescer` e usuário MySQL com acesso limitado a esse banco.

## Rodar localmente

```bash
npm ci
cp .env.example .env
```

Edite `.env` com os dados do MySQL e defina um segredo aleatório para sessão com pelo menos 32 caracteres. Aplique a migração incluída:

```bash
npm run db:deploy
```

Em um terminal, inicie a API:

```bash
npm run api:dev
```

Em outro terminal, inicie o Vite:

```bash
npm run dev
```

Abra o endereço informado pelo Vite, normalmente `http://localhost:5173`. O Vite encaminha `/api` para o Express na porta 3000. Para verificar a conexão do backend com o banco, abra `http://localhost:3000/api/health`.

## Prisma e migrações

O modelo fica em `prisma/schema.prisma`; o histórico SQL está em `prisma/migrations/`. Para mudar o modelo durante o desenvolvimento:

```bash
# Edite prisma/schema.prisma e rode:
npm run db:migrate -- --name descricao_da_alteracao
```

Revise e versione a nova migração. Em produção, use `npm run db:deploy` antes de iniciar a nova versão. Não use `prisma migrate reset` em bancos com dados que deseja preservar.

## Verificações

```bash
npm run build
npm test
```

`npm start` inicia o Express. Com `NODE_ENV=production`, o servidor também publica os arquivos compilados em `dist/`. O guia com explicações dos arquivos, comandos e tutorial Railway está em [`GUIA-PRISMA-MYSQL-E-PUBLICACAO.md`](GUIA-PRISMA-MYSQL-E-PUBLICACAO.md).

## Segurança e dados anteriores

O projeto usa hash de senha `scrypt`, cookie de sessão `HttpOnly`/`SameSite=Lax`, limitação básica de tentativas de login e consultas de registros sempre vinculadas à conta autenticada. Antes de armazenar dados reais, configure HTTPS, backups, retenção e exclusão de dados, monitoramento e política de privacidade adequada.

A versão original guardava dados no navegador. Cadastre novamente a conta na versão nova. Para aproveitar registros antigos, exporte-os pela versão antiga e use **Importar cópia** depois de entrar na nova conta. A importação substitui os registros existentes da conta.

## Área Entre Nós

A área de ajuda oferece ações rápidas e painéis HTML `<details>` recolhíveis. As informações são educativas e não substituem orientação médica, jurídica ou atendimento de emergência.
