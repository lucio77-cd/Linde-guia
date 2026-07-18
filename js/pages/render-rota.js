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

import { desenharMapaCompleto } from "./mapa-rota.js";

const CHAVE_SESSION_STORAGE = "linde-guia:capitulo-atual";

// Mapa Leaflet do resultado atual. Guardado aqui (não local a
// renderizarResultado) porque precisa ser removido explicitamente antes de
// desenhar um mapa novo — Leaflet lança erro ("Map container is already
// initialized") se L.map() for chamado de novo na mesma <div> sem isso.
// Isso acontece de verdade neste app: toda vez que a pessoa termina um
// capítulo e escolhe "continuar", renderizarResultado() é chamado outra
// vez pro capítulo seguinte, na mesma div#mapa-rota.
let mapaAtual = null;

// ============================================================
// INICIALIZAÇÃO
// ============================================================
function iniciarRenderRota() {
  const capitulo = lerRotaDoStorage();

  esconderTodosOsEstados();
  mostrarAvisoSeHouver();

  if (!capitulo) {
    mostrarEstado("estado-sem-rota");
    return;
  }

  if (capitulo.vazio || capitulo.paradas.length === 0) {
    mostrarEstado("estado-rota-vazia");
    return;
  }

  mostrarEstado("vista-resultado");
  renderizarResultado(capitulo);

  configurarBotaoIniciar(capitulo);
}

document.addEventListener("DOMContentLoaded", iniciarRenderRota);

// ============================================================
// AVISO DE ITENS DESCARTADOS (modo manual — roteiro-manual.js/perfil.js)
// ============================================================
// Consome a chave assim que mostra — não pode sobreviver a um F5 ou a uma
// visita futura à página, senão o aviso de uma rota antiga reaparece do
// nada numa rota nova sem relação nenhuma com ele.
function mostrarAvisoSeHouver() {
  const CHAVE_AVISO = "linde-guia:aviso-proxima-tela";
  const texto = sessionStorage.getItem(CHAVE_AVISO);
  if (!texto) return;

  sessionStorage.removeItem(CHAVE_AVISO);

  const el = document.getElementById("aviso-descartados");
  if (!el) return;

  el.textContent = texto;
  el.hidden = false;
}

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
  "vista-continuar",
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
function renderizarResultado(capitulo) {
  const resumoEl = document.getElementById("resumo-texto");
  resumoEl.textContent = montarTextoResumo(capitulo);

  const listaEl = document.getElementById("lista-paradas");
  listaEl.innerHTML = "";

  capitulo.paradas.forEach((parada, indice) => {
    listaEl.appendChild(criarParadaCard(parada, indice));
  });

  desenharOuAtualizarMapa(capitulo);
}

// Remove o mapa anterior (se houver) antes de desenhar o novo — necessário
// porque este mesmo #mapa-rota recebe um capítulo novo toda vez que a
// pessoa continua o passeio (ver comentário de mapaAtual no topo do
// arquivo). desenharMapaCompleto já lida sozinho com #mapa-rota ausente
// (ex: cache de HTML antigo sem essa div) ou Leaflet não carregado —
// devolve null nesses casos, sem lançar erro.
function desenharOuAtualizarMapa(capitulo) {
  if (mapaAtual) {
    mapaAtual.remove();
    mapaAtual = null;
  }

  mapaAtual = desenharMapaCompleto(
    "mapa-rota",
    capitulo.paradas,
    capitulo.perfilOriginal?.localizacaoPartida
  );
}

// Capítulo não carrega mais uma duração total pronta (não existe mais
// "tempo disponível" como conceito) — calcula a partir da diferença entre
// o horário de início do capítulo e a saída da última parada.
function montarTextoResumo(capitulo) {
  const ultimaParada = capitulo.paradas[capitulo.paradas.length - 1];
  const inicio = new Date(capitulo.perfilOriginal.horarioInicio);
  const fim = ultimaParada ? new Date(ultimaParada.horarioSaida) : inicio;
  const tempoTotalMin = Math.max(0, Math.round((fim.getTime() - inicio.getTime()) / 60000));

  const horas = Math.floor(tempoTotalMin / 60);
  const minutos = tempoTotalMin % 60;
  const tempoTexto = horas > 0 ? `${horas}h${minutos > 0 ? minutos + "min" : ""}` : `${minutos}min`;

  return `${capitulo.paradas.length} ${capitulo.paradas.length === 1 ? "parada" : "paradas"} · ${tempoTexto}`;
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

  const link = document.createElement("a");
  link.className = "parada-card__link";
  link.href = `ponto.html?id=${parada.id}`;
  link.textContent = "Ver detalhes";
  link.style.cssText = "display:inline-block; margin-top:0.375rem; font-size:0.8125rem; font-weight:600; color:var(--borde);";

  corpo.append(horario, nome, detalhes, link);
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
  renderizarResultado,
  configurarBotaoIniciar,
};
