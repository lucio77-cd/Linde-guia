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

import { recalcularRota, gerarCapitulo } from "../engine/motor-rota.js";
import {
  lerRotaDoStorage, salvarRotaNoStorage, mostrarEstado,
  renderizarResultado, configurarBotaoIniciar,
} from "./render-rota.js";
import { registrarCheckin, registrarRoteiroFinalizado } from "../data/registro-data.js";
import { salvarSeloLocal, lerSelos } from "../core/selos-local.js";
import { buscarPoisAtivos } from "../data/pois-data.js";
import { buscarEventosAtivosNaData } from "../data/eventos-data.js";

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

  document.getElementById("btn-nao-continuar").addEventListener("click", finalizarPasseio);
  document.getElementById("btn-sim-continuar").addEventListener("click", gerarProximoCapitulo);
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
        // Guarda o capítulo terminado — vista-continuar precisa dele pra
        // saber de onde partir (última parada) e o que ainda falta
        // (refeicoesRestantes) se a pessoa disser "sim, continuar".
        salvarRotaNoStorage(rotaAtualizada);
        mostrarPerguntaContinuar(rotaAtualizada);
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

// ============================================================
// PERGUNTA ENTRE CAPÍTULOS — "Quer continuar o passeio?"
// ============================================================
// Capítulos são curtos de propósito (ver motor-rota.js) — quando um
// termina, perguntamos em vez de simplesmente encerrar. Isso preserva o
// fechamento emocional de "Foi um prazer te mostrar..." pra quem realmente
// termina por ali, mas não força quem quer continuar a preencher o
// formulário de novo do zero.
function mostrarPerguntaContinuar(capituloTerminado) {
  const titulo = document.getElementById("vista-continuar__titulo");
  const texto  = document.getElementById("vista-continuar__texto");

  const aindaFaltaRefeicao = (capituloTerminado.refeicoesRestantes || []).length > 0;
  titulo.textContent = aindaFaltaRefeicao
    ? "Essa parte do passeio terminou — quer continuar?"
    : "Terminou por aqui — quer continuar o passeio?";
  texto.textContent = "A gente monta o próximo trecho a partir de onde você está agora.";

  mostrarEstado("vista-continuar");
}

function finalizarPasseio() {
  const capitulo = lerRotaDoStorage();
  if (capitulo) {
    registrarRoteiroFinalizado(capitulo, capitulo.paradas.length);
  }
  mostrarEstado("vista-finalizada");
}

// Gera o PRÓXIMO CAPÍTULO a partir de onde a pessoa está agora — mesma
// lógica de montarPerfilBusca() em formulario-roteiro.js, mas com a
// posição/horário atualizados (não o do formulário original) e as
// refeições já atendidas removidas da lista.
function gerarProximoCapitulo() {
  const capituloAnterior = lerRotaDoStorage();
  if (!capituloAnterior) {
    mostrarEstado("vista-finalizada");
    return;
  }

  document.getElementById("vista-continuar__acoes").hidden = true;
  document.getElementById("vista-continuar__carregando").hidden = false;

  obterPosicaoEHorarioAtuais()
    .then(async ({ posicaoAtual, horarioAtual }) => {
      const ultimaParada = capituloAnterior.paradas[capituloAnterior.paradas.length - 1];

      const idsJaVisitados = new Set([
        ...capituloAnterior.paradas.map((p) => p.id),
        ...lerSelos().map((selo) => selo.poiId).filter(Boolean),
      ]);

      const perfilBusca = {
        data: horarioAtual,
        horarioInicio: horarioAtual,
        localizacaoPartida: posicaoAtual || ultimaParada?.localizacao || capituloAnterior.perfilOriginal.localizacaoPartida,
        interesses: capituloAnterior.perfilOriginal.interesses,
        refeicoesDesejadas: capituloAnterior.refeicoesRestantes || [],
        idsExcluidos: [...idsJaVisitados],
      };

      const [pois, eventos] = await Promise.all([
        buscarPoisAtivos(),
        buscarEventosAtivosNaData(perfilBusca.data),
      ]);

      return gerarCapitulo(pois, eventos, perfilBusca);
    })
    .then((novoCapitulo) => {
      document.getElementById("vista-continuar__acoes").hidden = false;
      document.getElementById("vista-continuar__carregando").hidden = true;

      if (novoCapitulo.vazio || novoCapitulo.paradas.length === 0) {
        document.getElementById("vista-continuar__titulo").textContent =
          "Não achei mais nada aberto por perto agora";
        document.getElementById("vista-continuar__texto").textContent =
          "Você já viu tudo que dava pra encaixar por aqui nesse horário. Que tal finalizar por hoje?";
        document.getElementById("btn-sim-continuar").hidden = true;
        return;
      }

      salvarRotaNoStorage(novoCapitulo);
      mostrarEstado("vista-resultado");
      renderizarResultado(novoCapitulo);
      configurarBotaoIniciar(novoCapitulo);
    })
    .catch((erro) => {
      console.error("[modo-em-rota] Erro ao gerar próximo capítulo:", erro);
      document.getElementById("vista-continuar__acoes").hidden = false;
      document.getElementById("vista-continuar__carregando").hidden = true;
      mostrarAvisoRecalculo("Não conseguimos montar o próximo trecho agora. Tenta de novo em um instante.");
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
      <a class="botao botao--secundario"
         href="ponto.html?id=${parada.id}">
        Ver detalhes
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
