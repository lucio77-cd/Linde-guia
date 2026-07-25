/**
 * admin-patrocinadores.js — js/admin/admin-patrocinadores.js
 * CRUD de patrocinadores (banner de publicidade avulso).
 *
 * MUDANÇA NESTA VERSÃO: o campo único "Link de destino" virou um seletor
 * de TIPO DE DESTINO com 3 opções (ver patrocinadores-data.js):
 *   - "local": dropdown com os Locais já cadastrados (buscarTodosPois) —
 *     a pessoa escolhe da lista, nunca digita nada, e o clique no banner
 *     leva pra pages/ponto.html?id={poiId} daquele lugar.
 *   - "externo": link de fora, digitado (comportamento antigo).
 *   - "whatsapp": usa o número configurado na aba Configurações — é a
 *     opção usada no banner "Anuncie aqui" (anúncio do próprio espaço de
 *     anúncio), pra virar contato direto em vez de link nenhum.
 *
 * Corrigido nesta versão: o campo de nível estava duplicado no HTML (dois
 * <select id="campo-patrocinador-nivel">) de uma edição anterior — só um
 * deles sobrou.
 */
import {
  buscarTodosPatrocinadores, criarPatrocinador, atualizarPatrocinador, removerPatrocinador,
} from "../data/patrocinadores-data.js";
import { buscarTodosPois } from "../data/pois-data.js";
import { montarCaminhoBanner, extrairNumeroDoCaminho, numerosDeBannerEmUso } from "./numeracao-banners.js";

let patrocinadoresCache = [];
let poisCache = [];
let imagemBannerUrlAtual = null;

const LABEL_NIVEL = { ouro: "🥇 Ouro", prata: "🥈 Prata", bronze: "🥉 Bronze" };
const LABEL_DESTINO = { nenhum: "sem link", local: "leva a um Local", externo: "link externo", whatsapp: "leva ao WhatsApp" };

function iniciarAdminPatrocinadores() {
  document.addEventListener("linde-guia:admin-autenticado", carregarPatrocinadores);

  document.getElementById("btn-novo-patrocinador").addEventListener("click", () => abrirModal(null));
  document.getElementById("btn-cancelar-patrocinador").addEventListener("click", fecharModal);
  document.getElementById("btn-fechar-modal-patrocinador").addEventListener("click", fecharModal);
  document.getElementById("form-patrocinador").addEventListener("submit", salvarPatrocinador);
  document.getElementById("btn-excluir-patrocinador").addEventListener("click", excluirPatrocinadorAtual);

  document.getElementById("modal-patrocinador").addEventListener("click", (e) => {
    if (e.target === e.currentTarget) fecharModal();
  });

  document.getElementById("campo-patrocinador-numero").addEventListener("input", aoDigitarNumero);
  document.getElementById("campo-patrocinador-tipo-destino").addEventListener("change", aoMudarTipoDestino);
}

document.addEventListener("DOMContentLoaded", iniciarAdminPatrocinadores);

// ============================================================
// CARREGAR E LISTAR
// ============================================================
async function carregarPatrocinadores() {
  try {
    const [patrocinadores, pois] = await Promise.all([
      buscarTodosPatrocinadores(),
      buscarTodosPois({ forcarAtualizacao: false }).catch((erro) => {
        console.warn("[admin-patrocinadores] Não consegui carregar Locais:", erro);
        return [];
      }),
    ]);
    patrocinadoresCache = patrocinadores;
    poisCache = pois;
    preencherSelectDeLocais();
    renderizarListaPatrocinadores();
  } catch (erro) {
    console.error("[admin-patrocinadores] Erro ao carregar:", erro);
    document.getElementById("lista-patrocinadores").innerHTML =
      '<p class="lista-vazia">Não consegui carregar os patrocinadores agora.</p>';
  }
}

