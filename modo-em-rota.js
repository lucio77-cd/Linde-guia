/**
 * modo-em-rota.js
 * Linde Guia — Treze Tílias
 *
 * Controla a sub-vista "Em Rota": desenha o card e o mapa da parada
 * atual, e usa GPS contínuo (watchPosition) para detectar automaticamente
 * quando o usuário chega perto o suficiente — sem precisar apertar botão.
 * "Pular essa parada" e "Já cheguei" continuam como ações manuais de
 * fallback, caso o GPS falhe ou o usuário prefira controlar na mão.
 */

import { recalcularRota } from "./motor-rota.js";
import { lerRotaDoStorage, salvarRotaNoStorage, mostrarEstado } from "./render-rota.js";
import { criarMapaFocado } from "./mapa-rota.js";

const CHAVE_INDEX = "linde-guia:parada-atual-index";
const RAIO_CHEGADA_METROS = 50;
const INTERVALO_MIN_ENTRE_CHECAGENS_MS = 4000; // evita disparo duplicado em sequência

let watcherId = null;
let mapaFocado = null;
let ultimaChecagemEm = 0;
let processandoAvanco = false;

function iniciarModoEmRota() {
  document.addEventListener("linde-guia:iniciar-em-rota", (evento) => {
    mapaFocado = criarMapaFocado("mapa-em-rota");
    desenharParadaAtual(evento.detail.rota, obterIndiceAtual());
    iniciarMonitoramentoGPS();
  });

  document.getElementById("btn-pular-parada").addEventListener("click", () => {
    avancarRota("pular");
  });

  document.getElementById("btn-ja-cheguei").addEventListener("click", () => {
    avancarRota("chegou");
  });
}

document.addEventListener("DOMContentLoaded", iniciarModoEmRota);

// ============================================================
// GPS CONTÍNUO — detecta chegada automaticamente
// ============================================================
function iniciarMonitoramentoGPS() {
  const statusEl = document.getElementById("status-gps");

  if (!navigator.geolocation) {
    statusEl.textContent = "Seu navegador não permite localização automática — use o botão \"Já cheguei\".";
    return;
  }

  pararMonitoramentoGPS(); // garante que não há watcher duplicado de uma execução anterior

  watcherId = navigator.geolocation.watchPosition(
    (posicao) => {
      const posicaoAtual = { lat: posicao.coords.latitude, lng: posicao.coords.longitude };
      atualizarMapaComPosicao(posicaoAtual);
      checarProximidadeDaParadaAtual(posicaoAtual, statusEl);
    },
    () => {
      statusEl.textContent = "Não consegui acessar sua localização — use o botão \"Já cheguei\" quando estiver no local.";
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );
}

function pararMonitoramentoGPS() {
  if (watcherId !== null) {
    navigator.geolocation.clearWatch(watcherId);
    watcherId = null;
  }
}

function checarProximidadeDaParadaAtual(posicaoAtual, statusEl) {
  const rota = lerRotaDoStorage();
  if (!rota) return;

  const indiceAtual = obterIndiceAtual();
  const parada = rota.paradas[indiceAtual];
  if (!parada || !parada.localizacao) return;

  const distanciaMetros = calcularDistanciaMetros(posicaoAtual, parada.localizacao);
  statusEl.textContent = `Você está a ${formatarDistancia(distanciaMetros)} de ${parada.nome}.`;

  const agora = Date.now();
  const podeChecarDeNovo = agora - ultimaChecagemEm > INTERVALO_MIN_ENTRE_CHECAGENS_MS;

  if (distanciaMetros <= RAIO_CHEGADA_METROS && podeChecarDeNovo && !processandoAvanco) {
    ultimaChecagemEm = agora;
    statusEl.textContent = `Chegou em ${parada.nome}! Marcando automaticamente...`;
    avancarRota("chegou", posicaoAtual);
  }
}

function formatarDistancia(metros) {
  if (metros < 1000) return `${Math.round(metros)}m`;
  return `${(metros / 1000).toFixed(1)}km`;
}

// ============================================================
// AVANÇAR NO ROTEIRO ("chegou" automático/manual, ou "pular")
// ============================================================
function avancarRota(acao, posicaoConhecida) {
  if (processandoAvanco) return; // evita corrida entre GPS automático e clique manual simultâneos
  processandoAvanco = true;

  const rota = lerRotaDoStorage();
  if (!rota) {
    processandoAvanco = false;
    return;
  }

  const indiceAtual = obterIndiceAtual();

  obterPosicaoEHorarioAtuais(posicaoConhecida)
    .then(({ posicaoAtual, horarioAtual }) => {
      const rotaAtualizada = recalcularRota(rota, indiceAtual, acao, horarioAtual, posicaoAtual);

      salvarRotaNoStorage(rotaAtualizada);

      if (rotaAtualizada.finalizada) {
        pararMonitoramentoGPS();
        mostrarEstado("vista-finalizada");
        sessionStorage.removeItem(CHAVE_INDEX);
        return;
      }

      const novoIndice = indiceAtual + 1;
      definirIndiceAtual(novoIndice);
      desenharParadaAtual(rotaAtualizada, novoIndice);
    })
    .catch((erro) => {
      console.error("[modo-em-rota] Erro ao recalcular rota:", erro);
      mostrarAvisoRecalculo("Não conseguimos recalcular agora. Tenta de novo em um instante.");
    })
    .finally(() => {
      processandoAvanco = false;
    });
}

function obterPosicaoEHorarioAtuais(posicaoConhecida) {
  const horarioAtual = new Date().toISOString();

  if (posicaoConhecida) {
    return Promise.resolve({ posicaoAtual: posicaoConhecida, horarioAtual });
  }

  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ posicaoAtual: null, horarioAtual });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        resolve({
          posicaoAtual: { lat: posicao.coords.latitude, lng: posicao.coords.longitude },
          horarioAtual,
        });
      },
      () => resolve({ posicaoAtual: null, horarioAtual }),
      { timeout: 5000 }
    );
  });
}

