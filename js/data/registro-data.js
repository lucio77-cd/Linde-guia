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
  collection,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const COLECAO_ROTAS_CRIADAS = "rotas_criadas";
const COLECAO_CHECKINS = "checkins";

// ============================================================
// REGISTRAR ROTA CRIADA — chamado quando o formulário gera uma rota
// ============================================================
async function registrarRotaCriada(perfilBusca, rota) {
  try {
    await addDoc(collection(db, COLECAO_ROTAS_CRIADAS), {
      criadoEm: serverTimestamp(),
      horarioInicioEscolhido: perfilBusca.horarioInicio,
      tempoDisponivelMin: perfilBusca.tempoDisponivelMin,
      orcamentoFaixa: perfilBusca.orcamentoFaixa || null,
      composicaoGrupo: perfilBusca.composicaoGrupo || null,
      interesses: perfilBusca.interesses || [],
      quantidadeParadas: rota.paradas.length,
      paradasNomes: rota.paradas.map((p) => p.nome),
      rotaVazia: !!rota.vazia,
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
    await addDoc(collection(db, COLECAO_CHECKINS), {
      poiId: poi.id || null,
      poiNome: poi.nome,
      poiCategoria: poi.categoria || null,
      checkinEm: serverTimestamp(),
      origemDeteccao, // "gps" ou "manual" — útil pra saber a confiabilidade do dado
    });
  } catch (erro) {
    console.warn("[registro-data] Falha ao registrar check-in (não afeta o usuário):", erro);
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
      quantidadeParadasTotal: rota.paradas.length,
      quantidadeParadasVisitadas,
    });
  } catch (erro) {
    console.warn("[registro-data] Falha ao registrar finalização (não afeta o usuário):", erro);
  }
}

export { registrarRotaCriada, registrarCheckin, registrarRoteiroFinalizado };
