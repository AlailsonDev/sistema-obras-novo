# 🚀 Guia de Instalação e Uso

## Portal de Obras Públicas - Jaboatão dos Guararapes
### Versão 2.0 - Com Filtro por Unidade Jurisdicionada

---

## 📋 Requisitos

- **Node.js** versão 12 ou superior
- Navegador moderno (Chrome, Firefox, Safari, Edge)
- Conexão com internet (para acessar API do TCEPE)

---

## 🔧 Instalação

### 1. **Baixe todos os arquivos**

Certifique-se de ter todos estes arquivos na mesma pasta:

```
pasta-do-projeto/
├── api.js
├── config.js              ← NOVO! Arquivo de configuração
├── detalheObra.js
├── exportador.js
├── index.html
├── obra.html
├── obras.js
├── proxy.js
├── style.css
└── README.md
```

### 2. **Abra o terminal na pasta do projeto**

**Windows:**
- Shift + Clique direito na pasta → "Abrir janela do PowerShell aqui"
- ou Shift + Clique direito → "Abrir no Terminal"

**Mac/Linux:**
- Clique direito na pasta → "Abrir no Terminal"
- ou use `cd /caminho/da/pasta`

### 3. **Inicie o servidor**

```bash
node proxy.js
```

Você verá:
```
✅  http://localhost:5018
🔍  Debug: http://localhost:5018/debug?e=Remessa_Obra
```

### 4. **Acesse no navegador**

Abra: **http://localhost:5018**

---

## ⚙️ Configuração do Filtro

### Arquivo `config.js`

Este arquivo controla o comportamento do filtro. Você pode editá-lo para personalizar:

```javascript
export const CONFIG = {
  // Padrões que identificam a Prefeitura Municipal
  PREFEITURA_PATTERNS: [
    /prefeitura\s+municipal\s+(do|de)?\s*jaboat[ãa]o/i,
    /^prefeitura\s+municipal$/i,
    /pmjg/i,
  ],

  // O que fazer com obras sem informação de unidade?
  INCLUIR_SEM_UNIDADE: true,  // true = incluir | false = excluir

  // Subunidades para excluir (opcional)
  SUBUNIDADES_EXCLUIDAS: [],

  // Unidades adicionais para incluir (opcional)
  UNIDADES_ADICIONAIS: [],

  // Tamanho do lote de processamento
  BATCH_SIZE: 10,

  // Mostrar contador de obras filtradas
  MOSTRAR_CONTADOR_FILTRADAS: false,

  // Modo debug (logs no console)
  DEBUG_MODE: false,

  // Modo teste (desativa filtro)
  MODO_TESTE_SEM_FILTRO: false,
};
```

---

## 🔍 Como usar o Modo Debug

### 1. Ativar debug no `config.js`:

```javascript
DEBUG_MODE: true,
```

### 2. Abrir Console do Navegador:

- **Chrome/Edge**: F12 ou Ctrl+Shift+I
- **Firefox**: F12 ou Ctrl+Shift+K
- **Safari**: Cmd+Option+I

### 3. Verificar logs:

```
[OBRAS DEBUG] Processando lote 1 de 5
[OBRAS DEBUG] Verificando unidade: "Prefeitura Municipal..." => INCLUÍDA
[OBRAS DEBUG] Verificando unidade: "COMPESA" => EXCLUÍDA
[OBRAS DEBUG] Total de obras processadas: 50/50
[OBRAS DEBUG] Obras filtradas (excluídas): 12
[OBRAS DEBUG] Obras incluídas: 38
```

---

## 🧪 Modo Teste (Ver TODAS as obras)

Para verificar quantas obras estão sendo filtradas:

### 1. Em `config.js`, ative:

```javascript
MODO_TESTE_SEM_FILTRO: true,
MOSTRAR_CONTADOR_FILTRADAS: true,
```

### 2. Recarregue a página

Você verá TODAS as obras (inclusive de outros órgãos).

### 3. No console, veja:

```
ℹ️ 15 obra(s) de outros órgãos foram filtradas
```

---

## 🎯 Exemplos de Configuração

### Exemplo 1: Incluir apenas Prefeitura (mais restritivo)

