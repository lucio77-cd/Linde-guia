/**
 * admin-locais.js — js/admin/admin-locais.js
 * CRUD de POIs + filtro por categoria + dias de funcionamento
 */
import {
  buscarTodosPois, criarPoi, atualizarPoi, removerPoi,
} from "../data/pois-data.js";

let poisCache = [];
let categoriaAtiva = "todos";
let imagemBannerUrlAtual = null; // URL da imagem de banner do local aberto no modal (já enviada ou recém-enviada agora)

// Nomes completos na ordem da semana (domingo primeiro), formato usado por
// motor-rota.js (obterDiaSemana) e por pois-seed.json.
const DIAS_SEMANA = [
  { chave: "domingo", label: "Domingo" },
  { chave: "segunda", label: "Segunda" },
  { chave: "terca",   label: "Terça" },
  { chave: "quarta",  label: "Quarta" },
  { chave: "quinta",  label: "Quinta" },
  { chave: "sexta",   label: "Sexta" },
  { chave: "sabado",  label: "Sábado" },
];

const REFEICOES = ["cafeDaManha", "almoco", "tarde", "janta"];

// ============================================================
// SANIDADE GEOGRÁFICA — mesma referência usada em formulario-roteiro.js
// (CENTRO_TREZE_TILIAS) e mapa-rota.js (raio de tolerância). Centralizado
// aqui porque agora dois pontos deste arquivo dependem dele: a busca de
// endereço E a validação final antes de salvar.
// ============================================================
const CENTRO_TREZE_TILIAS = { lat: -27.0026, lng: -51.4084 };
const BBOX_TREZE_TILIAS = {
  sul: -27.04, norte: -26.84,
  oeste: -51.54, leste: -51.33,
};
// Raio bem mais generoso que o do turista (15km) — o admin pode
// legitimamente cadastrar um POI na zona rural, num distrito vizinho, etc.
// O objetivo aqui não é limitar onde um local pode existir, é pegar erro
// grosseiro (lat/lng de outra cidade/estado, ou dígito trocado na digitação
// manual) — algo na casa de dezenas de km, não centenas.
const RAIO_AVISO_KM = 30;

function distanciaKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const aH = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return R * 2 * Math.atan2(Math.sqrt(aH), Math.sqrt(1 - aH));
}

function iniciarAdminLocais() {
  document.addEventListener("linde-guia:admin-autenticado", carregarLocais);
  configurarAbas();
  configurarFiltros();
  montarLinhasHorarioSemana();
  configurarAtalhosHorario();
  configurarPrioridadeCondicional();
  configurarBuscaEndereco();
  configurarAvisoDistanciaManual();
  configurarPatrocinio();

  document.getElementById("btn-novo-local").addEventListener("click", () => abrirModal(null));
  document.getElementById("btn-cancelar-local").addEventListener("click", fecharModal);
  document.getElementById("btn-fechar-modal").addEventListener("click", fecharModal);
  document.getElementById("form-local").addEventListener("submit", salvarLocal);
  document.getElementById("btn-excluir-local").addEventListener("click", excluirLocalAtual);

  // Fecha modal ao clicar no backdrop
  document.getElementById("modal-local").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) fecharModal();
  });
}

document.addEventListener("DOMContentLoaded", iniciarAdminLocais);

// ============================================================
// ABAS DA SIDEBAR
// ============================================================
function configurarAbas() {
  document.querySelectorAll(".aba-nav[data-aba]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".aba-nav").forEach((b) => b.classList.remove("ativa"));
      btn.classList.add("ativa");
      document.querySelectorAll(".aba-conteudo").forEach((s) => {
        s.hidden = s.id !== btn.dataset.aba;
      });
    });
  });
}

// ============================================================
// FILTROS POR CATEGORIA
// ============================================================
function configurarFiltros() {
  document.querySelectorAll(".filtro-cat").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filtro-cat").forEach((b) => b.classList.remove("ativo"));
      btn.classList.add("ativo");
      categoriaAtiva = btn.dataset.cat;
      renderizarListaLocais();
    });
  });
}

