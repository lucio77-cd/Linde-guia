/**
 * upload-imagem.js — js/admin/upload-imagem.js
 * Linde Guia — Treze Tílias
 *
 * Upload de imagem pro Firebase Storage. Novo no projeto — até agora
 * nenhuma tela fazia upload de arquivo, só campos de texto/número/data.
 *
 * Usa getApp() (sem argumento) pra pegar a MESMA instância do Firebase já
 * inicializada em firebase-config.js — não precisa saber o nome exato do
 * que aquele arquivo exporta, só que ele chamou initializeApp() uma vez
 * (padrão-default do projeto). Se o projeto usar múltiplos apps Firebase
 * nomeados (pouco comum), ajusta a chamada de getApp() aqui.
 *
 * IMPORTANTE: ajusta o número de versão do SDK abaixo (10.7.0) pra bater
 * com a mesma versão que firebase-config.js já importa, se for diferente
 * — misturar versões do SDK do Firebase costuma funcionar, mas não é
 * garantido.
 */
import { getApp } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-storage.js";

const TAMANHO_MAXIMO_MB = 5;
const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp"];

// Envia a imagem pra Storage em banners-patrocinio/{poiId}-{timestamp}.{ext}
// e devolve a URL pública de download, já pronta pra salvar no campo
// patrocinio.imagemBannerUrl do POI. O timestamp no nome evita problema de
// cache do navegador quando o admin troca a arte de um patrocinador que já
// tinha imagem antes (URL antiga fica "presa" em cache senão).
async function enviarImagemBanner(poiId, arquivo) {
  validarArquivo(arquivo);

  const app = getApp();
  const storage = getStorage(app);

  const extensao = arquivo.name.split(".").pop().toLowerCase();
  const caminho = `banners-patrocinio/${poiId}-${Date.now()}.${extensao}`;
  const referencia = ref(storage, caminho);

  await uploadBytes(referencia, arquivo);
  return getDownloadURL(referencia);
}

function validarArquivo(arquivo) {
  if (!arquivo) {
    throw new Error("Nenhum arquivo selecionado.");
  }
  if (!TIPOS_ACEITOS.includes(arquivo.type)) {
    throw new Error("Formato não aceito. Use JPG, PNG ou WebP.");
  }
  const tamanhoMB = arquivo.size / (1024 * 1024);
  if (tamanhoMB > TAMANHO_MAXIMO_MB) {
    throw new Error(`Imagem muito grande (${tamanhoMB.toFixed(1)}MB). Máximo: ${TAMANHO_MAXIMO_MB}MB.`);
  }
}

export { enviarImagemBanner };
