# Guia do Prisma, MySQL e publicação do Florescer

Este documento acompanha o projeto já integrado. A aplicação tem um frontend Vite, uma API Express, o Prisma ORM 7 e um banco MySQL. Ele explica o que cada arquivo da integração faz, como executar localmente, como as consultas percorrem o sistema e como publicar uma instância no Railway.

## Como os componentes trabalham juntos

```text
Navegador
  └─ interface Vite e src/legacy/app.js
       └─ fetch('/api/...') com cookie HttpOnly
            └─ src/server/index.ts (API Express)
                 └─ src/server/db/prisma.ts (Prisma Client + adapter MariaDB)
                      └─ banco MySQL
```

O navegador não se conecta ao MySQL e não contém a senha do banco. Ele chama rotas HTTP do servidor. O servidor verifica a sessão, associa a operação ao usuário autenticado e usa Prisma Client para consultar o banco.

## O que o Prisma faz neste projeto

**Prisma Schema** é a definição dos dados e relações em `prisma/schema.prisma`. O modelo atual tem contas (`User`) e registros por data (`CycleRecord`).

**Prisma Client** é a biblioteca TypeScript gerada a partir do schema. Ela fornece operações tipadas como `prisma.user.create()` e `prisma.cycleRecord.upsert()`.

**Prisma Migrate** mantém os arquivos SQL que constroem e alteram o banco. A migração inicial já está em `prisma/migrations/20261021143000_init/migration.sql`. Em desenvolvimento, `prisma migrate dev` cria novas migrações. Em produção, `prisma migrate deploy` aplica as migrações já versionadas.[1] [2]

**Driver adapter** é a ponte entre Prisma Client e o driver Node para MySQL/MariaDB. Aqui o pacote `@prisma/adapter-mariadb` recebe host, porta e credenciais do servidor.[3]

## Arquivos da integração

### Dependências e configuração

**`package.json`** registra dependências e comandos. `express` atende requisições HTTP; `@prisma/client` fornece o cliente; `prisma` fornece a CLI; `@prisma/adapter-mariadb` conecta o cliente ao MySQL; `dotenv` carrega variáveis locais; `tsx` executa TypeScript no servidor; `helmet` adiciona cabeçalhos de segurança; `express-rate-limit` limita tentativas de cadastro e login. `@types/express` e `@types/node` oferecem tipos ao compilador.

Os scripts principais são:

- `npm run dev`: inicia o frontend Vite.
- `npm run api:dev`: inicia a API local com reinício automático.
- `npm run build`: gera o Prisma Client, verifica TypeScript e compila o frontend.
- `npm start`: inicia o servidor Express.
- `npm run db:generate`: gera novamente o Prisma Client.
- `npm run db:migrate -- --name nome`: cria e aplica uma migração de desenvolvimento.
- `npm run db:deploy`: aplica migrações já criadas, indicado para implantação.
- `npm test`: executa os testes Vitest.

**`package-lock.json`** fixa as versões instaladas para que `npm ci` reproduza a mesma instalação em outra máquina ou no serviço de deploy.

**`.env.example`** mostra os nomes das variáveis necessárias sem conter credenciais reais. Copie para `.env` e edite na máquina local. O arquivo `.gitignore` já impede que `.env` seja enviado ao Git. Em produção, cadastre valores secretos no painel do provedor, não no código.

**`prisma.config.ts`** configura a CLI do Prisma 7. `schema` aponta para o modelo; `migrations.path` aponta para o histórico SQL; `datasource.url` obtém a URL pelo segredo `DATABASE_URL`. No Prisma 7, a URL da CLI fica nesse arquivo de configuração.[3]

### Modelo e histórico do banco

**`prisma/schema.prisma`** declara o banco e as tabelas. O bloco `generator` determina que o cliente seja gerado em `generated/prisma`. O bloco `datasource` seleciona MySQL.

Em `User`, `id` é a chave primária autoincrementada. `username` é único para evitar duas contas com o mesmo nome. `passwordHash` armazena o hash, nunca a senha original. `displayName`, `cycleLength` e `theme` guardam as preferências do perfil. `createdAt` registra a criação e `updatedAt` é atualizado pelo Prisma em alterações. `records` é o lado da relação que lista os registros daquela conta.

Em `CycleRecord`, `userId` aponta para a conta dona. `date` é a data de calendário no tipo MySQL `DATE`. `flow`, `mood`, `symptoms`, `note`, `menstruation` e `quick` guardam os dados que a tela coleta. Listas de sintomas e check-ins usam o tipo JSON do MySQL. A relação `user` associa o registro ao usuário.