// ============================================================
// HORÁRIO POR DIA DA SEMANA — cada dia com seu próprio abre/fecha
// ============================================================
function montarLinhasHorarioSemana() {
  const container = document.getElementById("horarios-semana");
  container.innerHTML = "";

  DIAS_SEMANA.forEach(({ chave, label }) => {
    const linha = document.createElement("div");
    linha.className = "dia-linha";
    linha.dataset.dia = chave;
    linha.innerHTML = `
      <label class="dia-linha__toggle">
        <input type="checkbox" class="dia-linha__aberto" checked />
        <span class="dia-linha__nome">${label}</span>
      </label>
      <input type="time" class="dia-linha__abre" value="08:00" />
      <input type="time" class="dia-linha__fecha" value="18:00" />
      <label class="dia-linha__pausa-toggle">
        <input type="checkbox" class="dia-linha__tem-pausa" />
        Fecha pro almoço
      </label>
      <input type="time" class="dia-linha__pausa-inicio" value="12:00" disabled />
      <input type="time" class="dia-linha__pausa-fim" value="13:00" disabled />
    `;
    const checkbox = linha.querySelector(".dia-linha__aberto");
    const inputAbre = linha.querySelector(".dia-linha__abre");
    const inputFecha = linha.querySelector(".dia-linha__fecha");
    const checkboxPausa = linha.querySelector(".dia-linha__tem-pausa");
    const inputPausaInicio = linha.querySelector(".dia-linha__pausa-inicio");
    const inputPausaFim = linha.querySelector(".dia-linha__pausa-fim");

    checkbox.addEventListener("change", () => {
      const aberto = checkbox.checked;
      inputAbre.disabled = !aberto;
      inputFecha.disabled = !aberto;
      checkboxPausa.disabled = !aberto;
      inputPausaInicio.disabled = !aberto || !checkboxPausa.checked;
      inputPausaFim.disabled = !aberto || !checkboxPausa.checked;
      linha.classList.toggle("dia-linha--fechado", !aberto);
    });

    checkboxPausa.addEventListener("change", () => {
      inputPausaInicio.disabled = !checkboxPausa.checked;
      inputPausaFim.disabled = !checkboxPausa.checked;
    });

    container.appendChild(linha);
  });
}

function lerHorarioSemanaDoFormulario() {
  const horario = {};
  document.querySelectorAll(".dia-linha").forEach((linha) => {
    const dia = linha.dataset.dia;
    const aberto = linha.querySelector(".dia-linha__aberto").checked;
    const temPausa = linha.querySelector(".dia-linha__tem-pausa").checked;

    horario[dia] = {
      abre: linha.querySelector(".dia-linha__abre").value || "08:00",
      fecha: linha.querySelector(".dia-linha__fecha").value || "18:00",
      fechado: !aberto,
      pausaAlmoco: temPausa
        ? {
            inicio: linha.querySelector(".dia-linha__pausa-inicio").value || "12:00",
            fim: linha.querySelector(".dia-linha__pausa-fim").value || "13:00",
          }
        : null,
    };
  });
  return horario;
}

function preencherHorarioSemanaNoFormulario(horarioFuncionamento) {
  const dados = horarioFuncionamento || {};
  document.querySelectorAll(".dia-linha").forEach((linha) => {
    const dia = linha.dataset.dia;
    const janela = dados[dia];
    const aberto = !!janela && !janela.fechado;
    const pausa = janela?.pausaAlmoco || null;

    const checkbox = linha.querySelector(".dia-linha__aberto");
    const inputAbre = linha.querySelector(".dia-linha__abre");
    const inputFecha = linha.querySelector(".dia-linha__fecha");
    const checkboxPausa = linha.querySelector(".dia-linha__tem-pausa");
    const inputPausaInicio = linha.querySelector(".dia-linha__pausa-inicio");
    const inputPausaFim = linha.querySelector(".dia-linha__pausa-fim");

    checkbox.checked = aberto;
    inputAbre.value = janela?.abre || "08:00";
    inputFecha.value = janela?.fecha || "18:00";
    inputAbre.disabled = !aberto;
    inputFecha.disabled = !aberto;

    checkboxPausa.checked = !!pausa;
    checkboxPausa.disabled = !aberto;
    inputPausaInicio.value = pausa?.inicio || "12:00";
    inputPausaFim.value = pausa?.fim || "13:00";
    inputPausaInicio.disabled = !aberto || !pausa;
    inputPausaFim.disabled = !aberto || !pausa;

    linha.classList.toggle("dia-linha--fechado", !aberto);
  });
}

