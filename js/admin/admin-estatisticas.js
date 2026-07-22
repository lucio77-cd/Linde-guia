/**
 * admin-estatisticas.js — js/admin/admin-estatisticas.js
 * Linde Guia — Treze Tílias
 *
 * NOVO NESTA VERSÃO:
 *  - Acessos diários (coleção acessos_diarios, gravada por
 *    js/core/registrar-acesso.js — 1 doc por dia, não por visita)
 *  - Taxa de conversão (acessos -> rotas criadas)
 *  - Funil de conversão (Acessos -> Rotas criadas -> Concluídas)
 *  - Refeições mais pedidas / Interesses mais marcados (extraídos de
 *    rotas_criadas.refeicoesDesejadas / .interesses)
 *  - Dia da semana mais movimentado
 *  - "Rotas sem resultado" (capituloVazio) como sinal de saúde do motor
 *  - Botão "Gerar relatório com IA" — manda só os números já agregados
 *    (nunca dado individual) pro endpoint /api/gerar-relatorio
 *
 * "Locais mais visitados" (a partir de checkins) já cobre "selos salvos
 * por lugar" — cada selo salvo localmente no aparelho do turista
 * corresponde a 1 check-in gravado aqui ao mesmo tempo (ver
 * js/core/selos-local.js). Não duplicamos rastreamento pra isso, só
 * deixamos o rótulo do gráfico explícito sobre a equivalência.
 */
import { db } from "../core/firebase-config.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const LABEL_REFEICAO = { cafeDaManha: "Café da manhã", almoco: "Almoço", tarde: "Lanche da tarde", janta: "Janta" };
const LABEL_INTERESSE = { historia: "História", natureza: "Natureza", gastronomia: "Gastronomia", compras: "Compras", familia: "Família", cultura: "Cultura austríaca" };
const DIAS_SEMANA_LABEL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

let ultimoResumoParaIA = null; // guardado depois de cada carregamento, pro botão de IA usar sem recalcular

function iniciarEstatisticas() {
  document.addEventListener("linde-guia:admin-autenticado", carregarEstatisticas);

  const botaoIA = document.getElementById("btn-gerar-relatorio-ia");
  if (botaoIA) botaoIA.addEventListener("click", gerarRelatorioComIA);
}
document.addEventListener("DOMContentLoaded", iniciarEstatisticas);

async function carregarEstatisticas() {
  const [rotasCriadas, checkins, acessosDiarios] = await Promise.all([
    buscarTodos("rotas_criadas"),
    buscarTodos("checkins"),
    buscarAcessosDiarios(),
  ]);

  const criacoes     = rotasCriadas.filter((r) => r.tipoEvento !== "finalizacao");
  const finalizacoes = rotasCriadas.filter((r) => r.tipoEvento === "finalizacao");
  const totalAcessos = acessosDiarios.reduce((soma, d) => soma + (d.total || 0), 0);

  desenharKPIs(criacoes, finalizacoes, checkins, totalAcessos);
  desenharAcessosPorDia(acessosDiarios);
  desenharAcessosPorHorario(acessosDiarios);
  desenharFunilConversao(totalAcessos, criacoes.length, finalizacoes.length);
  desenharRotasPorDia(criacoes);
  desenharRotasPorHorario(criacoes);
  desenharConclusao(criacoes, finalizacoes);
  desenharDiaDaSemana(criacoes);
  desenharRefeicoesPedidas(criacoes);
  desenharInteressesMarcados(criacoes);
  desenharLocaisVisitados(checkins);
  desenharTabelaCheckins(checkins);

  ultimoResumoParaIA = montarResumoAgregado(criacoes, finalizacoes, checkins, acessosDiarios, totalAcessos);
}

async function buscarTodos(colecao) {
  try {
    const snap = await getDocs(collection(db, colecao));
    return snap.docs.map((d) => normalizarTimestamps(d.data()));
  } catch (e) {
    console.error(`[admin-estatisticas] Erro em ${colecao}:`, e);
    return [];
  }
}

// acessos_diarios tem o dado no ID do doc (a data), não num campo — busca
// separada dos outros, que usam campo criadoEm/checkinEm.
async function buscarAcessosDiarios() {
  try {
    const snap = await getDocs(collection(db, "acessos_diarios"));
    return snap.docs.map((d) => ({ data: d.id, ...d.data() }));
  } catch (e) {
    console.error("[admin-estatisticas] Erro em acessos_diarios:", e);
    return [];
  }
}

function normalizarTimestamps(doc) {
  const c = { ...doc };
  for (const k in c) if (c[k]?.toDate) c[k] = c[k].toDate();
  return c;
}

