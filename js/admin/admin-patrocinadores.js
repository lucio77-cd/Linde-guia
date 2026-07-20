/**
 * admin-patrocinadores.js — js/admin/admin-patrocinadores.js
 * CRUD de patrocinadores (banner de publicidade avulso, sem precisar ser
 * um Local já cadastrado no app).
 *
 * MUDANÇAS nesta versão:
 *  - Imagem: era um link colado à mão (imagemUrl); agora é um NÚMERO,
 *    igual ao patrocínio de Local (arte estática em /banners/{numero}.jpg,
 *    subida manualmente pelo GitHub — ver numeracao-banners.js).
 *  - Link de destino: era obrigatório; agora é OPCIONAL. Sem ele, o
 *    banner aparece só como imagem, sem link nenhum ao tocar — serve pra
 *    um anúncio que É a mensagem (aviso, campanha), não uma chamada pra
 *    visitar algo específico.
 *  - Número em uso é checado contra Locais E outros Patrocinadores juntos
 *    (mesma pasta banners/ compartilhada — ver numeracao-banners.js).
 *
 * A troca de aba em si (clique nos botões da sidebar) já é tratada de
 * forma genérica por configurarAbas() em admin-locais.js — esse arquivo só
 * cuida do conteúdo da aba "Patrocinadores".
 */
import {
  buscarTodosPatrocinadores, criarPatrocinador, atualizarPatrocinador, removerPatrocinador,
} from "../data/patrocinadores-data.js";
import { buscarTodosPois } from "../data/pois-data.js";
import { montarCaminhoBanner, extrairNumeroDoCaminho, numerosDeBannerEmUso } from "./numeracao-banners.js";

let patrocinadoresCache = [];
let poisCache = [];
let imagemBannerUrlAtual = null;

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
}

document.addEventListener("DOMContentLoaded", iniciarAdminPatrocinadores);

// ============================================================
// CARREGAR E LISTAR
// ============================================================
// Carrega patrocinadores E os POIs (só pra checagem cruzada de número —
// não é exibido nada de Local nessa tela).
async function carregarPatrocinadores() {
  try {
    const [patrocinadores, pois] = await Promise.all([
      buscarTodosPatrocinadores(),
      buscarTodosPois({ forcarAtualizacao: false }).catch((erro) => {
        console.warn("[admin-patrocinadores] Não consegui checar números de Locais:", erro);
        return []; // checagem cruzada falhar não pode travar a tela de Patrocinadores
      }),
    ]);
    patrocinadoresCache = patrocinadores;
    poisCache = pois;
    renderizarListaPatrocinadores();
  } catch (erro) {
    console.error("[admin-patrocinadores] Erro ao carregar:", erro);
    document.getElementById("lista-patrocinadores").innerHTML =
      '<p class="lista-vazia">Não consegui carregar os patrocinadores agora.</p>';
  }
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
  const semLink = !p.linkDestino ? " · sem link (só imagem)" : "";

  card.innerHTML = `
    <div class="local-admin-card__topo">
      <h3 class="local-admin-card__nome">${escaparHtml(p.nome)}</h3>
      <span class="local-admin-card__status status--${p.ativo ? "ativo" : "fechado_temporariamente"}">
        ${p.ativo ? "Ativo" : "Inativo"}
      </span>
    </div>
    <p class="local-admin-card__detalhe">${periodo}${semLink}</p>
  `;

  card.addEventListener("click", () => abrirModal(p));
  return card;
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
// NÚMERO DA ARTE — mesmo padrão do patrocínio de Local, checando os dois
// conjuntos juntos (ver numeracao-banners.js).
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

  erroEl.hidden = true;
  document.getElementById("form-patrocinador").reset();
  statusEl.textContent = "";
  statusEl.dataset.tipo = "";

  if (p) {
    titulo.textContent = "Editar patrocinador";
    document.getElementById("campo-patrocinador-id").value = p.id;
    document.getElementById("campo-patrocinador-nome").value = p.nome;
    imagemBannerUrlAtual = p.imagemBannerUrl || null;
    inputNumero.value = extrairNumeroDoCaminho(imagemBannerUrlAtual) || "";
    document.getElementById("campo-patrocinador-link").value = p.linkDestino || "";
    document.getElementById("campo-patrocinador-inicio").value = p.dataInicio ? p.dataInicio.slice(0, 10) : "";
    document.getElementById("campo-patrocinador-fim").value = p.dataFim ? p.dataFim.slice(0, 10) : "";
    document.getElementById("campo-patrocinador-ativo").checked = p.ativo;
    btnExcluir.hidden = false;
  } else {
    titulo.textContent = "Novo patrocinador";
    document.getElementById("campo-patrocinador-id").value = "";
    imagemBannerUrlAtual = null;
    inputNumero.value = "";
    document.getElementById("campo-patrocinador-ativo").checked = true;
    btnExcluir.hidden = true;
  }

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

  const dados = {
    nome: document.getElementById("campo-patrocinador-nome").value.trim(),
    imagemBannerUrl: imagemBannerUrlAtual || null,
    linkDestino: document.getElementById("campo-patrocinador-link").value.trim() || null, // opcional agora
    dataInicio: dataInicio ? new Date(dataInicio).toISOString() : null,
    dataFim: dataFim ? new Date(dataFim).toISOString() : null,
    ativo: document.getElementById("campo-patrocinador-ativo").checked,
  };

  if (!dados.nome || !dados.imagemBannerUrl) {
    erroEl.textContent = "Preenche o nome e o número da arte antes de salvar.";
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
    // Mostra o código/mensagem real do Firestore na tela — sem isso, no
    // celular (sem acesso a console de dev), "não consegui salvar" não diz
    // nada sobre SE é permissão negada, campo inválido, ou rede.
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
