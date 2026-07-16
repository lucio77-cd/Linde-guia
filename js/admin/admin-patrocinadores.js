/**
 * admin-patrocinadores.js — js/admin/admin-patrocinadores.js
 * CRUD de patrocinadores (banner de publicidade paga).
 *
 * A troca de aba em si (clique nos botões da sidebar) já é tratada de
 * forma genérica por configurarAbas() em admin-locais.js — esse arquivo só
 * cuida do conteúdo da aba "Patrocinadores".
 */
import {
  buscarTodosPatrocinadores, criarPatrocinador, atualizarPatrocinador, removerPatrocinador,
} from "../data/patrocinadores-data.js";

let patrocinadoresCache = [];

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
}

document.addEventListener("DOMContentLoaded", iniciarAdminPatrocinadores);

async function carregarPatrocinadores() {
  try {
    patrocinadoresCache = await buscarTodosPatrocinadores();
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

  card.innerHTML = `
    <div class="local-admin-card__topo">
      <h3 class="local-admin-card__nome">${escaparHtml(p.nome)}</h3>
      <span class="local-admin-card__status status--${p.ativo ? "ativo" : "fechado_temporariamente"}">
        ${p.ativo ? "Ativo" : "Inativo"}
      </span>
    </div>
    <p class="local-admin-card__detalhe">${periodo}</p>
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
// MODAL
// ============================================================
function abrirModal(p) {
  const modal = document.getElementById("modal-patrocinador");
  const titulo = document.getElementById("modal-patrocinador__titulo");
  const btnExcluir = document.getElementById("btn-excluir-patrocinador");
  const erroEl = document.getElementById("erro-form-patrocinador");

  erroEl.hidden = true;
  document.getElementById("form-patrocinador").reset();

  if (p) {
    titulo.textContent = "Editar patrocinador";
    document.getElementById("campo-patrocinador-id").value = p.id;
    document.getElementById("campo-patrocinador-nome").value = p.nome;
    document.getElementById("campo-patrocinador-imagem").value = p.imagemUrl;
    document.getElementById("campo-patrocinador-link").value = p.linkDestino;
    document.getElementById("campo-patrocinador-inicio").value = p.dataInicio ? p.dataInicio.slice(0, 10) : "";
    document.getElementById("campo-patrocinador-fim").value = p.dataFim ? p.dataFim.slice(0, 10) : "";
    document.getElementById("campo-patrocinador-ativo").checked = p.ativo;
    btnExcluir.hidden = false;
  } else {
    titulo.textContent = "Novo patrocinador";
    document.getElementById("campo-patrocinador-id").value = "";
    document.getElementById("campo-patrocinador-ativo").checked = true;
    btnExcluir.hidden = true;
  }

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
    imagemUrl: document.getElementById("campo-patrocinador-imagem").value.trim(),
    linkDestino: document.getElementById("campo-patrocinador-link").value.trim(),
    dataInicio: dataInicio ? new Date(dataInicio).toISOString() : null,
    dataFim: dataFim ? new Date(dataFim).toISOString() : null,
    ativo: document.getElementById("campo-patrocinador-ativo").checked,
  };

  if (!dados.nome || !dados.imagemUrl || !dados.linkDestino) {
    erroEl.textContent = "Preenche nome, imagem e link de destino antes de salvar.";
    erroEl.hidden = false;
    return;
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
    erroEl.textContent = "Não consegui salvar agora. Tenta de novo em instante.";
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
