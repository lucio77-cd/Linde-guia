/**
 * formulario-roteiro.js
 * Linde Guia — Treze Tílias
 *
 * Lógica da tela "Criar Roteiro" (pages/roteiro.html).
 *
 * Fluxo do submit:
 *   1. Monta o PerfilBusca a partir do formulário.
 *   2. Busca POIs e eventos ativos.
 *   3. Tenta curadoria por IA (Gemini, via curador-ia.js) DENTRO dos
 *      candidatos já filtrados pelo motor. Se falhar, cai no motor de
 *      pontuação padrão (gerarCapitulo).
 *   4. Com o capítulo já decidido (por IA ou pelo motor), tenta trocar a
 *      estimativa de deslocamento pelo tempo real de caminhada
 *      (Directions API, via caminhada-real.js). Se falhar, mantém a
 *      estimativa.
 *   5. Guarda o resultado e redireciona pra minha-rota.html.
 *
 * Cada camada (IA, tempo real) é opcional e best-effort — nenhuma delas
 * pode deixar o usuário sem roteiro.
 */

import {
  gerarCapitulo,
  gerarCapituloDeFavoritos,
  obterCandidatosViaveis,
  aplicarDeslocamentosReais,
} from "../engine/motor-rota.js";
import { curarCapituloComIA }          from "../engine/curador-ia.js";
import { obterDeslocamentosReaisMin }  from "../engine/caminhada-real.js";
import { montarHistoricoDoUsuario }    from "../data/historico-data.js";
import { buscarPoisAtivos }            from "../data/pois-data.js";
import { buscarEventosAtivosNaData }   from "../data/eventos-data.js";
import { registrarRotaCriada }         from "../data/registro-data.js";
import { lerSelos }                    from "../core/selos-local.js";

const MAX_PARADAS_CAPITULO_IA = 4; // mesmo teto do motor (MAX_PARADAS_POR_CAPITULO)

// ============================================================
// ESTADO DO FORMULÁRIO
// ============================================================
const estado = {
  quando: "agora",
  horarioInicio: null,
  localizacaoPartida: null,
  enderecoManual: "",
  interesses: [],
  refeicoesDesejadas: [],
};

// ============================================================
// INICIALIZAÇÃO
// ============================================================
function iniciarFormularioRoteiro() {
  configurarChipsSelecaoUnica();
  configurarChipsSelecaoMultipla();
  configurarQuando();
  configurarBotaoLocalizacao();
  configurarSubmit();
}

document.addEventListener("DOMContentLoaded", iniciarFormularioRoteiro);

// ============================================================
// CHIPS — seleção única
// ============================================================
function configurarChipsSelecaoUnica() {
  const grupos = agruparChipsPorCampo(".chip:not(.chip--multipla)");

  for (const [campo, chips] of Object.entries(grupos)) {
    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        chips.forEach((c) => c.setAttribute("aria-pressed", "false"));
        chip.setAttribute("aria-pressed", "true");
        estado[campo] = chip.dataset.valor;

        if (campo === "quando") {
          alternarCampoHorarioAgendado(chip.dataset.valor === "agendado");
        }
      });
    });
  }
}

// ============================================================
// CHIPS — seleção múltipla (refeições, interesses)
// ============================================================
function configurarChipsSelecaoMultipla() {
  const chips = document.querySelectorAll(".chip--multipla");

  chips.forEach((chip) => {
    chip.setAttribute("aria-pressed", "false");
    chip.addEventListener("click", () => {
      const pressionado = chip.getAttribute("aria-pressed") === "true";
      chip.setAttribute("aria-pressed", String(!pressionado));
      const campo = chip.dataset.campo;
      const valor = chip.dataset.valor;
      if (!Array.isArray(estado[campo])) estado[campo] = [];
      if (!pressionado) {
        estado[campo].push(valor);
      } else {
        estado[campo] = estado[campo].filter((v) => v !== valor);
      }
    });
  });
}

function agruparChipsPorCampo(seletor) {
  const chips = document.querySelectorAll(seletor);
  const grupos = {};
  chips.forEach((chip) => {
    const campo = chip.dataset.campo;
    if (!grupos[campo]) grupos[campo] = [];
    grupos[campo].push(chip);
  });
  return grupos;
}

// ============================================================
// QUANDO
// ============================================================
function configurarQuando() {
  atualizarHorarioParaAgora();

  const inputAgendado = document.getElementById("input-horario-agendado");
  inputAgendado.addEventListener("change", () => {
    if (inputAgendado.value) {
      estado.horarioInicio = construirDataHoraDeHoje(inputAgendado.value);
    }
  });
}

function alternarCampoHorarioAgendado(mostrar) {
  const grupo = document.getElementById("grupo-horario-agendado");
  grupo.hidden = !mostrar;

  if (mostrar) {
    const inputAgendado = document.getElementById("input-horario-agendado");
    if (inputAgendado.value) {
      estado.horarioInicio = construirDataHoraDeHoje(inputAgendado.value);
    }
  } else {
    atualizarHorarioParaAgora();
  }
}