function configurarAtalhosHorario() {
  document.getElementById("btn-copiar-semana").addEventListener("click", () => {
    const segunda = document.querySelector('.dia-linha[data-dia="segunda"]');
    const abre = segunda.querySelector(".dia-linha__abre").value;
    const fecha = segunda.querySelector(".dia-linha__fecha").value;
    const temPausa = segunda.querySelector(".dia-linha__tem-pausa").checked;
    const pausaInicio = segunda.querySelector(".dia-linha__pausa-inicio").value;
    const pausaFim = segunda.querySelector(".dia-linha__pausa-fim").value;

    ["terca", "quarta", "quinta", "sexta"].forEach((dia) => {
      const linha = document.querySelector(`.dia-linha[data-dia="${dia}"]`);
      linha.querySelector(".dia-linha__aberto").checked = true;
      linha.querySelector(".dia-linha__abre").value = abre;
      linha.querySelector(".dia-linha__abre").disabled = false;
      linha.querySelector(".dia-linha__fecha").value = fecha;
      linha.querySelector(".dia-linha__fecha").disabled = false;
      linha.querySelector(".dia-linha__tem-pausa").checked = temPausa;
      linha.querySelector(".dia-linha__tem-pausa").disabled = false;
      linha.querySelector(".dia-linha__pausa-inicio").value = pausaInicio;
      linha.querySelector(".dia-linha__pausa-inicio").disabled = !temPausa;
      linha.querySelector(".dia-linha__pausa-fim").value = pausaFim;
      linha.querySelector(".dia-linha__pausa-fim").disabled = !temPausa;
      linha.classList.remove("dia-linha--fechado");
    });
  });

  document.getElementById("btn-copiar-fds").addEventListener("click", () => {
    const sabado = document.querySelector('.dia-linha[data-dia="sabado"]');
    const domingo = document.querySelector('.dia-linha[data-dia="domingo"]');
    const abertoSabado = sabado.querySelector(".dia-linha__aberto").checked;
    const temPausaSabado = sabado.querySelector(".dia-linha__tem-pausa").checked;

    domingo.querySelector(".dia-linha__aberto").checked = abertoSabado;
    domingo.querySelector(".dia-linha__abre").value = sabado.querySelector(".dia-linha__abre").value;
    domingo.querySelector(".dia-linha__fecha").value = sabado.querySelector(".dia-linha__fecha").value;
    domingo.querySelector(".dia-linha__abre").disabled = !abertoSabado;
    domingo.querySelector(".dia-linha__fecha").disabled = !abertoSabado;

    domingo.querySelector(".dia-linha__tem-pausa").checked = temPausaSabado;
    domingo.querySelector(".dia-linha__tem-pausa").disabled = !abertoSabado;
    domingo.querySelector(".dia-linha__pausa-inicio").value = sabado.querySelector(".dia-linha__pausa-inicio").value;
    domingo.querySelector(".dia-linha__pausa-fim").value = sabado.querySelector(".dia-linha__pausa-fim").value;
    domingo.querySelector(".dia-linha__pausa-inicio").disabled = !abertoSabado || !temPausaSabado;
    domingo.querySelector(".dia-linha__pausa-fim").disabled = !abertoSabado || !temPausaSabado;

    domingo.classList.toggle("dia-linha--fechado", !abertoSabado);
  });
}

// ============================================================
// REFEIÇÕES SERVIDAS — aparece só para gastronomia
// ============================================================
function lerRefeicoesServidasDoFormulario() {
  return Array.from(document.querySelectorAll('#refeicoes-servidas input[type="checkbox"]:checked'))
    .map((el) => el.value);
}

function preencherRefeicoesServidasNoFormulario(refeicoesServidas = []) {
  document.querySelectorAll('#refeicoes-servidas input[type="checkbox"]').forEach((el) => {
    el.checked = refeicoesServidas.includes(el.value);
  });
}

// ============================================================
// TAGS DE INTERESSE — disponível pra qualquer categoria, não só gastronomia
// ============================================================
function lerTagsDeInteresseDoFormulario() {
  return Array.from(document.querySelectorAll('#tags-interesse input[type="checkbox"]:checked'))
    .map((el) => el.value);
}

function preencherTagsDeInteresseNoFormulario(tagsDeInteresse = []) {
  document.querySelectorAll('#tags-interesse input[type="checkbox"]').forEach((el) => {
    el.checked = tagsDeInteresse.includes(el.value);
  });
}

// ============================================================
// PRIORIDADE GASTRONÔMICA + REFEIÇÕES SERVIDAS — só para gastronomia
// ============================================================
function configurarPrioridadeCondicional() {
  const select = document.getElementById("campo-categoria");
  const grupoPrioridade = document.getElementById("grupo-prioridade-gastronomica");
  const grupoRefeicoes  = document.getElementById("grupo-refeicoes-servidas");
  select.addEventListener("change", () => {
    const ehGastronomia = select.value === "gastronomia";
    grupoPrioridade.hidden = !ehGastronomia;
    grupoRefeicoes.hidden  = !ehGastronomia;
  });
}

// ============================================================
// PATROCÍNIO — nível (Ouro/Prata/Bronze), ativo/inativo e a arte do
// banner. Vira um campo do próprio POI (não uma coleção separada) porque
// só locais já cadastrados no app podem ser patrocinados.
//
// SEM UPLOAD, SEM FIREBASE STORAGE: Storage exige o plano pago (Blaze) do
// Firebase, e não vale a pena pro tamanho do projeto agora. Em vez disso,
// a arte é um arquivo estático servido direto pela Vercel — o admin digita
// só um NÚMERO aqui, e sobe manualmente o arquivo
// "banners/{numero}.jpg" no repositório (pelo GitHub mesmo, sem precisar
// de tela de upload). O caminho é montado sozinho a partir do número.
// ============================================================
const PASTA_BANNERS = "/banners"; // caminho absoluto — funciona igual não importa de qual pasta a página está servindo
const EXTENSAO_BANNER = ".jpg";   // fixo por simplicidade — exporta a arte sempre como JPG

