/**
 * importar-poi.js
 * Linde Guia — Treze Tílias
 *
 * USO INTERNO ÚNICO — não faz parte do app que o turista usa.
 * Lê pois-seed.json e escreve cada POI no Firestore, usando o mesmo
 * Firebase já configurado (firebase-config.js) e a mesma camada de
 * dados (pois-data.js) que o resto do app usa.
 *
 * Seguro de clicar mais de uma vez: antes de criar, checa se já existe
 * um POI com o mesmo nome e, se sim, pula (não duplica).
 *
 * Depois de rodar uma vez com sucesso, apague importar.html e
 * importar-poi.js do repositório.
 */

import { db } from "./firebase-config.js";
import { collection, getDocs, addDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const NOME_COLECAO = "pois";

function iniciarImportador() {
  const botao = document.getElementById("btn-importar");
  const logEl = document.getElementById("log");

  botao.addEventListener("click", async () => {
    botao.disabled = true;
    botao.textContent = "Importando...";
    logEl.textContent = "";

    try {
      const resposta = await fetch("./pois-seed.json");
      const pois = await resposta.json();
      escreverLog(logEl, `Lidos ${pois.length} POIs de pois-seed.json.\n`);

      let criados = 0;
      let pulados = 0;

      for (const poi of pois) {
        const jaExiste = await existeComMesmoNome(poi.nome);

        if (jaExiste) {
          escreverLog(logEl, `~ Já existe, pulado: ${poi.nome}`);
          pulados++;
          continue;
        }

        await addDoc(collection(db, NOME_COLECAO), poi);
        escreverLog(logEl, `+ Criado: ${poi.nome}`);
        criados++;
      }

      escreverLog(logEl, `\nConcluído. ${criados} criados, ${pulados} já existiam.`);
      botao.textContent = "Importação concluída";
    } catch (erro) {
      console.error("[importar-poi] Erro:", erro);
      escreverLog(logEl, `\nERRO: ${erro.message}`);
      botao.disabled = false;
      botao.textContent = "Importar POIs agora";
    }
  });
}

async function existeComMesmoNome(nome) {
  const consulta = query(collection(db, NOME_COLECAO), where("nome", "==", nome));
  const snapshot = await getDocs(consulta);
  return !snapshot.empty;
}

function escreverLog(elemento, texto) {
  elemento.textContent += texto + "\n";
  elemento.scrollTop = elemento.scrollHeight;
}

document.addEventListener("DOMContentLoaded", iniciarImportador);