function preencherSelectDeLocais() {
  const select = document.getElementById("campo-patrocinador-poi");
  const valorAtual = select.value;
  select.innerHTML = '<option value="">Selecione...</option>';

  [...poisCache]
    .sort((a, b) => (a.nome || "").localeCompare(b.nome || ""))
    .forEach((poi) => {
      const opcao = document.createElement("option");
      opcao.value = poi.id;
      opcao.textContent = poi.nome;
      select.appendChild(opcao);
    });

  select.value = valorAtual; // mantém seleção se já havia uma (reabertura de modal)
}

function renderizarListaPatrocinadores() {
  const container = document.getElementById("lista-patrocinadores");
  container.innerHTML = "";

  if (patrocinadoresCache.length === 0) {
    container.innerHTML = '<p class="lista-vazia">Nenhum patrocinador cadastrado ainda.</p>';
    return;
  }

  patrocinadoresCache.forEach((p) => container.appendChild(criarCardPatrocinador(p)));
}

function criarCardPatrocinador(p) {
  const card = document.createElement("article");
  card.className = "local-admin-card";
  card.dataset.id = p.id;

  const periodo = formatarPeriodo(p);
  const destinoLabel = descreverDestino(p);
  const seloNivel = p.nivel
    ? `<span class="selo-patrocinio selo-patrocinio--${p.nivel}">${LABEL_NIVEL[p.nivel]}</span>`
    : "";

  card.innerHTML = `
    <div class="local-admin-card__topo">
      <h3 class="local-admin-card__nome">${escaparHtml(p.nome)}</h3>
      <span class="local-admin-card__status status--${p.ativo ? "ativo" : "fechado_temporariamente"}">
        ${p.ativo ? "Ativo" : "Inativo"}
      </span>
    </div>
    <p class="local-admin-card__detalhe">${periodo} · ${destinoLabel}</p>
    ${seloNivel}
  `;

  card.addEventListener("click", () => abrirModal(p));
  return card;
}

function descreverDestino(p) {
  if (p.tipoDestino === "local") {
    const poi = poisCache.find((x) => x.id === p.poiIdDestino);
    return poi ? `leva a "${poi.nome}"` : "leva a um Local (removido)";
  }
  return LABEL_DESTINO[p.tipoDestino] || "sem link";
}

function formatarPeriodo(p) {
  if (!p.dataInicio && !p.dataFim) return "Sem prazo definido";
  const ini = p.dataInicio ? new Date(p.dataInicio).toLocaleDateString("pt-BR") : "sempre";
  const fim = p.dataFim ? new Date(p.dataFim).toLocaleDateString("pt-BR") : "sem data final";
  return `De ${ini} até ${fim}`;
}

function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto || "";
  return div.innerHTML;
}

// ============================================================
// TIPO DE DESTINO — alterna qual grupo de campos aparece
// ============================================================
function aoMudarTipoDestino() {
  const tipo = document.getElementById("campo-patrocinador-tipo-destino").value;
  document.getElementById("grupo-destino-local").hidden = tipo !== "local";
  document.getElementById("grupo-destino-externo").hidden = tipo !== "externo";
  document.getElementById("grupo-destino-whatsapp").hidden = tipo !== "whatsapp";
}

// ============================================================
// NÚMERO DA ARTE
// ============================================================
function aoDigitarNumero() {
  const numero = document.getElementById("campo-patrocinador-numero").value.trim();
  imagemBannerUrlAtual = numero ? montarCaminhoBanner(numero) : null;
  atualizarPreviewBanner(imagemBannerUrlAtual);
  avisarSeNumeroJaUsado(numero);
}

function atualizarPreviewBanner(url) {
  const preview = document.getElementById("preview-patrocinador-imagem");
  const avisoQuebrada = document.getElementById("aviso-patrocinador-imagem-quebrada");
  if (!url) {
    preview.hidden = true;
    preview.removeAttribute("src");
    avisoQuebrada.hidden = true;
    return;
  }
  preview.src = url;
  preview.hidden = false;
  avisoQuebrada.hidden = true;
  preview.onerror = () => { avisoQuebrada.hidden = false; };
  preview.onload = () => { avisoQuebrada.hidden = true; };
}