function configurarPatrocinio() {
  const selectNivel   = document.getElementById("campo-patrocinio-nivel");
  const grupoDetalhes = document.getElementById("grupo-patrocinio-detalhes");
  const inputNumero   = document.getElementById("campo-patrocinio-numero");

  selectNivel.addEventListener("change", () => {
    grupoDetalhes.hidden = !selectNivel.value; // "" = Nenhum
    if (!selectNivel.value) return;
    mostrarNumerosEmUso();
  });

  inputNumero.addEventListener("input", () => {
    const numero = inputNumero.value.trim();
    imagemBannerUrlAtual = numero ? montarCaminhoBanner(numero) : null;
    atualizarPreviewBanner(imagemBannerUrlAtual);
    avisarSeNumeroJaUsado(numero);
  });
}

function montarCaminhoBanner(numero) {
  return `${PASTA_BANNERS}/${numero}${EXTENSAO_BANNER}`;
}

function atualizarPreviewBanner(url) {
  const preview = document.getElementById("preview-patrocinio-imagem");
  const avisoQuebrada = document.getElementById("aviso-patrocinio-imagem-quebrada");
  if (!url) {
    preview.hidden = true;
    preview.removeAttribute("src");
    avisoQuebrada.hidden = true;
    return;
  }
  preview.src = url;
  preview.hidden = false;
  avisoQuebrada.hidden = true;
  // A imagem pode ainda não existir no repo (admin digitou o número mas
  // não subiu o arquivo ainda) — isso é normal, não é erro. Só avisa de
  // forma discreta, sem travar nada.
  preview.onerror = () => { avisoQuebrada.hidden = false; };
  preview.onload = () => { avisoQuebrada.hidden = true; };
}

// Varre os POIs já carregados e monta um mapa {numero: nomeDoLocal} —
// ajuda a não repetir um número já usado por outro local sem querer.
// Exclui o próprio POI em edição (senão ele apareceria "colidindo" consigo
// mesmo toda vez que reabrir pra editar).
function numerosDeBannerEmUso(idIgnorar) {
  const regex = new RegExp(`^${PASTA_BANNERS}/(\\d+)${EXTENSAO_BANNER.replace(".", "\\.")}$`);
  const emUso = {};

  poisCache.forEach((poi) => {
    if (poi.id === idIgnorar) return;
    const url = poi.patrocinio?.imagemBannerUrl;
    if (!url) return;
    const match = url.match(regex);
    if (match) emUso[match[1]] = poi.nome;
  });

  return emUso;
}

function mostrarNumerosEmUso() {
  const idAtual = document.getElementById("campo-id").value || null;
  const emUso = numerosDeBannerEmUso(idAtual);
  const listaEl = document.getElementById("lista-numeros-em-uso");

  const entradas = Object.entries(emUso).sort((a, b) => Number(a[0]) - Number(b[0]));
  if (entradas.length === 0) {
    listaEl.textContent = "Nenhum número em uso ainda — pode começar do 1.";
    return;
  }
  listaEl.textContent = "Já em uso: " + entradas.map(([n, nome]) => `${n} (${nome})`).join(", ");
}

function avisarSeNumeroJaUsado(numero) {
  const statusEl = document.getElementById("status-patrocinio-imagem");
  if (!numero) {
    statusEl.textContent = "";
    statusEl.dataset.tipo = "";
    return;
  }
  const idAtual = document.getElementById("campo-id").value || null;
  const emUso = numerosDeBannerEmUso(idAtual);

  if (emUso[numero]) {
    statusEl.textContent = `⚠️ Número ${numero} já está em uso por "${emUso[numero]}" — escolhe outro, ou os dois vão mostrar a mesma imagem.`;
    statusEl.dataset.tipo = "erro";
  } else {
    statusEl.textContent = `Vai carregar de: ${PASTA_BANNERS}/${numero}${EXTENSAO_BANNER}`;
    statusEl.dataset.tipo = "ok";
  }
}

