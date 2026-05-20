# Integracao com NFS-e Nacional

## Fontes oficiais consultadas

- Documentacao tecnica atual: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual
- APIs de producao restrita e producao: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/apis-prod-restrita-e-producao
- Emissor Nacional: https://www.nfse.gov.br/EmissorNacional/Login?ReturnUrl=%2fEmissorNacional

Consulta atualizada em 20/05/2026. A pagina oficial indica documentacao tecnica atualizada em 17/04/2026 e publica manuais de contribuinte, layouts, documentos XML/XSD e links de APIs Swagger.

## Componentes oficiais relevantes

- Emissor Publico Nacional: portal usado pelo contribuinte para emissao manual e parametrizacao operacional.
- SEFIN Nacional: API de emissao e consulta de NFS-e/DPS. A documentacao oficial lista endpoints como `POST /nfse`, `GET /nfse/{chaveAcesso}`, `GET /dps/{id}`, `HEAD /dps/{id}`, `GET /dfe/{NSU}` e eventos relacionados.
- Parametros Municipais: API para consultar regras e configuracoes municipais que afetam a emissao.
- ADN Nacional: ambiente de distribuicao de documentos fiscais eletronicos e eventos.
- DANFSE: servico oficial para representacao/impressao quando aplicavel.

## Ambientes

O projeto deve iniciar pela producao restrita para validar certificado, payloads, XML e retorno sem impacto fiscal real.

Variaveis previstas:

```env
NFSE_ENV=restricted-production
NFSE_BASE_URL=https://sefin.producaorestrita.nfse.gov.br
NFSE_ADN_BASE_URL=https://adn.producaorestrita.nfse.gov.br
```

## Fluxo esperado

1. Frontend coleta dados da DPS/NFS-e com mascaras e validacoes locais.
2. Backend valida permissao, empresa, tomador, servico, municipio IBGE e valores.
3. Backend carrega o certificado A1 ativo da empresa.
4. Backend bloqueia certificado vencido, invalido, desvinculado ou incompativel com o CNPJ.
5. Backend gera DPS/XML conforme layout nacional vigente.
6. Backend transmite para a SEFIN Nacional no ambiente configurado.
7. API retorna autorizacao, processamento ou rejeicao.
8. Backend persiste status, XML enviado, retorno integral, eventos e arquivos baixaveis.
9. Cliente visualiza historico e baixa XML/PDF em lote.

## Estrategia para MVP

Antes de chamar a API real, o backend mantem um emissor mockado.

O emissor mockado deve:

- aceitar payload de emissao;
- gerar XML simples de exemplo;
- gerar PDF simples de exemplo;
- retornar status autorizado ou rejeitado para testes;
- salvar todos os dados no banco.

Isso permite validar tela, banco, permissao, Docker/Postgres e fluxo modular antes de lidar com regras fiscais reais.

## Modelo modular do projeto

- `apps/api`: NestJS, regras de negocio, Prisma, certificado, emissao, consultas e persistencia.
- `apps/web`: Next/React, telas por empresa, parametrizacao, tomadores, emissao e notas fiscais.
- Prisma: schema relacional e migrations versionadas.
- Docker/Postgres local: ambiente de teste para banco e migrations.

## Parametrizacao da tela

Campos que precisam ficar na parametrizacao principal:

- municipio/codigo IBGE: usado para direcionar regras municipais e preencher a DPS;
- inscricao municipal: dado do prestador exigido por muitos municipios e necessario para consistencia cadastral;
- certificado A1 valido e pertencente ao CNPJ da empresa: necessario para comunicacao/autenticacao/assinatura;
- perfis de servico: atalho operacional para preencher codigo nacional, codigo municipal, aliquota e descricao na DPS.

Campos que nao precisam poluir a tela principal:

- ambiente, URL base e versao da API: parametros tecnicos de suporte;
- regime tributario, incentivo fiscal e retencao padrao: regras fiscais operacionais, mantidas como opcionais porque podem variar por municipio, tomador e servico;
- natureza da operacao e serie/RPS: padroes internos para agilizar emissao, nao dados que o usuario precisa revisar em toda parametrizacao.

## Pontos de atencao

- Regras municipais variam; o modulo precisa consultar e armazenar parametros por municipio.
- Todo campo de municipio/IBGE deve permitir busca por nome e gravar o codigo IBGE.
- O cadastro de servicos e codigos municipais precisa ser flexivel.
- A emissao deve bloquear certificado vencido, invalido, desvinculado ou incompativel com o CNPJ.
- Rejeicoes devem ser salvas integralmente para suporte ao cliente.
- Logs nao devem expor senha do certificado ou conteudo sensivel desnecessario.
