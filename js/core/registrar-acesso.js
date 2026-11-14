/**
 * registrar-acesso.js — js/core/registrar-acesso.js
 * Linde Guia — Treze Tílias
 *
 * Registra uma visita aproximada por aparelho por dia, sem criar um
 * documento por carregamento. Não identifica pessoas: localStorage pode
 * ser apagado, navegação anônima e aparelhos diferentes contam novamente.
 *
 * Os dados anteriores à implantação desta regra continuam representando
 * carregamentos de página e não são diretamente comparáveis aos novos.
 *
 * Falhas de gravação não interrompem a navegação. A coleção e os campos
 * Firestore permanecem os mesmos: acessos_diarios/{AAAA-MM-DD}, total e
 * porHora. Nenhum registro histórico é alterado.
 */
import { db } from "./firebase-config.js";
import {
  doc, setDoc, increment,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const COLECAO_ACESSOS = "acessos_diarios";
const CHAVE_LOCAL = "linde-guia:acesso-contado-em";

function jaContouHoje(dataChave) {
  try {
    return localStorage.getItem(CHAVE_LOCAL) === dataChave;
  } catch {
    return false;
  }
}

function marcarContado(dataChave) {
  try {
    localStorage.setItem(CHAVE_LOCAL, dataChave);
  } catch {
    // Sem armazenamento local, a contagem continua funcionando por carga.
  }
}

function desmarcarContado() {
  try {
    localStorage.removeItem(CHAVE_LOCAL);
  } catch {
    // Nada a desfazer.
  }
}

async function registrarAcesso() {
  let dataChave = null;
  try {
    const agora = new Date();
    dataChave = [
      agora.getFullYear(),
      String(agora.getMonth() + 1).padStart(2, "0"),
      String(agora.getDate()).padStart(2, "0"),
    ].join("-");
    const hora = String(agora.getHours());

    if (jaContouHoje(dataChave)) return;
    marcarContado(dataChave);

    const ref = doc(db, COLECAO_ACESSOS, dataChave);
    await setDoc(
      ref,
      {
        total: increment(1),
        porHora: { [hora]: increment(1) },
      },
      { merge: true }
    );
  } catch (erro) {
    if (dataChave) desmarcarContado();
    console.warn("[registrar-acesso] Falha ao registrar acesso (não afeta o usuário):", erro);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", registrarAcesso, { once: true });
} else {
  registrarAcesso();
}

export { registrarAcesso };
