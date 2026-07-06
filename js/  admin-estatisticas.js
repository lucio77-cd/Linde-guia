/**
 * admin-estatisticas.js
 * Linde Guia — Painel administrativo
 *
 * Lê as coleções "rotas_criadas" e "checkins" (gravadas por
 * registro-data.js durante o uso real do app) e desenha os gráficos:
 * 1. Rotas criadas por dia
 * 2. Horário em que as rotas são criadas
 * 3. Rotas criadas vs. concluídas
 * 4. Locais mais visitados (check-ins confirmados)
 */

import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let graficosInstanciados = [];

function iniciarEstatisticas() {
  document.addEventListener("linde-guia:admin-autenticado", carregarEstatisticas);
}

document.addEventListener("DOMContentLoaded", iniciarEstatisticas);

async function carregarEstatisticas() {
  const [rotasCriadas, checkins] = await Promise.all([
    buscarTodosDocumentos("rotas_criadas"),
    buscarTodosDocumentos("checkins"),
  ]);

  // "rotas_criadas" mistura dois tipos de documento (criação e finalização),
  // diferenciados pelo campo tipoEvento.
  const criacoes = rotasCriadas.filter((r) => r.tipoEvento !== "finalizacao");
  const finalizacoes = rotasCriadas.filter((r) => r.tipoEvento === "finalizacao");

  desenharCartoesResumo(criacoes, finalizacoes, checkins);
  desenharGraficoRotasPorDia(criacoes);
  desenharGraficoRotasPorHorario(criacoes);
  desenharGraficoConclusao(criacoes, finalizacoes);
  desenharGraficoLocaisVisitados(checkins);
  desenharTabelaCheckins(checkins);
}

async function buscarTodosDocumentos(nomeColecao) {
  try {
    const snapshot = await getDocs(collection(db, nomeColecao));
    return snapshot.docs.map((d) => normalizarTimestamps(d.data()));
  } catch (erro) {
    console.error(`[admin-estatisticas] Erro ao buscar ${nomeColecao}:`, erro);
    return [];
  }
}

// Converte qualquer campo Firestore Timestamp para objeto Date, pra
// facilitar manipulação no resto do arquivo.
function normalizarTimestamps(doc) {
  const copia = { ...doc };
  for (const chave in copia) {
    if (copia[chave] && typeof copia[chave].toDate === "function") {
      copia[chave] = copia[chave].toDate();
    }
  }
  return copia;
}

// ============================================================
// CARTÕES DE RESUMO
// ============================================================
function desenharCartoesResumo(criacoes, finalizacoes, checkins) {
  const container = document.getElementById("cartoes-resumo");
  const taxaConclusao = criacoes.length > 0 ? Math.round((finalizacoes.length / criacoes.length) * 100) : 0;

  container.innerHTML = `
    <div class="cartao-resumo"><strong>${criacoes.length}</strong><span>Rotas criadas</span></div>
    <div class="cartao-resumo"><strong>${finalizacoes.length}</strong><span>Roteiros concluídos</span></div>
    <div class="cartao-resumo"><strong>${taxaConclusao}%</strong><span>Taxa de conclusão</span></div>
    <div class="cartao-resumo"><strong>${checkins.length}</strong><span>Check-ins confirmados</span></div>
  `;
}

// ============================================================
// GRÁFICO 1 — Rotas criadas por dia
// ============================================================
function desenharGraficoRotasPorDia(criacoes) {
  const contagemPorDia = {};

  criacoes.forEach((rota) => {
    if (!rota.criadoEm) return;
    const diaChave = formatarDiaChave(rota.criadoEm);
    contagemPorDia[diaChave] = (contagemPorDia[diaChave] || 0) + 1;
  });

  const dias = Object.keys(contagemPorDia).sort();
  const valores = dias.map((d) => contagemPorDia[d]);

  criarGrafico("grafico-rotas-por-dia", "bar", dias.map(formatarDiaExibicao), [
    { label: "Rotas criadas", data: valores, backgroundColor: "#3C4A3E" },
  ]);
}

