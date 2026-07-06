/**
 * diagnostico.js
 * Linde Guia — uso interno temporário
 * Mostra o que está no banco + reimporta o que falta do pois-seed.json
 * Apagar após confirmar que os 20 POIs estão no banco.
 */

import { db } from "./firebase-config.js";
import {
  collection, getDocs, addDoc, query, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const COLECAO = "pois";
const logEl = () => document.getElementById("log");

function log(texto) {
  logEl().textContent += texto + "\n";
  logEl().scrollTop = logEl().scrollHeight;
}

function limparLog() { logEl().textContent = ""; }

function aguardar(ms) { return new Promise(r => setTimeout(r, ms)); }

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-ver").addEventListener("click", verBanco);
  document.getElementById("btn-importar").addEventListener("click", reimportar);
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

// ============================================================
// REIMPORTAR LOCAIS FALTANTES
// ============================================================
async function reimportar() {
  limparLog();
  log("Lendo pois-seed.json...");

  let pois;
  try {
    const r = await fetch("./pois-seed.json");
    pois = await r.json();
    log(`${pois.length} POIs no arquivo seed.\n`);
  } catch (erro) {
    log("ERRO ao ler seed: " + erro.message);
    return;
  }

  log("Verificando o que falta no banco...\n");

  let criados = 0, pulados = 0, erros = 0;

  for (const poi of pois) {
    await aguardar(350);
    try {
      const existe = await verificarExistencia(poi.nome);
      if (existe) {
        log(`~ Já existe: ${poi.nome}`);
        pulados++;
      } else {
        await addDoc(collection(db, COLECAO), poi);
        log(`+ Criado: ${poi.nome}`);
        criados++;
      }
    } catch (erro) {
      log(`x ERRO em "${poi.nome}": ${erro.message}`);
      erros++;
    }
  }

  log(`\nConcluído. ${criados} criados, ${pulados} já existiam, ${erros} erros.`);
  if (erros === 0 && criados > 0) {
    log("\nAgora clique em 'Ver o que está no banco' pra confirmar o total.");
  }
  if (erros > 0) {
    log("\nAlguns falharam. Clique em 'Reimportar locais faltantes' de novo pra tentar novamente.");
  }
}

async function verificarExistencia(nome) {
  const q = query(collection(db, COLECAO), where("nome", "==", nome));
  const snap = await getDocs(q);
  return !snap.empty;
}