// ============================================================
// KPIs
// ============================================================
function desenharKPIs(criacoes, finalizacoes, checkins, totalAcessos) {
  const taxaConclusao   = criacoes.length > 0 ? Math.round((finalizacoes.length / criacoes.length) * 100) : 0;
  const taxaConversao   = totalAcessos > 0 ? Math.round((criacoes.length / totalAcessos) * 100) : 0;
  const rotasVazias     = criacoes.filter((r) => r.capituloVazio).length;
  const mediaParadas    = criacoes.length > 0
    ? (criacoes.reduce((soma, r) => soma + (r.quantidadeParadas || 0), 0) / criacoes.length).toFixed(1)
    : "0";

  document.getElementById("cartoes-resumo").innerHTML = `
    <div class="kpi-card"><span class="kpi-card__label">Acessos totais</span><span class="kpi-card__valor">${totalAcessos}</span></div>
    <div class="kpi-card"><span class="kpi-card__label">Rotas criadas</span><span class="kpi-card__valor">${criacoes.length}</span></div>
    <div class="kpi-card"><span class="kpi-card__label">Taxa de conversão</span><span class="kpi-card__valor kpi-card__valor--destaque">${taxaConversao}%</span></div>
    <div class="kpi-card"><span class="kpi-card__label">Concluídas</span><span class="kpi-card__valor">${finalizacoes.length}</span></div>
    <div class="kpi-card"><span class="kpi-card__label">Taxa de conclusão</span><span class="kpi-card__valor kpi-card__valor--destaque">${taxaConclusao}%</span></div>
    <div class="kpi-card"><span class="kpi-card__label">Check-ins (selos)</span><span class="kpi-card__valor">${checkins.length}</span></div>
    <div class="kpi-card"><span class="kpi-card__label">Média de paradas/rota</span><span class="kpi-card__valor">${mediaParadas}</span></div>
    <div class="kpi-card"><span class="kpi-card__label">Rotas sem resultado</span><span class="kpi-card__valor" style="color:${rotasVazias > 0 ? 'var(--borde)' : 'inherit'}">${rotasVazias}</span></div>
  `;
}

// ============================================================
// ACESSOS
// ============================================================
function desenharAcessosPorDia(acessosDiarios) {
  const ordenados = [...acessosDiarios].sort((a, b) => a.data.localeCompare(b.data));
  grafico(
    "grafico-acessos-por-dia", "bar",
    ordenados.map((d) => diaExibicao(d.data)),
    [{ label: "Acessos", data: ordenados.map((d) => d.total || 0), backgroundColor: "#4A6B9E", borderRadius: 6 }]
  );
}

function desenharAcessosPorHorario(acessosDiarios) {
  const arr = new Array(24).fill(0);
  acessosDiarios.forEach((d) => {
    const porHora = d.porHora || {};
    for (const [hora, qtd] of Object.entries(porHora)) {
      const h = Number(hora);
      if (h >= 0 && h < 24) arr[h] += qtd || 0;
    }
  });
  grafico(
    "grafico-acessos-por-horario", "bar",
    arr.map((_, h) => `${String(h).padStart(2, "0")}h`),
    [{ label: "Acessos", data: arr, backgroundColor: "#8B6B1A", borderRadius: 4 }]
  );
}

// ============================================================
// FUNIL DE CONVERSÃO — bom argumento de venda: mostra volume de topo
// (acessos) até o resultado final (rota concluída de fato)
// ============================================================
function desenharFunilConversao(totalAcessos, qtdCriacoes, qtdFinalizacoes) {
  grafico(
    "grafico-funil-conversao", "bar",
    ["Acessos", "Rotas criadas", "Concluídas"],
    [{
      label: "Pessoas",
      data: [totalAcessos, qtdCriacoes, qtdFinalizacoes],
      backgroundColor: ["#4A6B9E", "#3C4A3E", "#9E2B25"],
      borderRadius: 6,
    }],
    { indexAxis: "y" }
  );
}

// ============================================================
// ROTAS — dia / horário / conclusão (já existiam)
// ============================================================
function desenharRotasPorDia(criacoes) {
  const map = {};
  criacoes.forEach((r) => { if (r.criadoEm) { const k = diaChave(r.criadoEm); map[k] = (map[k]||0)+1; } });
  const dias = Object.keys(map).sort();
  grafico("grafico-rotas-por-dia","bar",dias.map(diaExibicao),[{label:"Rotas criadas",data:dias.map(d=>map[d]),backgroundColor:"#3C4A3E",borderRadius:6}]);
}

