/**
 * banner-patrocinado.js
 * Linde Guia — Treze Tílias
 *
 * Banner de patrocínio pago — mesmo espírito de banner-evento.js, mas
 * pensado pra aparecer em TODAS as páginas voltadas pro turista.
 *
 * HTML esperado:
 *   <div id="banner-patrocinado" class="banner-patrocinado" hidden>
 *     <a id="banner-patrocinado__link" href="#" target="_blank" rel="noopener sponsored">
 *       <img id="banner-patrocinado__imagem" alt="" />
 *       <span class="banner-patrocinado__selo">Publicidade</span>
 *     </a>
 *   </div>
 *
 * CHAMADA (mesmo padrão de carrossel-patrocinio.js — recebe o caminho
 * certo até ponto.html, que muda conforme a página estar na raiz do site
 * ou dentro de pages/):
 *   <script type="module">
 *     import { iniciarBannerPatrocinado } from "../js/core/banner-patrocinado.js";
 *     iniciarBannerPatrocinado("ponto.html?id="); // ou "pages/ponto.html?id=" na raiz
 *   </script>
 *
 * Resolve o link de destino conforme patrocinador.tipoDestino:
 *   "nenhum"   -> sem link, só imagem
 *   "local"    -> {caminhoParaPonto}{poiIdDestino}
 *   "externo"  -> linkDestino (link de fora)
 *   "whatsapp" -> número configurado no admin (Configurações)
 *
 * Se não houver patrocinador ativo, o banner continua oculto.
 */
import { buscarPatrocinadorParaExibir } from "../data/patrocinadores-data.js";
import { buscarConfiguracoes } from "../data/configuracoes-data.js";

async function iniciarBannerPatrocinado(caminhoParaPonto = "ponto.html?id=") {
  const banner = document.getElementById("banner-patrocinado");
  if (!banner) return;

  let patrocinador;
  try {
    patrocinador = await buscarPatrocinadorParaExibir();
  } catch (erro) {
    console.warn("[banner-patrocinado] Não consegui carregar patrocinador:", erro);
    return;
  }

  if (!patrocinador) return;

  const linkEl = document.getElementById("banner-patrocinado__link");
  const imagemEl = document.getElementById("banner-patrocinado__imagem");

  imagemEl.src = patrocinador.imagemBannerUrl;
  imagemEl.alt = patrocinador.nome;

  const href = await resolverDestino(patrocinador, caminhoParaPonto);

  if (href) {
    linkEl.href = href;
    linkEl.style.cursor = "";
    linkEl.style.pointerEvents = "";
  } else {
    linkEl.removeAttribute("href");
    linkEl.style.cursor = "default";
    linkEl.style.pointerEvents = "none";
  }

  banner.hidden = false;
}

async function resolverDestino(patrocinador, caminhoParaPonto) {
  switch (patrocinador.tipoDestino) {
    case "local":
      return patrocinador.poiIdDestino
        ? `${caminhoParaPonto}${encodeURIComponent(patrocinador.poiIdDestino)}`
        : null;

    case "externo":
      return patrocinador.linkDestino || null;

    case "whatsapp": {
      try {
        const config = await buscarConfiguracoes();
        if (!config.whatsappNumero) return null;
        const mensagem = encodeURIComponent(
          `Olá! Vi o anúncio "${patrocinador.nome}" no Linde Guia e quero saber mais sobre patrocínio.`
        );
        return `https://wa.me/55${config.whatsappNumero}?text=${mensagem}`;
      } catch (erro) {
        console.warn("[banner-patrocinado] Não consegui montar link do WhatsApp:", erro);
        return null;
      }
    }

    default: // "nenhum"
      return null;
  }
}

export { iniciarBannerPatrocinado };
