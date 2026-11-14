/**
 * parceiros-data.js
 * Configuração administrativa do Portal do Parceiro.
 *
 * Nesta primeira etapa, o documento guarda somente estado de ativação e
 * módulos habilitados. Chaves e vínculos de contas serão tratados no backend
 * nas próximas etapas; nunca armazenar chave em texto puro nesta coleção.
 */
import { db } from "../core/firebase-config.js";
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const COLECAO = "portais_parceiros";

async function buscarTodosPortaisParceiros() {
  const snapshot = await getDocs(collection(db, COLECAO));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function definirAtivacaoPortal(poiId, ativo, portalAtual = null) {
  if (typeof poiId !== "string" || !poiId.trim()) {
    throw new Error("Estabelecimento inválido.");
  }
  if (typeof ativo !== "boolean") {
    throw new Error("Estado de ativação inválido.");
  }

  const referencia = doc(db, COLECAO, poiId);
  const dados = {
    poiId,
    ativo,
    modulosAtivos: Array.isArray(portalAtual?.modulosAtivos)
      ? portalAtual.modulosAtivos
      : [],
    criadoEm: portalAtual?.criadoEm || serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  };

  await setDoc(referencia, dados, { merge: false });
  return { ...dados, id: poiId };
}

export { buscarTodosPortaisParceiros, definirAtivacaoPortal };
