# Integração Acessórias

## Objetivo

A integração com a Acessórias alimenta o módulo Contabilidade do Portal do Cliente. Ela cobre documentos, impostos, solicitações e processos, sempre com cache local para reduzir dependência de chamadas externas em cada navegação.

## Configuração

As credenciais ficam somente no backend, via variáveis de ambiente:

```env
ACESSORIAS_API_BASE_URL=https://api.acessorias.com
ACESSORIAS_API_TOKEN=change-me
ACESSORIAS_ATTACHMENT_FIELD=arquivo[]
ACESSORIAS_FILE_ALLOWED_HOSTS=acessorias.com
```

Não versionar tokens reais. Arquivos baixados da Acessórias ficam no storage local e são servidos apenas por endpoints autenticados.

## Fluxos Implementados

- Documentos: consulta entregas da Acessórias, normaliza dados e armazena anexos locais quando disponíveis.
- Impostos: exibe somente guias/documentos entregues, com data de envio, vencimento, departamento e arquivo local.
- Solicitações: permite abrir solicitação com anexos, responder como cliente, reabrir quando finalizada e avaliar atendimento.
- Processos: consulta processos vinculados à empresa e exibe histórico/etapas quando retornados pela API.

## Regras De UX

- Solicitações aparecem em formato de chat: cliente à direita, contabilidade à esquerda e eventos de sistema centralizados.
- O cliente não altera manualmente o status para "Cliente"; respostas enviadas pelo portal retornam para a contabilidade como "Resolvendo".
- Ao finalizar pelo portal, a solicitação pode receber avaliação e, se necessário, reabertura.
- Impostos usam filtros responsivos por busca, departamento e período, com paginação 20/50/100.

## Armazenamento Local

Registros ficam em `AccountingRecord` e anexos em `AccountingFile`. A listagem principal lê o cache local; a sincronização manual ou automática atualiza esse cache a partir da Acessórias.

## Pontos De Atenção

- A API da Acessórias pode variar nomes de campos entre endpoints; o normalizador deve continuar tolerante a aliases.
- Arquivos externos só devem ser baixados de hosts liberados em `ACESSORIAS_FILE_ALLOWED_HOSTS`.
- Erros de sincronização devem ficar em `AccountingSync.lastError` sem expor token, payload sensível ou link assinado.
