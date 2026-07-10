/**
 * modo-em-rota.js
 * Linde Guia — Treze Tílias
 *
 * Controla a sub-vista "Em Rota": desenha o card da parada atual e os
 * botões de checklist manual ("Cheguei" / "Pular essa parada").
 *
 * PAUSADO NESTA VERSÃO: GPS contínuo (watchPosition) e mapa focado.
 * O foco agora é confiabilidade do dado de check-in (botão manual,
 * sempre certo) em vez de detecção automática por proximidade.
 * Quando o trabalho do mapa for retomado, reintroduzir aqui.
 *
 * Cada "Cheguei" grava um check-in real no Firestore via
 * registro-data.js, que alimenta o painel admin (estatísticas de
 * locais visitados, horário, dia).
 */

import { recalcularRota } from "../engine/motor-rota.js";
import { lerRotaDoStorage, salvarRotaNoStorage, mostrarEstado } from "./render-rota.js";
import { registrarCheckin, registrarRoteiroFinalizado } from "../data/registro-data.js";
import { salvarSeloLocal } from "../core/selos-local.js";

const CHAVE_INDEX = "linde-guia:parada-atual-index";

function iniciarModoEmRota() {
  document.addEventListener("linde-guia:iniciar-em-rota", (evento) => {
    desenharParadaAtual(evento.detail.rota, obterIndiceAtual());
  });

  document.getElementById("btn-pular-parada").addEventListener("click", () => {
    avancarRota("pular");
  });

  document.getElementById("btn-cheguei").addEventListener("click", () => {
    avancarRota("chegou");
  });
}

document.addEventListener("DOMContentLoaded", iniciarModoEmRota);

// ============================================================
// AVANÇAR NO ROTEIRO ("Cheguei" ou "Pular essa parada")
// ============================================================
function avancarRota(acao) {
  const rota = lerRotaDoStorage();
  if (!rota) return;

  const indiceAtual = obterIndiceAtual();
  const paradaAtual = rota.paradas[indiceAtual];

  if (acao === "chegou" && paradaAtual) {
    registrarCheckin(paradaAtual, "manual"); // não bloqueia o fluxo, falha silenciosa
    salvarSeloLocal(paradaAtual); // guarda o selo no aparelho do visitante (ver perfil.html)
  }

  obterPosicaoEHorarioAtuais()
    .then(({ posicaoAtual, horarioAtual }) => {
      const rotaAtualizada = recalcularRota(rota, indiceAtual, acao, horarioAtual, posicaoAtual);

      salvarRotaNoStorage(rotaAtualizada);

      if (rotaAtualizada.finalizada) {
        const visitadas = rotaAtualizada.paradas.length;
        registrarRoteiroFinalizado(rota, visitadas);
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
    });
}

function obterPosicaoEHorarioAtuais() {
  const horarioAtual = new Date().toISOString();

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
// DESENHO DO CARD DA PARADA ATUAL
// ============================================================
function desenharParadaAtual(rota, indice) {
  const parada = rota.paradas[indice];

  if (!parada) {
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
    </div>
    <div class="card-parada-atual__navegacao">
      <a class="botao botao--secundario"
         href="${montarLinkGoogleMaps(parada.localizacao)}"
         target="_blank" rel="noopener">
        Navegar (Google Maps)
      </a>
      <a class="botao botao--secundario"
         href="${montarLinkWaze(parada.localizacao)}"
         target="_blank" rel="noopener">
        Navegar (Waze)
      </a>
    </div>
  `;

  esconderAvisoRecalculo();
  avisarSeRiscoDeFechar(parada);
}

function montarLinkGoogleMaps(localizacao) {
  if (!localizacao) return "#";
  // "dir" (direções) abre navegação turn-by-turn de verdade, diferente de
  // "search" (que só mostra o ponto no mapa). travelmode=walking porque o
  // passeio em Treze Tílias é pensado a pé no centro histórico.
  return `https://www.google.com/maps/dir/?api=1&destination=${localizacao.lat},${localizacao.lng}&travelmode=walking`;
}

function montarLinkWaze(localizacao) {
  if (!localizacao) return "#";
  return `https://waze.com/ul?ll=${localizacao.lat},${localizacao.lng}&navigate=yes`;
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
