/**
 * roteiro-manual.js
 * Linde Guia — Treze Tílias
 *
 * Lógica da tela "Montar meu roteiro" (pages/roteiro-manual.html) — modo
 * MANUAL: a pessoa escolhe os lugares com a própria mão, em vez do motor
 * decidir por pontuação (isso é o que js/pages/formulario-roteiro.js faz).
 *
 * Só entra na lista quem estaria aberto no horário escolhido — reaproveita
 * estaAbertoNoHorario() do motor, exportada especificamente pra esse tipo
 * de uso fora do fluxo de geração automática.
 *
 * Diferença de propósito importante em relação ao modo automático: aqui a
 * gente NÃO esconde locais já visitados (ver selos-local.js) — só marca com
 * um selo "✓ já visitado". Favoritar é "quero conhecer algum dia"; isso
 * aqui é "quero ir agora ou num horário específico", e faz sentido a pessoa
 * escolher voltar num lugar que já visitou.
 *
 * "Começar agora" e "Salvar pra outro dia" terminam nas mesmas funções que
 * o resto do app já usa (gerarCapituloDeFavoritos, minha-rota.html) — ver
 * comentário de arquitetura em rotas-manuais-local.js pra entender por que
 * só a ESCOLHA é salva, não a rota já calculada.
 */
import { buscarPoisAtivos } from "../data/pois-data.js";
import { estaAbertoNoHorario, gerarCapituloDeFavoritos } from "../engine/motor-rota.js";
import { lerSelos } from "../core/selos-local.js";
import { salvarRotaManual } from "../core/rotas-manuais-local.js";
import { desenharMapaCompleto } from "./mapa-rota.js";

const CATEGORIAS_LABEL = {
  gastronomia: "Gastronomia", historico: "História", natureza: "Natureza",
  compras: "Compras", lazer: "Lazer", cultura: "Cultura",
};

let todosPois = [];
let idsVisitados = new Set();
let quando = "agora"; // "agora" | "agendado"
let mapaAtual = null;

// Seleção guardada em ORDEM (array, não Set) — a ordem de escolha alimenta
// a prévia do mapa; a ordem final de verdade só é decidida na hora de
// "Começar agora" (ordenarPorProximidadeGeografica, dentro do motor).
let selecionados = [];

async function iniciar() {
  idsVisitados = new Set(lerSelos().map((s) => s.poiId).filter(Boolean));

  try {
    todosPois = await buscarPoisAtivos();
  } catch (erro) {
    console.error("[roteiro-manual] Erro ao carregar locais:", erro);
    document.getElementById("grade-locais").innerHTML =
      '<p class="estado-vazio">Não conseguimos carregar os locais agora. Tenta recarregar a página.</p>';
    return;
  }

  configurarQuando();
  configurarBarraSelecao();
  configurarModalSalvar();
  renderizarGrade();
  atualizarMapaPreview();
}

document.addEventListener("DOMContentLoaded", iniciar);

// ============================================================
// "QUANDO" — agora / agendado (mesmo padrão do roteiro.html automático)
// ============================================================
function configurarQuando() {
  document.querySelectorAll('.campo-quando .chip').forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll('.campo-quando .chip').forEach((c) => c.setAttribute("aria-pressed", "false"));
      chip.setAttribute("aria-pressed", "true");
      quando = chip.dataset.valor;

      const grupoAgendado = document.getElementById("grupo-horario-agendado");
      grupoAgendado.hidden = quando !== "agendado";

      renderizarGrade(); // recalcula quem está aberto no novo horário de referência
    });
  });

  document.getElementById("input-data-hora-agendada").addEventListener("change", () => {
    if (quando === "agendado") renderizarGrade();
  });

  // Valor padrão do agendamento: daqui a 1h, só pra já vir com algo plausível
  const daqui1h = new Date(Date.now() + 60 * 60 * 1000);
  document.getElementById("input-data-hora-agendada").value = formatarParaInputDatetime(daqui1h);
}