function mostrarNumerosEmUso() {
  const idAtual = document.getElementById("campo-patrocinador-id").value || null;
  const emUso = numerosDeBannerEmUso(poisCache, patrocinadoresCache, { patrocinadorId: idAtual });
  const listaEl = document.getElementById("lista-numeros-em-uso-patrocinador");

  const entradas = Object.entries(emUso).sort((a, b) => Number(a[0]) - Number(b[0]));
  if (entradas.length === 0) {
    listaEl.textContent = "Nenhum número em uso ainda — pode começar do 1.";
    return;
  }
  listaEl.textContent = "Já em uso: " + entradas.map(([n, origem]) => `${n} (${origem})`).join(", ");
}

function avisarSeNumeroJaUsado(numero) {
  const statusEl = document.getElementById("status-patrocinador-imagem");
  if (!numero) {
    statusEl.textContent = "";
    statusEl.dataset.tipo = "";
    return;
  }
  const idAtual = document.getElementById("campo-patrocinador-id").value || null;
  const emUso = numerosDeBannerEmUso(poisCache, patrocinadoresCache, { patrocinadorId: idAtual });

  if (emUso[numero]) {
    statusEl.textContent = `⚠️ Número ${numero} já está em uso por "${emUso[numero]}" — escolhe outro.`;
    statusEl.dataset.tipo = "erro";
  } else {
    statusEl.textContent = `Vai carregar de: /banners/${numero}.jpg`;
    statusEl.dataset.tipo = "ok";
  }
}

// ============================================================
// MODAL
// ============================================================
function abrirModal(p) {
  const modal = document.getElementById("modal-patrocinador");
  const titulo = document.getElementById("modal-patrocinador__titulo");
  const btnExcluir = document.getElementById("btn-excluir-patrocinador");
  const erroEl = document.getElementById("erro-form-patrocinador");
  const inputNumero = document.getElementById("campo-patrocinador-numero");
  const statusEl = document.getElementById("status-patrocinador-imagem");
  const selectTipoDestino = document.getElementById("campo-patrocinador-tipo-destino");

  erroEl.hidden = true;
  document.getElementById("form-patrocinador").reset();
  statusEl.textContent = "";
  statusEl.dataset.tipo = "";

  if (p) {
    titulo.textContent = "Editar patrocinador";
    document.getElementById("campo-patrocinador-id").value = p.id;
    document.getElementById("campo-patrocinador-nome").value = p.nome;
    document.getElementById("campo-patrocinador-nivel").value = p.nivel || "";
    imagemBannerUrlAtual = p.imagemBannerUrl || null;
    inputNumero.value = extrairNumeroDoCaminho(imagemBannerUrlAtual) || "";

    selectTipoDestino.value = p.tipoDestino || "nenhum";
    document.getElementById("campo-patrocinador-poi").value = p.poiIdDestino || "";
    document.getElementById("campo-patrocinador-link").value = p.linkDestino || "";

    document.getElementById("campo-patrocinador-inicio").value = p.dataInicio ? p.dataInicio.slice(0, 10) : "";
    document.getElementById("campo-patrocinador-fim").value = p.dataFim ? p.dataFim.slice(0, 10) : "";
    document.getElementById("campo-patrocinador-ativo").checked = p.ativo;
    btnExcluir.hidden = false;
  } else {
    titulo.textContent = "Novo patrocinador";
    document.getElementById("campo-patrocinador-id").value = "";
    document.getElementById("campo-patrocinador-nivel").value = "";
    imagemBannerUrlAtual = null;
    inputNumero.value = "";
    selectTipoDestino.value = "nenhum";
    document.getElementById("campo-patrocinador-poi").value = "";
    document.getElementById("campo-patrocinador-ativo").checked = true;
    btnExcluir.hidden = true;
  }

  aoMudarTipoDestino();
  atualizarPreviewBanner(imagemBannerUrlAtual);
  mostrarNumerosEmUso();
  modal.hidden = false;
}

