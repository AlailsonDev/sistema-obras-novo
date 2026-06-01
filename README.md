# Portal de Obras Públicas - Jaboatão dos Guararapes

## ⚠️ ATUALIZAÇÃO - Filtro por Unidade Jurisdicionada

Esta versão foi atualizada para exibir **APENAS** as obras realizadas pela **Prefeitura Municipal do Jaboatão dos Guararapes**.

### O que mudou?

#### 1. **Filtro Inteligente de Unidade Jurisdicionada**
O sistema agora:
- Busca informações do Instrumento Jurídico de cada obra
- Verifica a Unidade Jurisdicionada responsável pela obra
- Filtra apenas obras da Prefeitura Municipal do Jaboatão dos Guararapes
- Exclui obras de outros órgãos como Compesa, Estado, etc.

#### 2. **Alterações no arquivo `api.js`**

**Novidades:**
```javascript
// Padrões para identificar a Prefeitura Municipal
const PREFEITURA_PATTERNS = [
  /prefeitura\s+municipal\s+(do|de)?\s*jaboat[ãa]o/i,
  /^prefeitura\s+municipal$/i,
  /pmjg/i
];

function isPrefeituraJaboatao(unidadeNome) {
  // Verifica se a unidade é a Prefeitura Municipal
}
```

**Modificações na função `buscarObras()`:**
- Agora busca dados de `Remessa_InstrumentoJuridico` para cada obra
- Obtém o campo `unidadeJurisdicionadaNome`
- Filtra apenas obras onde a unidade seja a Prefeitura Municipal
- Processa em lotes de 10 obras para evitar sobrecarga

**Nova função:**
```javascript
export async function buscarUnidadeJurisdicionada(instrumentoJuridicoId)
```
Permite consultar informações completas da unidade jurisdicionada.

#### 3. **Campos adicionados ao objeto Obra**
```javascript
{
  // ... campos existentes
  unidadeJurisdicionadaNome: "Prefeitura Municipal do Jaboatão dos Guararapes",
  unidadeJurisdicionadaId: 12345,
}
```

### Como funciona o filtro?

1. **Busca de Geometrias**: Continua buscando todas as geometrias do município P083
2. **Busca de Obras**: Busca todas as obras relacionadas
3. **Busca de Instrumentos Jurídicos**: Para cada obra, busca o instrumento jurídico associado
4. **Verificação da Unidade**: Verifica se `unidadeJurisdicionadaNome` contém:
   - "Prefeitura Municipal do Jaboatão" (ou "Jaboatão")
   - "Prefeitura Municipal" (quando é a única do município)
   - "PMJG" (sigla)
5. **Filtragem**: Mantém apenas obras da Prefeitura Municipal

### Comportamento com dados sem Unidade

Se uma obra não possui informação de `unidadeJurisdicionadaNome`:
- **Atualmente**: A obra é **incluída** por segurança (pode ser dado antigo)
- **Para ser mais restritivo**: Altere linha 115 em `api.js` de `return true;` para `return false;`

### Performance

O sistema agora faz requisições adicionais para buscar instrumentos jurídicos:
- **Processamento em lotes**: 10 obras por vez
- **Requisições em paralelo**: Múltiplas obras processadas simultaneamente
- **Cache no navegador**: Reduz requisições repetidas

### Testando a aplicação

1. **Inicie o servidor proxy**:
   ```bash
   node proxy.js
   ```

2. **Acesse**: http://localhost:5030

3. **Verifique**: As obras exibidas devem ser apenas da Prefeitura Municipal

### Arquivos modificados

- ✅ `api.js` - **MODIFICADO** - Adicionado filtro por unidade jurisdicionada
- ✅ `detalheObra.js` - Sem alterações
- ✅ `exportador.js` - Sem alterações
- ✅ `obras.js` - Sem alterações
- ✅ `index.html` - Sem alterações
- ✅ `obra.html` - Sem alterações
- ✅ `style.css` - Sem alterações
- ✅ `proxy.js` - Sem alterações

### Possíveis ajustes futuros

1. **Filtro mais específico**: Se houver múltiplas unidades da Prefeitura (secretarias, autarquias), pode-se ajustar os padrões em `PREFEITURA_PATTERNS`

2. **Exclusão de subunidades**: Se necessário excluir obras de subunidades específicas, adicionar filtro em `subunidadeJurisdicionadaNome`

3. **Mensagem de "Obra Filtrada"**: Adicionar contador de obras filtradas para transparência

### Dados da API utilizados

**Endpoint**: `Remessa_InstrumentoJuridico`
**Campos relevantes**:
- `unidadeJurisdicionadaNome` - Nome da unidade responsável
- `unidadeJurisdicionadaId` - ID da unidade
- `unidadeJurisdicionadaCodigoTCE` - Código TCE da unidade
- `subunidadeJurisdicionadaNome` - Subunidade (se houver)

### Suporte

Em caso de dúvidas ou necessidade de ajustes nos padrões de filtro, os valores podem ser modificados no início do arquivo `api.js`.

---

**Versão**: 2.0 - Filtro por Unidade Jurisdicionada  
**Data**: 2026  
**Desenvolvedor**: Portal de Transparência - Jaboatão dos Guararapes