function formatarParaInputDatetime(data) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}T${pad(data.getHours())}:${pad(data.getMinutes())}`;
}

function obterHorarioReferencia() {
  if (quando === "agendado") {
    const valor = document.getElementById("input-data-hora-agendada").value;
    if (valor) return new Date(valor);
  }
  return new Date();
}

// ============================================================
// GRADE DE LOCAIS — só mostra quem estaria aberto no horário escolhido
// ============================================================
function renderizarGrade() {
  const referencia = obterHorarioReferencia();
  const grade = document.getElementById("grade-locais");
  grade.innerHTML = "";

  const abertos = todosPois.filter((poi) => estaAbertoNoHorario(poi, referencia, referencia));

  if (abertos.length === 0) {
    grade.innerHTML = '<p class="estado-vazio">Nada aberto nesse horário. Tenta escolher outro momento.</p>';
    return;
  }

  abertos.forEach((poi) => grade.appendChild(criarCardEscolha(poi)));
}

function criarCardEscolha(poi) {
  const card = document.createElement("article");
  card.className = "card-escolha";
  const jaSelecionado = selecionados.some((p) => p.id === poi.id);
  card.dataset.selecionado = String(jaSelecionado);

  const jaVisitado = idsVisitados.has(poi.id);

  card.innerHTML = `
    <div class="card-escolha__topo">
      <h3 class="card-escolha__nome">${escaparHtml(poi.nome)}</h3>
      ${jaVisitado ? '<span class="card-escolha__visitado">✓ já visitado</span>' : ""}
    </div>
    <p class="card-escolha__descricao">${escaparHtml(poi.descricaoCurta || "")}</p>
    <div class="card-escolha__rodape">
      <span class="tag-categoria">${escaparHtml(CATEGORIAS_LABEL[poi.categoria] || poi.categoria || "—")}</span>
      <button type="button" class="btn-adicionar" data-selecionado="${jaSelecionado}">
        ${jaSelecionado ? "✓ Adicionado" : "+ Adicionar"}
      </button>
    </div>
  `;

  card.querySelector(".btn-adicionar").addEventListener("click", () => alternarSelecao(poi, card));

  return card;
}

function alternarSelecao(poi, card) {
  const indice = selecionados.findIndex((p) => p.id === poi.id);
  const btn = card.querySelector(".btn-adicionar");

  if (indice >= 0) {
    selecionados.splice(indice, 1);
    btn.dataset.selecionado = "false";
    btn.textContent = "+ Adicionar";
    card.dataset.selecionado = "false";
  } else {
    selecionados.push(poi);
    btn.dataset.selecionado = "true";
    btn.textContent = "✓ Adicionado";
    card.dataset.selecionado = "true";
  }

  atualizarBarraSelecao();
  atualizarMapaPreview();
}

function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto || "";
  return div.innerHTML;
}

// ============================================================
// PRÉVIA NO MAPA — reaproveita desenharMapaCompleto (mesmo módulo usado
// no resultado do roteiro automático), religando mapa-rota.js que estava
// órfão no projeto.
// ============================================================
function atualizarMapaPreview() {
  if (mapaAtual) {
    mapaAtual.remove();
    mapaAtual = null;
  }
  if (selecionados.length === 0) return;

  // desenharMapaCompleto espera objetos com `.localizacao` — é exatamente
  // o formato que os POIs já têm, então passa direto, sem transformar nada.
  mapaAtual = desenharMapaCompleto("mapa-selecao", selecionados, null);
}

// ============================================================
// BARRA DE SELEÇÃO — contador + os 2 botões de ação
// ============================================================
function atualizarBarraSelecao() {
  const contador = document.getElementById("contador-selecao");
  contador.textContent = `${selecionados.length} ${selecionados.length === 1 ? "parada selecionada" : "paradas selecionadas"}`;

  const btnComecar = document.getElementById("btn-comecar-agora");
  const btnSalvar = document.getElementById("btn-salvar-depois");

  btnComecar.disabled = selecionados.length === 0 || quando !== "agora";
  btnSalvar.disabled = selecionados.length === 0;
}

function configurarBarraSelecao() {
  document.getElementById("btn-comecar-agora").addEventListener("click", comecarAgora);
  document.getElementById("btn-salvar-depois").addEventListener("click", () => {
    document.getElementById("modal-salvar").hidden = false;
  });
}

// ============================================================
// COMEÇAR AGORA — mesmo pipeline que "Começar tour" dos favoritos usa
// ============================================================
async function comecarAgora() {
  const btn = document.getElementById("btn-comecar-agora");
  btn.disabled = true;
  btn.textContent = "Montando...";

  try {
    const { posicaoAtual } = await obterPosicaoAtual();
    const agora = new Date().toISOString();

    const perfilBusca = {
      data: agora,
      horarioInicio: agora,
      localizacaoPartida: posicaoAtual || { lat: -27.0026, lng: -51.4084 }, // centro de Treze Tílias, fallback sem GPS
      interesses: [],
      refeicoesDesejadas: [],
      idsExcluidos: [],
    };

    const idsSelecionados = selecionados.map((p) => p.id);
    const capitulo = gerarCapituloDeFavoritos(todosPois, perfilBusca, idsSelecionados);

    if (capitulo.vazio) {
      alert("Nenhum dos lugares escolhidos está disponível agora. Tenta ajustar a seleção.");
      return;
    }

    if (capitulo.idsDescartados && capitulo.idsDescartados.length > 0) {
      const n = capitulo.idsDescartados.length;
      sessionStorage.setItem(
        "linde-guia:aviso-proxima-tela",
        `${n} ${n === 1 ? "parada não entrou" : "paradas não entraram"} na rota (fechado agora). Seguimos com o resto.`
      );
    }

    sessionStorage.setItem("linde-guia:capitulo-atual", JSON.stringify(capitulo));
    window.location.href = "minha-rota.html";
  } catch (erro) {
    console.error("[roteiro-manual] Erro ao montar rota:", erro);
    alert("Não conseguimos montar a rota agora. Tenta de novo em instante.");
  } finally {
    btn.disabled = selecionados.length === 0 || quando !== "agora";
    btn.textContent = "Começar agora";
  }
}

function obterPosicaoAtual() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ posicaoAtual: null });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (posicao) => resolve({ posicaoAtual: { lat: posicao.coords.latitude, lng: posicao.coords.longitude } }),
      () => resolve({ posicaoAtual: null }),
      { timeout: 5000 }
    );
  });
}

// ============================================================
// SALVAR PRA OUTRO DIA
// ============================================================
function configurarModalSalvar() {
  document.getElementById("btn-cancelar-salvar").addEventListener("click", () => {
    document.getElementById("modal-salvar").hidden = true;
  });

  document.getElementById("btn-confirmar-salvar").addEventListener("click", () => {
    const nome = document.getElementById("input-nome-rota").value.trim();
    const erroEl = document.getElementById("erro-salvar");

    if (!nome) {
      erroEl.textContent = "Dá um nome pro roteiro antes de salvar.";
      erroEl.style.display = "block";
      return;
    }

    const dataHoraAgendada =
      quando === "agendado"
        ? new Date(document.getElementById("input-data-hora-agendada").value).toISOString()
        : new Date().toISOString();

    const rota = salvarRotaManual({
      nome,
      poisIds: selecionados.map((p) => p.id),
      dataHoraAgendada,
    });

    if (!rota) {
      erroEl.textContent = "Não conseguimos salvar agora. Tenta de novo.";
      erroEl.style.display = "block";
      return;
    }

    window.location.href = "perfil.html";
  });
}
