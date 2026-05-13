# Seguranca de certificados digitais

## Contexto

Cada empresa cliente podera anexar um certificado digital A1, normalmente em formato `.pfx` ou `.p12`, para emissao de NFS-e.

Esse arquivo e a senha do certificado sao dados altamente sensiveis.

## Regras obrigatorias

1. Nunca salvar certificado sem criptografia.
2. Nunca salvar senha do certificado em texto puro.
3. Nunca retornar senha ou conteudo do certificado em respostas da API.
4. Nunca registrar senha ou conteudo do certificado em logs.
5. Validar se o certificado pertence ao CNPJ da empresa antes de liberar emissao.
6. Bloquear emissao com certificado vencido, invalido ou revogado.
7. Registrar auditoria de upload, validacao, substituicao e remocao.

## Fluxo de upload

1. Usuario seleciona empresa.
2. Usuario envia arquivo `.pfx` ou `.p12`.
3. Usuario informa senha.
4. Backend valida formato e senha.
5. Backend extrai metadados: titular, emissor, serial, validade.
6. Backend compara titularidade com CNPJ da empresa.
7. Backend criptografa arquivo e senha.
8. Backend salva metadados e caminho criptografado.

## Armazenamento no MVP

No MVP, o arquivo pode ser armazenado localmente em pasta fora do Git:

```txt
storage/certificates/{companyId}/{certificateId}.enc
```

A pasta `storage` deve permanecer no `.gitignore`.

## Armazenamento futuro

Em producao madura, considerar:

- S3 privado;
- Cloudflare R2;
- cofre de segredos;
- rotacao de chave de criptografia;
- backup criptografado.

## Variaveis de ambiente

```env
CERTIFICATE_ENCRYPTION_KEY=change-me-32-bytes-minimum
STORAGE_DRIVER=local
STORAGE_PATH=./storage
```

## Auditoria minima

Eventos a registrar:

- upload de certificado;
- validacao bem-sucedida;
- validacao com erro;
- substituicao de certificado;
- remocao/revogacao interna;
- tentativa de emissao com certificado invalido.
