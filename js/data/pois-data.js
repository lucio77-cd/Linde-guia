/**
 * pois-data.js
 * Linde Guia — Treze Tílias
 *
 * Camada ÚNICA de acesso aos dados de POI no Firestore.
 * Ninguém mais no projeto fala com a coleção "pois" diretamente — todo mundo
 * (motor-rota.js, explorar.js, ponto-detalhe.js, admin-pois.js) passa por aqui.
 *
 * Por quê: se o formato de um campo mudar no Firestore, só este arquivo muda.
 * O resto do app consome sempre o mesmo formato de objeto POI, normalizado.
 *
 * Formato de saída de um POI (o que o motor-rota.js espera receber):
 * {
 *   id, nome, categoria, subcategoria, descricaoCurta, descricaoLonga, fotos[],
 *   localizacao: { lat, lng },
 *   horarioFuncionamento: { segunda: {abre, fecha, fechado}, terca: {...}, ... },
 *   precoEstimado,            // número, em R$, 0 = grátis
 *   duracaoMediaVisitaMin,    // número
 *   avaliacao,                // 0-5
 *   tagsDeInteresse: [],
 *   statusOperacional,        // "ativo" | "sazonal" | "em_reforma" | "fechado_temporariamente"
 *   pesoInstitucional         // 0-1, opcional
 *   prioridadeGastronomica    // 1-5, opcional, só relevante se categoria === "gastronomia".
 *                             // Definido no painel admin. Nível >= 4 GARANTE um slot na
 *                             // rota (não é só bônus de pontuação) quando o lugar já é
 *                             // viável (aberto, dentro do orçamento, cabe no tempo).
 * }
 */