```javascript
INCLUIR_SEM_UNIDADE: false,  // Exclui obras sem info de unidade
SUBUNIDADES_EXCLUIDAS: [],
UNIDADES_ADICIONAIS: [],
```

### Exemplo 2: Incluir Prefeitura + Autarquias

```javascript
UNIDADES_ADICIONAIS: [
  "EMLURB",
  "Fundação de Cultura",
  "Autarquia Municipal de Trânsito"
],
```

### Exemplo 3: Excluir determinadas secretarias

```javascript
SUBUNIDADES_EXCLUIDAS: [
  "Secretaria de Obras Estaduais",
  "Departamento de Obras Privadas"
],
```

---

## 📊 Entendendo o Filtro

### Como funciona:

1. **Busca geometrias** do município P083 (Jaboatão)
2. **Busca obras** relacionadas a essas geometrias
3. **Busca instrumento jurídico** de cada obra (contrato/convênio)
4. **Verifica unidade responsável** no campo `unidadeJurisdicionadaNome`
5. **Aplica filtros** configurados em `config.js`
6. **Retorna apenas** obras da Prefeitura Municipal

### Obras incluídas:

✅ "Prefeitura Municipal do Jaboatão dos Guararapes"  
✅ "Prefeitura Municipal"  
✅ "PMJG"  

### Obras excluídas:

❌ "COMPESA - Companhia Pernambucana de Saneamento"  
❌ "Governo do Estado de Pernambuco"  
❌ "CPRH"  
❌ Outros órgãos estaduais ou federais

---

## 🚨 Solução de Problemas

### Problema: "Nenhuma obra encontrada"

**Possíveis causas:**

1. **Filtro muito restritivo**
   - Solução: Ative `INCLUIR_SEM_UNIDADE: true`

2. **Padrões incorretos**
   - Solução: Ative `DEBUG_MODE: true` e verifique os logs

3. **API offline**
   - Solução: Teste em http://localhost:5018/debug

### Problema: "Aparecendo obras de outros órgãos"

**Solução:**

1. Ative o modo debug
2. Verifique quais unidades estão sendo incluídas
3. Ajuste os padrões em `PREFEITURA_PATTERNS`

### Problema: "Muito lento"

**Solução:**

Aumente o `BATCH_SIZE` em `config.js`:

```javascript
BATCH_SIZE: 20,  // Processa 20 obras por vez
```

---

## 📁 Estrutura de Dados

### Obra retornada pela API:

```javascript
{
  obraId: 12345,
  descricaoGeometria: "Pavimentação da Rua...",
  informacoesAdicionais: "Obra de infraestrutura...",
  situacaoObraNome: "Em andamento",
  totalPago: 150000.00,
  totalMedido: 180000.00,
  
  // NOVO: Informações da unidade
  unidadeJurisdicionadaNome: "Prefeitura Municipal do Jaboatão...",
  unidadeJurisdicionadaId: 456,
  subunidadeJurisdicionadaNome: "Secretaria de Infraestrutura"
}
```

---

## 🔗 Links Úteis

- **API TCEPE**: https://sistemas.tcepe.tc.br/DadosAbertos/Exemplo!listar
- **Documentação RemessaTCEPE**: https://sistemas.tcepe.tc.br/DadosAbertos/
- **Repositório**: (adicione o link do seu repositório aqui)

---

## 📞 Suporte

Em caso de dúvidas ou problemas:

1. Verifique o arquivo `README.md`
2. Ative o `DEBUG_MODE` e analise os logs
3. Teste com `MODO_TESTE_SEM_FILTRO: true`

---

## 📝 Changelog

### Versão 2.0 (Atual)
- ✅ Filtro por Unidade Jurisdicionada
- ✅ Arquivo de configuração (`config.js`)
- ✅ Modo debug
- ✅ Processamento em lotes
- ✅ Logs detalhados

### Versão 1.0
- ✅ Listagem de obras
- ✅ Detalhes de obras
- ✅ Exportação CSV/Excel
- ✅ Mapa de localização

---

**Desenvolvido para a Prefeitura Municipal do Jaboatão dos Guararapes**  
**Dados fornecidos por**: Tribunal de Contas do Estado de Pernambuco (TCEPE)
