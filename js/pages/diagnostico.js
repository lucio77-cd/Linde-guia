/**
 * diagnostico.js
 * Linde Guia — uso interno temporário
 * Mostra o que está no banco + reimporta o que falta do pois-seed.json
 * Apagar após confirmar que os 20 POIs estão no banco.
 */

import { db } from "../core/firebase-config.js";
import {
  collection, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const COLECAO = "pois";
const logEl = () => document.getElementById("log");

function log(texto) {
  logEl().textContent += texto + "\n";
  logEl().scrollTop = logEl().scrollHeight;
}

function limparLog() { logEl().textContent = ""; }

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-ver").addEventListener("click", verBanco);
  const botaoImportar = document.getElementById("btn-importar");
  if (botaoImportar) botaoImportar.disabled = true; // diagnóstico não altera dados de produção
});

// ============================================================
// VER O QUE ESTÁ NO BANCO
// ============================================================
async function verBanco() {
  limparLog();
  log("Lendo coleção 'pois' no Firestore...\n");

  try {
    const snap = await getDocs(collection(db, COLECAO));
    log(`Total no banco: ${snap.size} POIs\n`);

    snap.docs
      .map(d => ({ nome: d.data().nome, cat: d.data().categoria, status: d.data().statusOperacional || d.data().status_operacional }))
      .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""))
      .forEach(p => log(`  • ${p.nome} [${p.cat}] — ${p.status}`));

  } catch (erro) {
    log("ERRO ao ler banco: " + erro.message);
  }
}
