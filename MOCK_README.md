# 📦 Sistema de Dados Mockados — Portal de Obras PMJG

## Como funciona

Em vez de consultar a API do TCEPE a cada visita (o que pode falhar por bloqueio ou instabilidade), o portal agora opera em **dois modos automáticos**:

| Modo | Quando ativa | O que faz |
|------|-------------|-----------|
| **MOCK** | `dados_mock.json` existe na pasta | Lê os dados salvos localmente, zero requisições ao TCEPE |
| **LIVE** | `dados_mock.json` não existe | Comporta-se como antes, consultando a API ao vivo |

A detecção é automática — você não precisa mudar nenhuma configuração.

---

## Fluxo de uso

### 1. Coletar dados (fazer uma vez agora, repetir quando quiser atualizar)

```bash
# 1. Certifique-se que o proxy está rodando
node proxy.js

# 2. Em outro terminal, rode o coletor
node coletar_dados.js
```

O coletor vai:
- Buscar todas as geometrias do município P083
- Baixar todas as obras relacionadas
- Buscar instrumento jurídico, participantes, execução financeira, itens e documentos de **cada** obra
- Salvar tudo em `dados_mock.json`

A coleta leva alguns minutos dependendo do número de obras. Você verá uma barra de progresso por etapa.

### 2. Usar o portal normalmente

```bash
node proxy.js
# Acesse: http://localhost:5018
```

O proxy vai detectar o `dados_mock.json` automaticamente e exibir no terminal:

```
📦  MODO MOCK — 87 obras em dados_mock.json
    Coletado em: 28/05/2026 14:35:00
    Para atualizar: node coletar_dados.js
```

### 3. Atualizar os dados (quando quiser dados frescos)

```bash
node coletar_dados.js
```

Isso sobrescreve o `dados_mock.json` com dados novos. O portal passa a usar os novos dados na próxima vez que for acessado (sem precisar reiniciar o proxy).

---

## Arquivos modificados / adicionados

```
pasta-do-projeto/
├── api.js              ← MODIFICADO — detecta e usa mock automaticamente
├── proxy.js            ← MODIFICADO — serve /mock-status e /mock-dados
├── coletar_dados.js    ← NOVO — script de coleta (roda no Node.js)
├── dados_mock.json     ← GERADO — criado pelo coletar_dados.js
│
├── config.js           (sem alteração)
├── detalheObra.js      (sem alteração)
├── exportador.js       (sem alteração)
├── obras.js            (sem alteração)
├── index.html          (sem alteração)
├── obra.html           (sem alteração)
├── style.css           (sem alteração)
└── README.md           (sem alteração)
```

---

## Estrutura do dados_mock.json

```json
{
  "_meta": {
    "coletadoEm": "2026-05-28T17:35:00.000Z",
    "municipio": "P083",
    "versao": "1.0"
  },
  "geometrias":       [...],   // todas as geometrias do município
  "obras":            [...],   // obras filtradas para o município
  "instrumentos":     { "123": [...], ... },
  "participantes":    { "123": [...], ... },
  "execucoes":        { "456": [...], ... },
  "geometriasPorObra":{ "456": [...], ... },
  "itens":            { "123": [...], ... },
  "documentos":       { "123": [...], ... }
}
```

---

## Parâmetros opcionais do coletor

```bash
# Usar outro proxy
PROXY_URL=http://localhost:4000 node coletar_dados.js

# Lotes maiores (mais rápido, mais carga na API)
BATCH_SIZE=20 node coletar_dados.js

# Salvar em outro arquivo
OUTPUT=backup_maio.json node coletar_dados.js
```

---

## Endpoints novos no proxy

| Endpoint | Resposta |
|----------|----------|
| `GET /mock-status` | `{ disponivel, coletadoEm, obras, arquivo }` |
| `GET /mock-dados`  | conteúdo completo do `dados_mock.json` |

---

## Perguntas frequentes

**Posso manter vários arquivos de backup?**  
Sim. O proxy sempre lê o arquivo chamado `dados_mock.json`. Para guardar uma versão anterior, basta renomear: `cp dados_mock.json dados_mock_2026-05.json`.

**O que acontece se o mock existir mas estiver corrompido?**  
O proxy registra o erro no terminal e continua em modo LIVE (sem travar).

**E se eu quiser forçar o modo LIVE mesmo com o mock existindo?**  
Renomeie ou apague o `dados_mock.json` temporariamente.

**A página de detalhes da obra (obra.html) também usa o mock?**  
Sim. Todos os dados — execução financeira, itens do contrato, documentos e geometria do mapa — são servidos pelo mock quando disponível.
