/**
 * proxy.js — Proxy local para a API RemessaTCEPE
 * Resolve CORS + SSL inválido + encoding ISO-8859-1
 *
 * NOVIDADE: endpoints /mock-status e /mock-dados
 *   GET /mock-status  → { disponivel: true/false, coletadoEm, obras, arquivo }
 *   GET /mock-dados   → conteúdo completo de dados_mock.json
 *
 * Quando dados_mock.json existe, o frontend usa os dados locais
 * e não faz nenhuma requisição para o TCEPE.
 * Para atualizar os dados:  node coletar_dados.js
 */

const http   = require("http");
const https  = require("https");
const url    = require("url");
const fs     = require("fs");
const path   = require("path");

const PORT        = process.env.PORT || 5030;
const TCEPE_BASE  = "https://sistemas.tcepe.tc.br:443/DadosAbertos";
const MOCK_FILE   = path.join(__dirname, "dados_mock.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css",
  ".js":   "application/javascript",
  ".json": "application/json; charset=utf-8",
  ".png":  "image/png",
  ".ico":  "image/x-icon",
};

// ─── Mock cache (lido uma vez e mantido em memória) ───────────────────────────
let _mockCache       = null;   // conteúdo parsed do JSON
let _mockLastModified = 0;

function carregarMockSeFrescal() {
  if (!fs.existsSync(MOCK_FILE)) {
    _mockCache = null;
    return;
  }
  const stat = fs.statSync(MOCK_FILE);
  if (stat.mtimeMs === _mockLastModified && _mockCache) return; // ainda válido

  try {
    const raw      = fs.readFileSync(MOCK_FILE, "utf8");
    _mockCache     = JSON.parse(raw);
    _mockLastModified = stat.mtimeMs;
    const dt = _mockCache._meta?.coletadoEm
      ? new Date(_mockCache._meta.coletadoEm).toLocaleString("pt-BR")
      : "data desconhecida";
    console.log(`[MOCK] dados_mock.json carregado — ${_mockCache.obras?.length || 0} obras — coletado ${dt}`);
  } catch (e) {
    console.error("[MOCK] Erro ao ler dados_mock.json:", e.message);
    _mockCache = null;
  }
}

// ─── Proxy para TCEPE ─────────────────────────────────────────────────────────
function proxyTCEPE(entidade, query, res) {
  const qs = Object.keys(query).length
    ? "?" + new URLSearchParams(query).toString()
    : "";
  const targetUrl = `${TCEPE_BASE}/${entidade}!json${qs}`;
  console.log(`[PROXY] → ${targetUrl}`);

  const opts = url.parse(targetUrl);
  opts.rejectUnauthorized = false;
  opts.headers = { Accept: "application/json, text/plain, */*" };

  const req = https.get(opts, proxyRes => {
    const chunks = [];
    proxyRes.on("data", chunk => chunks.push(chunk));
    proxyRes.on("end", () => {
      const raw = Buffer.concat(chunks);
      let body;
      try {
        body = new TextDecoder("iso-8859-1").decode(raw);
      } catch (e) {
        body = raw.toString("latin1");
      }
      console.log(`[PROXY] ← ${proxyRes.statusCode} | ${body.slice(0, 300)}`);
      res.writeHead(proxyRes.statusCode, {
        "Content-Type":                "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(body);
    });
  });

  req.on("error", e => {
    console.error("[PROXY ERROR]", e.message);
    res.writeHead(502, {
      "Content-Type":                "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({ erro: e.message }));
  });
}

// ─── Servidor HTTP ────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const parsed = url.parse(req.url, true);

  // Tenta recarregar mock a cada requisição (barato: só re-lê se mudou o arquivo)
  carregarMockSeFrescal();

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json; charset=utf-8",
  };

  // ── GET /mock-status ────────────────────────────────────────────────────────
  if (parsed.pathname === "/mock-status") {
    if (_mockCache) {
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({
        disponivel:  true,
        coletadoEm:  _mockCache._meta?.coletadoEm || null,
        obras:       _mockCache.obras?.length || 0,
        arquivo:     "dados_mock.json",
      }));
    } else {
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify({ disponivel: false }));
    }
    return;
  }

  // ── GET /mock-dados ─────────────────────────────────────────────────────────
  if (parsed.pathname === "/mock-dados") {
    if (_mockCache) {
      res.writeHead(200, corsHeaders);
      res.end(JSON.stringify(_mockCache));
    } else {
      res.writeHead(404, corsHeaders);
      res.end(JSON.stringify({ erro: "dados_mock.json não encontrado. Execute: node coletar_dados.js" }));
    }
    return;
  }

  // ── /debug ──────────────────────────────────────────────────────────────────
  if (parsed.pathname === "/debug") {
    const entidade = parsed.query.e || "Remessa_Obra";
    const query    = Object.assign({}, parsed.query);
    delete query.e;
    const qs      = Object.keys(query).length ? "?" + new URLSearchParams(query).toString() : "";
    const targetUrl = `${TCEPE_BASE}/${entidade}!json${qs}`;

    const opts        = url.parse(targetUrl);
    opts.rejectUnauthorized = false;
    opts.headers = { Accept: "application/json, text/plain, */*" };

    https.get(opts, proxyRes => {
      const chunks = [];
      proxyRes.on("data", c => chunks.push(c));
      proxyRes.on("end", () => {
        const raw  = Buffer.concat(chunks);
        const body = new TextDecoder("iso-8859-1").decode(raw);
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        res.end(`URL: ${targetUrl}\nStatus: ${proxyRes.statusCode}\n\n${body}`);
      });
    }).on("error", e => { res.writeHead(500); res.end("Erro: " + e.message); });
    return;
  }

  // ── /api/<Entidade> ─────────────────────────────────────────────────────────
  if (parsed.pathname.startsWith("/api/")) {
    const entidade = parsed.pathname.replace("/api/", "");
    const query    = Object.assign({}, parsed.query);
    delete query.formato;
    proxyTCEPE(entidade, query, res);
    return;
  }

  // ── Arquivos estáticos ──────────────────────────────────────────────────────
  let filePath = "." + parsed.pathname;
  if (filePath === "./") filePath = "./index.html";

  const ext         = path.extname(filePath);
  const contentType = MIME[ext] || "text/plain; charset=utf-8";

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("404: " + filePath); return; }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

// ─── Banner de inicialização ──────────────────────────────────────────────────
server.listen(PORT, () => {
  carregarMockSeFrescal();

  console.log(`\n✅  http://localhost:${PORT}`);
  console.log(`🔍  Debug: http://localhost:${PORT}/debug?e=Remessa_Obra`);

  if (_mockCache) {
    const dt = _mockCache._meta?.coletadoEm
      ? new Date(_mockCache._meta.coletadoEm).toLocaleString("pt-BR")
      : "data desconhecida";
    console.log(`\n📦  MODO MOCK — ${_mockCache.obras?.length || 0} obras em dados_mock.json`);
    console.log(`    Coletado em: ${dt}`);
    console.log(`    Para atualizar: node coletar_dados.js\n`);
  } else {
    console.log(`\n🌐  MODO LIVE — API TCEPE ao vivo`);
    console.log(`    Para usar dados locais: node coletar_dados.js\n`);
  }
});