`@@unique([userId, date])` impede dois registros do mesmo usuário na mesma data e permite usar `upsert` para criar ou atualizar. `@@index([userId, date])` ajuda consultas que buscam o histórico da conta. `onDelete: Cascade` faz com que excluir uma conta também remova seus registros relacionados; decida se essa regra atende à política de retenção antes de usar contas reais.

**`prisma/migrations/migration_lock.toml`** registra que esse histórico pertence a MySQL. **`prisma/migrations/20261021143000_init/migration.sql`** contém o SQL inicial gerado a partir do schema: cria as tabelas, índices e a chave estrangeira. Versione toda a pasta `prisma/migrations`; não edite migrações que já foram aplicadas em ambientes compartilhados.

**`generated/prisma/`** é criado pelo comando Prisma. Não é necessário versionar essa pasta: o `.gitignore` a exclui e `npm run build` gera o cliente antes da compilação.

### Servidor e acesso ao banco

**`src/server/db/prisma.ts`** cria um Prisma Client compartilhado pelo servidor. Antes de construir o adapter, verifica as variáveis essenciais. `PrismaMariaDb` recebe `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD` e `DATABASE_NAME`; `connectionLimit: 5` limita o pool por instância. `new PrismaClient({ adapter })` disponibiliza o cliente às rotas. No Prisma 7, o adapter faz a conexão em tempo de execução; o `DATABASE_URL` do config é usado pela CLI e pelas migrações.[3]

**`src/server/index.ts`** é o backend completo desta versão. Ele carrega variáveis, configura Express e Helmet, interpreta JSON e configura o proxy confiável para o serviço hospedado. `SESSION_SECRET` é obrigatório e deve ter pelo menos 32 caracteres.

A sessão usa um cookie chamado `florescer_session`. O conteúdo inclui o ID do usuário e a validade, codificados e assinados com HMAC-SHA256. `HttpOnly` impede acesso ao cookie pelo JavaScript da página; `SameSite=Lax` reduz envio em requisições iniciadas de outro site; `Secure` é ativado quando `NODE_ENV=production`, para HTTPS. O middleware `requireAuth` verifica a assinatura e validade antes de liberar rotas privadas.

As senhas são processadas no servidor por `scrypt`. A função `hashPassword` cria um salt aleatório, deriva um hash e grava o formato `scrypt$salt$hash`. `checkPassword` calcula novamente e compara bytes com `timingSafeEqual`. A senha original não é gravada nem enviada na resposta JSON. O limiter de autenticação limita tentativas por endereço de rede. Essas medidas são uma base técnica, não substituem auditoria de segurança, política de privacidade, backups ou controles adicionais para dados sensíveis.

`normalizeUsername` valida e normaliza o nome de usuário. `validDate` rejeita datas impossíveis. `parseRecord` limita tamanho e tipo dos campos. `recordData` converte o corpo validado para os tipos Prisma, e `publicRecord` transforma os dados do banco em JSON seguro para a tela. `publicUser` monta o perfil público sem incluir o hash da senha.

A rota `/api/health` testa conexão com `SELECT 1` e retorna um estado simples. `/api/auth/register` valida os campos, cria conta e emite cookie. `/api/auth/login` verifica credenciais e emite cookie. `/api/auth/logout` limpa o cookie. `/api/auth/me` identifica a sessão e devolve apenas dados de perfil. `PATCH /api/profile` atualiza nome, tema e duração do ciclo.

As rotas de registros exigem `requireAuth`. `GET /api/records` lista somente registros do usuário autenticado. `PUT /api/records/:date` grava ou atualiza um dia com Prisma `upsert`; o `userId` vem da sessão, não do navegador. `DELETE /api/records/:date` também inclui o usuário na condição de exclusão. `PUT /api/records/import` valida até 1.000 registros e substitui o conjunto atual dentro de uma transação, para que uma falha não deixe uma importação pela metade.

Em produção, o servidor também entrega os arquivos de `dist/`. O encerramento do processo fecha conexões do Prisma com `$disconnect()`. Erros internos são registrados no log do servidor e enviados ao navegador com uma mensagem genérica.

### Frontend e chamadas da API

**`src/legacy/app.js`** ainda contém a lógica da interface original, mas o fluxo de conta e persistência foi migrado para a API. A função `api()` centraliza `fetch`, JSON, cookies same-origin e erros HTTP. `carregarRegistros()` busca o histórico e monta o cache em memória usado para desenhar o calendário. `doBancoParaTela()` e `telaParaBanco()` convertem os nomes dos campos entre o formato histórico da interface (`nota`, `ciclo`, `fluxo`, `humor`, `sintomas`) e o formato da API (`note`, `menstruation`, `flow`, `mood`, `symptoms`).

