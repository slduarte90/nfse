# Desenvolvimento local

## Requisitos

- Node.js 20 ou superior
- npm 10 ou superior
- Docker e Docker Compose
- Git

## Preparar ambiente

Clone o repositorio e instale as dependencias:

```bash
git clone https://github.com/slduarte90/nfse.git
cd nfse
cp .env.example .env
npm install
```

## Subir banco

```bash
docker compose up -d postgres
```

## Preparar Prisma

```bash
npm run db:generate
npm run db:migrate
```

## Rodar projeto

```bash
npm run dev
```

Servicos esperados:

```txt
Frontend: http://localhost:3000
Backend:  http://localhost:3333
Health:   http://localhost:3333/health
```

## Testes

```bash
npm test
```

## Proxima etapa de implementacao

1. Modulo de autenticacao.
2. Cadastro/listagem de empresas.
3. Cadastro/listagem de tomadores.
4. Emissao mockada de NFS-e.
5. Geracao mockada de XML e PDF.
6. Tela de historico com download de PDF/XML.
