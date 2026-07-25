/**
 * configuracoes-data.js
 * Linde Guia — Treze Tílias
 *
 * Configurações gerais do app que o admin edita — hoje só o número de
 * WhatsApp de contato, mas o formato já é pensado pra crescer sem
 * precisar de nova coleção a cada campo novo. Documento único
 * ("configuracoes/geral"), não uma coleção com vários documentos.
 */
import { db } from "../core/firebase-config.js";
import {
  doc, getDoc, setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const CAMINHO_DOC = ["configuracoes", "geral"];

async function buscarConfiguracoes() {
  try {
    const snap = await getDoc(doc(db, ...CAMINHO_DOC));
    if (!snap.exists()) return { whatsappNumero: "" };
    return { whatsappNumero: snap.data().whatsappNumero || "" };
  } catch (erro) {
    console.warn("[configuracoes-data] Erro ao buscar configurações:", erro);
    return { whatsappNumero: "" };
  }
}

async function salvarConfiguracoes(dados) {
  await setDoc(doc(db, ...CAMINHO_DOC), {
    whatsappNumero: (dados.whatsappNumero || "").replace(/\D/g, ""), // só dígitos, formato que wa.me espera
  }, { merge: true });
}

export { buscarConfiguracoes, salvarConfiguracoes };