As rotinas `render`, `abrirDia`, `previsao` e `atualizarDashboard` continuam responsáveis pela visualização e pelos cálculos no navegador. Ao salvar uma anotação ou um check-in, o JavaScript chama `PUT /api/records/:date`; ao limpar um dia, chama `DELETE`. Cadastro, login, sessão atual, atualização do perfil e logout chamam as rotas correspondentes. Exportação monta um JSON com o perfil e os registros que vieram do servidor. Importação converte o JSON antigo ou atual para o formato da API e pede confirmação antes de substituir os registros.

O cache `registros` só existe na memória da página para alimentar a interface. A fonte persistente passou a ser o banco. Uma falha de rede aparece nas mensagens de status da tela.

**`vite.config.ts`** mantém o Vite no desenvolvimento e encaminha URLs começadas por `/api` para `http://127.0.0.1:3000`. Assim, o frontend usa o mesmo caminho `/api/...` tanto localmente quanto publicado e não precisa expor a URL privada do banco.

**`src/main.ts`** continua importando o CSS e inicializando o JavaScript da interface. **`index.html`** contém as telas e formulários. Os campos de senha agora exigem oito caracteres, compatíveis com a validação da API, e os avisos de privacidade descrevem o armazenamento no serviço.

**`src/domain/types.ts`, `src/models/CycleEntry.ts`, `src/repositories/CycleRepository.ts` e `src/services/cycleService.ts`** são arquivos preexistentes de domínio/organização da aplicação. A interface do repositório em `CycleRepository.ts` ainda não é a implementação usada pelo backend; as rotas atuais consultam Prisma diretamente. O guia não os apresenta como uma camada Prisma implementada.

**`tests/cycle.test.ts`** continua cobrindo o cálculo estimado de ciclo. Ele não substitui testes de integração das rotas de autenticação e do MySQL.

## Rodar na máquina local

Use Node.js 20 ou 22 LTS, npm e um MySQL 8 ou MariaDB acessível. Crie um banco e usuário dedicados, evitando usar o usuário administrativo `root` na aplicação. Um exemplo de SQL local é:

```sql
CREATE DATABASE florescer CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'florescer'@'localhost' IDENTIFIED BY 'troque-por-uma-senha-local';
GRANT ALL PRIVILEGES ON florescer.* TO 'florescer'@'localhost';
```

Na pasta do projeto:

```bash
npm ci
cp .env.example .env
```

Edite `.env`. Para `SESSION_SECRET`, gere um segredo aleatório, por exemplo:

```bash
openssl rand -base64 48
```

Configure `DATABASE_URL` no formato `mysql://usuario:senha@host:3306/florescer` e os campos separados `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_USER`, `DATABASE_PASSWORD` e `DATABASE_NAME`. Não compartilhe ou comite `.env`.

Aplique o histórico SQL que já está no projeto:

```bash
npm run db:deploy
```

Abra dois terminais na raiz. No primeiro:

```bash
npm run api:dev
```

No segundo:

```bash
npm run dev
```

Acesse o endereço informado pelo Vite, geralmente `http://localhost:5173`. O teste simples do servidor e do banco fica em `http://localhost:3000/api/health`.

Para mudar as tabelas durante o desenvolvimento, edite `prisma/schema.prisma` e rode:

```bash
npm run db:migrate -- --name descricao_da_alteracao
```

Revise a nova pasta em `prisma/migrations/`, rode `npm run build` e `npm test`, e versione a migração junto do código. Não rode `migrate reset` em um banco com dados importantes. A documentação Prisma separa migrações de desenvolvimento (`migrate dev`) e implantação de migrações preparadas (`migrate deploy`).[1]

## Publicar no Railway

O exemplo pressupõe um único serviço Node/Express que serve o frontend compilado e a API, além de um serviço MySQL no mesmo projeto. O Railway fornece variáveis de conexão MySQL e permite referenciá-las por outro serviço do projeto.[4] [5]

1. **Envie o projeto ao GitHub.** Inclua o código, `package-lock.json`, `prisma/schema.prisma` e todo o histórico `prisma/migrations/`. Não inclua `.env`, `node_modules`, `dist` ou dados pessoais. Configure o repositório como privado se desejar limitar o acesso ao código.

2. **Crie o projeto Railway e conecte o repositório.** No painel, crie um projeto e escolha o deploy a partir de um repositório GitHub. O Railway identifica projetos Node e instala as dependências pelo lockfile.[6]

