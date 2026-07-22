/**
 * registrar-acesso.js — js/core/registrar-acesso.js
 * Linde Guia — Treze Tílias
 *
 * Conta acessos ao site de forma AGREGADA — decisão registrada com o
 * cliente: 1 documento por VISITA seria simples de ler, mas custaria uma
 * escrita no Firestore a cada carregamento de página, o que aproxima do
 * limite do plano gratuito bem mais rápido se o tráfego crescer.
 *
 * Em vez disso: 1 único documento por DIA (acessos_diarios/{AAAA-MM-DD}),
 * incrementado a cada carregamento. `merge: true` + `increment()` fazem
 * o incremento ser atômico (duas pessoas acessando ao mesmo tempo não
 * perdem contagem uma da outra), tanto no total do dia quanto no total
 * daquela hora específica.
 *
 * Incluir em TODA página voltada pro turista:
 *   <script type="module" src="../js/core/registrar-acesso.js"></script>
 * (ou "js/core/..." sem "../" nas páginas que ficam na raiz, como index.html)
 *
 * Nunca lança erro pra quem inclui o script — falha aqui é só log,
 * silenciosa pro turista, igual ao padrão de registro-data.js.
 */
import { db } from "./firebase-config.js";
import {
  doc, setDoc, increment,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const COLECAO_ACESSOS = "acessos_diarios";

async function registrarAcesso() {
  try {
    const agora = new Date();
    const dataChave = agora.toISOString().slice(0, 10); // AAAA-MM-DD
    const hora = String(agora.getHours());

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
    console.warn("[registrar-acesso] Falha ao registrar acesso (não afeta o usuário):", erro);
  }
}

document.addEventListener("DOMContentLoaded", registrarAcesso);

export { registrarAcesso };
