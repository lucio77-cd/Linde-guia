/**
 * importar-poi.js
 * Linde Guia — Treze Tílias
 *
 * USO INTERNO ÚNICO — não faz parte do app que o turista usa.
 *
 * v2: cada operação no Firestore tem um TIMEOUT de 8 segundos. Se travar
 * (geralmente por regra de segurança bloqueando), mostra o erro na tela
 * em vez de ficar girando pra sempre — importante pra quem está testando
 * no celular, sem acesso a DevTools/Console do navegador.
 */

import { db } from "./firebase-config.js";
import { collection, getDocs, addDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const NOME_COLECAO = "pois";
const TIMEOUT_MS = 8000;

function iniciarImportador() {
  const botao = document.getElementById("btn-importar");
  const logEl = document.getElementById("log");

  botao.addEventListener("click", async () => {
    botao.disabled = true;
    botao.textContent = "Importando...";
    logEl.textContent = "";

    escreverLog(logEl, "Passo 1: lendo pois-seed.json...");

    let pois;
    try {
      const resposta = await comTimeout(fetch("./pois-seed.json"), TIMEOUT_MS, "ler pois-seed.json");
      pois = await resposta.json();
      escreverLog(logEl, `OK — ${pois.length} POIs encontrados no arquivo.\n`);
    } catch (erro) {
      escreverLog(logEl, `ERRO ao ler pois-seed.json: ${erro.message}`);
      escreverLog(logEl, "Confirme se o arquivo está na mesma pasta de importar.html no GitHub.");
      pararComErro(botao);
      return;
    }

    escreverLog(logEl, "Passo 2: testando conexão com o Firestore...");

    try {
      await comTimeout(
        getDocs(collection(db, NOME_COLECAO)),
        TIMEOUT_MS,
        "conectar ao Firestore"
      );
      escreverLog(logEl, "OK — consegui falar com o Firestore.\n");
    } catch (erro) {
      escreverLog(logEl, `ERRO ao conectar ao Firestore: ${erro.message}`);
      if (String(erro.message).toLowerCase().includes("permission")) {
        escreverLog(
          logEl,
          "\nIsso parece ser bloqueio de permissão (regra de segurança do Firestore). " +
            "Veja as instruções abaixo do botão para liberar temporariamente."
        );
      } else {
        escreverLog(logEl, "\nIsso pode ser timeout de rede — tente de novo.");
      }
      pararComErro(botao);
      return;
    }

    escreverLog(logEl, "Passo 3: importando POIs (pode levar alguns segundos por item)...\n");

    let criados = 0;
    let pulados = 0;
    let comErro = 0;

    for (const poi of pois) {
      try {
        const jaExiste = await comTimeout(
          existeComMesmoNome(poi.nome),
          TIMEOUT_MS,
          `checar duplicado de ${poi.nome}`
        );

        if (jaExiste) {
          escreverLog(logEl, `~ Já existe, pulado: ${poi.nome}`);
          pulados++;
          continue;
        }

        await comTimeout(
          addDoc(collection(db, NOME_COLECAO), poi),
          TIMEOUT_MS,
          `criar ${poi.nome}`
        );
        escreverLog(logEl, `+ Criado: ${poi.nome}`);
        criados++;
      } catch (erro) {
        escreverLog(logEl, `x ERRO em "${poi.nome}": ${erro.message}`);
        comErro++;
      }
    }

    escreverLog(
      logEl,
      `\nConcluído. ${criados} criados, ${pulados} já existiam, ${comErro} com erro.`
    );

    if (comErro > 0) {
      escreverLog(logEl, "\nAlguns itens falharam — provavelmente bloqueio de permissão. Veja as instruções abaixo.");
      pararComErro(botao);
    } else {
      botao.textContent = "Importação concluída";
    }
  });
}

// Envolve qualquer Promise do Firestore com um limite de tempo, pra nunca
// ficar girando pra sempre sem explicação.
function comTimeout(promessa, ms, descricaoOperacao) {
  return Promise.race([
    promessa,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Tempo esgotado ao tentar ${descricaoOperacao} (mais de ${ms / 1000}s sem resposta — provável bloqueio de permissão)`)),
        ms
      )
    ),
  ]);
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

function pararComErro(botao) {
  botao.disabled = false;
  botao.textContent = "Tentar de novo";
}

document.addEventListener("DOMContentLoaded", iniciarImportador);
