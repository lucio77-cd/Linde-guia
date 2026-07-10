/**
 * eventos-data.js
 * Linde Guia — Treze Tílias
 *
 * Camada única de acesso à coleção "eventos" no Firestore.
 * Mesmo padrão de cache/normalização do pois-data.js — o motor-rota.js
 * e a tela eventos.html consomem sempre o formato normalizado abaixo,
 * nunca o documento bruto do Firestore.
 *
 * Formato de saída de um evento:
 * {
 *   id, nome, descricao,
 *   dataInicio: Date, dataFim: Date,
 *   localizacao: { lat, lng } | null,
 *   horarioFuncionamento, precoEstimado, duracaoMediaVisitaMin,
 *   tagsDeInteresse: [], pesoInstitucional, poiRelacionado
 * }
 */

import { db } from "../core/firebase-config.js";
import {
  collection,
  getDocs,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const NOME_COLECAO = "eventos";

// ============================================================
// CACHE EM MEMÓRIA (mesmo padrão de pois-data.js)
// ============================================================
let cacheEventos = null;
let cacheTimestamp = null;
const CACHE_VALIDADE_MS = 5 * 60 * 1000;

function cacheEstaValido() {
  return cacheEventos !== null && cacheTimestamp !== null && Date.now() - cacheTimestamp < CACHE_VALIDADE_MS;
}

function invalidarCache() {
  cacheEventos = null;
  cacheTimestamp = null;
}

// ============================================================
// LEITURA — todos os eventos
// ============================================================
async function buscarTodosEventos({ forcarAtualizacao = false } = {}) {
  if (!forcarAtualizacao && cacheEstaValido()) {
    return cacheEventos;
  }

  try {
    const snapshot = await getDocs(collection(db, NOME_COLECAO));
    const eventos = snapshot.docs.map((docSnap) => normalizarEvento(docSnap.id, docSnap.data()));

    cacheEventos = eventos;
    cacheTimestamp = Date.now();

    return eventos;
  } catch (erro) {
    console.error("[eventos-data] Erro ao buscar todos os eventos:", erro);
    return cacheEventos || [];
  }
}

// ============================================================
// LEITURA — evento ativo agora (usado pelo banner da Home)
// ============================================================
async function buscarEventoAtivoAgora() {
  const todos = await buscarTodosEventos();
  const agoraMs = Date.now();

  return (
    todos.find((evento) => {
      const inicioMs = evento.dataInicio?.getTime() ?? 0;
      const fimMs = evento.dataFim?.getTime() ?? Infinity;
      return agoraMs >= inicioMs && agoraMs <= fimMs;
    }) || null
  );
}

// ============================================================
// LEITURA — eventos ativos numa data específica (usado pelo motor-rota.js)
// ============================================================
async function buscarEventosAtivosNaData(dataReferencia) {
  const todos = await buscarTodosEventos();
  const refMs = new Date(dataReferencia).getTime();

  return todos.filter((evento) => {
    const inicioMs = evento.dataInicio?.getTime() ?? 0;
    const fimMs = evento.dataFim?.getTime() ?? Infinity;
    return refMs >= inicioMs && refMs <= fimMs;
  });
}

// ============================================================
// NORMALIZAÇÃO — Firestore -> formato interno do app
// ============================================================
function normalizarEvento(id, d) {
  return {
    id,
    nome: d.nome || "",
    descricao: d.descricao || "",
    dataInicio: converterParaDate(d.data_inicio ?? d.dataInicio),
    dataFim: converterParaDate(d.data_fim ?? d.dataFim),
    localizacao: normalizarLocalizacao(d.localizacao),
    horarioFuncionamento: d.horario_funcionamento || d.horarioFuncionamento || null,
    precoEstimado: Number(d.preco_estimado ?? d.precoEstimado ?? 0),
    duracaoMediaVisitaMin: Number(d.duracao_media_visita_min ?? d.duracaoMediaVisitaMin ?? 60),
    tagsDeInteresse: d.tags_de_interesse || d.tagsDeInteresse || ["cultura"],
    pesoInstitucional: Number(d.peso_institucional ?? d.pesoInstitucional ?? 1),
    poiRelacionado: d.poi_relacionado ?? d.poiRelacionado ?? null,
  };
}

function converterParaDate(valor) {
  if (!valor) return null;
  if (valor instanceof Timestamp) return valor.toDate();
  if (valor.toDate) return valor.toDate(); // Timestamp do Firestore via CDN
  return new Date(valor);
}

function normalizarLocalizacao(localizacao) {
  if (!localizacao) return null;
  const lat = localizacao.latitude ?? localizacao.lat;
  const lng = localizacao.longitude ?? localizacao.lng;
  if (lat == null || lng == null) return null;
  return { lat: Number(lat), lng: Number(lng) };
}

export {
  buscarTodosEventos,
  buscarEventoAtivoAgora,
  buscarEventosAtivosNaData,
  invalidarCache,
};