import { db } from "../core/firebase-config.js";
import {
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const NOME_COLECAO = "pois";

// ============================================================
// CACHE EM MEMÓRIA
// ============================================================
// Evita ler o Firestore inteiro de novo a cada tela — os POIs não mudam
// a cada segundo, então um cache simples de sessão já resolve.
let cachePois = null;
let cacheTimestamp = null;
const CACHE_VALIDADE_MS = 5 * 60 * 1000; // 5 minutos

function cacheEstaValido() {
  return cachePois !== null && cacheTimestamp !== null && Date.now() - cacheTimestamp < CACHE_VALIDADE_MS;
}

function invalidarCache() {
  cachePois = null;
  cacheTimestamp = null;
}

// ============================================================
// LEITURA — todos os POIs
// ============================================================
async function buscarTodosPois({ forcarAtualizacao = false } = {}) {
  if (!forcarAtualizacao && cacheEstaValido()) {
    return cachePois;
  }

  try {
    const snapshot = await getDocs(collection(db, NOME_COLECAO));
    const pois = snapshot.docs.map((docSnap) => normalizarPoi(docSnap.id, docSnap.data()));

    cachePois = pois;
    cacheTimestamp = Date.now();

    return pois;
  } catch (erro) {
    console.error("[pois-data] Erro ao buscar todos os POIs:", erro);
    // Se já existe cache antigo, melhor devolver dado velho do que travar o app
    return cachePois || [];
  }
}

// ============================================================
// LEITURA — um POI específico por id
// ============================================================
async function buscarPoiPorId(id) {
  if (cacheEstaValido()) {
    const doCache = cachePois.find((poi) => poi.id === id);
    if (doCache) return doCache;
  }

  try {
    const docSnap = await getDoc(doc(db, NOME_COLECAO, id));
    if (!docSnap.exists()) {
      console.warn(`[pois-data] POI ${id} não encontrado.`);
      return null;
    }
    return normalizarPoi(docSnap.id, docSnap.data());
  } catch (erro) {
    console.error(`[pois-data] Erro ao buscar POI ${id}:`, erro);
    return null;
  }
}

// ============================================================
// LEITURA — POIs por categoria (usado em explorar.js)
// ============================================================
async function buscarPoisPorCategoria(categoria) {
  const todos = await buscarTodosPois();
  if (!categoria || categoria === "todas") return todos;
  return todos.filter((poi) => poi.categoria === categoria);
}

// ============================================================
// LEITURA — só POIs operacionalmente saudáveis
// ============================================================
// Atalho usado pelo motor-rota.js: nunca quer ver algo em reforma ou fechado.
async function buscarPoisAtivos() {
  const todos = await buscarTodosPois();
  return todos.filter(
    (poi) => poi.statusOperacional === "ativo" || poi.statusOperacional === "sazonal"
  );
}

// ============================================================
// ESCRITA — usado pelo admin-pois.js (painel da Secretaria de Turismo)
// ============================================================
async function criarPoi(dadosPoi) {
  try {
    const docRef = await addDoc(collection(db, NOME_COLECAO), desnormalizarPoi(dadosPoi));
    invalidarCache();
    return docRef.id;
  } catch (erro) {
    console.error("[pois-data] Erro ao criar POI:", erro);
    throw erro;
  }
}

async function atualizarPoi(id, dadosParciais) {
  try {
    await updateDoc(doc(db, NOME_COLECAO, id), desnormalizarPoi(dadosParciais, { parcial: true }));
    invalidarCache();
  } catch (erro) {
    console.error(`[pois-data] Erro ao atualizar POI ${id}:`, erro);
    throw erro;
  }
}

// Atalho específico: mudar só o status operacional (caso de uso real — Águas Tirolesas)
async function atualizarStatusOperacional(id, novoStatus) {
  return atualizarPoi(id, { statusOperacional: novoStatus });
}

async function removerPoi(id) {
  try {
    await deleteDoc(doc(db, NOME_COLECAO, id));
    invalidarCache();
  } catch (erro) {
    console.error(`[pois-data] Erro ao remover POI ${id}:`, erro);
    throw erro;
  }
}

// ============================================================
// NORMALIZAÇÃO — Firestore (snake_case/legado) -> formato interno do app
// ============================================================
function normalizarPoi(id, dadosFirestore) {
  return {
    id,
    nome: dadosFirestore.nome || "",
    categoria: dadosFirestore.categoria || "outro",
    subcategoria: dadosFirestore.subcategoria || null,
    descricaoCurta: dadosFirestore.descricao_curta || dadosFirestore.descricaoCurta || "",
    descricaoLonga: dadosFirestore.descricao_longa || dadosFirestore.descricaoLonga || "",
    fotos: dadosFirestore.fotos || [],
    localizacao: normalizarLocalizacao(dadosFirestore.localizacao),
    horarioFuncionamento: dadosFirestore.horario_funcionamento || dadosFirestore.horarioFuncionamento || null,
    precoEstimado: Number(dadosFirestore.preco_estimado ?? dadosFirestore.precoEstimado ?? 0),
    duracaoMediaVisitaMin: Number(
      dadosFirestore.duracao_media_visita_min ?? dadosFirestore.duracaoMediaVisitaMin ?? 30
    ),
    avaliacao: Number(dadosFirestore.avaliacao ?? 0),
    tagsDeInteresse: dadosFirestore.tags_de_interesse || dadosFirestore.tagsDeInteresse || [],
    statusOperacional: dadosFirestore.status_operacional || dadosFirestore.statusOperacional || "ativo",
    pesoInstitucional: Number(dadosFirestore.peso_institucional ?? dadosFirestore.pesoInstitucional ?? 0),
    prioridadeGastronomica: Number(
      dadosFirestore.prioridade_gastronomica ?? dadosFirestore.prioridadeGastronomica ?? 0
    ),
  };
}

function normalizarLocalizacao(localizacao) {
  if (!localizacao) return null;
  // Firestore GeoPoint tem .latitude/.longitude; dado seed em JSON usa lat/lng direto
  const lat = localizacao.latitude ?? localizacao.lat;
  const lng = localizacao.longitude ?? localizacao.lng;
  if (lat == null || lng == null) return null;
  return { lat: Number(lat), lng: Number(lng) };
}

// ============================================================
// DESNORMALIZAÇÃO — formato interno do app -> Firestore
// ============================================================
function desnormalizarPoi(poi, { parcial = false } = {}) {
  const mapa = {
    nome: poi.nome,
    categoria: poi.categoria,
    subcategoria: poi.subcategoria,
    descricao_curta: poi.descricaoCurta,
    descricao_longa: poi.descricaoLonga,
    fotos: poi.fotos,
    localizacao: poi.localizacao,
    horario_funcionamento: poi.horarioFuncionamento,
    preco_estimado: poi.precoEstimado,
    duracao_media_visita_min: poi.duracaoMediaVisitaMin,
    avaliacao: poi.avaliacao,
    tags_de_interesse: poi.tagsDeInteresse,
    status_operacional: poi.statusOperacional,
    peso_institucional: poi.pesoInstitucional,
    prioridade_gastronomica: poi.prioridadeGastronomica,
  };

  if (!parcial) return mapa;

  // Em atualização parcial, só manda os campos que vieram preenchidos
  return Object.fromEntries(Object.entries(mapa).filter(([, valor]) => valor !== undefined));
}

// ============================================================
// EXPORTAÇÃO
// ============================================================
export {
  buscarTodosPois,
  buscarPoiPorId,
  buscarPoisPorCategoria,
  buscarPoisAtivos,
  criarPoi,
  atualizarPoi,
  atualizarStatusOperacional,
  removerPoi,
  invalidarCache,
};