// Chamado por abrirModal() — preenche os campos de patrocínio a partir do
// POI (ou zera tudo, pra "Novo local").
function preencherPatrocinioNoFormulario(poi) {
  const selectNivel = document.getElementById("campo-patrocinio-nivel");
  const inputAtivo  = document.getElementById("campo-patrocinio-ativo");
  const inputNumero = document.getElementById("campo-patrocinio-numero");
  const grupoDetalhes = document.getElementById("grupo-patrocinio-detalhes");
  const statusEl = document.getElementById("status-patrocinio-imagem");

  const patrocinio = poi?.patrocinio || null;

  selectNivel.value = patrocinio?.nivel || "";
  inputAtivo.checked = patrocinio?.ativo ?? true; // default ativo quando marcar um nível pela primeira vez
  imagemBannerUrlAtual = patrocinio?.imagemBannerUrl || null;

  // Extrai só o número de volta do caminho salvo, pra reaparecer no campo
  // ao reabrir um local que já tem patrocínio configurado.
  const match = imagemBannerUrlAtual?.match(
    new RegExp(`^${PASTA_BANNERS}/(\\d+)${EXTENSAO_BANNER.replace(".", "\\.")}$`)
  );
  inputNumero.value = match ? match[1] : "";

  grupoDetalhes.hidden = !selectNivel.value;
  statusEl.textContent = "";
  statusEl.dataset.tipo = "";
  atualizarPreviewBanner(imagemBannerUrlAtual);

  if (selectNivel.value) mostrarNumerosEmUso();
}

// Chamado por salvarLocal() — monta o objeto patrocinio pro dados do POI.
// null (não undefined) quando nível é "Nenhum", pra sobrescrever de
// verdade um patrocínio removido em vez de deixar o campo antigo no
// Firestore (updateDoc não remove campo que simplesmente não é enviado).
function lerPatrocinioDoFormulario() {
  const nivel = document.getElementById("campo-patrocinio-nivel").value;
  if (!nivel) {
    return null;
  }
  return {
    nivel,
    ativo: document.getElementById("campo-patrocinio-ativo").checked,
    imagemBannerUrl: imagemBannerUrlAtual || null,
  };
}

// ============================================================
// BUSCA DE ENDEREÇO — preenche lat/lng automaticamente via Nominatim/OSM
// (grátis, sem faturamento vinculado — decisão consciente em vez do
// Google Geocoding, que exige cartão de crédito no projeto).
// ============================================================
// Camadas de proteção pra compensar a precisão menor do Nominatim:
//   1. Busca primeiro DENTRO de uma caixa ao redor de Treze Tílias.
//   2. Se não achar nada aí, tenta de novo sem a caixa.
//   3. Mede a distância do resultado até o centro da cidade — se estiver
//      longe demais, avisa bem visível em vez de preencher os campos
//      calado, e deixa o admin decidir.
function configurarBuscaEndereco() {
  const botao = document.getElementById("btn-buscar-endereco");
  const input = document.getElementById("campo-endereco");
  const statusEl = document.getElementById("endereco-status");

  botao.addEventListener("click", async () => {
    const texto = input.value.trim();
    if (!texto) {
      definirStatusEndereco(statusEl, "erro", "Digita um endereço primeiro.");
      return;
    }

    definirStatusEndereco(statusEl, null, "Buscando...");

    try {
      let resultado = await buscarNominatim(montarUrlComBbox(texto));
      if (!resultado) {
        resultado = await buscarNominatim(montarUrlSemBbox(texto));
      }

      if (!resultado) {
        definirStatusEndereco(statusEl, "erro", "Não encontrei esse endereço — confere a latitude/longitude na mão.");
        return;
      }

      const lat = parseFloat(resultado.lat);
      const lng = parseFloat(resultado.lon);
      const distancia = distanciaKm(CENTRO_TREZE_TILIAS, { lat, lng });

      document.getElementById("campo-lat").value = lat;
      document.getElementById("campo-lng").value = lng;

      if (distancia > RAIO_AVISO_KM) {
        definirStatusEndereco(
          statusEl, "aviso",
          `⚠️ Esse resultado está a ${Math.round(distancia)} km do centro de Treze Tílias ` +
          `(${resultado.display_name.split(",").slice(0, 3).join(",")}). ` +
          `Confere com atenção antes de salvar — pode ser um endereço de mesmo nome em outra cidade.`
        );
      } else {
        definirStatusEndereco(statusEl, "ok", "Encontrado! Latitude e longitude preenchidas.");
      }
    } catch (erro) {
      console.error("[admin-locais] Erro ao buscar endereço:", erro);
      definirStatusEndereco(statusEl, "erro", "Erro ao buscar — confere a latitude/longitude na mão.");
    }
  });
}

function montarUrlComBbox(texto) {
  return `https://nominatim.openstreetmap.org/search?` + new URLSearchParams({
    q: `${texto}, Treze Tílias, SC, Brasil`,
    format: "json", limit: "1", countrycodes: "br",
    viewbox: `${BBOX_TREZE_TILIAS.oeste},${BBOX_TREZE_TILIAS.norte},${BBOX_TREZE_TILIAS.leste},${BBOX_TREZE_TILIAS.sul}`,
    bounded: "1",
  });
}

