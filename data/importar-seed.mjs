/**
 * importar-seed.mjs
 * Linde Guia — Treze Tílias
 *
 * Script de importação ÚNICA EXECUÇÃO MANUAL — não faz parte do app,
 * não sobe pro Vercel rodar. Você roda isso UMA VEZ do seu computador
 * pra popular a coleção "pois" no Firestore com os dados de pois-seed.json.
 *
 * Como rodar:
 *   1. npm install firebase-admin
 *   2. Baixe a chave de serviço no Firebase Console:
 *      Configurações do projeto > Contas de serviço > Gerar nova chave privada
 *      Salve como "service-account-key.json" na mesma pasta deste script
 *      (NÃO suba esse arquivo pro GitHub — é uma credencial sensível)
 *   3. node importar-seed.mjs
 *
 * Pode rodar de novo sem medo de duplicar: usa o "nome" do POI como
 * identificador — se já existir um POI com aquele nome, atualiza em vez
 * de criar outro.
 */

import { readFileSync } from "fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const CHAVE_SERVICO = "./service-account-key.json";
const ARQUIVO_SEED = "./pois-seed.json";
const NOME_COLECAO = "pois";

async function importarSeed() {
  console.log("Linde Guia — importação de POIs\n");

  let credenciais;
  try {
    credenciais = JSON.parse(readFileSync(CHAVE_SERVICO, "utf-8"));
  } catch (erro) {
    console.error(
      `Não encontrei "${CHAVE_SERVICO}". Baixe a chave de serviço no Firebase Console ` +
        "(Configurações do projeto > Contas de serviço > Gerar nova chave privada) " +
        "e salve com esse nome nesta pasta."
    );
    process.exit(1);
  }

  initializeApp({ credential: cert(credenciais) });
  const db = getFirestore();

  const pois = JSON.parse(readFileSync(ARQUIVO_SEED, "utf-8"));
  console.log(`Lidos ${pois.length} POIs de ${ARQUIVO_SEED}.\n`);

  const colecao = db.collection(NOME_COLECAO);
  let criados = 0;
  let atualizados = 0;

  for (const poi of pois) {
    const existente = await colecao.where("nome", "==", poi.nome).limit(1).get();

    if (existente.empty) {
      await colecao.add(poi);
      criados++;
      console.log(`+ Criado: ${poi.nome}`);
    } else {
      const docId = existente.docs[0].id;
      await colecao.doc(docId).set(poi, { merge: true });
      atualizados++;
      console.log(`~ Atualizado: ${poi.nome}`);
    }
  }

  console.log(`\nConcluído. ${criados} criados, ${atualizados} atualizados.`);
  process.exit(0);
}

importarSeed().catch((erro) => {
  console.error("Erro na importação:", erro);
  process.exit(1);
});
