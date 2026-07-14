/**
 * admin-locais.js — js/admin/admin-locais.js
 * CRUD de POIs + filtro por categoria + dias de funcionamento
 */
import {
  buscarTodosPois, criarPoi, atualizarPoi, removerPoi,
} from "../data/pois-data.js";

let poisCache = [];
let categoriaAtiva = "todos";

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

function iniciarAdminLocais() {
  document.addEventListener("linde-guia:admin-autenticado", carregarLocais);
  configurarAbas();
  configurarFiltros();
  montarLinhasHorarioSemana();
  configurarAtalhosHorario();
  configurarPrioridadeCondicional();
  configurarBuscaEndereco();

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
// Monta as 7 linhas uma única vez (na inicialização da página, não a cada
// abertura do modal) — abrirModal() só preenche os valores.
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
    `;
    const checkbox = linha.querySelector(".dia-linha__aberto");
    const inputAbre = linha.querySelector(".dia-linha__abre");
    const inputFecha = linha.querySelector(".dia-linha__fecha");

    checkbox.addEventListener("change", () => {
      const aberto = checkbox.checked;
      inputAbre.disabled = !aberto;
      inputFecha.disabled = !aberto;
      linha.classList.toggle("dia-linha--fechado", !aberto);
    });

    container.appendChild(linha);
  });
}

// Lê as 7 linhas do formulário e monta o objeto que motor-rota.js espera:
// { segunda: {abre, fecha, fechado}, terca: {...}, ... } — sempre com as
// 7 chaves presentes (mesmo os dias fechados), pra facilitar reabrir e
// editar depois sem perder o horário que já estava configurado ali.
function lerHorarioSemanaDoFormulario() {
  const horario = {};
  document.querySelectorAll(".dia-linha").forEach((linha) => {
    const dia = linha.dataset.dia;
    const aberto = linha.querySelector(".dia-linha__aberto").checked;
    horario[dia] = {
      abre: linha.querySelector(".dia-linha__abre").value || "08:00",
      fecha: linha.querySelector(".dia-linha__fecha").value || "18:00",
      fechado: !aberto,
    };
  });
  return horario;
}

// Preenche as 7 linhas a partir do horarioFuncionamento salvo no Firestore.
// Dia ausente no dado salvo = tratado como fechado (mesma regra que
// motor-rota.js usa: `if (!janela || janela.fechado) return false`).
function preencherHorarioSemanaNoFormulario(horarioFuncionamento) {
  const dados = horarioFuncionamento || {};
  document.querySelectorAll(".dia-linha").forEach((linha) => {
    const dia = linha.dataset.dia;
    const janela = dados[dia];
    const aberto = !!janela && !janela.fechado;

    const checkbox = linha.querySelector(".dia-linha__aberto");
    const inputAbre = linha.querySelector(".dia-linha__abre");
    const inputFecha = linha.querySelector(".dia-linha__fecha");

    checkbox.checked = aberto;
    inputAbre.value = janela?.abre || "08:00";
    inputFecha.value = janela?.fecha || "18:00";
    inputAbre.disabled = !aberto;
    inputFecha.disabled = !aberto;
    linha.classList.toggle("dia-linha--fechado", !aberto);
  });
}

// Atalhos de preenchimento rápido — o caso mais comum é "segunda a sexta
// igual, fim de semana diferente", então copiar em vez de digitar 7 vezes.
function configurarAtalhosHorario() {
  document.getElementById("btn-copiar-semana").addEventListener("click", () => {
    const segunda = document.querySelector('.dia-linha[data-dia="segunda"]');
    const abre = segunda.querySelector(".dia-linha__abre").value;
    const fecha = segunda.querySelector(".dia-linha__fecha").value;
    ["terca", "quarta", "quinta", "sexta"].forEach((dia) => {
      const linha = document.querySelector(`.dia-linha[data-dia="${dia}"]`);
      linha.querySelector(".dia-linha__aberto").checked = true;
      linha.querySelector(".dia-linha__abre").value = abre;
      linha.querySelector(".dia-linha__abre").disabled = false;
      linha.querySelector(".dia-linha__fecha").value = fecha;
      linha.querySelector(".dia-linha__fecha").disabled = false;
      linha.classList.remove("dia-linha--fechado");
    });
  });

  document.getElementById("btn-copiar-fds").addEventListener("click", () => {
    const sabado = document.querySelector('.dia-linha[data-dia="sabado"]');
    const domingo = document.querySelector('.dia-linha[data-dia="domingo"]');
    domingo.querySelector(".dia-linha__aberto").checked = sabado.querySelector(".dia-linha__aberto").checked;
    domingo.querySelector(".dia-linha__abre").value = sabado.querySelector(".dia-linha__abre").value;
    domingo.querySelector(".dia-linha__fecha").value = sabado.querySelector(".dia-linha__fecha").value;
    domingo.querySelector(".dia-linha__abre").disabled = !sabado.querySelector(".dia-linha__aberto").checked;
    domingo.querySelector(".dia-linha__fecha").disabled = !sabado.querySelector(".dia-linha__aberto").checked;
    domingo.classList.toggle("dia-linha--fechado", !sabado.querySelector(".dia-linha__aberto").checked);
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
// BUSCA DE ENDEREÇO — preenche lat/lng automaticamente (Nominatim/OSM,
// mesmo serviço já usado em formulario-roteiro.js pro turista)
// ============================================================
function configurarBuscaEndereco() {
  const botao = document.getElementById("btn-buscar-endereco");
  const input = document.getElementById("campo-endereco");
  const statusEl = document.getElementById("endereco-status");

  botao.addEventListener("click", async () => {
    const texto = input.value.trim();
    if (!texto) {
      statusEl.textContent = "Digita um endereço primeiro.";
      return;
    }

    statusEl.textContent = "Buscando...";

    try {
      const url = `https://nominatim.openstreetmap.org/search?` + new URLSearchParams({
        q: `${texto}, Treze Tílias, SC, Brasil`,
        format: "json", limit: "1", countrycodes: "br",
      });
      const resposta = await fetch(url, {
        headers: { "Accept-Language": "pt-BR", "User-Agent": "LindeGuia/1.0 (admin)" },
      });
      const dados = await resposta.json();

      if (dados.length === 0) {
        statusEl.textContent = "Não encontrei esse endereço — confere a latitude/longitude na mão.";
        return;
      }

      document.getElementById("campo-lat").value = dados[0].lat;
      document.getElementById("campo-lng").value = dados[0].lon;
      statusEl.textContent = "Encontrado! Latitude e longitude preenchidas.";
    } catch (erro) {
      console.error("[admin-locais] Erro ao buscar endereço:", erro);
      statusEl.textContent = "Erro ao buscar — confere a latitude/longitude na mão.";
    }
  });
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
      </div>
    `;
    card.addEventListener("click", () => abrirModal(poi));
    container.appendChild(card);
  });
}

function formatarStatus(s) {
  return { ativo:"Ativo", sazonal:"Sazonal", em_reforma:"Em reforma", fechado_temporariamente:"Fechado" }[s] || s;
}

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

    // Horário — poi.horarioFuncionamento vem no formato
    // { segunda: {abre,fecha,fechado}, terca: {...}, ... }, com cada dia
    // podendo ter um horário diferente (ex: sábado/domingo abrindo mais cedo).
    preencherHorarioSemanaNoFormulario(poi.horarioFuncionamento);
    preencherRefeicoesServidasNoFormulario(poi.refeicoesServidas || []);
    preencherTagsDeInteresseNoFormulario(poi.tagsDeInteresse || []);

    // Prioridade gastronômica + refeições servidas
    grupoPrio.hidden = poi.categoria !== "gastronomia";
    grupoRefeicoesEl.hidden = poi.categoria !== "gastronomia";
    document.getElementById("campo-prioridade-gastronomica").value = poi.prioridadeGastronomica ?? 0;

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