function desenharRotasPorHorario(criacoes) {
  const arr = new Array(24).fill(0);
  criacoes.forEach((r) => { if (r.criadoEm) arr[r.criadoEm.getHours()]++; });
  grafico("grafico-rotas-por-horario","bar",arr.map((_,h)=>`${String(h).padStart(2,"0")}h`),[{label:"Rotas",data:arr,backgroundColor:"#9E2B25",borderRadius:4}]);
}

function desenharConclusao(criacoes, finalizacoes) {
  const c={},f={};
  criacoes.forEach(r=>{if(r.criadoEm){const k=diaChave(r.criadoEm);c[k]=(c[k]||0)+1;}});
  finalizacoes.forEach(r=>{if(r.criadoEm){const k=diaChave(r.criadoEm);f[k]=(f[k]||0)+1;}});
  const dias=[...new Set([...Object.keys(c),...Object.keys(f)])].sort();
  grafico("grafico-conclusao","line",dias.map(diaExibicao),[
    {label:"Criadas",data:dias.map(d=>c[d]||0),borderColor:"#3C4A3E",backgroundColor:"transparent",tension:.3},
    {label:"Concluídas",data:dias.map(d=>f[d]||0),borderColor:"#9E2B25",backgroundColor:"transparent",tension:.3},
  ]);
}

// ============================================================
// DIA DA SEMANA MAIS MOVIMENTADO
// ============================================================
function desenharDiaDaSemana(criacoes) {
  const arr = new Array(7).fill(0);
  criacoes.forEach((r) => { if (r.criadoEm) arr[r.criadoEm.getDay()]++; });
  grafico(
    "grafico-dia-semana", "bar",
    DIAS_SEMANA_LABEL,
    [{ label: "Rotas criadas", data: arr, backgroundColor: "#6B4226", borderRadius: 6 }]
  );
}

// ============================================================
// REFEIÇÕES MAIS PEDIDAS / INTERESSES MAIS MARCADOS
// ============================================================
function desenharRefeicoesPedidas(criacoes) {
  const contagem = {};
  criacoes.forEach((r) => (r.refeicoesDesejadas || []).forEach((ref) => { contagem[ref] = (contagem[ref]||0)+1; }));
  const entradas = Object.entries(contagem).sort((a,b) => b[1]-a[1]);
  grafico(
    "grafico-refeicoes-pedidas", "bar",
    entradas.map(([k]) => LABEL_REFEICAO[k] || k),
    [{ label: "Vezes pedida", data: entradas.map(([,q]) => q), backgroundColor: "#C8943A", borderRadius: 6 }]
  );
}

function desenharInteressesMarcados(criacoes) {
  const contagem = {};
  criacoes.forEach((r) => (r.interesses || []).forEach((int) => { contagem[int] = (contagem[int]||0)+1; }));
  const entradas = Object.entries(contagem).sort((a,b) => b[1]-a[1]);
  grafico(
    "grafico-interesses-marcados", "bar",
    entradas.map(([k]) => LABEL_INTERESSE[k] || k),
    [{ label: "Vezes marcado", data: entradas.map(([,q]) => q), backgroundColor: "#2D7A3A", borderRadius: 6 }]
  );
}

// ============================================================
// LOCAIS MAIS VISITADOS = SELOS POR LUGAR (mesma fonte, ver comentário no
// topo do arquivo — cada check-in aqui é 1 selo salvo no aparelho do
// turista naquele momento)
// ============================================================
function desenharLocaisVisitados(checkins) {
  const map={};
  checkins.forEach(c=>{const n=c.poiNome||"Desconhecido";map[n]=(map[n]||0)+1;});
  const ord=Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,10);
  grafico("grafico-locais-visitados","bar",ord.map(([n])=>n),[{label:"Selos / check-ins",data:ord.map(([,q])=>q),backgroundColor:"#B8924A",borderRadius:6}],{indexAxis:"y"});
}

