import { buscarObras, buscarContratoObra, enriquecerEmpresasObras } from "./api.js";
import { exportarParaCSV, exportarParaExcel } from "./exportador.js";

let todasObras = [];
let obrasFiltradasAtuais = [];
let filtros = {
  situacao: "",
  secretaria: "",
  empresa: "",
  ordenar: "valorMedido_desc",
};

const NAO_INFORMADO = "Não informada";

function labelSecretaria(o) {
  return o.secretariaNome?.trim() || NAO_INFORMADO;
}

function labelEmpresa(o) {
  return o.empresaContratadaNome?.trim() || NAO_INFORMADO;
}

const tbody = document.getElementById("obras-tbody");
const tbodyParalisadas = document.getElementById("paralisadas-tbody");
const semObras = document.getElementById("sem-obras");
const semParalisadas = document.getElementById("sem-paralisadas");

function formatMoeda(v) {
  if (v == null || v === "") return "—";
  return parseFloat(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatData(d) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return isNaN(dt) ? d : dt.toLocaleDateString("pt-BR");
}

function situacaoBadge(nome) {
  if (!nome || nome === "—") return `<span class="badge badge-default">—</span>`;
  const l = nome.toLowerCase();
  let cls = "badge-default";
  if (l.includes("conclu")) cls = "badge-concluida";
  else if (l.includes("andamento")) cls = "badge-execucao";
  else if (l.includes("parali")) cls = "badge-paralisada";
  else if (l.includes("cancel") || l.includes("inacab")) cls = "badge-cancelada";
  return `<span class="badge ${cls}">${nome}</span>`;
}

function barraProgresso(medido, pago) {
  const m = parseFloat(medido) || 0;
  const p = parseFloat(pago) || 0;
  const base = Math.max(m, p, 1);
  const pct = Math.min((p / base) * 100, 100).toFixed(0);
  return `
    <div class="progress-bar-wrap">
      <div><div class="progress-bar-fill" style="width:${pct}%"></div></div>
      <span class="progress-label">${pct}%</span>
    </div>`;
}

function escapeHtml(texto) {
  if (!texto) return "";
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function celulaInfo(principal, secundario = "") {
  if (!principal || principal === NAO_INFORMADO) {
    return `<span class="info-nao-informada">${NAO_INFORMADO}</span>`;
  }
  const sec = secundario && secundario !== principal
    ? `<div class="info-secundaria">${escapeHtml(secundario)}</div>`
    : "";
  return `<div class="info-principal">${escapeHtml(principal)}</div>${sec}`;
}

function celulaSecretaria(o) {
  return `<td class="td-info">${celulaInfo(labelSecretaria(o))}</td>`;
}

function celulaEmpresa(o) {
  const nome = labelEmpresa(o);
  const doc = o.empresaContratadaDocumentoFormatado || "";
  return `<td class="td-info">${celulaInfo(nome, doc)}</td>`;
}

function objetoCelula(o) {
  const principal = o.descricaoContrato || o.descricaoGeometria || o.informacoesAdicionais || o.enderecoFallback || "";
  const secundario = (o.descricaoGeometria && o.informacoesAdicionais &&
    o.descricaoGeometria.toLowerCase() !== o.informacoesAdicionais.toLowerCase())
    ? o.informacoesAdicionais : "";

  if (!principal) {
    return `<div class="obj-wrapper obj-sem-info" data-obra="${o.obraId}">
      <span class="pulse-text">Buscando detalhes do contrato...</span>
    </div>`;
  }

  return `<div class="obj-wrapper" data-obra="${o.obraId}">
      <div class="obj-principal">${escapeHtml(principal)}</div>
      ${secundario && !o.descricaoContrato ? `<div class="obj-secundario">${escapeHtml(secundario)}</div>` : ""}
    </div>`;
}

async function carregarDescricoesFaltantes(obras) {
  const obrasSemDesc = obras.filter(o => {
    if (!o.instrumentoJuridicoId || o.descricaoContrato) return false;
    const principal = o.descricaoGeometria || o.informacoesAdicionais || o.enderecoFallback || "";
    return !principal || principal === o.enderecoFallback;
  });

  for (const o of obrasSemDesc) {
    buscarContratoObra(o.instrumentoJuridicoId).then(obj => {
      if (obj) {
        o.descricaoContrato = obj;
        const els = document.querySelectorAll(`.obj-wrapper[data-obra="${o.obraId}"]`);
        els.forEach(el => {
          el.className = "obj-wrapper";
          el.innerHTML = `<div class="obj-principal">${escapeHtml(obj)}</div>`;
        });
      } else {
        const els = document.querySelectorAll(`.obj-wrapper[data-obra="${o.obraId}"]`);
        els.forEach(el => {
          if (el.classList.contains('obj-sem-info')) {
            el.innerHTML = `Obra #${o.obraId} — sem descrição`;
            el.classList.remove('pulse-text');
          }
        });
      }
    }).catch(console.error);
  }
}

function obrasProcessadas() {
  let lista = [...todasObras];

  if (filtros.situacao) {
    lista = lista.filter(o =>
      o.situacaoObraNome.toLowerCase().includes(filtros.situacao.toLowerCase())
    );
  }

  if (filtros.secretaria) {
    lista = lista.filter(o => labelSecretaria(o) === filtros.secretaria);
  }

  if (filtros.empresa) {
    lista = lista.filter(o => labelEmpresa(o) === filtros.empresa);
  }

  const [campo, dir] = filtros.ordenar.split("_");
  const asc = dir === "asc";

  lista.sort((a, b) => {
    let va, vb;
    if (campo === "valorMedido") {
      va = parseFloat(a.totalMedido) || 0;
      vb = parseFloat(b.totalMedido) || 0;
    } else if (campo === "valorPago") {
      va = parseFloat(a.totalPago) || 0;
      vb = parseFloat(b.totalPago) || 0;
    } else if (campo === "inicio") {
      va = a.dataInicioObra ? new Date(a.dataInicioObra) : new Date(0);
      vb = b.dataInicioObra ? new Date(b.dataInicioObra) : new Date(0);
    } else if (campo === "conclusao") {
      va = a.dataConclusaoObra ? new Date(a.dataConclusaoObra) : new Date(0);
      vb = b.dataConclusaoObra ? new Date(b.dataConclusaoObra) : new Date(0);
    } else if (campo === "secretaria") {
      va = labelSecretaria(a).toLowerCase();
      vb = labelSecretaria(b).toLowerCase();
    } else if (campo === "empresa") {
      va = labelEmpresa(a).toLowerCase();
      vb = labelEmpresa(b).toLowerCase();
    } else {
      return 0;
    }
    if (va < vb) return asc ? -1 : 1;
    if (va > vb) return asc ? 1 : -1;
    return 0;
  });

  obrasFiltradasAtuais = lista;
  return lista;
}

function renderObras(obras) {
  semObras.style.display = "none";
  tbody.innerHTML = "";

  document.getElementById("total-obras").textContent = obras.length;
  const totalInvestido = obras.reduce((acc, o) => acc + (parseFloat(o.totalPago) || 0), 0);
  document.getElementById("total-investido").textContent =
    totalInvestido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (!obras.length) {
    semObras.textContent = "Nenhuma obra encontrada para os filtros selecionados.";
    semObras.style.display = "block";
    return;
  }

  tbody.innerHTML = obras.map(o => `
    <tr>
      <td class="td-objeto">${objetoCelula(o)}</td>
      ${celulaSecretaria(o)}
      ${celulaEmpresa(o)}
      <td>${situacaoBadge(o.situacaoObraNome)}</td>
      <td>${formatData(o.dataInicioObra)}</td>
      <td>${formatData(o.dataConclusaoObra)}</td>
      <td class="td-valor">${formatMoeda(o.totalPago)}</td>
      <td class="td-valor">${formatMoeda(o.totalMedido)}</td>
      <td>${barraProgresso(o.totalMedido, o.totalPago)}</td>
      <td>
        <a href="obra.html?id=${o.obraId}" class="btn-detalhes">
          <span class="btn-texto">→ Ver detalhes</span>
          <span class="btn-icone-only">→</span>
        </a>
      </td>
    </tr>`).join("");
}

function renderParalisadas(obras) {
  semParalisadas.style.display = "none";
  tbodyParalisadas.innerHTML = "";

  const paralisadas = obras.filter(o =>
    o.situacaoObraNome && o.situacaoObraNome.toLowerCase().includes("parali")
  );

  document.getElementById("total-paralisadas").textContent = paralisadas.length;

  if (!paralisadas.length) {
    semParalisadas.style.display = "block";
    return;
  }

  tbodyParalisadas.innerHTML = paralisadas.map(o => `
    <tr>
      <td class="td-objeto">${objetoCelula(o)}</td>
      ${celulaSecretaria(o)}
      ${celulaEmpresa(o)}
      <td>${situacaoBadge(o.situacaoObraNome)}</td>
      <td>${formatData(o.dataInicioObra)}</td>
      <td class="td-valor">${formatMoeda(o.totalPago)}</td>
      <td>
        <a href="obra.html?id=${o.obraId}" class="btn-detalhes btn-detalhes-warn">
          <span class="btn-texto">→ Ver detalhes</span>
          <span class="btn-icone-only">→</span>
        </a>
      </td>
    </tr>`).join("");
}

function renderTudo() {
  const obras = obrasProcessadas();
  renderObras(obras);
  renderParalisadas(todasObras);
  atualizarContadorFiltro(obras.length);
  carregarDescricoesFaltantes(todasObras);
}

function atualizarContadorFiltro(total) {
  const el = document.getElementById("filtro-contador");
  if (el) el.textContent = `${total} obra${total !== 1 ? "s" : ""}`;
}

function popularSituacoes() {
  const sel = document.getElementById("filtro-situacao");
  const situacoes = [...new Set(
    todasObras.map(o => o.situacaoObraNome).filter(s => s && s !== "—")
  )].sort();

  sel.innerHTML = `<option value="">Todas as situações</option>` +
    situacoes.map(s => `<option value="${s.replace(/"/g, "&quot;")}">${escapeHtml(s)}</option>`).join("");
}

function popularSelectFiltro(id, valores, labelTodas) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = `<option value="">${labelTodas}</option>` +
    valores.map(v => `<option value="${v.replace(/"/g, "&quot;")}">${escapeHtml(v)}</option>`).join("");
  if (valores.includes(atual)) sel.value = atual;
}

function popularFiltrosExtras() {
  const secretarias = [...new Set(todasObras.map(labelSecretaria))].sort((a, b) => {
    if (a === NAO_INFORMADO) return 1;
    if (b === NAO_INFORMADO) return -1;
    return a.localeCompare(b, "pt-BR");
  });
  const empresas = [...new Set(todasObras.map(labelEmpresa))].sort((a, b) => {
    if (a === NAO_INFORMADO) return 1;
    if (b === NAO_INFORMADO) return -1;
    return a.localeCompare(b, "pt-BR");
  });
  popularSelectFiltro("filtro-secretaria", secretarias, "Todas as secretarias");
  popularSelectFiltro("filtro-empresa", empresas, "Todas as empresas");
}

// Exportação
function handleExportarCSV() {
  if (obrasFiltradasAtuais.length === 0) {
    alert("Não há dados para exportar. Verifique os filtros aplicados.");
    return;
  }
  exportarParaCSV(obrasFiltradasAtuais, "obras_jaboatao");
}

function handleExportarExcel() {
  if (obrasFiltradasAtuais.length === 0) {
    alert("Não há dados para exportar. Verifique os filtros aplicados.");
    return;
  }
  exportarParaExcel(obrasFiltradasAtuais, "obras_jaboatao");
}

// Eventos
document.getElementById("filtro-situacao").addEventListener("change", e => {
  filtros.situacao = e.target.value;
  renderTudo();
});

document.getElementById("filtro-secretaria").addEventListener("change", e => {
  filtros.secretaria = e.target.value;
  renderTudo();
});

document.getElementById("filtro-empresa").addEventListener("change", e => {
  filtros.empresa = e.target.value;
  renderTudo();
});

document.getElementById("filtro-ordenar").addEventListener("change", e => {
  filtros.ordenar = e.target.value;
  renderTudo();
});

document.getElementById("btn-limpar-filtros").addEventListener("click", () => {
  filtros = { situacao: "", secretaria: "", empresa: "", ordenar: "valorMedido_desc" };
  document.getElementById("filtro-situacao").value = "";
  document.getElementById("filtro-secretaria").value = "";
  document.getElementById("filtro-empresa").value = "";
  document.getElementById("filtro-ordenar").value = "valorMedido_desc";
  renderTudo();
});

const btnCSV = document.getElementById("btn-exportar-csv");
const btnExcel = document.getElementById("btn-exportar-excel");
if (btnCSV) btnCSV.addEventListener("click", handleExportarCSV);
if (btnExcel) btnExcel.addEventListener("click", handleExportarExcel);

// Init
async function init() {
  try {
    if (location.protocol === "file:") {
      throw new Error("Abra via http://localhost:5030 (execute: node proxy.js)");
    }
    todasObras = await buscarObras();
    popularSituacoes();
    popularFiltrosExtras();
    renderTudo();

    const loadingEmpresas = document.getElementById("loading-empresas");
    if (loadingEmpresas) loadingEmpresas.style.display = "inline";

    enriquecerEmpresasObras(todasObras, (feitas, total) => {
      renderTudo();
      if (feitas >= total) {
        popularFiltrosExtras();
        if (loadingEmpresas) loadingEmpresas.style.display = "none";
      }
    }).catch(err => {
      console.warn("Empresas contratadas: carregamento parcial.", err);
      if (loadingEmpresas) loadingEmpresas.style.display = "none";
    });
  } catch (e) {
    console.error("Falha ao carregar obras:", e);
    tbody.innerHTML = "";
    semObras.textContent = `Erro ao carregar obras: ${e.message}. Verifique se o proxy está rodando (node proxy.js).`;
    semObras.style.display = "block";
    semObras.style.color = "var(--danger)";
    tbodyParalisadas.innerHTML = "";
    semParalisadas.style.display = "block";
    document.getElementById("total-paralisadas").textContent = "0";
    document.getElementById("total-obras").textContent = "0";
  }
}

document.addEventListener("DOMContentLoaded", init);