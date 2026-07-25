/**
 * patrocinadores-data.js
 * Linde Guia — Treze Tílias
 *
 * Único canal de acesso à coleção "patrocinadores" no Firestore.
 *
 * Formato de um patrocinador:
 *   id, nome, imagemBannerUrl, nivel, tipoDestino, poiIdDestino,
 *   linkDestino, dataInicio, dataFim, ativo
 *
 * MUDANÇA: "linkDestino" sozinho virou "tipoDestino" + campo específico —
 * porque agora um banner pode levar a 3 lugares diferentes, não só um
 * link externo colado à mão:
 *   tipoDestino: "nenhum"   -> banner só imagem, sem clique
 *   tipoDestino: "local"    -> leva pra pages/ponto.html?id={poiIdDestino},
 *                              um Local JÁ CADASTRADO no app (escolhido
 *                              por dropdown no admin, nunca digitado)
 *   tipoDestino: "externo"  -> leva pro linkDestino (link de fora, ex:
 *                              Instagram do patrocinador)
 *   tipoDestino: "whatsapp" -> leva pro WhatsApp configurado no admin
 *                              (aba Configurações) — usado no banner
 *                              "anuncie aqui" pra virar contato direto
 *
 * Compatibilidade: patrocinador antigo que só tinha linkDestino (sem
 * tipoDestino) é lido como tipoDestino "externo" automaticamente.
 */
import { db } from "../core/firebase-config.js";
import {
  collection, getDocs, query, where, addDoc, updateDoc, deleteDoc, doc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const NOME_COLECAO = "patrocinadores";

// ============================================================
// LEITURA — lado do turista (só ativos e dentro do período)
// ============================================================
async function buscarPatrocinadoresAtivos() {
  const consulta = query(collection(db, NOME_COLECAO), where("ativo", "==", true));
  const snapshot = await getDocs(consulta);

  const agora = new Date();

  return snapshot.docs
    .map((doc) => normalizarPatrocinador(doc.id, doc.data()))
    .filter((p) => dentroDoPeriodoContratado(p, agora));
}

function dentroDoPeriodoContratado(patrocinador, agora) {
  if (patrocinador.dataInicio && new Date(patrocinador.dataInicio) > agora) return false;
  if (patrocinador.dataFim && new Date(patrocinador.dataFim) < agora) return false;
  return true;
}

async function buscarPatrocinadorParaExibir() {
  const ativos = await buscarPatrocinadoresAtivos();
  if (ativos.length === 0) return null;
  return ativos[Math.floor(Math.random() * ativos.length)];
}

// ============================================================
// LEITURA + ESCRITA — lado admin
// ============================================================
async function buscarTodosPatrocinadores() {
  const snapshot = await getDocs(collection(db, NOME_COLECAO));
  return snapshot.docs.map((doc) => normalizarPatrocinador(doc.id, doc.data()));
}

async function criarPatrocinador(dados) {
  try {
    const docRef = await addDoc(collection(db, NOME_COLECAO), desnormalizarPatrocinador(dados));
    return docRef.id;
  } catch (erro) {
    console.error("[patrocinadores-data] Erro ao criar patrocinador:", erro);
    throw erro;
  }
}

async function atualizarPatrocinador(id, dadosParciais) {
  try {
    await updateDoc(doc(db, NOME_COLECAO, id), desnormalizarPatrocinador(dadosParciais));
  } catch (erro) {
    console.error(`[patrocinadores-data] Erro ao atualizar patrocinador ${id}:`, erro);
    throw erro;
  }
}

async function removerPatrocinador(id) {
  try {
    await deleteDoc(doc(db, NOME_COLECAO, id));
  } catch (erro) {
    console.error(`[patrocinadores-data] Erro ao remover patrocinador ${id}:`, erro);
    throw erro;
  }
}

function normalizarPatrocinador(id, dadosFirestore) {
  // Compatibilidade: doc antigo tem linkDestino mas nunca teve
  // tipoDestino — trata como "externo" automaticamente.
  const tipoDestino = dadosFirestore.tipoDestino
    || (dadosFirestore.linkDestino ? "externo" : "nenhum");

  return {
    id,
    nome: dadosFirestore.nome || "",
    imagemBannerUrl: dadosFirestore.imagemBannerUrl || "",
    nivel: dadosFirestore.nivel || null,
    tipoDestino,
    poiIdDestino: dadosFirestore.poiIdDestino || null,
    linkDestino: dadosFirestore.linkDestino || null,
    dataInicio: dadosFirestore.dataInicio || null,
    dataFim: dadosFirestore.dataFim || null,
    ativo: dadosFirestore.ativo !== false,
  };
}

function desnormalizarPatrocinador(dados) {
  const saida = {};
  if (dados.nome !== undefined) saida.nome = dados.nome;
  if (dados.imagemBannerUrl !== undefined) saida.imagemBannerUrl = dados.imagemBannerUrl;
  if (dados.nivel !== undefined) saida.nivel = dados.nivel || null;
  if (dados.tipoDestino !== undefined) saida.tipoDestino = dados.tipoDestino;
  if (dados.poiIdDestino !== undefined) saida.poiIdDestino = dados.poiIdDestino || null;
  if (dados.linkDestino !== undefined) saida.linkDestino = dados.linkDestino || null;
  if (dados.dataInicio !== undefined) saida.dataInicio = dados.dataInicio || null;
  if (dados.dataFim !== undefined) saida.dataFim = dados.dataFim || null;
  if (dados.ativo !== undefined) saida.ativo = dados.ativo;
  return saida;
}

export {
  buscarPatrocinadoresAtivos,
  buscarPatrocinadorParaExibir,
  buscarTodosPatrocinadores,
  criarPatrocinador,
  atualizarPatrocinador,
  removerPatrocinador,
};
