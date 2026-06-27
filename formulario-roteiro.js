/**
 * formulario-roteiro.js
 * Linde Guia — Treze Tílias
 *
 * Lógica da tela "Criar Roteiro" (roteiro.html).
 * Lê os campos do formulário, monta o objeto PerfilBusca, chama motor-rota.js,
 * guarda o resultado e redireciona para minha-rota.html.
 *
 * Não toca Firestore direto — pega os POIs/eventos via pois-data.js / eventos-data.js.
 */

import { gerarRota } from "./motor-rota.js";
import { buscarPoisAtivos } from "./pois-data.js";
import { buscarEventosAtivosNaData } from "./eventos-data.js";

// ============================================================
// ESTADO DO FORMULÁRIO (preenchido pelos chips e inputs)
// ============================================================
const estado = {
  tempoDisponivelMin: 240,        // valor padrão = chip "Meio dia", já marcado no HTML
  horarioInicio: null,
  localizacaoPartida: null,
  enderecoManual: "",
  orcamentoFaixa: "moderado",     // valor padrão = chip "Moderado", já marcado no HTML
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
// HORÁRIO — pré-preenche com a hora atual do device
// ============================================================
function configurarHorarioPadrao() {
  const input = document.getElementById("input-horario");
  const agora = new Date();
  const horas = String(agora.getHours()).padStart(2, "0");
  const minutos = String(agora.getMinutes()).padStart(2, "0");
  input.value = `${horas}:${minutos}`;

  input.addEventListener("change", () => {
    estado.horarioInicio = construirDataHoraDeHoje(input.value);
  });

  // já preenche o estado inicial também
  estado.horarioInicio = construirDataHoraDeHoje(input.value);
}

function construirDataHoraDeHoje(horaTexto) {
  const [h, m] = horaTexto.split(":").map(Number);
  const data = new Date();
  data.setHours(h, m, 0, 0);
  return data.toISOString();
}

// ============================================================
// LOCALIZAÇÃO — GPS do navegador, com fallback manual
// ============================================================
function configurarBotaoLocalizacao() {
  const botao = document.getElementById("btn-usar-localizacao");
  const statusEl = document.getElementById("localizacao-status");
  const inputEndereco = document.getElementById("input-endereco");

  botao.addEventListener("click", () => {
    if (!navigator.geolocation) {
      definirStatusLocalizacao(statusEl, "erro", "Seu navegador não permite localização automática. Digite um endereço.");
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

  inputEndereco.addEventListener("input", () => {
    estado.enderecoManual = inputEndereco.value;
    if (inputEndereco.value) {
      estado.localizacaoPartida = null; // endereço manual tem prioridade sobre GPS antigo
      definirStatusLocalizacao(statusEl, null, "");
    }
  });
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
// SUBMIT — valida, busca dados, chama o motor, redireciona
// ============================================================
function configurarSubmit() {
  const form = document.getElementById("form-roteiro");
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

      const rota = gerarRota(pois, eventos, perfilBusca);

      sessionStorage.setItem("linde-guia:rota-gerada", JSON.stringify(rota));
      window.location.href = "minha-rota.html";
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
  // Se não há coordenada de GPS (usuário digitou endereço manual), usamos
  // o centro da Praça Andreas Thaler como ponto de partida aproximado.
  // ponto-detalhe/explorar podem evoluir isso para geocodificação real depois.
  const CENTRO_TREZE_TILIAS = { lat: -27.0026, lng: -51.4084 };
  const RAIO_MAXIMO_RAZOAVEL_KM = 15; // Treze Tílias é pequena; GPS muito além disso é erro de leitura

  let localizacaoPartida = estado.localizacaoPartida || CENTRO_TREZE_TILIAS;

  // Checagem de sanidade: GPS de primeira leitura em celular às vezes vem
  // impreciso (sinal fraco, modo economia de bateria) e cai a dezenas de km
  // de distância — o que faz a rota e o mapa saírem completamente errados.
  // Se isso acontecer, descarta o GPS e cai no centro da cidade.
  if (estado.localizacaoPartida && distanciaKm(estado.localizacaoPartida, CENTRO_TREZE_TILIAS) > RAIO_MAXIMO_RAZOAVEL_KM) {
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
  const c = 2 * Math.atan2(Math.sqrt(aH), Math.sqrt(1 - aH));
  return R * c;
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
