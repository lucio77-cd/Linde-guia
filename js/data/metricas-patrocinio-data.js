/**
 * metricas-patrocinio-data.js
 * Linde Guia — Treze Tílias
 *
 * FEITO: registra eventos anônimos de exposição e interação com patrocínios.
 * MOTIVO: separar impressão, clique, contato, direção, check-in e parada pulada.
 * FALTA: agregação diária confiável no servidor e painel comercial (fase seguinte).
 *
 * Não grava nome, telefone, e-mail, IP, coordenadas ou identificador de conta.
 * Os IDs de rota são aleatórios e existem apenas para relacionar eventos do passeio.
 * Os registros são append-only; o cliente não pode alterar nem apagar eventos.
 */
import { db } from "../core/firebase-config.js";
import {
  addDoc,
  collection,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const COLECAO_EVENTOS = "eventos_patrocinio";
const CHAVE_ROTA = "linde-guia:rota-analytics-id";
const CHAVE_VISITAS = "linde-guia:paradas-visitadas";

function criarIdAnonimo() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function obterRotaIdAtual(criarSeAusente = false) {
  try {
    let rotaId = sessionStorage.getItem(CHAVE_ROTA);
    if (!rotaId && criarSeAusente) {
      rotaId = criarIdAnonimo();
      sessionStorage.setItem(CHAVE_ROTA, rotaId);
      sessionStorage.setItem(CHAVE_VISITAS, "0");
    }
    return rotaId || null;
  } catch (erro) {
    console.warn("[metricas-patrocinio] sessionStorage indisponível:", erro);
    return null;
  }
}

function iniciarNovaRotaAnalytics() {
  try {
    const rotaId = criarIdAnonimo();
    sessionStorage.setItem(CHAVE_ROTA, rotaId);
    sessionStorage.setItem(CHAVE_VISITAS, "0");
    return rotaId;
  } catch (erro) {
    console.warn("[metricas-patrocinio] Não foi possível iniciar ID de rota:", erro);
    return null;
  }
}

function registrarVisitaDaRota() {
  try {
    const atual = Number(sessionStorage.getItem(CHAVE_VISITAS) || "0");
    const proximo = atual + 1;
    sessionStorage.setItem(CHAVE_VISITAS, String(proximo));
    return proximo;
  } catch {
    return 0;
  }
}

function obterQuantidadeParadasVisitadas() {
  try {
    return Number(sessionStorage.getItem(CHAVE_VISITAS) || "0");
  } catch {
    return 0;
  }
}

function finalizarRotaAnalytics() {
  try {
    sessionStorage.removeItem(CHAVE_ROTA);
    sessionStorage.removeItem(CHAVE_VISITAS);
  } catch {
    // Métricas nunca podem interromper o passeio.
  }
}

async function registrarEventoPatrocinio({
  tipoEvento,
  origem,
  poiId = null,
  patrocinadorId = null,
  rotaId = undefined,
  nivel = null,
}) {
  const tiposPermitidos = [
    "impressao", "clique", "whatsapp", "instagram",
    "direcoes", "checkin", "parada_pulada",
  ];
  const origensPermitidas = [
    "carrossel", "banner", "pagina-local", "modo-rota",
  ];

  if (!tiposPermitidos.includes(tipoEvento) || !origensPermitidas.includes(origem)) return;
  if (!poiId && !patrocinadorId) return;

  const evento = {
    tipoEvento,
    origem,
    criadoEm: serverTimestamp(),
  };

  const idRota = rotaId === undefined ? obterRotaIdAtual(false) : rotaId;
  if (poiId) evento.poiId = String(poiId).slice(0, 100);
  if (patrocinadorId) evento.patrocinadorId = String(patrocinadorId).slice(0, 100);
  if (idRota) evento.rotaId = String(idRota).slice(0, 36);
  if (nivel && ["ouro", "prata", "bronze"].includes(nivel)) evento.nivel = nivel;

  try {
    await addDoc(collection(db, COLECAO_EVENTOS), evento);
  } catch (erro) {
    // Telemetria é secundária: jamais bloqueia navegação ou uso do app.
    console.warn("[metricas-patrocinio] Falha ao registrar evento:", erro);
  }
}

export {
  obterRotaIdAtual,
  iniciarNovaRotaAnalytics,
  registrarVisitaDaRota,
  obterQuantidadeParadasVisitadas,
  finalizarRotaAnalytics,
  registrarEventoPatrocinio,
};