function montarUrlSemBbox(texto) {
  return `https://nominatim.openstreetmap.org/search?` + new URLSearchParams({
    q: `${texto}, Treze Tílias, SC, Brasil`,
    format: "json", limit: "1", countrycodes: "br",
  });
}

async function buscarNominatim(url) {
  const resposta = await fetch(url, {
    headers: { "Accept-Language": "pt-BR", "User-Agent": "LindeGuia/1.0 (admin)" },
  });
  if (!resposta.ok) return null;
  const dados = await resposta.json();
  return dados.length > 0 ? dados[0] : null;
}

function definirStatusEndereco(elemento, tipo, texto) {
  elemento.textContent = texto;
  elemento.dataset.tipo = tipo || "";
}

// ============================================================
// AVISO DE DISTÂNCIA NA DIGITAÇÃO MANUAL — pega o caso de alguém editar
// lat/lng na mão (não só via busca de endereço) e errar um dígito.
// Só avisa, não bloqueia — pode ser um POI legítimo longe do centro.
// ============================================================
function configurarAvisoDistanciaManual() {
  const inputLat = document.getElementById("campo-lat");
  const inputLng = document.getElementById("campo-lng");
  const statusEl = document.getElementById("endereco-status");

  const checar = () => {
    const lat = parseFloat(inputLat.value);
    const lng = parseFloat(inputLng.value);
    if (isNaN(lat) || isNaN(lng)) return;

    const distancia = distanciaKm(CENTRO_TREZE_TILIAS, { lat, lng });
    if (distancia > RAIO_AVISO_KM) {
      definirStatusEndereco(
        statusEl, "aviso",
        `⚠️ Essa coordenada está a ${Math.round(distancia)} km do centro de Treze Tílias. Confere se não trocou nenhum dígito.`
      );
    }
  };

  inputLat.addEventListener("change", checar);
  inputLng.addEventListener("change", checar);
}

// ============================================================
// CARREGAR E LISTAR
// ============================================================
async function carregarLocais() {
  try {
    poisCache = await buscarTodosPois({ forcarAtualizacao: true });
    renderizarListaLocais();
  } catch (erro) {
    console.error("[admin-locais] Erro ao carregar locais:", erro);
  }
}

function renderizarListaLocais() {
  const container = document.getElementById("lista-locais-admin");
  container.innerHTML = "";

  const filtrados = poisCache
    .filter((p) => categoriaAtiva === "todos" || p.categoria === categoriaAtiva)
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));

  if (filtrados.length === 0) {
    container.innerHTML = `<p class="lista-vazia">Nenhum local encontrado nessa categoria.</p>`;
    return;
  }

  filtrados.forEach((poi) => {
    const status = poi.statusOperacional || poi.status_operacional || "ativo";
    const distanciaDoCentro = poi.localizacao
      ? distanciaKm(CENTRO_TREZE_TILIAS, poi.localizacao)
      : null;
    const avisoDistancia = distanciaDoCentro !== null && distanciaDoCentro > RAIO_AVISO_KM
      ? `<span class="local-admin-card__aviso" title="Coordenada distante do centro de Treze Tílias">⚠️ ${Math.round(distanciaDoCentro)} km do centro</span>`
      : "";
    const seloPatrocinio = poi.patrocinio?.nivel
      ? `<span class="selo-patrocinio selo-patrocinio--${poi.patrocinio.nivel}">${LABEL_NIVEL[poi.patrocinio.nivel]}${poi.patrocinio.ativo ? "" : " (pausado)"}</span>`
      : "";

    const card = document.createElement("div");
    card.className = "local-admin-card";
    card.innerHTML = `
      <div class="local-admin-card__topo">
        <span class="local-admin-card__nome">${poi.nome}</span>
        <span class="local-admin-card__status status--${status}">${formatarStatus(status)}</span>
      </div>
      <div class="local-admin-card__rodape">
        <span class="tag-categoria tag-categoria--${poi.categoria || 'lazer'}">${poi.categoria || '—'}</span>
        <span class="local-admin-card__detalhe">${poi.duracaoMediaVisitaMin ?? poi.duracao_media_visita_min ?? 30} min · ${poi.precoEstimado > 0 ? 'R$' + poi.precoEstimado : 'Grátis'}</span>
        ${avisoDistancia}
        ${seloPatrocinio}
      </div>
    `;
    card.addEventListener("click", () => abrirModal(poi));
    container.appendChild(card);
  });
}

function formatarStatus(s) {
  return { ativo:"Ativo", sazonal:"Sazonal", em_reforma:"Em reforma", fechado_temporariamente:"Fechado" }[s] || s;
}

const LABEL_NIVEL = { ouro: "🥇 Ouro", prata: "🥈 Prata", bronze: "🥉 Bronze" };

