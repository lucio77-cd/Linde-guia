/**
 * modo-em-rota.js
 * Linde Guia — Treze Tílias
 *
 * Controla a sub-vista "Em Rota": desenha o card da parada atual e os
 * botões de checklist manual ("Cheguei" / "Pular essa parada").
 *
 * Mapa de orientação (parada atual + posição + traçado): lê o GPS UMA vez
 * por parada e no botão "Atualizar minha posição". Não há GPS contínuo
 * (watchPosition) nem check-in automático — o "Cheguei" continua manual,
 * que é o que mantém o dado do painel confiável. Navegação curva a curva
 * fica por conta dos botões do Google Maps/Waze.
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
import {
  registrarCheckin,
  registrarParadaPulada,
  registrarCapituloAdicional,
  registrarRoteiroFinalizado,
} from "../data/registro-data.js";
import { obterQuantidadeParadasVisitadas } from "../data/metricas-patrocinio-data.js";
import { salvarSeloLocal, lerSelos } from "../core/selos-local.js";
import { buscarPoisAtivos } from "../data/pois-data.js";
import { buscarEventosAtivosNaData } from "../data/eventos-data.js";
import { escaparHtml } from "../core/html-utils.js";
import { criarMapaFocado } from "./mapa-rota.js";

const CHAVE_INDEX = "linde-guia:parada-atual-index";

function iniciarModoEmRota() {
  document.addEventListener("linde-guia:iniciar-em-rota", (evento) => {
    // Capítulo novo: o traçado do anterior não vale mais.
    polylineNoMapa = evento.detail.rota.polyline || null;
    desenharParadaAtual(evento.detail.rota, obterIndiceAtual());
  });

  document.getElementById("btn-pular-parada").addEventListener("click", () => {
    avancarRota("pular");
  });

  document.getElementById("btn-cheguei").addEventListener("click", () => {
    avancarRota("chegou");
  });

  const btnAtualizarPosicao = document.getElementById("btn-atualizar-posicao");
  if (btnAtualizarPosicao) {
    btnAtualizarPosicao.addEventListener("click", () => {
      if (paradaNoMapa) atualizarMapaEmRota(paradaNoMapa);
    });
  }

  document.getElementById("btn-nao-continuar").addEventListener("click", finalizarPasseio);
  document.getElementById("btn-sim-continuar").addEventListener("click", gerarProximoCapitulo);
}

document.addEventListener("DOMContentLoaded", iniciarModoEmRota);

// ============================================================
// AVANÇAR NO ROTEIRO ("Cheguei" ou "Pular essa parada")
// ============================================================
let avancandoRota = false; // trava contra duplo clique enquanto o GPS responde (até ~5 s)

function avancarRota(acao) {
  if (avancandoRota) return;
  const rota = lerRotaDoStorage();
  if (!rota) return;
  avancandoRota = true;

  const indiceAtual = obterIndiceAtual();
  const paradaAtual = rota.paradas[indiceAtual];

  if (acao === "chegou" && paradaAtual) {
    registrarCheckin(paradaAtual, "manual"); // não bloqueia o fluxo, falha silenciosa
    salvarSeloLocal(paradaAtual); // guarda o selo no aparelho do visitante (ver perfil.html)
  } else if (acao === "pular" && paradaAtual) {
    registrarParadaPulada(paradaAtual); // mede a parada oferecida que não virou visita
  }

  obterPosicaoEHorarioAtuais(paradaAtual?.localizacao)
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
    })
    .finally(() => {
      avancandoRota = false;
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
    registrarRoteiroFinalizado(capitulo, obterQuantidadeParadasVisitadas());
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

  const ultimaParadaConhecida = capituloAnterior.paradas[capituloAnterior.paradas.length - 1];

  obterPosicaoEHorarioAtuais(ultimaParadaConhecida?.localizacao)
    .then(async ({ posicaoAtual, horarioAtual }) => {
      const ultimaParada = ultimaParadaConhecida;

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

      registrarCapituloAdicional(novoCapitulo);
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

// Raio de tolerância entre a posição real do GPS e a última parada
// confirmada — acima disso, a leitura é descartada por não fazer sentido
// fisicamente (cidade pequena, poucos minutos entre uma parada e outra).
// Sem essa checagem, uma leitura de GPS ruim (comum logo depois de abrir
// o app, ou em ambiente fechado) fazia o app achar que a pessoa estava
// muito mais longe do que estava de verdade — o tempo de caminhada
// calculado explodia, o horário de chegada calculado caía fora do
// funcionamento de TODAS as paradas restantes, e a rota era finalizada
// mesmo sobrando parada de verdade pra visitar. Bug real, corrigido aqui.
const RAIO_TOLERANCIA_GPS_KM = 3;

function obterPosicaoEHorarioAtuais(posicaoDeReferencia) {
  const horarioAtual = new Date().toISOString();

  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ posicaoAtual: posicaoDeReferencia || null, horarioAtual });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        const posicaoGps = { lat: posicao.coords.latitude, lng: posicao.coords.longitude };

        if (posicaoDeReferencia && distanciaKm(posicaoDeReferencia, posicaoGps) > RAIO_TOLERANCIA_GPS_KM) {
          console.warn(
            "[modo-em-rota] Leitura de GPS descartada — muito longe da última parada confirmada. Usando a posição da última parada em vez disso."
          );
          resolve({ posicaoAtual: posicaoDeReferencia, horarioAtual });
          return;
        }

        resolve({ posicaoAtual: posicaoGps, horarioAtual });
      },
      () => resolve({ posicaoAtual: posicaoDeReferencia || null, horarioAtual }),
      { timeout: 5000 }
    );
  });
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
    <p class="card-parada-atual__categoria">${escaparHtml(parada.categoria || "")}</p>
    <h2 class="card-parada-atual__nome">${escaparHtml(parada.nome)}</h2>
    <div class="card-parada-atual__info">
      <span>Chegada prevista: ${formatarHorarioLocal(parada.horarioChegada)}</span>
      <span>${Number(parada.duracaoMediaVisitaMin) || 30} min de visita</span>
    </div>
    <div class="card-parada-atual__navegacao">
      <a class="botao botao--secundario"
         href="${montarLinkGoogleMaps(parada)}"
         target="_blank" rel="noopener">
        Navegar (Google Maps)
      </a>
      <a class="botao botao--secundario"
         href="${montarLinkWaze(parada)}"
         target="_blank" rel="noopener">
        Navegar (Waze)
      </a>
      <a class="botao botao--secundario"
         href="ponto.html?id=${encodeURIComponent(parada.id)}">
        Ver detalhes
      </a>
    </div>
  `;

  esconderAvisoRecalculo();
  avisarSeRiscoDeFechar(parada);
  atualizarMapaEmRota(parada);
}

// ============================================================
// MAPA DA PARADA ATUAL
// ============================================================
let mapaFocado = null;
let paradaNoMapa = null;
let polylineNoMapa = null;
let leituraDePosicaoEmAndamento = false;

// Posição uma vez só, precisão normal (economiza bateria), sem cache velho.
function lerPosicaoUmaVez() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { timeout: 8000, maximumAge: 30000 }
    );
  });
}

function formatarDistancia(km) {
  return km < 1 ? `${Math.max(10, Math.round((km * 1000) / 10) * 10)} m` : `${km.toFixed(1).replace(".", ",")} km`;
}

async function atualizarMapaEmRota(parada) {
  const infoEl = document.getElementById("info-distancia-parada");
  if (!document.getElementById("mapa-em-rota")) return;

  if (!mapaFocado) mapaFocado = criarMapaFocado("mapa-em-rota");
  if (!mapaFocado) return; // Leaflet não carregou: o card continua funcionando sem mapa

  paradaNoMapa = parada;

  // 1) Mostra já a parada (sem esperar o GPS)
  mapaFocado.atualizar(parada.localizacao, null, parada.nome, polylineNoMapa);
  if (infoEl) infoEl.textContent = "Buscando sua posição...";

  if (leituraDePosicaoEmAndamento) return;
  leituraDePosicaoEmAndamento = true;

  try {
    const posicao = await lerPosicaoUmaVez();

    // A pessoa pode ter avançado de parada enquanto o GPS respondia
    if (paradaNoMapa !== parada) return;

    mapaFocado.atualizar(parada.localizacao, posicao, parada.nome, polylineNoMapa);

    if (!infoEl) return;

    if (!posicao) {
      infoEl.textContent = "Não consegui pegar sua posição. Você ainda pode usar os botões de navegação acima.";
    } else if (!parada.localizacao) {
      infoEl.textContent = "";
    } else {
      const km = distanciaKm(posicao, parada.localizacao);
      if (km > 5) {
        infoEl.textContent = "Você parece estar longe de Treze Tílias. O mapa mostra só a parada.";
      } else if (km * 1000 <= 60) {
        infoEl.innerHTML = "<strong>Você está bem perto!</strong> Chegou? Toque em \"Cheguei\".";
      } else {
        const minutos = Math.max(1, Math.round((km / 4.5) * 60 * 1.3)); // 4,5 km/h + 30% de desvio de ruas
        infoEl.innerHTML = `Você está a <strong>${formatarDistancia(km)}</strong> · cerca de <strong>${minutos} min</strong> a pé`;
      }
    }
  } finally {
    leituraDePosicaoEmAndamento = false;
    // Se a pessoa avançou de parada enquanto o GPS respondia, atualiza a atual.
    if (paradaNoMapa && paradaNoMapa !== parada) atualizarMapaEmRota(paradaNoMapa);
  }
}

// Busca por NOME do local + cidade, em vez de coordenada crua. Decisão
// consciente: parte dos POIs cadastrados pode ter lat/lng impreciso (ver
// admin-locais.js — Nominatim, sem verificação humana em todo cadastro),
// e mandar alguém pra um pino errado é pior do que deixar o próprio
// Google/Waze resolver o nome do estabelecimento com a base deles, que
// já inclui avaliações, fotos e o pino certo na porta do lugar. Também
// evita qualquer custo ou dependência de API de geocodificação nossa —
// esses links são só URLs abertas no app de navegação da pessoa.
function montarLinkGoogleMaps(parada) {
  const consulta = encodeURIComponent(`${parada.nome}, Treze Tílias, SC`);
  // "dir" (direções) abre navegação turn-by-turn de verdade; destination
  // aceita texto de busca, não só coordenada. travelmode=walking porque o
  // passeio em Treze Tílias é pensado a pé no centro histórico.
  return `https://www.google.com/maps/dir/?api=1&destination=${consulta}&travelmode=walking`;
}

function montarLinkWaze(parada) {
  const consulta = encodeURIComponent(`${parada.nome}, Treze Tílias, SC`);
  return `https://waze.com/ul?q=${consulta}&navigate=yes`;
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

