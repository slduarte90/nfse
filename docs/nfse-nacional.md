# Integracao com NFS-e Nacional

## Objetivo

Documentar a estrategia de integracao com a API nacional de NFS-e.

## Ambientes

Inicialmente o projeto deve trabalhar com ambiente de producao restrita/homologacao.

Variaveis previstas:

```env
NFSE_ENV=restricted-production
NFSE_BASE_URL=https://adn.producaorestrita.nfse.gov.br
```

## Fluxo esperado

1. Sistema recebe dados da nota pelo frontend.
2. Backend valida dados obrigatorios.
3. Backend carrega certificado A1 da empresa.
4. Backend gera DPS/XML.
5. Backend envia XML para API nacional.
6. API retorna autorizacao, processamento ou rejeicao.
7. Backend salva XML, retorno e status.
8. Backend gera ou recupera PDF da NFS-e.
9. Cliente visualiza historico e baixa XML/PDF.

## Estrategia para MVP

Antes de chamar a API real, o backend tera um emissor mockado.

O emissor mockado deve:

- aceitar payload de emissao;
- gerar um XML simples de exemplo;
- gerar um PDF simples de exemplo;
- retornar status autorizado ou rejeitado para testes;
- salvar todos os dados no banco.

Isso permite validar tela, banco, permissao e fluxo antes de lidar com regras fiscais reais.

## Pontos de atencao

- Alguns municipios podem ter regras especificas.
- O cadastro de servicos e codigos municipais precisa ser flexivel.
- A emissao deve bloquear certificado vencido, invalido ou incompatível com o CNPJ.
- Rejeicoes devem ser salvas integralmente para suporte ao cliente.
- Logs nao devem expor senha do certificado ou conteudo sensivel desnecessario.
