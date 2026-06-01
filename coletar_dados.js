/**
 * coletar_dados.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Executa UMA VEZ para capturar todos os dados da API TCEPE via proxy local
 * e salvar em dados_mock.json.  Depois disso, o portal roda offline.
 *
 * Pré-requisito: o proxy deve estar rodando  →  node proxy.js
 *
 * Uso:
 *   node coletar_dados.js
 *
 * Parâmetros opcionais (variáveis de ambiente):
 *   PROXY_URL=http://localhost:5018   URL base do proxy  (padrão: http://localhost:5018)
 *   BATCH_SIZE=10                     Obras por lote     (padrão: 10)
 *   OUTPUT=dados_mock.json            Arquivo de saída   (padrão: dados_mock.json)
 *
 * Exemplo:
 *   BATCH_SIZE=20 node coletar_dados.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

const http  = require("http");
const https = require("https");
const fs    = require("fs");
const url   = require("url");

const PROXY_URL  = (process.env.PROXY_URL  || "http://localhost:5018").replace(/\/$/, "");
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "10", 10);
const OUTPUT     = process.env.OUTPUT || "dados_mock.json";
const MUNICIPIO  = "P083";

// ─── helpers ────────────────────────────────────────────────────────────────

function get(endpoint, params = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(PROXY_URL + "/api/" + endpoint);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== "") u.searchParams.append(k, v);
    });

    const parsed = url.parse(u.toString());
    const lib    = parsed.protocol === "https:" ? https : http;

    const req = lib.get(parsed, res => {
      let body = "";
      res.on("data", c => (body += c));
      res.on("end", () => {
        try {
          const json = JSON.parse(body);
          let data = json;
          if (json?.resposta?.conteudo)            data = json.resposta.conteudo;
          else if (json?.conteudo)                 data = json.conteudo;
          else if (Array.isArray(json))            data = json;
          else if (json && typeof json === "object") data = [json];
          resolve(data);
        } catch (e) {
          reject(new Error(`JSON inválido em ${endpoint}: ${e.message}\nBody: ${body.slice(0, 200)}`));
        }
      });
    });

    req.setTimeout(60000, () => { req.destroy(); reject(new Error(`Timeout: ${endpoint}`)); });
    req.on("error", reject);
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function progresso(atual, total, msg = "") {
  const pct  = Math.round((atual / total) * 100);
  const barra = "█".repeat(Math.floor(pct / 5)) + "░".repeat(20 - Math.floor(pct / 5));
  process.stdout.write(`\r  [${barra}] ${pct}% (${atual}/${total}) ${msg}`.padEnd(80));
}

// ─── coleta ─────────────────────────────────────────────────────────────────

async function coletar() {
  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║        COLETOR DE DADOS — Portal de Obras PMJG              ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  console.log(`  Proxy : ${PROXY_URL}`);
  console.log(`  Saída : ${OUTPUT}`);
  console.log(`  Lotes : ${BATCH_SIZE} obras por vez\n`);

  const mock = {
    _meta: {
      coletadoEm: new Date().toISOString(),
      municipio: MUNICIPIO,
      versao: "1.0",
    },
    geometrias:    [],
    obras:         [],
    instrumentos:  {},   // instrumentoJuridicoId → dados do instrumento
    execucoes:     {},   // obraId → array de execuções
    geometriasPorObra: {}, // obraId → array de geometrias
    itens:         {},   // instrumentoJuridicoId → array de itens
    documentos:    {},   // instrumentoJuridicoId → array de documentos
    participantes: {},   // instrumentoJuridicoId → array de participantes
  };

  // ── 1. Geometrias do município ───────────────────────────────────────────
  console.log("▶ 1/6  Buscando geometrias do município…");
  try {
    mock.geometrias = await get("Remessa_ObraGeometria", { Municipio: MUNICIPIO });
    console.log(`       ${mock.geometrias.length} geometria(s) encontradas.`);
  } catch (e) {
    console.error("\n  ❌ Falha ao buscar geometrias:", e.message);
    console.error("     Verifique se o proxy está rodando:  node proxy.js");
    process.exit(1);
  }

  // ── 2. Todas as obras ────────────────────────────────────────────────────
  console.log("▶ 2/6  Buscando todas as obras…");
  let todasObras = [];
  try {
    todasObras = await get("Remessa_Obra", {});
    console.log(`       ${todasObras.length} obra(s) encontradas no total.`);
  } catch (e) {
    console.error("\n  ❌ Falha ao buscar obras:", e.message);
    process.exit(1);
  }

  // Filtra apenas as obras com geometria no município
  const geoIds = new Set(mock.geometrias.map(g => String(g.obraId)));
  mock.obras   = todasObras.filter(o => geoIds.has(String(o.obraId)));
  console.log(`       ${mock.obras.length} obra(s) no município ${MUNICIPIO}.\n`);

  // ── 3. Instrumentos jurídicos ────────────────────────────────────────────
  const instrumentoIds = [...new Set(
    mock.obras.map(o => o.instrumentoJuridicoId).filter(Boolean).map(String)
  )];
  console.log(`▶ 3/6  Buscando ${instrumentoIds.length} instrumento(s) jurídico(s)…`);

  let ijFeitos = 0;
  for (let i = 0; i < instrumentoIds.length; i += BATCH_SIZE) {
    const batch = instrumentoIds.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async id => {
        try {
          const data = await get("Remessa_InstrumentoJuridico", { instrumentoJuridicoId: id });
          mock.instrumentos[id] = data;
        } catch (e) {
          console.warn(`\n  ⚠ Instrumento ${id}: ${e.message}`);
          mock.instrumentos[id] = [];
        }
        ijFeitos++;
        progresso(ijFeitos, instrumentoIds.length, "instrumentos…");
      })
    );
    await sleep(50); // pausa gentil entre lotes
  }
  console.log(`\n       ${ijFeitos} instrumento(s) coletados.\n`);

  // ── 4. Participantes (empresa contratada) ────────────────────────────────
  console.log(`▶ 4/6  Buscando participantes dos instrumentos…`);
  let partFeitos = 0;
  for (let i = 0; i < instrumentoIds.length; i += BATCH_SIZE) {
    const batch = instrumentoIds.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async id => {
        try {
          const data = await get("Remessa_InstrumentoJuridicoParticipantes", {
            instrumentoJuridicoIdId: id,
          });
          mock.participantes[id] = Array.isArray(data) ? data : [];
        } catch (e) {
          mock.participantes[id] = [];
        }
        partFeitos++;
        progresso(partFeitos, instrumentoIds.length, "participantes…");
      })
    );
    await sleep(50);
  }
  console.log(`\n       Participantes coletados.\n`);

  // ── 5. Execução financeira ────────────────────────────────────────────────
  console.log(`▶ 5/6  Buscando execução financeira de ${mock.obras.length} obra(s)…`);
  let execFeitas = 0;
  for (let i = 0; i < mock.obras.length; i += BATCH_SIZE) {
    const batch = mock.obras.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async obra => {
        const id = String(obra.obraId);
        try {
          const data = await get("Remessa_ObraExecucao", { obraId: id });
          mock.execucoes[id] = Array.isArray(data) ? data : [];
        } catch (e) {
          mock.execucoes[id] = [];
        }
        execFeitas++;
        progresso(execFeitas, mock.obras.length, "execuções…");
      })
    );
    await sleep(50);
  }
  console.log(`\n       Execuções coletadas.\n`);

  // ── 6. Geometrias individuais + Itens + Documentos ────────────────────────
  console.log(`▶ 6/6  Buscando geometrias individuais, itens e documentos…`);
  let detalheFeitos = 0;
  for (let i = 0; i < mock.obras.length; i += BATCH_SIZE) {
    const batch = mock.obras.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async obra => {
        const obraId = String(obra.obraId);
        const ijId   = obra.instrumentoJuridicoId ? String(obra.instrumentoJuridicoId) : null;

        // Geometria individual (pode ter mais pontos que a lista geral)
        try {
          const geo = await get("Remessa_ObraGeometria", { obraId });
          mock.geometriasPorObra[obraId] = Array.isArray(geo) ? geo : [];
        } catch {
          mock.geometriasPorObra[obraId] = [];
        }

        // Itens do contrato
        if (ijId && !mock.itens[ijId]) {
          try {
            const itens = await get("Remessa_InstrumentoJuridicoItens", { instrumentoJuridicoId: ijId });
            mock.itens[ijId] = Array.isArray(itens) ? itens : [];
          } catch {
            mock.itens[ijId] = [];
          }
        }

        // Documentos
        if (ijId && !mock.documentos[ijId]) {
          try {
            const docs = await get("Remessa_InstrumentoJuridicoDocumento", { instrumentoJuridicoId: ijId });
            mock.documentos[ijId] = Array.isArray(docs) ? docs : [];
          } catch {
            mock.documentos[ijId] = [];
          }
        }

        detalheFeitos++;
        progresso(detalheFeitos, mock.obras.length, "geometrias/itens/docs…");
      })
    );
    await sleep(50);
  }
  console.log(`\n       Detalhes coletados.\n`);

  // ── Salvar JSON ───────────────────────────────────────────────────────────
  console.log(`▶ Salvando em "${OUTPUT}"…`);
  fs.writeFileSync(OUTPUT, JSON.stringify(mock, null, 2), "utf8");
  const kb = (fs.statSync(OUTPUT).size / 1024).toFixed(1);
  console.log(`  ✅ Arquivo salvo: ${kb} KB\n`);

  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  COLETA CONCLUÍDA — Resumo                                  ║");
  console.log("╠══════════════════════════════════════════════════════════════╣");
  console.log(`║  Geometrias    : ${String(mock.geometrias.length).padEnd(44)}║`);
  console.log(`║  Obras (munícip): ${String(mock.obras.length).padEnd(43)}║`);
  console.log(`║  Instrumentos  : ${String(Object.keys(mock.instrumentos).length).padEnd(43)}║`);
  console.log(`║  Participantes : ${String(Object.keys(mock.participantes).length).padEnd(43)}║`);
  console.log(`║  Execuções     : ${String(Object.keys(mock.execucoes).length).padEnd(43)}║`);
  console.log(`║  Arquivo       : ${OUTPUT.padEnd(43)}║`);
  console.log(`║  Tamanho       : ${(kb + " KB").padEnd(43)}║`);
  console.log(`║  Coletado em   : ${new Date().toLocaleString("pt-BR").padEnd(43)}║`);
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  console.log("  Próximo passo: acesse http://localhost:5018 — o portal usará");
  console.log(`  os dados de "${OUTPUT}" até você rodar este script novamente.\n`);
}

coletar().catch(e => {
  console.error("\n❌ Erro fatal:", e.message);
  process.exit(1);
});