// ============================================================
// MODAL
// ============================================================
function abrirModal(poi) {
  const modal    = document.getElementById("modal-local");
  const titulo   = document.getElementById("modal-local__titulo");
  const btnExcl  = document.getElementById("btn-excluir-local");
  const erroEl   = document.getElementById("erro-form-local");
  const grupoPrio = document.getElementById("grupo-prioridade-gastronomica");
  const grupoRefeicoesEl = document.getElementById("grupo-refeicoes-servidas");

  erroEl.hidden = true;

  if (poi) {
    titulo.textContent = "Editar local";
    document.getElementById("campo-id").value        = poi.id;
    document.getElementById("campo-nome").value      = poi.nome || "";
    document.getElementById("campo-categoria").value = poi.categoria || "gastronomia";
    document.getElementById("campo-descricao").value = poi.descricaoCurta || poi.descricao_curta || "";
    document.getElementById("campo-lat").value       = poi.localizacao?.lat ?? poi.localizacao?.latitude ?? "";
    document.getElementById("campo-lng").value       = poi.localizacao?.lng ?? poi.localizacao?.longitude ?? "";
    document.getElementById("campo-preco").value     = poi.precoEstimado ?? poi.preco_estimado ?? 0;
    document.getElementById("campo-duracao").value   = poi.duracaoMediaVisitaMin ?? poi.duracao_media_visita_min ?? 30;
    document.getElementById("campo-status").value    = poi.statusOperacional || poi.status_operacional || "ativo";
    document.getElementById("campo-endereco").value  = poi.endereco || "";
    document.getElementById("campo-sobre").value     = poi.descricaoLonga || poi.descricao_longa || "";
    document.getElementById("campo-instagram").value = poi.instagram || "";
    document.getElementById("campo-whatsapp").value  = poi.whatsapp || "";
    document.getElementById("endereco-status").textContent = "";
    document.getElementById("endereco-status").dataset.tipo = "";

    // Se o local já cadastrado está longe do centro, avisa assim que abre
    // o modal — não só quando o admin mexer nos campos.
    if (poi.localizacao) {
      const distancia = distanciaKm(CENTRO_TREZE_TILIAS, poi.localizacao);
      if (distancia > RAIO_AVISO_KM) {
        definirStatusEndereco(
          document.getElementById("endereco-status"), "aviso",
          `⚠️ Esse local está cadastrado a ${Math.round(distancia)} km do centro de Treze Tílias. Confere se a coordenada está certa.`
        );
      }
    }

    preencherHorarioSemanaNoFormulario(poi.horarioFuncionamento);
    preencherRefeicoesServidasNoFormulario(poi.refeicoesServidas || []);
    preencherTagsDeInteresseNoFormulario(poi.tagsDeInteresse || []);

    grupoPrio.hidden = poi.categoria !== "gastronomia";
    grupoRefeicoesEl.hidden = poi.categoria !== "gastronomia";
    document.getElementById("campo-prioridade-gastronomica").value = poi.prioridadeGastronomica ?? 0;

    preencherPatrocinioNoFormulario(poi);

    btnExcl.hidden = false;
  } else {
    titulo.textContent = "Novo local";
    document.getElementById("form-local").reset();
    document.getElementById("campo-id").value      = "";
    document.getElementById("campo-preco").value   = 0;
    document.getElementById("campo-duracao").value = 30;
    preencherHorarioSemanaNoFormulario(null);
    preencherRefeicoesServidasNoFormulario([]);
    preencherTagsDeInteresseNoFormulario([]);
    document.getElementById("campo-endereco").value  = "";
    document.getElementById("campo-sobre").value     = "";
    document.getElementById("campo-instagram").value = "";
    document.getElementById("campo-whatsapp").value  = "";
    document.getElementById("endereco-status").textContent = "";
    document.getElementById("endereco-status").dataset.tipo = "";
    preencherPatrocinioNoFormulario(null);
    grupoPrio.hidden = true;
    grupoRefeicoesEl.hidden = true;
    btnExcl.hidden = true;
  }

  modal.hidden = false;
}

function fecharModal() {
  document.getElementById("modal-local").hidden = true;
}

