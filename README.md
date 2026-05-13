# nfse

Sistema para emissao, consulta e gerenciamento de NFS-e para clientes da Zip Contabilidade.

## Objetivo

Criar uma plataforma SaaS onde cada cliente acessa com login e senha, cadastra suas empresas, anexa o certificado digital A1 por CNPJ e emite NFS-e usando a API nacional.

## Stack inicial

- Backend: NestJS + TypeScript
- Frontend: Next.js + TypeScript
- Banco: PostgreSQL
- ORM: Prisma
- Fila futura: Redis + BullMQ
- Arquivos: armazenamento local no MVP; objeto/S3 depois

## Estrutura

```txt
apps/
  api/       Backend NestJS
  web/       Frontend Next.js
packages/
  shared/    Tipos e contratos comuns
infra/
  database/  Scripts e notas do banco
docs/        Documentacao do projeto
```

## Primeiros comandos locais

```bash
cp .env.example .env
docker compose up -d
npm install
npm run dev
```

## MVP planejado

1. Login basico
2. Cadastro de empresas
3. Upload e validacao de certificado A1
4. Cadastro de tomadores
5. Emissao mockada de NFS-e
6. Geracao de XML e PDF mockados
7. Historico de emissoes
8. Integracao real com ambiente de producao restrita da NFS-e Nacional

## Decisoes importantes

- Nunca salvar certificado ou senha em texto puro.
- Todo acesso deve ser restrito por usuario e empresa.
- Toda emissao deve gerar log de auditoria.
- O XML e o PDF da NFS-e devem ser armazenados e disponibilizados ao cliente.
