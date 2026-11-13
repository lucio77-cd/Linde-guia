/**
 * registro-data.js
 * Linde Guia — Treze Tílias
 *
 * Camada de ESCRITA de dados analíticos — registra eventos que depois
 * alimentam o painel admin (gráficos de rotas criadas, check-ins de
 * chegada por local, etc). Separado de pois-data.js porque é um tipo de
 * dado diferente (eventos de uso, não conteúdo turístico).
 *
 * Nunca lança erro para quem chama: se o registro falhar (rede instável,
 * etc), isso NUNCA deve impedir o turista de usar o app normalmente.
 * Falha aqui é só log no console, silenciosa para a experiência do usuário.
 */

import { db } from "../core/firebase-config.js";
import {
  iniciarNovaRotaAnalytics,
  obterRotaIdAtual,
  registrarVisitaDaRota,
  finalizarRotaAnalytics,
  registrarEventoPatrocinio,
} from "./metricas-patrocinio-data.js";
import {
  collection,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const COLECAO_ROTAS_CRIADAS = "rotas_criadas";
const COLECAO_CHECKINS = "checkins";

// ============================================================
// REGISTRAR ROTA CRIADA — chamado quando o formulário gera uma rota
// ============================================================
async function registrarRotaCriada(perfilBusca, capitulo) {
  try {
    await addDoc(collection(db, COLECAO_ROTAS_CRIADAS), {
      criadoEm: serverTimestamp(),
      rotaId: iniciarNovaRotaAnalytics(),
      horarioInicioEscolhido: perfilBusca.horarioInicio,
      refeicoesDesejadas: perfilBusca.refeicoesDesejadas || [],
      interesses: perfilBusca.interesses || [],
      quantidadeParadas: capitulo.paradas.length,
      paradasNomes: capitulo.paradas.map((p) => p.nome),
      paradasIds: capitulo.paradas.map((p) => String(p.id)).filter(Boolean),
      capituloVazio: !!capitulo.vazio,
    });
  } catch (erro) {
    console.warn("[registro-data] Falha ao registrar rota criada (não afeta o usuário):", erro);
  }
}

// ============================================================
// REGISTRAR CHECK-IN — chamado quando o usuário chega de fato num local
// ============================================================
async function registrarCheckin(poi, origemDeteccao) {
  try {
    const rotaId = obterRotaIdAtual(false);
    registrarVisitaDaRota();
    await addDoc(collection(db, COLECAO_CHECKINS), {
      ...(rotaId ? { rotaId } : {}),
      poiId: poi.id || null,
      poiNome: poi.nome,
      poiCategoria: poi.categoria || null,
      checkinEm: serverTimestamp(),
      origemDeteccao, // "gps" ou "manual" — útil pra saber a confiabilidade do dado
    });
    if (poi.patrocinio?.ativo === true) {
      await registrarEventoPatrocinio({
        tipoEvento: "checkin", origem: "modo-rota", poiId: poi.id,
      });
    }
  } catch (erro) {
    console.warn("[registro-data] Falha ao registrar check-in (não afeta o usuário):", erro);
  }
}

// ============================================================
// REGISTRAR PARADA PULADA — identifica oferta que não virou visita
// ============================================================
async function registrarParadaPulada(poi) {
  if (!poi?.id) return;
  await registrarEventoPatrocinio({
    tipoEvento: "parada_pulada",
    origem: "modo-rota",
    poiId: poi.id,
  });
}

// ============================================================
// REGISTRAR CAPÍTULO ADICIONAL — mantém o mesmo passeio entre capítulos
// ============================================================
async function registrarCapituloAdicional(capitulo) {
  try {
    const rotaId = obterRotaIdAtual(true);
    await addDoc(collection(db, COLECAO_ROTAS_CRIADAS), {
      criadoEm: serverTimestamp(),
      tipoEvento: "capitulo",
      rotaId,
      quantidadeParadas: capitulo.paradas.length,
      paradasNomes: capitulo.paradas.map((p) => p.nome),
      paradasIds: capitulo.paradas.map((p) => String(p.id)).filter(Boolean),
      capituloVazio: !!capitulo.vazio,
    });
  } catch (erro) {
    console.warn("[registro-data] Falha ao registrar capítulo adicional:", erro);
  }
}

// ============================================================
// REGISTRAR ROTEIRO FINALIZADO — quanto da rota foi de fato concluída
// ============================================================
async function registrarRoteiroFinalizado(rota, quantidadeParadasVisitadas) {
  try {
    await addDoc(collection(db, COLECAO_ROTAS_CRIADAS), {
      criadoEm: serverTimestamp(),
      tipoEvento: "finalizacao",
      rotaId: obterRotaIdAtual(false),
      quantidadeParadasTotal: rota.paradas.length,
      quantidadeParadasVisitadas,
    });
  } catch (erro) {
    console.warn("[registro-data] Falha ao registrar finalização (não afeta o usuário):", erro);
  } finally {
    finalizarRotaAnalytics();
  }
}

export {
  registrarRotaCriada,
  registrarCheckin,
  registrarParadaPulada,
  registrarCapituloAdicional,
  registrarRoteiroFinalizado,
};
