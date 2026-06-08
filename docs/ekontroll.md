# Integração e-Kontroll

## Objetivo

O menu Controle será a camada de apresentações contábeis do Portal do Cliente. A integração com a e-Kontroll deve apoiar indicadores e gráficos dos departamentos Contábil, Fiscal e Departamento Pessoal.

## Documentação Oficial

Base pública consultada:

- `https://bc.e-kontroll.com.br/base-de-conhecimento/documentacao/`
- Endpoint de métodos indicado pela documentação: `https://app.e-kontroll.com.br/api/v1/metodo/*`

A documentação organiza métodos em grupos como dados do escritório, operacional e volumetria de departamentos. A API usa chaves de acesso que devem ficar apenas no backend.

## Configuração

```env
EKONTROLL_API_BASE_URL=https://app.e-kontroll.com.br/api/v1/metodo
EKONTROLL_API_KEY=change-me
EKONTROLL_API_KEY_EMPRESA=
EKONTROLL_API_KEY_CLIENTE=
```

Não versionar chaves reais. O backend deve montar as chamadas e entregar ao frontend somente dados normalizados.

## Tela Controle

Submenus planejados:

- Visão geral
- Contábil
- Fiscal
- Departamento pessoal

Indicadores iniciais sugeridos:

- Contábil: receita bruta, resultado líquido, EBITDA, liquidez corrente, endividamento e despesas por centro.
- Fiscal: carga tributária efetiva, tributos por competência, créditos fiscais, obrigações entregues, pendências e comparativo de regime tributário.
- Departamento pessoal: total de colaboradores, folha bruta, encargos/provisões, admissões/demissões, turnover e férias/afastamentos.

## Implementação Atual

O backend já possui módulo `ControlModule` e serviço `EkontrollApiService`. A tela exibe os departamentos e catálogo de indicadores, ficando pronta para conectar métodos oficiais específicos por variável de ambiente quando o mapeamento final for definido.

Variáveis opcionais para mapear métodos por departamento:

```env
EKONTROLL_METHOD_ACCOUNTING=
EKONTROLL_METHOD_TAX=
EKONTROLL_METHOD_PAYROLL=
```

## Segurança

- Nunca expor `EKONTROLL_API_KEY` no frontend, README ou logs.
- Tratar respostas externas como dados não confiáveis e normalizar antes de retornar ao web.
- Registrar falhas de integração sem persistir segredos.
