/**
 * explorar.js
 * Linde Guia — Treze Tílias
 *
 * Lógica da tela "Explorar" (pages/explorar.html). Lê os POIs pelo
 * mesmo canal único que o resto do app (pois-data.js), filtra por
 * categoria, e sincroniza o filtro ativo com a URL (?categoria=...)
 * para que os cards da Home (index.html) cheguem direto na categoria
 * certa.
 */
import { buscarTodosPois } from "../data/pois-data.js";
import { estaAbertoNoHorario } from "../engine/motor-rota.js";

let todosPois = [];
let categoriaAtiva = "todas";

function iniciarExplorar() {
  categoriaAtiva = lerCategoriaDaUrl();
  marcarChipAtivo(categoriaAtiva);
  configurarFiltros();
  carregarLocais();
}

document.addEventListener("DOMContentLoaded", iniciarExplorar);

// ============================================================
// URL <-> FILTRO
// ============================================================
function lerCategoriaDaUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("categoria") || "todas";
}

function atualizarUrl(categoria) {
  const url = new URL(window.location.href);
  if (categoria === "todas") {
    url.searchParams.delete("categoria");
  } else {
    url.searchParams.set("categoria", categoria);
  }
  window.history.replaceState({}, "", url);
}

// ============================================================
// FILTROS (chips)
// ============================================================
function configurarFiltros() {
  document.querySelectorAll(".filtro-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      categoriaAtiva = chip.dataset.cat;
      marcarChipAtivo(categoriaAtiva);
      atualizarUrl(categoriaAtiva);
      renderizarLista();
    });
  });
}

function marcarChipAtivo(categoria) {
  document.querySelectorAll(".filtro-chip").forEach((chip) => {
    chip.setAttribute("aria-pressed", String(chip.dataset.cat === categoria));
  });
}

// ============================================================
// CARREGAR DADOS
// ============================================================
async function carregarLocais() {
  const estadoCarregando = document.getElementById("estado-carregando");
  try {
    todosPois = await buscarTodosPois();
  } catch (erro) {
    console.error("[explorar] Erro ao carregar locais:", erro);
    todosPois = [];
  } finally {
    estadoCarregando.hidden = true;
  }
  renderizarLista();
}

// ============================================================
// RENDERIZAÇÃO
// ============================================================
function renderizarLista() {
  const grade = document.getElementById("grade-locais");
  const estadoVazio = document.getElementById("estado-vazio");
  grade.innerHTML = "";

  const filtrados = todosPois
    .filter((poi) => categoriaAtiva === "todas" || poi.categoria === categoriaAtiva)
    .filter((poi) => poi.statusOperacional !== "fechado_temporariamente")
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));

  estadoVazio.hidden = filtrados.length > 0;

  filtrados.forEach((poi) => grade.appendChild(criarCardLocal(poi)));
}

function criarCardLocal(poi) {
  const card = document.createElement("article");
  card.className = "card-local";

  const status = calcularStatusExibicao(poi);
  const preco = poi.precoEstimado > 0 ? `R$${poi.precoEstimado}` : "Grátis";

  card.innerHTML = `
    <div class="card-local__topo">
      <h3 class="card-local__nome">${escaparHtml(poi.nome)}</h3>
      <span class="card-local__status status--${status.chave}">${status.texto}</span>
    </div>
    <p class="card-local__descricao">${escaparHtml(poi.descricaoCurta || "")}</p>
    <div class="card-local__rodape">
      <span class="tag-categoria">${escaparHtml(poi.categoria || "—")}</span>
      <span class="card-local__detalhe">${poi.duracaoMediaVisitaMin || 30} min · ${preco}</span>
    </div>
  `;
  return card;
}

// O card precisa combinar DUAS informações que são independentes uma da
// outra: o status manual do admin (Ativo/Sazonal/Em reforma/Fechado — um
// estado de médio/longo prazo) e se o local está de fato aberto NESTE
// exato momento pelo horário configurado por dia da semana. Antes, o card
// só olhava o status manual — então marcar um dia como "fechado" no
// horário, ou um horário de fechamento que já passou, não mudava nada na
// tela: o local continuava aparecendo como "Aberto" porque o status
// manual continuava "ativo".
function calcularStatusExibicao(poi) {
  // Status manual não-ativo (sazonal, em reforma) tem prioridade — é uma
  // decisão explícita do admin que vale mais que o horário automático.
  if (poi.statusOperacional && poi.statusOperacional !== "ativo") {
    return { chave: poi.statusOperacional, texto: formatarStatus(poi.statusOperacional) };
  }

  const agora = new Date();
  const abertoAgora = estaAbertoNoHorario(poi, agora, agora);

  return abertoAgora
    ? { chave: "ativo", texto: "Aberto agora" }
    : { chave: "fechado_agora", texto: "Fechado agora" };
}

function formatarStatus(status) {
  return { ativo: "Aberto", sazonal: "Sazonal", em_reforma: "Em reforma", fechado_temporariamente: "Fechado" }[status] || status;
}

// Evita que descrição/nome vindos do Firestore quebrem o HTML por acidente
function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}
