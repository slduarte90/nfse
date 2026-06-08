# ZIP Portal do Cliente

Ecossistema contábil para clientes e profissionais da ZIP Contabilidade. O projeto começou pelo módulo de NFS-e, mas a direção atual é um portal modular com integrações fiscais, contábeis e operacionais, centralizando emissão de notas, documentos, impostos, solicitações, processos e indicadores gerenciais.

## Visão Do Produto

A plataforma permite que clientes acessem suas empresas com permissões por módulo, executem rotinas liberadas pela contabilidade e acompanhem retornos em um único ambiente. Para a equipe interna, o sistema funciona como uma camada gerencial sobre integrações externas, reduzindo retrabalho e mantendo histórico local dos dados críticos.

## Módulos Atuais

- **Portal do Cliente**: login, empresas vinculadas, permissões por empresa e controle modular de acesso.
- **NFS-e**: parametrização fiscal, certificado digital A1, cadastro de serviços, tomadores, emissão, transmissão, cancelamento, acompanhamento de status, download de PDF/XML e relatórios.
- **NFS-e Recorrente**: cadastro de recorrências para emissão automática por tomador, serviço, frequência e intervalo.
- **Contabilidade**: documentos, impostos, solicitações e processos integrados à Acessórias, com cache local e anexos armazenados.
- **Controle**: estrutura inicial para apresentações contábeis e indicadores por departamento via e-Kontroll.

## Integrações

### NFS-e Nacional

Integração com a API nacional de NFS-e para transmissão, consulta de status, cancelamento e obtenção de arquivos fiscais. O sistema suporta ambiente de homologação/produção conforme parametrização da empresa.

### Acessórias

Integração com `https://api.acessorias.com` usando token configurado somente no backend. Os dados consultados são persistidos localmente para evitar depender de chamadas externas a cada navegação. Arquivos de documentos/impostos são baixados para `storage/accounting` quando a API retorna anexos.

Funcionalidades estruturadas:

- sincronização de documentos, impostos/guias, solicitações e processos;
- abertura de nova solicitação pelo portal, encaminhando para a Acessórias;
- respostas em formato de histórico/chat, reabertura, finalização e avaliação de solicitações;
- atualização manual e atualização periódica das solicitações para capturar retornos de analistas;
- download local de anexos já armazenados.

### e-Kontroll

Integração preparada no backend para o menu Controle, usando chaves somente no `.env`. A tela inicial exibe indicadores sugeridos para Contábil, Fiscal e Departamento Pessoal, pronta para receber os métodos oficiais definidos para cada departamento.

### E-mail

Quando uma NFS-e é autorizada, o backend pode enviar e-mail ao tomador com texto informativo e anexos PDF/XML. O envio depende de SMTP configurado no backend; se SMTP não estiver configurado, o sistema registra o envio como ignorado sem bloquear a emissão.

## Documentação Técnica

- [NFS-e Nacional](docs/nfse-nacional.md)
- [Acessórias](docs/acessorias.md)
- [e-Kontroll](docs/ekontroll.md)
- [Segurança de certificados](docs/seguranca-certificados.md)
- [Desenvolvimento local](docs/desenvolvimento-local.md)

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
EKONTROLL_API_KEY=change-me
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

## Segurança E Dados Sensíveis

- Tokens de APIs externas ficam apenas no backend e no `.env` local/ambiente seguro.
- Certificados digitais não devem expor senha nem nome de arquivo sensível na interface.
- Permissões são avaliadas por empresa e módulo, tanto na UI quanto no backend.
- Usuário sem permissão não deve conseguir acessar submódulos por link direto.
- Arquivos fiscais e contábeis devem ser servidos por endpoints autenticados, nunca por caminho público direto.
- Logs e mensagens de erro devem mostrar o necessário para diagnóstico sem vazar segredo, certificado ou payload sensível.

## Estado Atual

O módulo NFS-e já está funcional para parametrização, cadastro, emissão local, transmissão, sincronização de status, cancelamento, recorrências, relatórios, downloads e envio de e-mail quando SMTP estiver configurado. A integração Acessórias já possui cache local, armazenamento de anexos, listagens ordenáveis, abertura/resposta de solicitações e filtros de impostos. O menu Controle está estruturado para e-Kontroll, aguardando mapeamento final dos métodos oficiais de indicadores.

Próximos passos naturais:

- mapear os métodos e-Kontroll definitivos por departamento;
- evoluir telas de Contabilidade para workflows completos por departamento;
- evoluir relatórios para XLSX nativo quando necessário;
- implementar jobs backend para sincronizações periódicas fora da navegação do usuário;
- reforçar testes automatizados de permissões, emissão fiscal e integrações externas.
