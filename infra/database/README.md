# Banco de dados

O projeto usa PostgreSQL com Prisma.

## Subir banco local

```bash
docker compose up -d postgres
```

## Gerar Prisma Client

```bash
npm run db:generate
```

## Criar migration local

```bash
npm run db:migrate
```

## Abrir Prisma Studio

```bash
npm run db:studio
```

## Banco local padrao

```txt
Host: localhost
Porta: 5432
Usuario: nfse
Senha: nfse
Database: nfse
```

A URL fica em `.env`:

```env
DATABASE_URL="postgresql://nfse:nfse@localhost:5432/nfse?schema=public"
```