// ============================================================
// ESTADO DO PASSEIO (índice da parada atual, em sessionStorage)
// ============================================================
function obterIndiceAtual() {
  return Number(sessionStorage.getItem(CHAVE_INDEX) || "0");
}

function definirIndiceAtual(indice) {
  sessionStorage.setItem(CHAVE_INDEX, String(indice));
}

// ============================================================
// DESENHO DO CARD + MAPA DA PARADA ATUAL
// ============================================================
function desenharParadaAtual(rota, indice) {
  const parada = rota.paradas[indice];

  if (!parada) {
    pararMonitoramentoGPS();
    mostrarEstado("vista-finalizada");
    return;
  }

  atualizarProgresso(indice, rota.paradas.length);

  const card = document.getElementById("card-parada-atual");
  card.innerHTML = `
    <p class="card-parada-atual__categoria">${parada.categoria || ""}</p>
    <h2 class="card-parada-atual__nome">${parada.nome}</h2>
    <div class="card-parada-atual__info">
      <span>Chegada prevista: ${formatarHorarioLocal(parada.horarioChegada)}</span>
      <span>${parada.duracaoMediaVisitaMin} min de visita</span>
      <span>${parada.precoEstimado > 0 ? "R$" + parada.precoEstimado : "Grátis"}</span>
    </div>
    <a class="botao botao--secundario card-parada-atual__navegar"
       href="https://www.google.com/maps/search/?api=1&query=${parada.localizacao?.lat},${parada.localizacao?.lng}"
       target="_blank" rel="noopener">
      Abrir navegação
    </a>
  `;

  if (mapaFocado) {
    mapaFocado.atualizar(parada.localizacao, null, parada.nome);
  }

  esconderAvisoRecalculo();
  avisarSeRiscoDeFechar(parada);
}

function atualizarMapaComPosicao(posicaoAtual) {
  const rota = lerRotaDoStorage();
  if (!rota || !mapaFocado) return;
  const parada = rota.paradas[obterIndiceAtual()];
  if (!parada) return;
  mapaFocado.atualizar(parada.localizacao, posicaoAtual, parada.nome);
}

function atualizarProgresso(indice, total) {
  document.getElementById("progresso-texto").textContent = `Parada ${indice + 1} de ${total}`;
  const porcentagem = Math.round(((indice + 1) / total) * 100);
  document.getElementById("progresso-barra-preenchida").style.width = `${porcentagem}%`;
}

function formatarHorarioLocal(dataHorario) {
  if (!dataHorario) return "";
  const data = new Date(dataHorario);
  const horas = String(data.getHours()).padStart(2, "0");
  const minutos = String(data.getMinutes()).padStart(2, "0");
  return `${horas}:${minutos}`;
}

// ============================================================
// AVISO DE RISCO DE ATRASO (informativo, não bloqueia a ação)
// ============================================================
function avisarSeRiscoDeFechar(parada) {
  if (!parada.horarioChegada) return;

  const agora = new Date();
  const chegadaPrevista = new Date(parada.horarioChegada);
  const atrasoMin = Math.round((agora.getTime() - chegadaPrevista.getTime()) / 60000);

  if (atrasoMin > 15) {
    mostrarAvisoRecalculo(
      `Você está um pouco atrasado em relação ao previsto — vamos ajustar o resto do roteiro se precisar.`
    );
  }
}

function mostrarAvisoRecalculo(texto) {
  const el = document.getElementById("aviso-recalculo");
  el.textContent = texto;
  el.hidden = false;
}

function esconderAvisoRecalculo() {
  document.getElementById("aviso-recalculo").hidden = true;
}

// ============================================================
// CÁLCULO DE DISTÂNCIA (haversine, em metros — mesma fórmula do motor,
// só que em metros em vez de km, para precisão na detecção de chegada)
// ============================================================
function calcularDistanciaMetros(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371000;
  const dLat = grauParaRad(b.lat - a.lat);
  const dLon = grauParaRad(b.lng - a.lng);
  const lat1 = grauParaRad(a.lat);
  const lat2 = grauParaRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const aHaversine = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(aHaversine), Math.sqrt(1 - aHaversine));

  return R * c;
}

function grauParaRad(graus) {
  return (graus * Math.PI) / 180;
}
