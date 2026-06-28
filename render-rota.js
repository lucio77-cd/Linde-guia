/**
 * render-rota.js
 * Linde Guia — Treze Tílias
 *
 * Pega o resultado já calculado (guardado em sessionStorage por
 * formulario-roteiro.js) e desenha a sub-vista de resultado em
 * minha-rota.html. NÃO recalcula nada — só apresentação.
 *
 * Exporta funções que modo-em-rota.js reaproveita para desenhar o
 * card da parada ativa durante o passeio (mesmo formato visual).
 */

const CHAVE_SESSION_STORAGE = "linde-guia:rota-gerada";

// ============================================================
// INICIALIZAÇÃO
// ============================================================
function iniciarRenderRota() {
  const rota = lerRotaDoStorage();

  esconderTodosOsEstados();

  if (!rota) {
    mostrarEstado("estado-sem-rota");
    return;
  }

  if (rota.vazia || rota.paradas.length === 0) {
    mostrarEstado("estado-rota-vazia");
    return;
  }

  mostrarEstado("vista-resultado");
  renderizarResultado(rota);

  configurarBotaoIniciar(rota);
}

document.addEventListener("DOMContentLoaded", iniciarRenderRota);

// ============================================================
// LEITURA DO RESULTADO
// ============================================================
function lerRotaDoStorage() {
  try {
    const bruto = sessionStorage.getItem(CHAVE_SESSION_STORAGE);
    if (!bruto) return null;
    return JSON.parse(bruto);
  } catch (erro) {
    console.error("[render-rota] Erro ao ler rota do sessionStorage:", erro);
    return null;
  }
}

function salvarRotaNoStorage(rota) {
  sessionStorage.setItem(CHAVE_SESSION_STORAGE, JSON.stringify(rota));
}

// ============================================================
// CONTROLE DE ESTADOS/SUB-VISTAS (todos vivem no mesmo HTML)
// ============================================================
const IDS_ESTADOS = [
  "estado-carregando",
  "estado-sem-rota",
  "estado-rota-vazia",
  "vista-resultado",
  "vista-em-rota",
  "vista-finalizada",
];

function esconderTodosOsEstados() {
  IDS_ESTADOS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  });
}

function mostrarEstado(id) {
  esconderTodosOsEstados();
  const el = document.getElementById(id);
  if (el) el.hidden = false;
}

// ============================================================
// RENDERIZAÇÃO DA LISTA DE PARADAS
// ============================================================
function renderizarResultado(rota) {
  const resumoEl = document.getElementById("resumo-texto");
  resumoEl.textContent = montarTextoResumo(rota);

  const listaEl = document.getElementById("lista-paradas");
  listaEl.innerHTML = "";

  rota.paradas.forEach((parada, indice) => {
    listaEl.appendChild(criarParadaCard(parada, indice));
  });
}

function montarTextoResumo(rota) {
  const horas = Math.floor(rota.tempoTotalEstimadoMin / 60);
  const minutos = rota.tempoTotalEstimadoMin % 60;
  const tempoTexto = horas > 0 ? `${horas}h${minutos > 0 ? minutos + "min" : ""}` : `${minutos}min`;

  return `${rota.paradas.length} ${rota.paradas.length === 1 ? "parada" : "paradas"} · ${tempoTexto}`;
}

function criarParadaCard(parada, indice) {
  const li = document.createElement("li");
  li.className = "parada-card";

  const numero = document.createElement("div");
  numero.className = "parada-card__numero";
  numero.textContent = String(indice + 1);

  const corpo = document.createElement("div");
  corpo.className = "parada-card__corpo";

  const horario = document.createElement("p");
  horario.className = "parada-card__horario";
  horario.textContent = formatarHorario(parada.horarioChegada);

  const nome = document.createElement("h3");
  nome.className = "parada-card__nome";
  nome.textContent = parada.nome;

  const detalhes = document.createElement("div");
  detalhes.className = "parada-card__detalhes";
  detalhes.innerHTML = `
    <span>${parada.duracaoMediaVisitaMin} min de visita</span>
    <span>${parada.precoEstimado > 0 ? "R$" + parada.precoEstimado : "Grátis"}</span>
  `;

  const acoes = document.createElement("div");
  acoes.className = "parada-card__acoes";
  const linkDetalhe = document.createElement("a");
  linkDetalhe.href = `ponto.html?id=${parada.id}`;
  linkDetalhe.className = "parada-card__trocar";
  linkDetalhe.style.color = "var(--cor-marca)";
  linkDetalhe.textContent = "Ver detalhes";
  acoes.appendChild(linkDetalhe);

  corpo.append(horario, nome, detalhes, acoes);
  li.append(numero, corpo);

  return li;
}

function formatarHorario(dataHorario) {
  if (!dataHorario) return "";
  const data = new Date(dataHorario);
  const horas = String(data.getHours()).padStart(2, "0");
  const minutos = String(data.getMinutes()).padStart(2, "0");
  return `${horas}:${minutos}`;
}

// ============================================================
// BOTÃO "INICIAR ROTEIRO" — troca pra sub-vista Em Rota
// ============================================================
function configurarBotaoIniciar(rota) {
  const botao = document.getElementById("btn-iniciar-roteiro");
  botao.addEventListener("click", () => {
    sessionStorage.setItem("linde-guia:parada-atual-index", "0");
    mostrarEstado("vista-em-rota");
    // modo-em-rota.js escuta esse evento customizado pra desenhar o card inicial
    document.dispatchEvent(new CustomEvent("linde-guia:iniciar-em-rota", { detail: { rota } }));
  });
}

// ============================================================
// EXPORTAÇÃO — reaproveitado por modo-em-rota.js
// ============================================================
export {
  formatarHorario,
  montarTextoResumo,
  lerRotaDoStorage,
  salvarRotaNoStorage,
  mostrarEstado,
};