function atualizarHorarioParaAgora() {
  estado.horarioInicio = new Date().toISOString();
}

function construirDataHoraDeHoje(horaTexto) {
  const [h, m] = horaTexto.split(":").map(Number);
  const data = new Date();
  data.setHours(h, m, 0, 0);
  return data.toISOString();
}

// ============================================================
// LOCALIZAÇÃO — GPS + geocodificação via Nominatim
// ============================================================
const BBOX_TREZE_TILIAS = {
  sul: -27.04, norte: -26.84,
  oeste: -51.54, leste: -51.33,
};
const CENTRO_TREZE_TILIAS_NOMINATIM = "Treze Tílias, SC, Brasil";

function configurarBotaoLocalizacao() {
  const botao         = document.getElementById("btn-usar-localizacao");
  const statusEl       = document.getElementById("localizacao-status");
  const inputEndereco  = document.getElementById("input-endereco");

  botao.addEventListener("click", () => {
    if (!navigator.geolocation) {
      definirStatusLocalizacao(statusEl, "erro", "Seu navegador não permite localização automática. Digite um endereço abaixo.");
      return;
    }
    definirStatusLocalizacao(statusEl, "buscando", "Buscando sua localização...");
    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        estado.localizacaoPartida = {
          lat: posicao.coords.latitude,
          lng: posicao.coords.longitude,
        };
        definirStatusLocalizacao(statusEl, "ok", "Localização encontrada!");
        inputEndereco.value = "";
        inputEndereco.disabled = true;
      },
      () => {
        definirStatusLocalizacao(statusEl, "erro", "Não consegui acessar sua localização. Digite um endereço abaixo.");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });

  inputEndereco.addEventListener("blur", () => {
    const texto = inputEndereco.value.trim();
    if (texto) geocodificarEndereco(texto, statusEl);
  });

  inputEndereco.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const texto = inputEndereco.value.trim();
      if (texto) geocodificarEndereco(texto, statusEl);
    }
  });

  inputEndereco.addEventListener("input", () => {
    if (!inputEndereco.value.trim()) {
      estado.localizacaoPartida = null;
      estado.enderecoManual = "";
      definirStatusLocalizacao(statusEl, null, "");
    } else {
      estado.enderecoManual = inputEndereco.value;
    }
  });
}

async function geocodificarEndereco(texto, statusEl) {
  definirStatusLocalizacao(statusEl, "buscando", "Buscando endereço...");

  const urlComBbox = `https://nominatim.openstreetmap.org/search?` + new URLSearchParams({
    q: `${texto}, Treze Tílias, SC`,
    format: "json", limit: "1", countrycodes: "br",
    viewbox: `${BBOX_TREZE_TILIAS.oeste},${BBOX_TREZE_TILIAS.norte},${BBOX_TREZE_TILIAS.leste},${BBOX_TREZE_TILIAS.sul}`,
    bounded: "1",
  });

  const urlSemBbox = `https://nominatim.openstreetmap.org/search?` + new URLSearchParams({
    q: `${texto}, ${CENTRO_TREZE_TILIAS_NOMINATIM}`,
    format: "json", limit: "1", countrycodes: "br",
  });

  try {
    let resultado = await buscarNominatim(urlComBbox);
    if (!resultado) resultado = await buscarNominatim(urlSemBbox);

    if (resultado) {
      estado.localizacaoPartida = {
        lat: parseFloat(resultado.lat),
        lng: parseFloat(resultado.lon),
      };
      estado.enderecoManual = texto;
      definirStatusLocalizacao(statusEl, "ok", `Encontrado: ${resultado.display_name.split(",").slice(0, 2).join(",")}`);
    } else {
      estado.localizacaoPartida = null;
      estado.enderecoManual = texto;
      definirStatusLocalizacao(statusEl, "ok", "Partindo do centro de Treze Tílias.");
    }
  } catch (erro) {
    console.warn("[geocodificação] Nominatim falhou:", erro);
    estado.localizacaoPartida = null;
    estado.enderecoManual = texto;
    definirStatusLocalizacao(statusEl, "ok", "Não achei o endereço exato — partindo do centro da cidade.");
  }
}

async function buscarNominatim(url) {
  const resposta = await fetch(url, {
    headers: {
      "Accept-Language": "pt-BR",
      "User-Agent": "LindeGuia/1.0 (treze-tilias-guia)"
    }
  });
  if (!resposta.ok) return null;
  const dados = await resposta.json();
  return dados.length > 0 ? dados[0] : null;
}

function definirStatusLocalizacao(elemento, estadoVisual, texto) {
  elemento.textContent = texto;
  if (estadoVisual) {
    elemento.dataset.estado = estadoVisual;
  } else {
    delete elemento.dataset.estado;
  }
}