// ============================================================
// GRÁFICO 2 — Horário em que as rotas são criadas (agrupado por hora)
// ============================================================
function desenharGraficoRotasPorHorario(criacoes) {
  const contagemPorHora = new Array(24).fill(0);

  criacoes.forEach((rota) => {
    if (!rota.criadoEm) return;
    const hora = rota.criadoEm.getHours();
    contagemPorHora[hora]++;
  });

  const labels = contagemPorHora.map((_, h) => `${String(h).padStart(2, "0")}h`);

  criarGrafico("grafico-rotas-por-horario", "bar", labels, [
    { label: "Rotas criadas", data: contagemPorHora, backgroundColor: "#9E2B25" },
  ]);
}

// ============================================================
// GRÁFICO 3 — Rotas criadas vs. concluídas (por dia)
// ============================================================
function desenharGraficoConclusao(criacoes, finalizacoes) {
  const criadasPorDia = {};
  const concluidasPorDia = {};

  criacoes.forEach((r) => {
    if (!r.criadoEm) return;
    const dia = formatarDiaChave(r.criadoEm);
    criadasPorDia[dia] = (criadasPorDia[dia] || 0) + 1;
  });

  finalizacoes.forEach((r) => {
    if (!r.criadoEm) return;
    const dia = formatarDiaChave(r.criadoEm);
    concluidasPorDia[dia] = (concluidasPorDia[dia] || 0) + 1;
  });

  const todosOsDias = Array.from(new Set([...Object.keys(criadasPorDia), ...Object.keys(concluidasPorDia)])).sort();

  criarGrafico(
    "grafico-conclusao",
    "line",
    todosOsDias.map(formatarDiaExibicao),
    [
      { label: "Criadas", data: todosOsDias.map((d) => criadasPorDia[d] || 0), borderColor: "#3C4A3E", backgroundColor: "transparent" },
      { label: "Concluídas", data: todosOsDias.map((d) => concluidasPorDia[d] || 0), borderColor: "#9E2B25", backgroundColor: "transparent" },
    ]
  );
}

// ============================================================
// GRÁFICO 4 — Locais mais visitados (check-ins confirmados)
// ============================================================
function desenharGraficoLocaisVisitados(checkins) {
  const contagemPorLocal = {};

  checkins.forEach((c) => {
    const nome = c.poiNome || "Desconhecido";
    contagemPorLocal[nome] = (contagemPorLocal[nome] || 0) + 1;
  });

  const ordenado = Object.entries(contagemPorLocal).sort((a, b) => b[1] - a[1]).slice(0, 10);

  criarGrafico(
    "grafico-locais-visitados",
    "bar",
    ordenado.map(([nome]) => nome),
    [{ label: "Check-ins", data: ordenado.map(([, qtd]) => qtd), backgroundColor: "#B8924A" }],
    { indexAxis: "y" }
  );
}

// ============================================================
// TABELA — Check-ins recentes
// ============================================================
function desenharTabelaCheckins(checkins) {
  const tbody = document.querySelector("#tabela-checkins tbody");
  tbody.innerHTML = "";

  const recentes = [...checkins]
    .filter((c) => c.checkinEm)
    .sort((a, b) => b.checkinEm - a.checkinEm)
    .slice(0, 30);

  recentes.forEach((c) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${c.poiNome || "—"}</td>
      <td>${formatarDiaExibicao(formatarDiaChave(c.checkinEm))}</td>
      <td>${String(c.checkinEm.getHours()).padStart(2, "0")}:${String(c.checkinEm.getMinutes()).padStart(2, "0")}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ============================================================
// HELPERS DE GRÁFICO E DATA
// ============================================================
function criarGrafico(canvasId, tipo, labels, datasets, opcoesExtra = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;

  new Chart(canvas, {
    type: tipo,
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { display: datasets.length > 1 } },
      ...opcoesExtra,
    },
  });
}

function formatarDiaChave(data) {
  // YYYY-MM-DD, ordenável como string
  return data.toISOString().slice(0, 10);
}

function formatarDiaExibicao(diaChave) {
  const [ano, mes, dia] = diaChave.split("-");
  return `${dia}/${mes}`;
}
