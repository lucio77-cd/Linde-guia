/**
 * patrocinadores-data.js
 * Linde Guia — Treze Tílias
 *
 * Único canal de acesso à coleção "patrocinadores" no Firestore — mesmo
 * princípio de pois-data.js/eventos-data.js: ninguém mais no projeto fala
 * direto com essa coleção.
 *
 * Formato de um patrocinador:
 *   id, nome, imagemUrl, linkDestino, dataInicio, dataFim, ativo
 *
 * "ativo" é uma chave geral (liga/desliga rápido, sem precisar mexer nas
 * datas). dataInicio/dataFim são opcionais — sem elas, o patrocinador vale
 * indefinidamente enquanto "ativo" for true. Com elas, só conta como
 * disponível dentro do período contratado, mesmo que "ativo" continue true
 * (evita você esquecer de desligar manualmente quando o contrato acabar).
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

// Escolhe 1 entre os patrocinadores ativos no momento — se tiver mais de
// um contratado ao mesmo tempo, cada carregamento de página sorteia um
// diferente (revezamento simples, sem precisar de lógica de "vez de cada
// um", que seria over-engineering pro tamanho do projeto agora).
async function buscarPatrocinadorParaExibir() {
  const ativos = await buscarPatrocinadoresAtivos();
  if (ativos.length === 0) return null;
  return ativos[Math.floor(Math.random() * ativos.length)];
}

// ============================================================
// LEITURA + ESCRITA — lado admin (todos, inclusive inativos/expirados)
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
  return {
    id,
    nome: dadosFirestore.nome || "",
    imagemUrl: dadosFirestore.imagemUrl || "",
    linkDestino: dadosFirestore.linkDestino || "#",
    dataInicio: dadosFirestore.dataInicio || null,
    dataFim: dadosFirestore.dataFim || null,
    ativo: dadosFirestore.ativo !== false,
  };
}

// undefined quebra o Firestore (addDoc/updateDoc rejeitam) — nunca manda
// direto o que vier do formulário sem passar por aqui.
function desnormalizarPatrocinador(dados) {
  const saida = {};
  if (dados.nome !== undefined) saida.nome = dados.nome;
  if (dados.imagemUrl !== undefined) saida.imagemUrl = dados.imagemUrl;
  if (dados.linkDestino !== undefined) saida.linkDestino = dados.linkDestino;
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
