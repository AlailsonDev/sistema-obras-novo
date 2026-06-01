/**
 * api.js — Portal de Obras PMJG
 *
 * MODO MOCK: quando o servidor encontra dados_mock.json, todas as requisições
 * são atendidas localmente (sem bater na API do TCEPE).
 * Para atualizar, rode:  node coletar_dados.js
 *
 * MODO LIVE: se dados_mock.json não existir, comporta-se exatamente como antes.
 */

import { CONFIG, deveIncluirUnidade, debugLog } from "./config.js";

const BASE_URL      = "/api";
const MUNICIPIO_COD = "P083";

// Valores inválidos no campo DescricaoGeometria
const DESCRICAO_INVALIDA = /^(n[ãa]o\s*(tem|temos|existe|h[aá])|sem\s*descri|n\/a|[-. ]+|canteiro|[aá]rea\s*\d*|jaboat[ãa]o( dos guararapes)?|início\s*$|regiona[il]\s*.*?|munic[íi]pio.*?|sede.*?|lote\s*\d*)$/i;

// ─── Detecção e carregamento do mock ────────────────────────────────────────

let _mockData  = null;   // null = não carregado ainda; false = não existe
let _mockPromise = null; // evita múltiplas requisições simultâneas

async function carregarMock() {
  if (_mockData !== null) return _mockData;
  if (_mockPromise)       return _mockPromise;

  _mockPromise = fetch("/mock-status")
    .then(r => r.ok ? r.json() : { disponivel: false })
    .then(status => {
      if (!status.disponivel) {
        console.info("ℹ️  Modo LIVE — dados_mock.json não encontrado. Usando API ao vivo.");
        _mockData = false;
        return false;
      }
      return fetch("/mock-dados")
        .then(r => r.json())
        .then(data => {
          _mockData = data;
          const dt  = data._meta?.coletadoEm
            ? new Date(data._meta.coletadoEm).toLocaleString("pt-BR")
            : "data desconhecida";
          console.info(
            `✅ Modo MOCK ativo — ${data.obras?.length || 0} obras carregadas.\n` +
            `   Coletado em: ${dt}\n` +
            `   Para atualizar: node coletar_dados.js`
          );
          return data;
        });
    })
    .catch(e => {
      console.warn("⚠️  Não foi possível verificar mock:", e.message, "— usando API ao vivo.");
      _mockData = false;
      return false;
    });

  return _mockPromise;
}

function mockAtivo() {
  return _mockData && typeof _mockData === "object";
}

// ─── fetchAPI com suporte a mock ────────────────────────────────────────────

/**
 * Rota de retorno do mock para cada endpoint.
 * Retorna os dados já extraídos (array) ou null se não souber responder.
 */
function responderDoMock(endpoint, params) {
  const m = _mockData;

  // Remessa_ObraGeometria
  if (endpoint.includes("Remessa_ObraGeometria")) {
    if (params.obraId) {
      return m.geometriasPorObra?.[String(params.obraId)] || [];
    }
    if (params.Municipio) {
      return m.geometrias || [];
    }
    return m.geometrias || [];
  }

  // Remessa_Obra
  if (endpoint.includes("Remessa_Obra") && !endpoint.includes("Execucao")) {
    if (params.obraId) {
      return (m.obras || []).filter(o => String(o.obraId) === String(params.obraId));
    }
    return m.obras || [];
  }

  // Remessa_ObraExecucao
  if (endpoint.includes("Remessa_ObraExecucao")) {
    if (params.obraId) {
      return m.execucoes?.[String(params.obraId)] || [];
    }
    return [];
  }

  // Remessa_InstrumentoJuridico
  if (endpoint.includes("Remessa_InstrumentoJuridico") &&
      !endpoint.includes("Itens") &&
      !endpoint.includes("Documento") &&
      !endpoint.includes("Participantes")) {
    if (params.instrumentoJuridicoId) {
      return m.instrumentos?.[String(params.instrumentoJuridicoId)] || [];
    }
    return [];
  }

  // Remessa_InstrumentoJuridicoItens
  if (endpoint.includes("Remessa_InstrumentoJuridicoItens")) {
    if (params.instrumentoJuridicoId) {
      return m.itens?.[String(params.instrumentoJuridicoId)] || [];
    }
    return [];
  }

  // Remessa_InstrumentoJuridicoDocumento
  if (endpoint.includes("Remessa_InstrumentoJuridicoDocumento")) {
    if (params.instrumentoJuridicoId) {
      return m.documentos?.[String(params.instrumentoJuridicoId)] || [];
    }
    return [];
  }

  // Remessa_InstrumentoJuridicoParticipantes
  if (endpoint.includes("Remessa_InstrumentoJuridicoParticipantes")) {
    const id = params.instrumentoJuridicoIdId || params.instrumentoJuridicoId;
    if (id) {
      return m.participantes?.[String(id)] || [];
    }
    return [];
  }

  // Remessa_ProcessoContratacao
  if (endpoint.includes("Remessa_ProcessoContratacao")) {
    // Não coletamos processos individualmente — retorna vazio (degradação graciosa)
    return [];
  }

  // SubunidadesUnidadesJurisdicionadas
  if (endpoint.includes("SubunidadesUnidadesJurisdicionadas")) {
    return [];
  }

  // ObrasDadosContratacao
  if (endpoint.includes("ObrasDadosContratacao")) {
    return [];
  }

  return null; // não reconhecido
}

