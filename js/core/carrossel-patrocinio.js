/**
 * carrossel-patrocinio.js — js/core/carrossel-patrocinio.js
 * Linde Guia — Treze Tílias
 *
 * Carrossel de banners patrocinados, reaproveitável em qualquer página.
 * Cada tela chama iniciarCarrosselPatrocinio() com o NÍVEL e a QUANTIDADE
 * de slots dela — o mesmo módulo serve pra Home (ouro, 2), segunda tela
 * (prata, 3) e terceira tela (bronze, 4), sem duplicar código.
 *
 * DUAS FONTES DE CANDIDATOS, MESMA DISPUTA POR NÍVEL:
 *  - Locais já cadastrados no app, com patrocinio.nivel definido no
 *    cadastro do Local (admin-locais.js) — clique leva pra ponto.html
 *    daquele local.
 *  - Anúncios avulsos, sem precisar ser um Local (admin-patrocinadores.js)
 *    — clique leva pro linkDestino externo (se tiver) ou não é clicável
 *    (se o anúncio for só a mensagem em si, sem link).
 * As duas fontes competem pelos mesmos slots do mesmo nível, embaralhadas
 * juntas — nenhuma tem prioridade sobre a outra.
 *
 * HTML esperado na página que for usar:
 *   <div id="carrossel-patrocinio-ouro" class="carrossel-patrocinio" hidden>
 *     <div class="carrossel-patrocinio__trilha"></div>
 *     <div class="carrossel-patrocinio__pontos"></div>
 *   </div>
 * (troque "ouro" no id pelo nível daquela tela — passe o mesmo id como
 * primeiro argumento da função)
 *
 * Se não houver NENHUM candidato ativo daquele nível com imagem, o
 * container continua oculto — nunca mostra um carrossel vazio.
 */
import { buscarPoisAtivos } from "../data/pois-data.js";
import { buscarPatrocinadoresAtivos } from "../data/patrocinadores-data.js";

const INTERVALO_ROTACAO_MS = 6000;

// caminhoParaPonto: ajuste conforme a página que chama esta função esteja
// dentro de pages/ (usar "ponto.html?id=") ou na raiz do site
// (usar "pages/ponto.html?id="). Default assume que a página chamadora
// está em pages/, igual ao resto do app.
async function iniciarCarrosselPatrocinio(idContainer, nivel, quantidade, caminhoParaPonto = "ponto.html?id=") {
  const container = document.getElementById(idContainer);
  if (!container) return; // página não tem esse carrossel — não faz nada

  const candidatos = await coletarCandidatos(nivel, caminhoParaPonto);
  if (candidatos.length === 0) return; // mantém hidden

  // Embaralha pra não ser sempre a mesma ordem/os mesmos primeiros quando
  // há mais candidatos do que slots — dá exposição igual entre quem está
  // no mesmo nível, não só "quem foi cadastrado primeiro".
  const embaralhados = embaralhar(candidatos);
  const grupos = agruparEmSlots(embaralhados, quantidade);

  montarCarrossel(container, grupos);
  container.hidden = false;
}

// Busca as duas fontes em paralelo e devolve uma lista única, já no
// formato que o carrossel entende: { nome, imagemBannerUrl, href, externo }
// href = null quando o banner não deve ser clicável (anúncio avulso sem
// linkDestino).
async function coletarCandidatos(nivel, caminhoParaPonto) {
  const [pois, patrocinadores] = await Promise.all([
    buscarPoisAtivos().catch((erro) => {
      console.warn("[carrossel-patrocinio] Não consegui carregar POIs:", erro);
      return [];
    }),
    buscarPatrocinadoresAtivos().catch((erro) => {
      console.warn("[carrossel-patrocinio] Não consegui carregar Patrocinadores:", erro);
      return [];
    }),
  ]);

  const candidatosDeLocais = pois
    .filter(
      (poi) =>
        poi.patrocinio?.ativo === true &&
        poi.patrocinio?.nivel === nivel &&
        !!poi.patrocinio?.imagemBannerUrl
    )
    .map((poi) => ({
      nome: poi.nome,
      imagemBannerUrl: poi.patrocinio.imagemBannerUrl,
      href: `${caminhoParaPonto}${poi.id}`,
      externo: false,
    }));

  const candidatosAvulsos = patrocinadores
    .filter((p) => p.nivel === nivel && !!p.imagemBannerUrl)
    .map((p) => ({
      nome: p.nome,
      imagemBannerUrl: p.imagemBannerUrl,
      href: p.linkDestino || null, // sem link = banner só imagem, não clicável
      externo: true,
    }));

  return [...candidatosDeLocais, ...candidatosAvulsos];
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
// último grupo, ele fica menor mesmo (não repete candidato só pra
// preencher slot vazio).
function agruparEmSlots(lista, quantidade) {
  const grupos = [];
  for (let i = 0; i < lista.length; i += quantidade) {
    grupos.push(lista.slice(i, i + quantidade));
  }
  return grupos;
}

function montarCarrossel(container, grupos) {
  const trilha = container.querySelector(".carrossel-patrocinio__trilha");
  const pontosContainer = container.querySelector(".carrossel-patrocinio__pontos");
  trilha.innerHTML = "";
  pontosContainer.innerHTML = "";

  grupos.forEach((grupo, indiceGrupo) => {
    const paginaEl = document.createElement("div");
    paginaEl.className = "carrossel-patrocinio__pagina";
    paginaEl.hidden = indiceGrupo !== 0;

    grupo.forEach((candidato) => {
      paginaEl.appendChild(criarBannerEl(candidato));
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

// candidato.href null = anúncio avulso sem link, banner só imagem, sem
// clique — renderiza como <div> em vez de <a>, igual ao mesmo caso em
// banner-patrocinado.js.
function criarBannerEl(candidato) {
  const clicavel = !!candidato.href;
  const wrapper = document.createElement(clicavel ? "a" : "div");
  wrapper.className = "carrossel-patrocinio__banner";

  if (clicavel) {
    wrapper.href = candidato.href;
    if (candidato.externo) {
      wrapper.target = "_blank";
      wrapper.rel = "noopener sponsored";
    }
  }

  const imagem = document.createElement("img");
  imagem.src = candidato.imagemBannerUrl;
  imagem.alt = candidato.nome;
  imagem.loading = "lazy";

  const selo = document.createElement("span");
  selo.className = "carrossel-patrocinio__selo";
  selo.textContent = "Publicidade";

  wrapper.appendChild(imagem);
  wrapper.appendChild(selo);
  return wrapper;
}

export { iniciarCarrosselPatrocinio };