// ============================================================
// SALVAR
// ============================================================
async function salvarLocal(e) {
  e.preventDefault();
  const erroEl = document.getElementById("erro-form-local");
  erroEl.hidden = true;

  const id       = document.getElementById("campo-id").value;
  const categoria = document.getElementById("campo-categoria").value;

  const dados = {
    nome:               document.getElementById("campo-nome").value.trim(),
    categoria,
    descricaoCurta:     document.getElementById("campo-descricao").value.trim(),
    localizacao: {
      lat: Number(document.getElementById("campo-lat").value),
      lng: Number(document.getElementById("campo-lng").value),
    },
    precoEstimado:        Number(document.getElementById("campo-preco").value),
    duracaoMediaVisitaMin: Number(document.getElementById("campo-duracao").value),
    statusOperacional:    document.getElementById("campo-status").value,
    horarioFuncionamento: lerHorarioSemanaDoFormulario(),
    tagsDeInteresse:      lerTagsDeInteresseDoFormulario(),
    endereco:             document.getElementById("campo-endereco").value.trim(),
    descricaoLonga:       document.getElementById("campo-sobre").value.trim(),
    instagram:            document.getElementById("campo-instagram").value.trim().replace(/^@/, ""),
    whatsapp:             document.getElementById("campo-whatsapp").value.trim().replace(/\D/g, ""),
    patrocinio:           lerPatrocinioDoFormulario(),
  };

  if (categoria === "gastronomia") {
    dados.refeicoesServidas = lerRefeicoesServidasDoFormulario();
    dados.prioridadeGastronomica = Number(document.getElementById("campo-prioridade-gastronomica").value);
  }

  if (!dados.nome) {
    erroEl.textContent = "O nome é obrigatório.";
    erroEl.hidden = false;
    return;
  }
  if (isNaN(dados.localizacao.lat) || isNaN(dados.localizacao.lng)) {
    erroEl.textContent = "Latitude e longitude precisam ser números válidos.";
    erroEl.hidden = false;
    return;
  }
  // Sanidade extra, além do campo obrigatório: números "válidos" mas fora
  // do intervalo físico possível (ex: lat/lng trocados de propósito ou por
  // engano em algum outro fluxo de importação) — pega antes de salvar
  // qualquer coisa geograficamente impossível no banco.
  if (Math.abs(dados.localizacao.lat) > 90 || Math.abs(dados.localizacao.lng) > 180) {
    erroEl.textContent = "Latitude/longitude fora do intervalo válido — confere se não estão trocadas entre si.";
    erroEl.hidden = false;
    return;
  }
  // Não bloqueia — só confirma com o admin, porque um POI legítimo pode
  // estar longe do centro (zona rural, distrito vizinho). Bloquear
  // silenciosamente uma coordenada correta seria pior do que avisar.
  const distanciaDoCentro = distanciaKm(CENTRO_TREZE_TILIAS, dados.localizacao);
  if (distanciaDoCentro > RAIO_AVISO_KM) {
    const confirmar = confirm(
      `Essa coordenada está a ${Math.round(distanciaDoCentro)} km do centro de Treze Tílias. ` +
      `Tem certeza que é isso mesmo? Cancelar pra revisar, OK pra salvar assim mesmo.`
    );
    if (!confirmar) return;
  }

  // Nível escolhido mas sem número de arte definido — patrocínio ficaria
  // "ativo" mas sem imagem nenhuma, o que só resultaria num slot quebrado
  // no carrossel do turista.
  if (dados.patrocinio && !dados.patrocinio.imagemBannerUrl) {
    erroEl.textContent = "Escolheu um nível de patrocínio, mas não digitou o número da arte.";
    erroEl.hidden = false;
    return;
  }
  // Número de arte colidindo com outro local — não impede salvar (pode ser
  // proposital em algum caso raro), só confirma, porque sobrescrever o
  // banner de outro patrocinador sem querer é o tipo de erro que só
  // aparece dias depois, quando alguém notar a imagem errada no ar.
  if (dados.patrocinio) {
    const numeroAtual = dados.patrocinio.imagemBannerUrl.match(
      new RegExp(`^${PASTA_BANNERS}/(\\d+)${EXTENSAO_BANNER.replace(".", "\\.")}$`)
    )?.[1];
    const emUso = numerosDeBannerEmUso(id || null);
    if (numeroAtual && emUso[numeroAtual]) {
      const confirmar2 = confirm(
        `O número ${numeroAtual} já está em uso por "${emUso[numeroAtual]}". ` +
        `Os dois vão mostrar a mesma imagem. Salvar assim mesmo?`
      );
      if (!confirmar2) return;
    }
  }

  try {
    if (id) {
      await atualizarPoi(id, dados);
    } else {
      await criarPoi(dados);
    }
    fecharModal();
    await carregarLocais();
  } catch (erro) {
    console.error("[admin-locais] Erro ao salvar:", erro);
    erroEl.textContent = "Erro ao salvar. Tente de novo.";
    erroEl.hidden = false;
  }
}

// ============================================================
// EXCLUIR
// ============================================================
async function excluirLocalAtual() {
  const id   = document.getElementById("campo-id").value;
  const nome = document.getElementById("campo-nome").value;
  if (!id) return;
  if (!confirm(`Excluir "${nome}"? Essa ação não pode ser desfeita.`)) return;
  try {
    await removerPoi(id);
    fecharModal();
    await carregarLocais();
  } catch (erro) {
    console.error("[admin-locais] Erro ao excluir:", erro);
    alert("Erro ao excluir. Tente de novo.");
  }
}