function fecharModal() {
  document.getElementById("modal-patrocinador").hidden = true;
}

async function salvarPatrocinador(evento) {
  evento.preventDefault();

  const id = document.getElementById("campo-patrocinador-id").value;
  const erroEl = document.getElementById("erro-form-patrocinador");
  erroEl.hidden = true;

  const dataInicio = document.getElementById("campo-patrocinador-inicio").value;
  const dataFim = document.getElementById("campo-patrocinador-fim").value;
  const tipoDestino = document.getElementById("campo-patrocinador-tipo-destino").value;

  const dados = {
    nome: document.getElementById("campo-patrocinador-nome").value.trim(),
    imagemBannerUrl: imagemBannerUrlAtual || null,
    nivel: document.getElementById("campo-patrocinador-nivel").value || null,
    tipoDestino,
    poiIdDestino: tipoDestino === "local" ? (document.getElementById("campo-patrocinador-poi").value || null) : null,
    linkDestino: tipoDestino === "externo" ? (document.getElementById("campo-patrocinador-link").value.trim() || null) : null,
    dataInicio: dataInicio ? new Date(dataInicio).toISOString() : null,
    dataFim: dataFim ? new Date(dataFim).toISOString() : null,
    ativo: document.getElementById("campo-patrocinador-ativo").checked,
  };

  if (!dados.nome || !dados.imagemBannerUrl) {
    erroEl.textContent = "Preenche o nome e o número da arte antes de salvar.";
    erroEl.hidden = false;
    return;
  }
  if (tipoDestino === "local" && !dados.poiIdDestino) {
    erroEl.textContent = "Escolhe qual Local esse banner deve levar.";
    erroEl.hidden = false;
    return;
  }
  if (tipoDestino === "externo" && !dados.linkDestino) {
    erroEl.textContent = "Preenche o link externo, ou muda o tipo de destino.";
    erroEl.hidden = false;
    return;
  }

  const numeroAtual = extrairNumeroDoCaminho(dados.imagemBannerUrl);
  const emUso = numerosDeBannerEmUso(poisCache, patrocinadoresCache, { patrocinadorId: id || null });
  if (numeroAtual && emUso[numeroAtual]) {
    const confirmar = confirm(
      `O número ${numeroAtual} já está em uso por "${emUso[numeroAtual]}". ` +
      `Os dois vão mostrar a mesma imagem. Salvar assim mesmo?`
    );
    if (!confirmar) return;
  }

  const btnSalvar = evento.submitter;
  const textoOriginal = btnSalvar.textContent;
  btnSalvar.disabled = true;
  btnSalvar.textContent = "Salvando...";

  try {
    if (id) {
      await atualizarPatrocinador(id, dados);
    } else {
      await criarPatrocinador(dados);
    }
    fecharModal();
    await carregarPatrocinadores();
  } catch (erro) {
    console.error("[admin-patrocinadores] Erro ao salvar:", erro);
    const detalhe = erro.code || erro.message || "erro desconhecido";
    erroEl.textContent = `Não consegui salvar agora (${detalhe}). Se disser "permission-denied", falta liberar a coleção "patrocinadores" nas regras do Firestore.`;
    erroEl.hidden = false;
  } finally {
    btnSalvar.disabled = false;
    btnSalvar.textContent = textoOriginal;
  }
}

async function excluirPatrocinadorAtual() {
  const id = document.getElementById("campo-patrocinador-id").value;
  if (!id) return;

  if (!confirm("Excluir esse patrocinador? Essa ação não pode ser desfeita.")) return;

  try {
    await removerPatrocinador(id);
    fecharModal();
    await carregarPatrocinadores();
  } catch (erro) {
    const erroEl = document.getElementById("erro-form-patrocinador");
    erroEl.textContent = "Não consegui excluir agora. Tenta de novo em instante.";
    erroEl.hidden = false;
  }
}
