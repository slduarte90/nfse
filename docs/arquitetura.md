# Arquitetura do projeto NFSe

## Visao geral

O projeto sera uma plataforma SaaS para clientes da Zip Contabilidade emitirem NFS-e pela API nacional.

Fluxo principal:

1. Cliente acessa o sistema com login e senha.
2. Cliente seleciona ou cadastra uma empresa.
3. Cliente anexa certificado digital A1 da empresa.
4. Sistema valida e armazena o certificado de forma criptografada.
5. Cliente cadastra tomador e dados do servico.
6. Sistema gera a DPS/XML.
7. Sistema envia a DPS para a API NFS-e Nacional.
8. Sistema salva retorno, XML, PDF e logs de auditoria.

## Componentes

### Frontend

Aplicacao Next.js responsavel por:

- login;
- painel;
- cadastro de empresas;
- upload de certificado;
- cadastro de tomadores;
- emissao de NFS-e;
- historico;
- visualizacao/download de PDF e XML.

### Backend

API NestJS responsavel por:

- autenticacao;
- autorizacao por empresa;
- regras de negocio;
- criptografia de certificados;
- integracao com API nacional;
- geracao de PDF/XML no MVP;
- logs de auditoria.

### Banco de dados

PostgreSQL com Prisma.

Tabelas iniciais:

- users
- companies
- company_users
- digital_certificates
- customers
- nfse_invoices
- nfse_events
- stored_files
- audit_logs

### Storage

No MVP, arquivos serao armazenados localmente em uma pasta ignorada pelo Git.

Arquivos previstos:

- certificado A1 criptografado;
- XML enviado/recebido;
- PDF da NFS-e;
- logs tecnicos, quando necessario.

Em producao, o ideal sera migrar para storage privado como S3, Cloudflare R2 ou equivalente.

## Separacao por cliente/empresa

Todo recurso sensivel deve estar vinculado a uma empresa.

Um usuario pode ter acesso a varias empresas via tabela `company_users`.

Toda consulta ou emissao deve validar:

- usuario autenticado;
- empresa ativa;
- vinculo usuario/empresa;
- permissao do usuario;
- certificado valido quando a operacao exigir emissao.

## Estrategia de desenvolvimento

### Fase 1 - MVP mockado

- Login basico.
- Cadastro de empresas.
- Cadastro de tomadores.
- Emissao mockada.
- XML e PDF mockados.
- Historico de notas.

### Fase 2 - Certificado

- Upload .pfx/.p12.
- Validacao de senha.
- Leitura de vencimento e titularidade.
- Criptografia e armazenamento seguro.

### Fase 3 - API real

- Geracao real da DPS.
- Validacao contra schema.
- Chamada para ambiente de producao restrita.
- Persistencia do XML autorizado.
- Geracao/obtencao do PDF.
- Tratamento de rejeicoes.

## Decisoes de seguranca

- Nao salvar senha do usuario em texto puro.
- Nao salvar certificado ou senha do certificado em texto puro.
- Nao imprimir dados sensiveis em logs.
- Registrar auditoria das operacoes fiscais.
- Isolar acesso por empresa.