async function fetchAPI(endpoint, params = {}, timeoutMs = CONFIG.REQUEST_TIMEOUT || 30000) {
  // Garante que o mock foi verificado antes de qualquer requisição
  await carregarMock();

  if (mockAtivo()) {
    const resultado = responderDoMock(endpoint, params);
    if (resultado !== null) {
      debugLog(`[MOCK] ${endpoint}`, params, `→ ${resultado.length} registro(s)`);
      return resultado;
    }
    // Endpoint não mapeado — cai no fetch normal (não deve acontecer em condições normais)
    console.warn(`[MOCK] Endpoint não mapeado: ${endpoint} — fazendo requisição ao vivo`);
  }

  // ── modo LIVE (comportamento original) ──────────────────────────────────
  const u = new URL(BASE_URL + endpoint, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (k !== "formato" && v !== null && v !== undefined && v !== "") {
      u.searchParams.append(k, v);
    }
  });

  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(u.toString(), {
      headers: { Accept: "application/json" },
      signal:  controller.signal,
    });
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error(`Tempo esgotado (${timeoutMs / 1000}s) em ${endpoint}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new Error(`Erro HTTP ${res.status}`);
  const raw = await res.json();
  let data = raw;
  if (raw?.resposta?.conteudo)              data = raw.resposta.conteudo;
  else if (raw?.conteudo)                   data = raw.conteudo;
  else if (Array.isArray(raw))              data = raw;
  else if (raw && typeof raw === "object")  data = [raw];
  return data;
}

// ─── O restante do arquivo é idêntico ao original ───────────────────────────

function isPrefeituraJaboatao(unidadeNome, subunidadeNome = null) {
  if (CONFIG.MODO_TESTE_SEM_FILTRO) {
    debugLog("Modo teste ativado - incluindo todas as obras");
    return true;
  }
  const resultado = deveIncluirUnidade(unidadeNome, subunidadeNome);
  debugLog(`Verificando unidade: "${unidadeNome}" / Subunidade: "${subunidadeNome}" => ${resultado ? "INCLUÍDA" : "EXCLUÍDA"}`);
  return resultado;
}

function isValido(str) {
  if (!str || str.trim().length < 4) return false;
  return !DESCRICAO_INVALIDA.test(str.trim());
}

function toTitleCase(str) {
  if (!str) return "";
  const min = ["de","da","do","das","dos","e","a","o","em","no","na","nos","nas"];
  return str.toLowerCase().split(" ").map((w, i) =>
    i === 0 || !min.includes(w) ? w.charAt(0).toUpperCase() + w.slice(1) : w
  ).join(" ");
}

const PAPEL_CONTRATANTE = /contratante|tomador|prefeitura|munic[ií]pio|unidade\s*jurisdicionada|órgão\s*contratante|administra[cç][aã]o\s*pública|fiscaliza|gestor\s*do\s*contrato/i;
const PAPEL_CONTRATADA  = /contratad|execut|fornecedor|adjudicat|vencedor|prestador|empreiteir/i;

export function formatarDocumento(doc) {
  if (!doc) return "";
  const d = String(doc).replace(/\D/g, "");
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
  return String(doc).trim();
}

function normalizarParticipante(p) {
  return {
    nome:      (p.participanteNome      || p.ParticipanteNome      || p.nome      || "").trim(),
    documento: (p.participanteDocumento || p.ParticipanteDocumento || p.documento || "").trim(),
    tipoId:    (p.tipoParticipanteId    || p.TipoParticipanteId    || p.tipoId    || "").trim().toUpperCase(),
    tipoNome:  (p.tipoParticipanteNome  || p.TipoParticipanteNome  || p.tipoNome  || "").trim(),
  };
}

function pareceContratante(part, unidadeNome = "") {
  if (PAPEL_CONTRATANTE.test(part.tipoNome)) return true;
  const nomeL = part.nome.toLowerCase();
  if (PAPEL_CONTRATANTE.test(nomeL)) return true;
  if (unidadeNome && nomeL && unidadeNome.toLowerCase().includes(nomeL.slice(0, 20))) return true;
  if (unidadeNome && nomeL.length > 10 && unidadeNome.toLowerCase() === nomeL) return true;
  return false;
}

export function extrairEmpresaContratada(participantes, unidadeNome = "") {
  if (!participantes?.length) return null;

  const lista = participantes.map(normalizarParticipante).filter(p => p.nome);
  if (!lista.length) return null;

  let candidatos = lista.filter(p => p.tipoId === "PJ" && !pareceContratante(p, unidadeNome));
  if (!candidatos.length) {
    candidatos = lista.filter(p => !pareceContratante(p, unidadeNome) && PAPEL_CONTRATADA.test(p.tipoNome));
  }
  if (!candidatos.length) {
    const naoContratante = lista.filter(p => !pareceContratante(p, unidadeNome));
    if (naoContratante.length >= 1) candidatos = naoContratante;
  }
  if (!candidatos.length) {
    candidatos = lista.filter(p => !PAPEL_CONTRATANTE.test(p.tipoNome));
  }

  const comPapelContratada = candidatos.filter(p => PAPEL_CONTRATADA.test(p.tipoNome));
  const escolhidos         = comPapelContratada.length ? comPapelContratada : candidatos;
  if (!escolhidos.length) return null;

  const principal = escolhidos[0];
  return {
    nome:               principal.nome,
    documento:          principal.documento,
    documentoFormatado: formatarDocumento(principal.documento),
    tipoParticipante:   principal.tipoNome || principal.tipoId || "—",
    todas: escolhidos.map(p => ({
      nome:               p.nome,
      documento:          p.documento,
      documentoFormatado: formatarDocumento(p.documento),
      tipoParticipante:   p.tipoNome || p.tipoId || "—",
    })),
  };
}

const cacheInstrumento = new Map();
const cacheProcesso    = new Map();
const cacheSubunidade  = new Map();
const cacheObraEmpresa = new Map();

function limparCachesDados() {
  cacheInstrumento.clear();
  cacheProcesso.clear();
  cacheSubunidade.clear();
  cacheObraEmpresa.clear();
}

function extrairSubunidadeNome(registro) {
  if (!registro) return "";
  return (registro.subunidadeJurisdicionadaNome || registro.NomeSubunidade || "").trim();
}

export function getSecretariaNome(instrumentoJuridico) {
  return extrairSubunidadeNome(instrumentoJuridico) || null;
}

async function buscarSubunidadePorId(subunidadeId) {
  if (!subunidadeId || !CONFIG.SECRETARIA_FALLBACK_CATALOGO) return null;
  const id = String(subunidadeId);
  if (cacheSubunidade.has(id)) {
    const cached = cacheSubunidade.get(id);
    return typeof cached === "string" ? cached : null;
  }
  try {
    const data = await fetchAPI("/SubunidadesUnidadesJurisdicionadas", { ID_SUBUNIDADE: subunidadeId });
    const nome = data?.[0]?.NomeSubunidade?.trim() || null;
    cacheSubunidade.set(id, nome);
    debugLog(`Catálogo subunidade ${id} => "${nome}"`);
    return nome;
  } catch (e) {
    console.warn(`Erro ao buscar subunidade ${subunidadeId}:`, e);
    cacheSubunidade.set(id, null);
    return null;
  }
}

async function buscarProcessoContratacao(numero, ano) {
  if (!numero || !ano || !CONFIG.SECRETARIA_FALLBACK_PROCESSO) return null;
  const key = `${numero}|${ano}`;
  if (cacheProcesso.has(key)) return cacheProcesso.get(key);
  try {
    const data = await fetchAPI("/Remessa_ProcessoContratacao", {
      numeroContratacao: numero,
      anoContratacao:    ano,
    });
    const proc =
      data?.find(p =>
        String(p.numeroContratacao) === String(numero) &&
        String(p.anoContratacao)    === String(ano)
      ) || data?.[0] || null;
    cacheProcesso.set(key, proc);
    return proc;
  } catch (e) {
    console.warn(`Erro ao buscar processo ${numero}/${ano}:`, e);
    cacheProcesso.set(key, null);
    return null;
  }
}

export function resolverSecretariaSync(instrumentoJuridico) {
  if (!instrumentoJuridico) return { nome: null, fonte: null, subunidadeId: null };
  const nome        = extrairSubunidadeNome(instrumentoJuridico);
  const subunidadeId = instrumentoJuridico.subunidadeJurisdicionadaId || null;
  if (nome) return { nome, fonte: "instrumento", subunidadeId };
  return { nome: null, fonte: null, subunidadeId };
}

export async function resolverSecretaria(instrumentoJuridico, opcoes = {}) {
  const usarProcesso = opcoes.usarProcesso === true;
  const usarCatalogo = opcoes.usarCatalogo === true;

  if (!instrumentoJuridico) return { nome: null, fonte: null, subunidadeId: null };

  const sync = resolverSecretariaSync(instrumentoJuridico);
  if (sync.nome) return sync;

  const subunidadeId = instrumentoJuridico.subunidadeJurisdicionadaId || null;

  if (subunidadeId && usarCatalogo) {
    const nomeCatalogo = await buscarSubunidadePorId(subunidadeId);
    if (nomeCatalogo) return { nome: nomeCatalogo, fonte: "catalogo_tce", subunidadeId };
  }

  if (!usarProcesso) return { nome: null, fonte: null, subunidadeId };

  const numero = instrumentoJuridico.NumeroProcessoContratacao;
  const ano    = instrumentoJuridico.AnoProcessoContratacao;
  if (numero && ano) {
    const processo = await buscarProcessoContratacao(numero, ano);
    let nome = extrairSubunidadeNome(processo);
    if (nome) return { nome, fonte: "processo_contratacao", subunidadeId: processo?.subunidadeJurisdicionadaId || subunidadeId };
    const procSubId = processo?.subunidadeJurisdicionadaId;
    if (procSubId) {
      const nomeProcCat = await buscarSubunidadePorId(procSubId);
      if (nomeProcCat) return { nome: nomeProcCat, fonte: "processo_catalogo", subunidadeId: procSubId };
    }
  }

  return { nome: null, fonte: null, subunidadeId };
}

function normalizarEmpresaObrasDadosContratacao(registros) {
  const lista = (Array.isArray(registros) ? registros : [])
    .map(r => ({
      nome:      (r.Pessoa || r.pessoa || r.NomePessoa || r.nomePessoa || "").trim(),
      documento: (r.CPFCNPJ || r.cpfcnpj || r.CpfCnpj || r.CPF_CNPJ || "").trim(),
    }))
    .filter(r => r.nome);

  if (!lista.length) return null;
  const principal = lista[0];
  return {
    nome:               principal.nome,
    documento:          principal.documento,
    documentoFormatado: formatarDocumento(principal.documento),
    tipoParticipante:   "Contratado",
    fonte:              "obras_dados_contratacao",
    todas: lista.map(r => ({
      nome:               r.nome,
      documento:          r.documento,
      documentoFormatado: formatarDocumento(r.documento),
      tipoParticipante:   "Contratado",
    })),
  };
}

export async function buscarEmpresaPorObra(obraId) {
  if (!obraId || !CONFIG.USAR_OBRAS_DADOS_CONTRATACAO) return null;
  const key = String(obraId);
  if (cacheObraEmpresa.has(key)) return cacheObraEmpresa.get(key);
  try {
    const data    = await fetchAPI("/ObrasDadosContratacao", { Obra: obraId }, CONFIG.INSTRUMENTO_TIMEOUT || 20000);
    const empresa = normalizarEmpresaObrasDadosContratacao(data);
    cacheObraEmpresa.set(key, empresa);
    debugLog(`ObrasDadosContratacao obra ${obraId}: "${empresa?.nome || "—"}"`);
    return empresa;
  } catch (e) {
    debugLog(`ObrasDadosContratacao obra ${obraId}:`, e.message);
    cacheObraEmpresa.set(key, null);
    return null;
  }
}

async function buscarEmpresaComFallback(obraId, instrumentoJuridicoId, unidadeNome = "") {
  let empresa = await buscarEmpresaPorObra(obraId);
  if (empresa?.nome) return empresa;
  if (!instrumentoJuridicoId) return null;
  const participantes = await buscarParticipantesInstrumento(instrumentoJuridicoId);
  empresa = extrairEmpresaContratada(participantes, unidadeNome);
  if (empresa) empresa.fonte = "instrumento_participantes";
  return empresa;
}

function aplicarEmpresaNaObra(obra, empresa) {
  obra.empresaContratadaNome                = empresa?.nome || null;
  obra.empresaContratadaDocumento           = empresa?.documento || null;
  obra.empresaContratadaDocumentoFormatado  = empresa?.documentoFormatado || null;
  obra.empresaContratadaTipo                = empresa?.tipoParticipante || null;
  obra.empresaContratadaFonte               = empresa?.fonte || null;
  obra.empresasContratadas                  = empresa?.todas || [];
}

export async function buscarParticipantesInstrumento(instrumentoJuridicoId) {
  if (!instrumentoJuridicoId) return [];
  const timeout = CONFIG.PARTICIPANTES_TIMEOUT || 12000;
  try {
    const data = await fetchAPI(
      "/Remessa_InstrumentoJuridicoParticipantes",
      { instrumentoJuridicoIdId: instrumentoJuridicoId },
      timeout
    );
    return Array.isArray(data) ? data : [];
  } catch (e) {
    debugLog(`Participantes ${instrumentoJuridicoId} ignorados:`, e.message);
    return [];
  }
}

async function carregarDadosInstrumento(instrumentoJuridicoId, opcoes = {}) {
  if (!instrumentoJuridicoId) {
    return { instrumentoJuridico: null, empresaContratada: null, secretaria: { nome: null, fonte: null, subunidadeId: null } };
  }

  const cacheKey = String(instrumentoJuridicoId);
  if (cacheInstrumento.has(cacheKey)) return cacheInstrumento.get(cacheKey);

  const buscarEmpresa = opcoes.buscarEmpresa !== false;

  const ijResult = await fetchAPI(
    "/Remessa_InstrumentoJuridico",
    { instrumentoJuridicoId },
    CONFIG.INSTRUMENTO_TIMEOUT || 20000
  ).catch(() => []);
  const instrumentoJuridico = ijResult?.length > 0 ? ijResult[0] : null;

  let empresaContratada = null;
  if (buscarEmpresa) {
    const obraId = opcoes.obraId;
    empresaContratada = await buscarEmpresaComFallback(
      obraId,
      instrumentoJuridicoId,
      instrumentoJuridico?.unidadeJurisdicionadaNome || ""
    );
    if (obraId && empresaContratada) cacheObraEmpresa.set(String(obraId), empresaContratada);
  }

  const secretaria = await resolverSecretaria(instrumentoJuridico, {
    usarProcesso: opcoes.usarProcesso === true,
    usarCatalogo: opcoes.usarCatalogo === true,
  });

  const resultado = { instrumentoJuridico, empresaContratada, secretaria };
  cacheInstrumento.set(cacheKey, resultado);
  debugLog(`Instrumento ${instrumentoJuridicoId}: secretaria="${secretaria.nome || "—"}" (${secretaria.fonte || "sem dado"}) empresa="${empresaContratada?.nome || "—"}"`);
  return resultado;
}

async function carregarInstrumentosEmLote(instrumentoIds) {
  const unicos   = [...new Set(instrumentoIds.filter(Boolean).map(String))];
  if (!unicos.length) return;

  const BATCH    = CONFIG.BATCH_SIZE;
  const timeout  = CONFIG.INSTRUMENTO_TIMEOUT || 20000;

  for (let i = 0; i < unicos.length; i += BATCH) {
    const batch = unicos.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async id => {
        if (cacheInstrumento.get(id)?.instrumentoJuridico) return;
        try {
          const data = await fetchAPI("/Remessa_InstrumentoJuridico", { instrumentoJuridicoId: id }, timeout);
          const ij   = data?.[0] || null;
          const secretaria = resolverSecretariaSync(ij);
          cacheInstrumento.set(id, {
            instrumentoJuridico: ij,
            empresaContratada:   cacheInstrumento.get(id)?.empresaContratada ?? null,
            secretaria,
          });
        } catch (e) {
          debugLog(`Instrumento ${id} falhou:`, e.message);
          cacheInstrumento.set(id, {
            instrumentoJuridico: null,
            empresaContratada:   null,
            secretaria:          { nome: null, fonte: null, subunidadeId: null },
          });
        }
      })
    );
    debugLog(`Instrumentos: ${Math.min(i + BATCH, unicos.length)}/${unicos.length}`);
  }
}

function normalizeObra(o, geo, instrumentoJuridico, empresaContratada, secretaria) {
  const geoDesc  = (geo?.DescricaoGeometria || "").trim();
  const infoAdic = (o.InformacoesAdicionais || o.informacoesAdicionais || "").trim();
  const endereco = (geo?.Endereco || "").trim();

  const descricaoGeometria    = isValido(geoDesc)  ? toTitleCase(geoDesc)  : "";
  const informacoesAdicionais = isValido(infoAdic) ? infoAdic              : "";
  const enderecoFallback      = (!descricaoGeometria && !informacoesAdicionais && endereco)
    ? endereco.replace(/\s+/g, " ").trim()
    : "";

  return {
    obraId:                       o.obraId,
    instrumentoJuridicoId:        o.instrumentoJuridicoId,
    situacaoObraId:               o.situacaoObraId,
    situacaoObraNome:             o.situacaoObraNome || "—",
    dataInicioObra:               o.dataInicioObra,
    dataConclusaoObra:            o.dataConclusaoObra,
    descricaoGeometria,
    informacoesAdicionais,
    enderecoFallback,
    totalMedido:                  o.totalMedido,
    totalPago:                    o.totalPago,
    tipoGeometriaNome:            o.tipoGeometriaNome,
    municipio:                    "Jaboatão dos Guararapes",
    latitude:                     geo?.Latitude  || null,
    longitude:                    geo?.Longitude || null,
    endereco,
    unidadeJurisdicionadaNome:    instrumentoJuridico?.unidadeJurisdicionadaNome    || null,
    unidadeJurisdicionadaId:      instrumentoJuridico?.unidadeJurisdicionadaId      || null,
    subunidadeJurisdicionadaNome: secretaria?.nome || instrumentoJuridico?.subunidadeJurisdicionadaNome || null,
    secretariaNome:               secretaria?.nome  || null,
    secretariaFonte:              secretaria?.fonte || null,
    secretariaSubunidadeId:       secretaria?.subunidadeId || instrumentoJuridico?.subunidadeJurisdicionadaId || null,
    empresaContratadaNome:              empresaContratada?.nome              || null,
    empresaContratadaDocumento:         empresaContratada?.documento         || null,
    empresaContratadaDocumentoFormatado: empresaContratada?.documentoFormatado || null,
    empresaContratadaTipo:              empresaContratada?.tipoParticipante  || null,
    empresaContratadaFonte:             empresaContratada?.fonte             || null,
    empresasContratadas:                empresaContratada?.todas             || [],
  };
}

function logResumoSecretarias(obras) {
  const comSecretaria   = obras.filter(o => o.secretariaNome).length;
  const semInstrumento  = obras.filter(o => !o.instrumentoJuridicoId).length;
  const semSecretaria   = obras.length - comSecretaria;
  if (semSecretaria > 0) {
    console.info(
      `ℹ️ Secretarias: ${comSecretaria}/${obras.length} obras com secretaria identificada` +
      (semInstrumento ? ` (${semInstrumento} sem instrumento jurídico)` : "") +
      (semSecretaria  ? ` — ${semSecretaria} exibirão "Não informada" (ausente no TCEPE)` : "")
    );
  }
  debugLog("Resumo fontes secretaria:", obras.reduce((acc, o) => {
    const f = o.secretariaFonte || "sem_dado";
    acc[f]  = (acc[f] || 0) + 1;
    return acc;
  }, {}));
}

export async function buscarObras(filtros = {}) {
  limparCachesDados();

  if (filtros.obraId) {
    const [obraData, geoData] = await Promise.all([
      fetchAPI("/Remessa_Obra", { obraId: filtros.obraId }),
      fetchAPI("/Remessa_ObraGeometria", { obraId: filtros.obraId }).catch(() => []),
    ]);
    const geoMap = {};
    geoData.forEach(g => { if (!geoMap[g.obraId]) geoMap[g.obraId] = g; });

    const obrasComUnidade = await Promise.all(
      obraData.map(async o => {
        const { instrumentoJuridico, empresaContratada, secretaria } =
          await carregarDadosInstrumento(o.instrumentoJuridicoId, {
            obraId:       o.obraId,
            usarProcesso: true,
            usarCatalogo: true,
            buscarEmpresa: true,
          });
        return normalizeObra(o, geoMap[String(o.obraId)], instrumentoJuridico, empresaContratada, secretaria);
      })
    );

    logResumoSecretarias(obrasComUnidade);
    return obrasComUnidade;
  }

  const [geos, todasObras] = await Promise.all([
    fetchAPI("/Remessa_ObraGeometria", { Municipio: MUNICIPIO_COD }),
    fetchAPI("/Remessa_Obra", {}),
  ]);

  const geoMap = {};
  geos.forEach(g => { if (!geoMap[g.obraId]) geoMap[g.obraId] = g; });
  const idsSet = new Set(Object.keys(geoMap));

  const obrasFiltradas = todasObras.filter(o => idsSet.has(String(o.obraId)));
  debugLog(`Obras em ${MUNICIPIO_COD}: ${obrasFiltradas.length}`);

  const instrumentoIds = obrasFiltradas.map(o => o.instrumentoJuridicoId).filter(Boolean);
  await carregarInstrumentosEmLote(instrumentoIds);

  const obrasComUnidade = obrasFiltradas.map(o => {
    const ijId   = o.instrumentoJuridicoId ? String(o.instrumentoJuridicoId) : null;
    const cached = ijId ? cacheInstrumento.get(ijId) : null;
    const ij     = cached?.instrumentoJuridico || null;
    const secretaria = cached?.secretaria || resolverSecretariaSync(ij);
    return normalizeObra(o, geoMap[String(o.obraId)], ij, null, secretaria);
  });

  logResumoSecretarias(obrasComUnidade);

  const obrasPrefeitura = obrasComUnidade.filter(o =>
    isPrefeituraJaboatao(o.unidadeJurisdicionadaNome, o.subunidadeJurisdicionadaNome)
  );

  const obrasFiltradasCount = obrasComUnidade.length - obrasPrefeitura.length;
  debugLog(`Obras filtradas (excluídas): ${obrasFiltradasCount}`);
  debugLog(`Obras incluídas: ${obrasPrefeitura.length}`);

  if (CONFIG.MOSTRAR_CONTADOR_FILTRADAS && obrasFiltradasCount > 0) {
    console.info(`ℹ️ ${obrasFiltradasCount} obra(s) de outros órgãos foram filtradas`);
  }

  return obrasPrefeitura;
}

export async function enriquecerEmpresasObras(obras, onLote) {
  const pendentes = obras.filter(o => o.obraId && !o.empresaContratadaNome?.trim());
  if (!pendentes.length) return;

  const BATCH = CONFIG.BATCH_SIZE;

  for (let i = 0; i < pendentes.length; i += BATCH) {
    const batch = pendentes.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async obra => {
        const cached = cacheObraEmpresa.get(String(obra.obraId));
        if (cached?.nome?.trim()) { aplicarEmpresaNaObra(obra, cached); return; }

        const ijCached = obra.instrumentoJuridicoId
          ? cacheInstrumento.get(String(obra.instrumentoJuridicoId))
          : null;

        const empresa = await buscarEmpresaComFallback(
          obra.obraId,
          obra.instrumentoJuridicoId,
          ijCached?.instrumentoJuridico?.unidadeJurisdicionadaNome || obra.unidadeJurisdicionadaNome || ""
        );
        aplicarEmpresaNaObra(obra, empresa);
      })
    );
    if (onLote) onLote(Math.min(i + BATCH, pendentes.length), pendentes.length);
  }
}

export async function buscarExecucaoObra(obraId) {
  return fetchAPI("/Remessa_ObraExecucao", { obraId });
}

export async function buscarGeometriaObra(obraId) {
  return fetchAPI("/Remessa_ObraGeometria", { obraId });
}

export async function buscarItensObra(instrumentoJuridicoId) {
  const itens = await fetchAPI("/Remessa_InstrumentoJuridicoItens", { instrumentoJuridicoId });
  return itens.map(item => {
    let desc       = item.itemDescricao || "";
    const separador = desc.indexOf(" - ");
    if (separador !== -1) desc = desc.slice(separador + 3).trim();
    return {
      itemContratoId: item.itemContratoId,
      descricao:      desc,
      unidadeMedida:  item.UnidadeMedida  || "—",
      quantidade:     parseFloat(item.Quantidade)    || 0,
      valorUnitario:  parseFloat(item.ValorUnitario) || 0,
      valorTotal:     parseFloat(item.ValorTotal)    || 0,
      bdi:            parseFloat(item.BDI)           || 0,
    };
  });
}

export async function buscarDocumentosObra(instrumentoJuridicoId) {
  const docs = await fetchAPI("/Remessa_InstrumentoJuridicoDocumento", { instrumentoJuridicoId });
  return docs.map(d => ({
    id:          d.documentoInstrumentoJuridicoId,
    tipo:        d.tipoDocumentoInstrumentoJuridicoNome || "Documento",
    descricao:   d.descricaoDocumento || d.nomeArquivo || "—",
    nomeArquivo: d.nomeArquivo || "",
    sigiloso:    d.documentoSigiloso === "1" || d.documentoSigiloso === 1,
    link:        d.LinkDownload || "",
  }));
}

export async function buscarContratoObra(instrumentoJuridicoId) {
  if (!instrumentoJuridicoId) return null;
  const dados = await fetchAPI("/Remessa_InstrumentoJuridico", { instrumentoJuridicoId });
  if (dados && dados.length > 0 && dados[0].Objeto) return dados[0].Objeto.trim();
  return null;
}

export async function buscarUnidadeJurisdicionada(instrumentoJuridicoId) {
  if (!instrumentoJuridicoId) return null;
  try {
    const dados = await fetchAPI("/Remessa_InstrumentoJuridico", { instrumentoJuridicoId });
    if (dados && dados.length > 0) {
      return {
        nome:       dados[0].unidadeJurisdicionadaNome      || null,
        id:         dados[0].unidadeJurisdicionadaId        || null,
        codigoTCE:  dados[0].unidadeJurisdicionadaCodigoTCE || null,
        subunidade: dados[0].subunidadeJurisdicionadaNome   || null,
      };
    }
  } catch (e) {
    console.warn("Erro ao buscar unidade jurisdicionada:", e);
  }
  return null;
}
