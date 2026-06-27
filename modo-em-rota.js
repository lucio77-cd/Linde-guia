/**
 * modo-em-rota.js
 * Linde Guia — Treze Tílias
 *
 * Controla a sub-vista "Em Rota" de minha-rota.html: desenha o card da
 * parada atual, escuta "Cheguei"/"Pular essa parada", e chama
 * recalcularRota() (etapa 4 do motor) sem refazer tudo do zero.
 */

import { recalcularRota } from "./motor-rota.js";
import { lerRotaDoStorage, salvarRotaNoStorage, mostrarEstado } from "./render-rota.js";

const CHAVE_INDEX = "linde-guia:parada-atual-index";

function iniciarModoEmRota() {
  document.addEventListener("linde-guia:iniciar-em-rota", (evento) => {
    desenharParadaAtual(evento.detail.rota, obterIndiceAtual());
  });

  document.getElementById("btn-cheguei").addEventListener("click", () => {
    avancarRota("chegou");
  });

  document.getElementById("btn-pular-parada").addEventListener("click", () => {
    avancarRota("pular");
  });
}

document.addEventListener("DOMContentLoaded", iniciarModoEmRota);

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
// AVANÇAR NO ROTEIRO ("Cheguei" ou "Pular")
// ============================================================
function avancarRota(acao) {
  const rota = lerRotaDoStorage();
  if (!rota) return;

  const indiceAtual = obterIndiceAtual();

  obterPosicaoEHorarioAtuais()
    .then(({ posicaoAtual, horarioAtual }) => {
      const rotaAtualizada = recalcularRota(rota, indiceAtual, acao, horarioAtual, posicaoAtual);

      salvarRotaNoStorage(rotaAtualizada);

      if (rotaAtualizada.finalizada) {
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
      <span>${parada.precoEstimado > 0 ? "R$" + parada.precoEstimado : "Grátis"}</span>
    </div>
    <a class="botao botao--secundario card-parada-atual__navegar"
       href="https://www.google.com/maps/search/?api=1&query=${parada.localizacao?.lat},${parada.localizacao?.lng}"
       target="_blank" rel="noopener">
      Abrir navegação
    </a>
  `;

  esconderAvisoRecalculo();
  avisarSeRiscoDeFechar(parada);
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
