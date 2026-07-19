/**
 * carrossel-patrocinio.js — js/core/carrossel-patrocinio.js
 * Linde Guia — Treze Tílias
 *
 * Carrossel de banners patrocinados, reaproveitável em qualquer página.
 * Cada tela chama iniciarCarrosselPatrocinio() com o NÍVEL e a QUANTIDADE
 * de slots dela — o mesmo módulo serve pra Home (ouro, 2), segunda tela
 * (prata, 3) e terceira tela (bronze, 4), sem duplicar código.
 *
 * Fonte dos dados: os próprios POIs (patrocínio virou um campo do POI, não
 * uma coleção separada — só locais já cadastrados no app podem ser
 * patrocinados). Filtra por patrocinio.nivel + patrocinio.ativo +
 * patrocinio.imagemBannerUrl presente (sem imagem, não é candidato a
 * aparecer, mesmo que o admin tenha marcado o nível).
 *
 * HTML esperado na página que for usar:
 *   <div id="carrossel-patrocinio-ouro" class="carrossel-patrocinio" hidden>
 *     <div class="carrossel-patrocinio__trilha"></div>
 *     <div class="carrossel-patrocinio__pontos"></div>
 *   </div>
 * (troque "ouro" no id pelo nível daquela tela — passe o mesmo id como
 * primeiro argumento da função)
 *
 * Se não houver NENHUM patrocinador ativo daquele nível com imagem, o
 * container continua oculto — nunca mostra um carrossel vazio.
 */
import { buscarPoisAtivos } from "../data/pois-data.js";

const INTERVALO_ROTACAO_MS = 6000;

// caminhoParaPonto: ajuste conforme a página que chama esta função esteja
// dentro de pages/ (usar "ponto.html?id=") ou na raiz do site
// (usar "pages/ponto.html?id="). Default assume que a página chamadora
// está em pages/, igual ao resto do app.
async function iniciarCarrosselPatrocinio(idContainer, nivel, quantidade, caminhoParaPonto = "ponto.html?id=") {
  const container = document.getElementById(idContainer);
  if (!container) return; // página não tem esse carrossel — não faz nada

  let pois;
  try {
    pois = await buscarPoisAtivos();
  } catch (erro) {
    console.warn(`[carrossel-patrocinio] Não consegui carregar POIs (nível ${nivel}):`, erro);
    return; // mantém hidden — carrossel nunca deve travar a página por trás dele
  }

  const patrocinados = pois.filter(
    (poi) =>
      poi.patrocinio?.ativo === true &&
      poi.patrocinio?.nivel === nivel &&
      !!poi.patrocinio?.imagemBannerUrl
  );

  if (patrocinados.length === 0) return; // mantém hidden

  // Embaralha pra não ser sempre a mesma ordem/os mesmos 2 primeiros do
  // banco quando há mais patrocinadores ativos do que slots — dá exposição
  // igual entre quem está no mesmo nível, não só "quem foi cadastrado
  // primeiro".
  const embaralhados = embaralhar(patrocinados);
  const grupos = agruparEmSlots(embaralhados, quantidade);

  montarCarrossel(container, grupos, caminhoParaPonto);
  container.hidden = false;
}

function embaralhar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

// Divide a lista embaralhada em grupos do tamanho "quantidade" — cada
// grupo é uma "página" do carrossel. Se sobrar menos que "quantidade" no
// último grupo, ele fica menor mesmo (não repete patrocinador só pra
// preencher slot vazio).
function agruparEmSlots(lista, quantidade) {
  const grupos = [];
  for (let i = 0; i < lista.length; i += quantidade) {
    grupos.push(lista.slice(i, i + quantidade));
  }
  return grupos;
}

function montarCarrossel(container, grupos, caminhoParaPonto) {
  const trilha = container.querySelector(".carrossel-patrocinio__trilha");
  const pontosContainer = container.querySelector(".carrossel-patrocinio__pontos");
  trilha.innerHTML = "";
  pontosContainer.innerHTML = "";

  grupos.forEach((grupo, indiceGrupo) => {
    const paginaEl = document.createElement("div");
    paginaEl.className = "carrossel-patrocinio__pagina";
    paginaEl.hidden = indiceGrupo !== 0;

    grupo.forEach((poi) => {
      paginaEl.appendChild(criarBannerEl(poi, caminhoParaPonto));
    });

    trilha.appendChild(paginaEl);
  });

  // Só mostra os pontinhos de navegação se houver mais de 1 página —
  // com só 1 grupo, não existe "próxima" pra rotacionar.
  if (grupos.length <= 1) return;

  const paginas = Array.from(trilha.children);
  let paginaAtual = 0;

  grupos.forEach((_, indice) => {
    const ponto = document.createElement("button");
    ponto.type = "button";
    ponto.className = "carrossel-patrocinio__ponto";
    ponto.setAttribute("aria-label", `Ver grupo ${indice + 1} de patrocinadores`);
    ponto.setAttribute("aria-current", indice === 0 ? "true" : "false");
    ponto.addEventListener("click", () => irParaPagina(indice));
    pontosContainer.appendChild(ponto);
  });

  const pontos = Array.from(pontosContainer.children);

  function irParaPagina(indice) {
    paginas[paginaAtual].hidden = true;
    pontos[paginaAtual].setAttribute("aria-current", "false");
    paginaAtual = indice;
    paginas[paginaAtual].hidden = false;
    pontos[paginaAtual].setAttribute("aria-current", "true");
  }

  const intervaloId = setInterval(() => {
    irParaPagina((paginaAtual + 1) % grupos.length);
  }, INTERVALO_ROTACAO_MS);

  // Pausa a rotação automática enquanto a pessoa está interagindo com os
  // pontinhos — evita a página trocar embaixo do dedo dela.
  pontosContainer.addEventListener("pointerenter", () => clearInterval(intervaloId));
}

function criarBannerEl(poi, caminhoParaPonto) {
  const link = document.createElement("a");
  link.className = "carrossel-patrocinio__banner";
  link.href = `${caminhoParaPonto}${poi.id}`;

  const imagem = document.createElement("img");
  imagem.src = poi.patrocinio.imagemBannerUrl;
  imagem.alt = poi.nome;
  imagem.loading = "lazy";

  const selo = document.createElement("span");
  selo.className = "carrossel-patrocinio__selo";
  selo.textContent = "Publicidade";

  link.appendChild(imagem);
  link.appendChild(selo);
  return link;
}

export { iniciarCarrosselPatrocinio };