3. **Adicione o banco.** No canvas do projeto, crie um serviço **Database → MySQL**. Não habilite acesso público ao banco para esta configuração; a API e o banco devem comunicar-se pela rede privada do projeto.[4]

4. **Configure as variáveis no serviço da aplicação.** Substitua `MySQL` pelo nome exato do serviço MySQL se ele tiver outro nome. Cadastre estas referências:

   ```text
   NODE_ENV=production
   DATABASE_URL=${{MySQL.MYSQL_URL}}
   DATABASE_HOST=${{MySQL.MYSQLHOST}}
   DATABASE_PORT=${{MySQL.MYSQLPORT}}
   DATABASE_USER=${{MySQL.MYSQLUSER}}
   DATABASE_PASSWORD=${{MySQL.MYSQLPASSWORD}}
   DATABASE_NAME=${{MySQL.MYSQLDATABASE}}
   SESSION_SECRET=<segredo aleatório com pelo menos 32 caracteres>
   ```

   Gere o segredo localmente com `openssl rand -base64 48` e cole o resultado no campo secreto do Railway. Não use `VITE_` em variáveis secretas, pois variáveis com esse prefixo podem parar no bundle do navegador. O Railway injeta as variáveis durante build e execução e permite referências como `${{SERVICE_NAME.VARIABLE}}`.[5]

5. **Defina os comandos de deploy.** Configure o comando de build como `npm run build`, o comando **Pre-Deploy** como `npm run db:deploy` e o comando de início como `npm start`. O build gera o Prisma Client e o diretório `dist`. O pre-deploy aplica as migrações antes de a nova instância iniciar. O Railway executa essa etapa dentro da rede privada com as variáveis disponíveis; se ela falhar, o deploy não deve prosseguir.[7]

6. **Gere um domínio para o serviço web.** Nas configurações de rede do serviço da aplicação, gere um domínio público. Não gere domínio público para o banco. O Express escuta na porta definida pelo Railway e no endereço `0.0.0.0`.

7. **Confira o deploy.** Leia os logs e confirme o build, a execução de `npm run db:deploy` e a inicialização do Express. Abra `https://SEU-DOMINIO/api/health` e confirme que a API retorna `{"status":"ok","database":"ok"}`. Abra também a página principal, crie uma conta de teste e confirme que registros continuam presentes depois de atualizar a página.

A documentação do Railway explica como adicionar MySQL, referenciar suas variáveis em outros serviços e usar pre-deploy para tarefas como migrações.[4] [5] [7] A pasta `dist` gerada pelo Vite contém o frontend; o servidor Express deste projeto é que torna possível hospedar frontend e API sob o mesmo domínio. Uma hospedagem apenas estática do `dist` não executa Prisma nem deve receber credenciais do banco.[8]

## Dados da versão anterior e limitações

A versão original guardava contas em `localStorage` e registros em chaves por navegador. Esses dados não são transferidos automaticamente ao MySQL. Antes de substituir uma instalação antiga, exporte os registros usando a versão antiga. Na versão nova, crie uma nova conta e use **Importar cópia**. A importação substitui registros dessa nova conta; confirme se esse é o resultado desejado antes de continuar. Por segurança, as senhas da versão antiga não são migradas: cada pessoa deve cadastrar uma nova senha.

O cookie assinado é stateless e tem validade de sete dias. O logout limpa o cookie no navegador; como não há tabela de sessões no banco, tokens copiados indevidamente não podem ser revogados individualmente antes de expirar. Para serviços com múltiplas instâncias ou exigência de revogação imediata, substitua a estratégia por sessões persistidas e revogáveis. O limite de tentativas do `express-rate-limit` também é local a cada instância. Esses pontos, backups, monitoramento, consentimento e política de privacidade devem ser considerados antes de guardar dados pessoais reais em produção.

## Referências

[1]: https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production "Migrações Prisma em desenvolvimento e produção"
[2]: https://www.prisma.io/docs/v7/prisma-orm/quickstart/mysql "Prisma ORM 7 com MySQL"
[3]: https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/mysql "Conector MySQL e adapters do Prisma 7"
[4]: https://docs.railway.com/databases/mysql "Banco MySQL no Railway"
[5]: https://docs.railway.com/variables "Variáveis de ambiente e referências no Railway"
[6]: https://docs.railway.com/guides/express "Deploy de aplicação Express no Railway"
[7]: https://docs.railway.com/deployments/pre-deploy-command "Comando Pre-Deploy no Railway"
[8]: https://vite.dev/guide/static-deploy "Publicação estática do Vite"