// ============================================================
// SUBMIT
// ============================================================
function configurarSubmit() {
  const form   = document.getElementById("form-roteiro");
  const erroEl = document.getElementById("form-roteiro__erro");

  form.addEventListener("submit", async (evento) => {
    evento.preventDefault();
    ocultarErro(erroEl);

    const erroValidacao = validarEstado();
    if (erroValidacao) {
      mostrarErro(erroEl, erroValidacao);
      return;
    }

    const botaoSubmit = form.querySelector("button[type=submit]");
    botaoSubmit.disabled = true;
    mostrarOverlayCarregando();

    try {
      const perfilBusca = montarPerfilBusca();

      const [pois, eventos] = await Promise.all([
        buscarPoisAtivos(),
        buscarEventosAtivosNaData(perfilBusca.data),
      ]);

      const capitulo = await gerarCapituloCompleto(pois, eventos, perfilBusca);

      sessionStorage.setItem("linde-guia:capitulo-atual", JSON.stringify(capitulo));
      registrarRotaCriada(perfilBusca, capitulo); // falha silenciosa, não bloqueia redirect

      window.location.href = "../pages/minha-rota.html";
    } catch (erro) {
      console.error("[formulario-roteiro] Erro ao gerar rota:", erro);
      mostrarErro(erroEl, "Algo deu errado ao montar sua rota. Tenta de novo?");
      botaoSubmit.disabled = false;
      esconderOverlayCarregando();
    }
  });
}

// ============================================================
// PIPELINE DO CAPÍTULO — IA (opcional) + tempo real (opcional), com
// fallback seguro em cada etapa. Nunca deixa o usuário sem roteiro.
// ============================================================
async function gerarCapituloCompleto(pois, eventos, perfilBusca) {
  const candidatosViaveis = obterCandidatosViaveis(pois, eventos, perfilBusca);

  if (candidatosViaveis.length === 0) {
    return gerarCapitulo(pois, eventos, perfilBusca); // devolve o capítulo vazio padrão
  }

  // --- Camada 1: curadoria por IA (opcional) ---
  const historico = await montarHistoricoDoUsuario();
  const curadoria = await curarCapituloComIA(candidatosViaveis, perfilBusca, historico, MAX_PARADAS_CAPITULO_IA);

  let capitulo;
  let explicacaoIA = "";

  if (curadoria) {
    capitulo = gerarCapituloDeFavoritos(pois, perfilBusca, curadoria.idsEscolhidos);
    explicacaoIA = curadoria.explicacao || "";
  }

  if (!curadoria || capitulo.vazio) {
    capitulo = gerarCapitulo(pois, eventos, perfilBusca); // fallback: IA indisponível ou escolha não sobreviveu
    explicacaoIA = "";
  }

  if (capitulo.vazio) {
    return capitulo; // nada a fazer, capítulo vazio não precisa de tempo real
  }

  // --- Camada 2: tempo real de caminhada (opcional) ---
  const deslocamentosReaisMin = await obterDeslocamentosReaisMin(
    perfilBusca.localizacaoPartida,
    capitulo.paradas
  );
  const capituloFinal = aplicarDeslocamentosReais(capitulo.paradas, deslocamentosReaisMin, perfilBusca);

  return { ...capituloFinal, explicacaoIA };
}

function validarEstado() {
  if (!estado.horarioInicio) {
    return "Diz a que horas você quer começar o passeio.";
  }
  if (!estado.localizacaoPartida && !estado.enderecoManual.trim()) {
    return "A gente precisa saber de onde você está partindo — usa o GPS ou digita um endereço.";
  }
  return null;
}

function montarPerfilBusca() {
  const CENTRO_TREZE_TILIAS   = { lat: -27.0026, lng: -51.4084 };
  const RAIO_MAXIMO_RAZOAVEL_KM = 15;

  let localizacaoPartida = estado.localizacaoPartida || CENTRO_TREZE_TILIAS;

  if (
    estado.localizacaoPartida &&
    distanciaKm(estado.localizacaoPartida, CENTRO_TREZE_TILIAS) > RAIO_MAXIMO_RAZOAVEL_KM
  ) {
    console.warn("[formulario-roteiro] GPS muito distante da cidade, usando centro como fallback.");
    localizacaoPartida = CENTRO_TREZE_TILIAS;
  }

  const idsJaVisitados = lerSelos().map((selo) => selo.poiId).filter(Boolean);

  return {
    data: estado.horarioInicio,
    horarioInicio: estado.horarioInicio,
    localizacaoPartida,
    interesses: estado.interesses,
    refeicoesDesejadas: estado.refeicoesDesejadas,
    idsExcluidos: idsJaVisitados,
  };
}

function distanciaKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const aH = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return R * 2 * Math.atan2(Math.sqrt(aH), Math.sqrt(1 - aH));
}

function mostrarErro(elemento, texto) {
  elemento.textContent = texto;
  elemento.hidden = false;
}

function ocultarErro(elemento) {
  elemento.hidden = true;
}

function mostrarOverlayCarregando() {
  const overlay = document.getElementById("overlay-carregando");
  if (overlay) overlay.hidden = false;
}

function esconderOverlayCarregando() {
  const overlay = document.getElementById("overlay-carregando");
  if (overlay) overlay.hidden = true;
}
