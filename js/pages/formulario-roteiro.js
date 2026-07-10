/**
 * formulario-roteiro.js
 * Linde Guia — Treze Tílias
 *
 * Lógica da tela "Criar Roteiro" (pages/roteiro.html).
 * Lê os campos do formulário, monta o PerfilBusca, chama motor-rota.js,
 * guarda o resultado no sessionStorage e redireciona para minha-rota.html.
 *
 * Caminhos atualizados para nova estrutura:
 *   js/pages/formulario-roteiro.js
 *   js/engine/motor-rota.js
 *   js/data/pois-data.js
 *   js/data/eventos-data.js
 *   js/data/registro-data.js
 */

import { gerarRota }                  from "../engine/motor-rota.js";
import { buscarPoisAtivos }            from "../data/pois-data.js";
import { buscarEventosAtivosNaData }   from "../data/eventos-data.js";
import { registrarRotaCriada }         from "../data/registro-data.js";

// ============================================================
// ESTADO DO FORMULÁRIO
// ============================================================
const estado = {
  tempoDisponivelMin: 240,      // padrão = "Meio dia"
  horarioInicio: null,
  localizacaoPartida: null,
  enderecoManual: "",
  orcamentoFaixa: "moderado",   // padrão = "Moderado"
  composicaoGrupo: null,
  interesses: [],
};

// ============================================================
// INICIALIZAÇÃO
// ============================================================
function iniciarFormularioRoteiro() {
  configurarChipsSelecaoUnica();
  configurarChipsSelecaoMultipla();
  configurarHorarioPadrao();
  configurarBotaoLocalizacao();
  configurarSubmit();
}

document.addEventListener("DOMContentLoaded", iniciarFormularioRoteiro);

// ============================================================
// CHIPS — seleção única (tempo, orçamento, grupo)
// ============================================================
function configurarChipsSelecaoUnica() {
  const grupos = agruparChipsPorCampo(".chip:not(.chip--multipla)");

  for (const [campo, chips] of Object.entries(grupos)) {
    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        chips.forEach((c) => c.setAttribute("aria-pressed", "false"));
        chip.setAttribute("aria-pressed", "true");
        const valor = chip.dataset.valor;
        estado[campo] = isNaN(Number(valor)) ? valor : Number(valor);
      });
    });
  }
}

// ============================================================
// CHIPS — seleção múltipla (interesses)
// ============================================================
function configurarChipsSelecaoMultipla() {
  const chips = document.querySelectorAll(".chip--multipla");

  chips.forEach((chip) => {
    chip.setAttribute("aria-pressed", "false");
    chip.addEventListener("click", () => {
      const pressionado = chip.getAttribute("aria-pressed") === "true";
      chip.setAttribute("aria-pressed", String(!pressionado));
      const valor = chip.dataset.valor;
      if (!pressionado) {
        estado.interesses.push(valor);
      } else {
        estado.interesses = estado.interesses.filter((v) => v !== valor);
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
// HORÁRIO — pré-preenche com hora atual do device
// ============================================================
function configurarHorarioPadrao() {
  const input = document.getElementById("input-horario");
  const agora = new Date();
  const horas   = String(agora.getHours()).padStart(2, "0");
  const minutos = String(agora.getMinutes()).padStart(2, "0");
  input.value = `${horas}:${minutos}`;
  estado.horarioInicio = construirDataHoraDeHoje(input.value);

  input.addEventListener("change", () => {
    estado.horarioInicio = construirDataHoraDeHoje(input.value);
  });
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
  const botao       = document.getElementById("btn-usar-localizacao");
  const statusEl    = document.getElementById("localizacao-status");
  const inputEndereco = document.getElementById("input-endereco");

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
// SUBMIT — valida, busca dados, chama motor, redireciona
// ============================================================
function configurarSubmit() {
  const form    = document.getElementById("form-roteiro");
  const erroEl  = document.getElementById("form-roteiro__erro");

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

      const rota = gerarRota(pois, eventos, perfilBusca);

      sessionStorage.setItem("linde-guia:rota-gerada", JSON.stringify(rota));
      registrarRotaCriada(perfilBusca, rota); // falha silenciosa, não bloqueia redirect

      // Redireciona para minha-rota (mesmo nível em pages/)
      window.location.href = "../pages/minha-rota.html";
    } catch (erro) {
      console.error("[formulario-roteiro] Erro ao gerar rota:", erro);
      mostrarErro(erroEl, "Algo deu errado ao montar sua rota. Tenta de novo?");
      botaoSubmit.disabled = false;
      esconderOverlayCarregando();
    }
  });
}

function validarEstado() {
  if (!estado.horarioInicio) {
    return "Diz a que horas você começa o passeio.";
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

  return {
    data: estado.horarioInicio,
    horarioInicio: estado.horarioInicio,
    tempoDisponivelMin: estado.tempoDisponivelMin,
    localizacaoPartida,
    orcamentoFaixa: estado.orcamentoFaixa,
    composicaoGrupo: estado.composicaoGrupo,
    interesses: estado.interesses,
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
