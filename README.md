# ZIP Portal do Cliente

Ecossistema contábil para clientes e profissionais da ZIP Contabilidade. O projeto começou pelo módulo de NFS-e, mas a direção atual é um portal modular com integrações fiscais, contábeis e operacionais, centralizando emissão de notas, documentos, impostos, solicitações e processos.

## Visão do Produto

A plataforma permite que clientes acessem suas empresas com permissões por módulo, executem rotinas liberadas pela contabilidade e acompanhem retornos em um único ambiente. Para a equipe interna, o sistema deve funcionar como uma camada gerencial sobre integrações externas, reduzindo retrabalho e mantendo histórico local dos dados críticos.

## Módulos Atuais

- **Portal do Cliente**: login, empresas vinculadas, permissões por empresa e controle modular de acesso.
- **NFS-e**: parametrização fiscal, certificado digital A1, cadastro de serviços, tomadores, emissão, transmissão, acompanhamento de status, download de PDF/XML e relatórios CSV/Excel.
- **Contabilidade**: estrutura inicial dos menus Documentos, Impostos, Solicitações e Processos.
- **Acessórias**: integração inicial para sincronizar entregas, impostos, solicitações e processos, com cache local e armazenamento de arquivos quando disponíveis.

## Integrações

### NFS-e Nacional

Integração com a API nacional de NFS-e para transmissão, consulta de status e obtenção de arquivos fiscais. O sistema suporta ambiente de homologação/produção conforme parametrização da empresa.

### Acessórias

Integração com `https://api.acessorias.com` usando token Bearer configurado somente no backend. Os dados consultados são persistidos localmente para evitar depender de chamadas externas a cada navegação. Arquivos de documentos/impostos são baixados para `storage/accounting` quando a API retorna anexos.

Funcionalidades estruturadas:

- sincronização de documentos, impostos/guias, solicitações e processos;
- abertura de nova solicitação pelo portal, encaminhando para a Acessórias;
- atualização manual e atualização periódica das solicitações para capturar retornos de analistas;
- download local de anexos já armazenados.

## Stack

- **Frontend**: Next.js + React + TypeScript
- **Backend**: NestJS + TypeScript
- **Banco de dados**: PostgreSQL via Docker
- **ORM**: Prisma
- **Armazenamento local**: `storage/` para XML, PDF, certificados processados e arquivos contábeis
- **Monorepo**: npm workspaces em `apps/*` e `packages/*`

## Estrutura

```txt
apps/
  api/       Backend NestJS, Prisma, integrações e regras de negócio
  web/       Frontend Next.js com o portal modular
packages/
  shared/    Tipos e contratos compartilhados
docs/        Documentação técnica e decisões do projeto
infra/       Apoio de infraestrutura local
storage/     Arquivos locais gerados em runtime (ignorado pelo Git)
```

## Configuração Local

1. Crie o `.env` a partir do exemplo:

```bash
cp .env.example .env
```

2. Ajuste os segredos no `.env` local:

```env
JWT_SECRET=change-me-in-development
CERTIFICATE_ENCRYPTION_KEY=change-me-32-bytes-minimum
ACESSORIAS_API_TOKEN=change-me
```

Nunca versionar tokens reais, senhas de certificado ou arquivos `.pfx/.p12`.

3. Suba o banco:

```bash
docker compose up -d
```

4. Instale dependências e gere o Prisma Client:

```bash
npm install
npm run db:generate
```

5. Aplique migrations quando houver alteração no schema:

```bash
npm run db:migrate -- --name nome_da_migration
```

Em ambientes não interativos, use `prisma migrate deploy` com o mesmo schema da API.

6. Rode API e web:

```bash
npm run dev --workspace apps/api
npm run dev --workspace apps/web
```

URLs locais padrão:

- Web: `http://localhost:3000/login`
- API health: `http://localhost:3333/health`

## Scripts Úteis

```bash
npm run build --workspace apps/api
npm run build --workspace apps/web
npm run db:generate
npm run db:migrate -- --name nome_da_migration
```

## Segurança e Dados Sensíveis

- Tokens de APIs externas ficam apenas no backend e no `.env` local/ambiente seguro.
- Certificados digitais não devem expor senha nem nome de arquivo sensível na interface.
- Permissões são avaliadas por empresa e módulo, tanto na UI quanto no backend.
- Usuário sem permissão não deve conseguir acessar submódulos por link direto.
- Arquivos fiscais e contábeis devem ser servidos por endpoints autenticados, nunca por caminho público direto.
- Logs e mensagens de erro devem mostrar o necessário para diagnóstico sem vazar segredo, certificado ou payload sensível.

## Estado Atual

O módulo NFS-e já está funcional para parametrização, cadastro, emissão local, transmissão, sincronização de status, relatórios e downloads. A integração Acessórias está em fase inicial, com cache local, armazenamento de anexos, listagens ordenáveis e abertura de solicitações.

Próximos passos naturais:

- ampliar telas de Contabilidade para workflows completos por departamento;
- adicionar filtros específicos por competência, departamento e status;
- evoluir relatórios para XLSX nativo quando necessário;
- implementar jobs backend para sincronizações periódicas fora da navegação do usuário;
- reforçar testes automatizados de permissões, emissão fiscal e integrações externas.