function desenharTabelaCheckins(checkins) {
  const tbody = document.querySelector("#tabela-checkins tbody");
  tbody.innerHTML = "";
  [...checkins].filter(c=>c.checkinEm).sort((a,b)=>b.checkinEm-a.checkinEm).slice(0,30).forEach(c=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${c.poiNome||"—"}</td><td>${c.poiCategoria||"—"}</td><td>${diaExibicao(diaChave(c.checkinEm))}</td><td>${String(c.checkinEm.getHours()).padStart(2,"0")}:${String(c.checkinEm.getMinutes()).padStart(2,"0")}</td><td>${c.origemDeteccao||"—"}</td>`;
    tbody.appendChild(tr);
  });
}

// ============================================================
// RELATÓRIO COM IA — manda só o resumo agregado (nunca dado individual)
// ============================================================
function montarResumoAgregado(criacoes, finalizacoes, checkins, acessosDiarios, totalAcessos) {
  const contagemRefeicoes = {};
  criacoes.forEach((r) => (r.refeicoesDesejadas || []).forEach((ref) => { contagemRefeicoes[ref] = (contagemRefeicoes[ref]||0)+1; }));

  const contagemInteresses = {};
  criacoes.forEach((r) => (r.interesses || []).forEach((int) => { contagemInteresses[int] = (contagemInteresses[int]||0)+1; }));

  const contagemLocais = {};
  checkins.forEach((c) => { const n = c.poiNome||"Desconhecido"; contagemLocais[n] = (contagemLocais[n]||0)+1; });
  const topLocais = Object.entries(contagemLocais).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([n,q])=>`${n} (${q})`);

  return {
    periodoComDadosDesde: acessosDiarios.length > 0 ? [...acessosDiarios].sort((a,b)=>a.data.localeCompare(b.data))[0].data : null,
    totalAcessos,
    totalRotasCriadas: criacoes.length,
    totalRotasConcluidas: finalizacoes.length,
    taxaConversaoAcessoParaRota: totalAcessos > 0 ? Math.round((criacoes.length/totalAcessos)*100) : null,
    taxaConclusao: criacoes.length > 0 ? Math.round((finalizacoes.length/criacoes.length)*100) : null,
    totalCheckins: checkins.length,
    rotasSemResultado: criacoes.filter((r)=>r.capituloVazio).length,
    mediaParadasPorRota: criacoes.length > 0 ? Number((criacoes.reduce((s,r)=>s+(r.quantidadeParadas||0),0)/criacoes.length).toFixed(1)) : null,
    refeicoesMaisPedidas: Object.entries(contagemRefeicoes).sort((a,b)=>b[1]-a[1]).map(([k,q])=>({ refeicao: LABEL_REFEICAO[k]||k, vezes: q })),
    interessesMaisMarcados: Object.entries(contagemInteresses).sort((a,b)=>b[1]-a[1]).map(([k,q])=>({ interesse: LABEL_INTERESSE[k]||k, vezes: q })),
    top5LocaisMaisVisitados: topLocais,
  };
}

async function gerarRelatorioComIA() {
  const botao = document.getElementById("btn-gerar-relatorio-ia");
  const statusEl = document.getElementById("relatorio-ia-status");
  const resultadoEl = document.getElementById("relatorio-ia-resultado");

  if (!ultimoResumoParaIA) {
    statusEl.textContent = "Aguarde os gráficos carregarem antes de gerar o relatório.";
    statusEl.dataset.tipo = "erro";
    return;
  }

  botao.disabled = true;
  statusEl.textContent = "Gerando relatório...";
  statusEl.dataset.tipo = "";
  resultadoEl.hidden = true;

  try {
    const resposta = await fetch("/api/gerar-relatorio", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resumo: ultimoResumoParaIA }),
    });

    const dados = await resposta.json();

    if (!resposta.ok || !dados.relatorio) {
      throw new Error(dados.erro || "Falha desconhecida");
    }

    resultadoEl.textContent = dados.relatorio;
    resultadoEl.hidden = false;
    statusEl.textContent = "";
  } catch (erro) {
    console.error("[admin-estatisticas] Erro ao gerar relatório:", erro);
    statusEl.textContent = "Não consegui gerar o relatório agora. Tenta de novo em instante.";
    statusEl.dataset.tipo = "erro";
  } finally {
    botao.disabled = false;
  }
}

// ============================================================
// UTILITÁRIOS
// ============================================================
function grafico(id, tipo, labels, datasets, extra={}) {
  const canvas = document.getElementById(id);
  if (!canvas || typeof Chart==="undefined") return;
  // Reaproveitar canvas entre chamadas (aba pode recarregar) — Chart.js
  // reclama se instanciar de novo sem destruir a instância anterior.
  if (canvas._chartInstance) canvas._chartInstance.destroy();
  canvas._chartInstance = new Chart(canvas,{type:tipo,data:{labels,datasets},options:{responsive:true,plugins:{legend:{display:datasets.length>1}},...extra}});
}

function diaChave(d) { return d.toISOString().slice(0,10); }
function diaExibicao(k) { const [,m,d]=k.split("-"); return `${d}/${m}`; }
