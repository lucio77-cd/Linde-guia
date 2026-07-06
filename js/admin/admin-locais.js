/**
 * admin-locais.js
 * Linde Guia — Painel administrativo
 *
 * CRUD de Pontos de Interesse direto pelo navegador, sem precisar de
 * script de importação manual. Usa a mesma coleção "pois" que o app
 * do turista lê (via pois-data.js).
 */

import { db } from "./firebase-config.js";
import {
  collection,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const NOME_COLECAO = "pois";
let poisCache = [];

function iniciarAdminLocais() {
  document.addEventListener("linde-guia:admin-autenticado", carregarLocais);

  configurarAbas();

  document.getElementById("btn-novo-local").addEventListener("click", () => abrirModal(null));
  document.getElementById("btn-cancelar-local").addEventListener("click", fecharModal);
  document.getElementById("form-local").addEventListener("submit", salvarLocal);
  document.getElementById("btn-excluir-local").addEventListener("click", excluirLocalAtual);
}

document.addEventListener("DOMContentLoaded", iniciarAdminLocais);

// ============================================================
// NAVEGAÇÃO ENTRE ABAS (Estatísticas / Locais)
// ============================================================
function configurarAbas() {
  const botoesAba = document.querySelectorAll(".aba-nav");

  botoesAba.forEach((botao) => {
    botao.addEventListener("click", () => {
      botoesAba.forEach((b) => b.classList.remove("ativa"));
      botao.classList.add("ativa");

      document.querySelectorAll(".aba-conteudo").forEach((secao) => {
        secao.hidden = secao.id !== botao.dataset.aba;
      });
    });
  });
}

// ============================================================
// CARREGAR E LISTAR LOCAIS
// ============================================================
async function carregarLocais() {
  try {
    const snapshot = await getDocs(collection(db, NOME_COLECAO));
    poisCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderizarListaLocais();
  } catch (erro) {
    console.error("[admin-locais] Erro ao carregar locais:", erro);
  }
}

function renderizarListaLocais() {
  const container = document.getElementById("lista-locais-admin");
  container.innerHTML = "";

  const ordenados = [...poisCache].sort((a, b) => (a.nome || "").localeCompare(b.nome || ""));

  ordenados.forEach((poi) => {
    const card = document.createElement("div");
    card.className = "local-admin-card";

    const status = poi.statusOperacional || poi.status_operacional || "ativo";

    card.innerHTML = `
      <div class="local-admin-card__info">
        <strong>${poi.nome}</strong>
        <span>${poi.categoria || "—"}</span>
      </div>
      <span class="local-admin-card__status local-admin-card__status--${status}">${formatarStatus(status)}</span>
    `;

    card.addEventListener("click", () => abrirModal(poi));
    container.appendChild(card);
  });
}

function formatarStatus(status) {
  const mapa = {
    ativo: "Ativo",
    sazonal: "Sazonal",
    em_reforma: "Em reforma",
    fechado_temporariamente: "Fechado",
  };
  return mapa[status] || status;
}

// ============================================================
// MODAL DE CRIAÇÃO/EDIÇÃO
// ============================================================
function abrirModal(poi) {
  const modal = document.getElementById("modal-local");
  const titulo = document.getElementById("modal-local__titulo");
  const btnExcluir = document.getElementById("btn-excluir-local");
  const erroEl = document.getElementById("erro-form-local");

  erroEl.hidden = true;

  if (poi) {
    titulo.textContent = "Editar local";
    document.getElementById("campo-id").value = poi.id;
    document.getElementById("campo-nome").value = poi.nome || "";
    document.getElementById("campo-categoria").value = poi.categoria || "historico";
    document.getElementById("campo-descricao").value = poi.descricaoCurta || poi.descricao_curta || "";
    document.getElementById("campo-lat").value = poi.localizacao?.lat ?? poi.localizacao?.latitude ?? "";
    document.getElementById("campo-lng").value = poi.localizacao?.lng ?? poi.localizacao?.longitude ?? "";
    document.getElementById("campo-preco").value = poi.precoEstimado ?? poi.preco_estimado ?? 0;
    document.getElementById("campo-duracao").value = poi.duracaoMediaVisitaMin ?? poi.duracao_media_visita_min ?? 30;
    document.getElementById("campo-status").value = poi.statusOperacional || poi.status_operacional || "ativo";
    btnExcluir.hidden = false;
  } else {
    titulo.textContent = "Novo local";
    document.getElementById("form-local").reset();
    document.getElementById("campo-id").value = "";
    document.getElementById("campo-preco").value = 0;
    document.getElementById("campo-duracao").value = 30;
    btnExcluir.hidden = true;
  }

  modal.hidden = false;
}

function fecharModal() {
  document.getElementById("modal-local").hidden = true;
}

// ============================================================
// SALVAR (criar ou atualizar)
// ============================================================
async function salvarLocal(evento) {
  evento.preventDefault();

  const erroEl = document.getElementById("erro-form-local");
  erroEl.hidden = true;

  const id = document.getElementById("campo-id").value;
  const dados = {
    nome: document.getElementById("campo-nome").value.trim(),
    categoria: document.getElementById("campo-categoria").value,
    descricaoCurta: document.getElementById("campo-descricao").value.trim(),
    localizacao: {
      lat: Number(document.getElementById("campo-lat").value),
      lng: Number(document.getElementById("campo-lng").value),
    },
    precoEstimado: Number(document.getElementById("campo-preco").value),
    duracaoMediaVisitaMin: Number(document.getElementById("campo-duracao").value),
    statusOperacional: document.getElementById("campo-status").value,
  };

  if (!dados.nome) {
    erroEl.textContent = "O nome é obrigatório.";
    erroEl.hidden = false;
    return;
  }

  if (Number.isNaN(dados.localizacao.lat) || Number.isNaN(dados.localizacao.lng)) {
    erroEl.textContent = "Latitude e longitude precisam ser números válidos.";
    erroEl.hidden = false;
    return;
  }

  try {
    if (id) {
      await updateDoc(doc(db, NOME_COLECAO, id), dados);
    } else {
      await addDoc(collection(db, NOME_COLECAO), dados);
    }
    fecharModal();
    await carregarLocais();
  } catch (erro) {
    console.error("[admin-locais] Erro ao salvar local:", erro);
    erroEl.textContent = "Erro ao salvar. Tente de novo.";
    erroEl.hidden = false;
  }
}

// ============================================================
// EXCLUIR
// ============================================================
async function excluirLocalAtual() {
  const id = document.getElementById("campo-id").value;
  if (!id) return;

  const nome = document.getElementById("campo-nome").value;
  const confirmou = confirm(`Tem certeza que quer excluir "${nome}"? Essa ação não pode ser desfeita.`);
  if (!confirmou) return;

  try {
    await deleteDoc(doc(db, NOME_COLECAO, id));
    fecharModal();
    await carregarLocais();
  } catch (erro) {
    console.error("[admin-locais] Erro ao excluir local:", erro);
    alert("Erro ao excluir. Tente de novo.");
  }
}
