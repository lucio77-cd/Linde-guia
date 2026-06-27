/**
 * eventos-data.js
 * Linde Guia — Treze Tílias
 *
 * VERSÃO MÍNIMA — só o suficiente para banner-evento.js funcionar na Home.
 * Será expandido (mesmo padrão de cache/normalização do pois-data.js)
 * quando chegarmos na tela eventos.html.
 */

import { db } from "./firebase-config.js";
import { collection, getDocs, query, where, Timestamp } from "firebase/firestore";

const NOME_COLECAO = "eventos";

async function buscarEventoAtivoAgora() {
  try {
    const agora = Timestamp.now();
    const snapshot = await getDocs(
      query(collection(db, NOME_COLECAO), where("data_fim", ">=", agora))
    );

    const eventos = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));

    const ativoAgora = eventos.find((evento) => {
      const inicio = evento.data_inicio?.toMillis?.() ?? 0;
      return inicio <= agora.toMillis();
    });

    return ativoAgora || null;
  } catch (erro) {
    console.error("[eventos-data] Erro ao buscar evento ativo:", erro);
    return null;
  }
}

export { buscarEventoAtivoAgora };
