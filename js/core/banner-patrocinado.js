/**
 * banner-patrocinado.js
 * Linde Guia — Treze Tílias
 *
 * Banner de patrocínio pago — mesmo espírito de banner-evento.js, mas
 * pensado pra aparecer em TODAS as páginas voltadas pro turista (não só
 * a Home). Cada página que quiser o banner precisa ter:
 *
 *   <div id="banner-patrocinado" class="banner-patrocinado" hidden>
 *     <a id="banner-patrocinado__link" href="#" target="_blank" rel="noopener sponsored">
 *       <img id="banner-patrocinado__imagem" alt="" />
 *       <span class="banner-patrocinado__selo">Publicidade</span>
 *     </a>
 *   </div>
 *   <script type="module" src="../js/core/banner-patrocinado.js"></script>
 *
 * Se não houver patrocinador ativo (ou a coleção estiver vazia), o banner
 * continua oculto — o atributo "hidden" do HTML nunca é removido.
 *
 * MUDANÇA: patrocinador.linkDestino agora é OPCIONAL (ver
 * patrocinadores-data.js). Sem link, o banner aparece só como imagem —
 * remove o href e desliga o clique, em vez de forçar um destino qualquer.
 */
import { buscarPatrocinadorParaExibir } from "../data/patrocinadores-data.js";

async function iniciarBannerPatrocinado() {
  const banner = document.getElementById("banner-patrocinado");
  if (!banner) return; // página não tem o container — não faz nada

  let patrocinador;
  try {
    patrocinador = await buscarPatrocinadorParaExibir();
  } catch (erro) {
    console.warn("[banner-patrocinado] Não consegui carregar patrocinador:", erro);
    return; // mantém hidden — banner nunca deve travar a página por trás dele
  }

  if (!patrocinador) return; // mantém hidden

  const linkEl = document.getElementById("banner-patrocinado__link");
  const imagemEl = document.getElementById("banner-patrocinado__imagem");

  imagemEl.src = patrocinador.imagemBannerUrl;
  imagemEl.alt = patrocinador.nome;

  if (patrocinador.linkDestino) {
    linkEl.href = patrocinador.linkDestino;
    linkEl.style.cursor = "";
    linkEl.style.pointerEvents = "";
  } else {
    // Banner-anúncio sem destino: é a própria mensagem, não uma chamada
    // pra clicar em algo. Remove o link em vez de deixar um href quebrado
    // ou forçar um destino que não existe.
    linkEl.removeAttribute("href");
    linkEl.style.cursor = "default";
    linkEl.style.pointerEvents = "none";
  }

  banner.hidden = false;
}

document.addEventListener("DOMContentLoaded", iniciarBannerPatrocinado);

export { iniciarBannerPatrocinado };
