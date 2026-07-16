/**
 * perfil.js
 * Linde Guia — Treze Tílias
 *
 * Lógica da tela "Meus selos" (pages/perfil.html). Lê os selos gravados
 * localmente por selos-local.js (não depende de Firestore nem de login —
 * ver comentário de arquitetura em selos-local.js).
 */
import { lerSelos } from "../core/selos-local.js";
import { lerFavoritos, removerFavorito } from "../core/favoritos-local.js";
import { lerRotasSalvas, removerRotaSalva } from "../core/rotas-manuais-local.js";
import { buscarTodosPois } from "../data/pois-data.js";
import { gerarCapituloDeFavoritos } from "../engine/motor-rota.js";

const ICONES_CATEGORIA = {
  gastronomia: "🥨",
  historico: "🏛️",
  natureza: "🌲",
  lazer: "🎡",
  compras: "🛍️",
  evento: "🎉",
};

function iniciarPerfil() {
  const selos = [...lerSelos()].sort(
    (a, b) => new Date(b.data).getTime() - new Date(a.data).getTime()
  );

  document.getElementById("contador-numero").textContent = String(selos.length);
  document.getElementById("contador-label").textContent =
    selos.length === 1 ? "selo coletado" : "selos coletados";

  const lista = document.getElementById("lista-selos");
  const estadoVazio = document.getElementById("estado-vazio");

  if (selos.length === 0) {
    estadoVazio.hidden = false;
  } else {
    selos.forEach((selo) => lista.appendChild(criarCardSelo(selo)));
  }

  renderizarFavoritos();
  renderizarRotasSalvas();
}

document.addEventListener("DOMContentLoaded", iniciarPerfil);

function criarCardSelo(selo) {
  const li = document.createElement("li");
  li.className = "card-selo";

  const icone = ICONES_CATEGORIA[selo.poiCategoria] || "📍";

  li.innerHTML = `
    <div class="card-selo__icone" aria-hidden="true">${icone}</div>
    <div class="card-selo__corpo">
      <p class="card-selo__nome">${escaparHtml(selo.poiNome)}</p>
      <p class="card-selo__data">${formatarData(selo.data)}</p>
    </div>
  `;
  return li;
}

function formatarData(isoString) {
  if (!isoString) return "";
  const data = new Date(isoString);
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function escaparHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto || "";
  return div.innerHTML;
}

// ============================================================
// FAVORITOS — "Lugares que quero conhecer"
// ============================================================
const ICONES_FAVORITO = {
  gastronomia: "🥨", historico: "🏛️", natureza: "🌲",
  lazer: "🎡", compras: "🛍️", cultura: "🎻",
};

function renderizarFavoritos() {
  const favoritos = lerFavoritos();
  const lista = document.getElementById("lista-favoritos");
  const estadoVazio = document.getElementById("estado-vazio-favoritos");
  const acoes = document.getElementById("favoritos-acoes");

  lista.innerHTML = "";

  if (favoritos.length === 0) {
    estadoVazio.hidden = false;
    acoes.hidden = true;
    return;
  }

  estadoVazio.hidden = true;
  acoes.hidden = false;

  favoritos.forEach((fav) => lista.appendChild(criarCardFavorito(fav)));

  document.getElementById("btn-comecar-tour").onclick = comecarTourDosFavoritos;
}

function criarCardFavorito(favorito) {
  const li = document.createElement("li");
  li.className = "card-selo"; // reaproveita o mesmo visual do card de selo

  const icone = ICONES_FAVORITO[favorito.poiCategoria] || "📍";

  li.innerHTML = `
    <div class="card-selo__icone" aria-hidden="true">${icone}</div>
    <div class="card-selo__corpo">
      <p class="card-selo__nome">${escaparHtml(favorito.poiNome)}</p>
      <a href="ponto.html?id=${favorito.poiId}" class="card-selo__data">Ver detalhes</a>
    </div>
    <button type="button" class="btn-remover-favorito" aria-label="Remover dos favoritos">✕</button>
  `;

  li.querySelector(".btn-remover-favorito").addEventListener("click", () => {
    removerFavorito(favorito.poiId);
    renderizarFavoritos();
  });

  return li;
}

// "Começar tour" — gera uma rota só com os locais favoritados, na ordem
// geográfica mais sensata a partir de onde a pessoa está agora. Reaproveita
// o mesmo formato de capítulo que o roteiro personalizado usa, então
// minha-rota.html já sabe mostrar isso sem nenhuma mudança.
async function comecarTourDosFavoritos() {
  const btn = document.getElementById("btn-comecar-tour");
  const erroEl = document.getElementById("erro-favoritos");
  erroEl.hidden = true;
  btn.disabled = true;
  btn.textContent = "Montando seu tour...";

  try {
    const favoritos = lerFavoritos();
    const idsFavoritos = favoritos.map((f) => f.poiId);

    const { posicaoAtual, horarioAtual } = await obterPosicaoEHorarioAtuais();

    const perfilBusca = {
      data: horarioAtual,
      horarioInicio: horarioAtual,
      localizacaoPartida: posicaoAtual || { lat: -27.0026, lng: -51.4084 }, // centro de Treze Tílias, fallback sem GPS
      interesses: [],
      refeicoesDesejadas: [],
      idsExcluidos: [],
    };

    const todosPois = await buscarTodosPois();
    const capitulo = gerarCapituloDeFavoritos(todosPois, perfilBusca, idsFavoritos);

    if (capitulo.vazio) {
      erroEl.textContent = "Nenhum dos seus favoritos está aberto agora. Tenta de novo em outro horário.";
      erroEl.hidden = false;
      return;
    }

    if (capitulo.idsDescartados && capitulo.idsDescartados.length > 0) {
      const n = capitulo.idsDescartados.length;
      sessionStorage.setItem(
        "linde-guia:aviso-proxima-tela",
        `${n} ${n === 1 ? "favorito não entrou" : "favoritos não entraram"} no tour (fechado agora ou removido). Seguimos com o resto.`
      );
    }

    sessionStorage.setItem("linde-guia:capitulo-atual", JSON.stringify(capitulo));
    window.location.href = "minha-rota.html";
  } catch (erro) {
    console.error("[perfil] Erro ao montar tour dos favoritos:", erro);
    erroEl.textContent = "Não conseguimos montar o tour agora. Tenta de novo em instante.";
    erroEl.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Começar tour";
  }
}

function obterPosicaoEHorarioAtuais() {
  const horarioAtual = new Date().toISOString();

  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ posicaoAtual: null, horarioAtual });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (posicao) => {
        resolve({
          posicaoAtual: { lat: posicao.coords.latitude, lng: posicao.coords.longitude },
          horarioAtual,
        });
      },
      () => resolve({ posicaoAtual: null, horarioAtual }),
      { timeout: 5000 }
    );
  });
}

// ============================================================
// ROTAS MANUAIS SALVAS — "Meus roteiros salvos"
// ============================================================
// Importante: o que foi salvo é só a ESCOLHA (lista de ids + horário
// planejado) — ver comentário de arquitetura em rotas-manuais-local.js.
// "Iniciar agora" sempre busca o dado atual do Firestore antes de montar o
// capítulo, nunca confia num snapshot antigo salvo no aparelho.
function renderizarRotasSalvas() {
  const rotas = lerRotasSalvas();
  const lista = document.getElementById("lista-rotas-salvas");
  const estadoVazio = document.getElementById("estado-vazio-rotas-salvas");

  lista.innerHTML = "";

  if (rotas.length === 0) {
    estadoVazio.hidden = false;
    return;
  }

  estadoVazio.hidden = true;
  rotas.forEach((rota) => lista.appendChild(criarCardRotaSalva(rota)));
}

function criarCardRotaSalva(rota) {
  const li = document.createElement("li");
  li.className = "card-selo";

  li.innerHTML = `
    <div class="card-selo__icone" aria-hidden="true">🗺️</div>
    <div class="card-selo__corpo">
      <p class="card-selo__nome">${escaparHtml(rota.nome)}</p>
      <p class="card-selo__data">${rota.poisIds.length} ${rota.poisIds.length === 1 ? "parada" : "paradas"} · planejado pra ${formatarDataHora(rota.dataHoraAgendada)}</p>
    </div>
    <button type="button" class="btn-iniciar-rota-salva">Iniciar agora</button>
    <button type="button" class="btn-remover-favorito" aria-label="Excluir roteiro salvo">✕</button>
  `;

  li.querySelector(".btn-iniciar-rota-salva").addEventListener("click", (evento) =>
    iniciarRotaSalva(rota, evento.currentTarget)
  );

  li.querySelector(".btn-remover-favorito").addEventListener("click", () => {
    removerRotaSalva(rota.id);
    renderizarRotasSalvas();
  });

  return li;
}

function formatarDataHora(isoString) {
  if (!isoString) return "";
  const data = new Date(isoString);
  return data.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

async function iniciarRotaSalva(rota, btn) {
  btn.disabled = true;
  btn.textContent = "Montando...";

  try {
    const { posicaoAtual, horarioAtual } = await obterPosicaoEHorarioAtuais();

    const perfilBusca = {
      data: horarioAtual,
      horarioInicio: horarioAtual,
      localizacaoPartida: posicaoAtual || { lat: -27.0026, lng: -51.4084 },
      interesses: [],
      refeicoesDesejadas: [],
      idsExcluidos: [],
    };

    const todosPois = await buscarTodosPois();
    const capitulo = gerarCapituloDeFavoritos(todosPois, perfilBusca, rota.poisIds);

    if (capitulo.vazio) {
      alert("Nenhum dos lugares desse roteiro está disponível agora. Os horários deles podem ter mudado desde que você salvou.");
      return;
    }

    if (capitulo.idsDescartados && capitulo.idsDescartados.length > 0) {
      const n = capitulo.idsDescartados.length;
      sessionStorage.setItem(
        "linde-guia:aviso-proxima-tela",
        `${n} ${n === 1 ? "parada não entrou" : "paradas não entraram"} nessa rota (fechado agora ou removido). Seguimos com o resto.`
      );
    }

    sessionStorage.setItem("linde-guia:capitulo-atual", JSON.stringify(capitulo));
    window.location.href = "minha-rota.html";
  } catch (erro) {
    console.error("[perfil] Erro ao iniciar rota salva:", erro);
    alert("Não conseguimos montar a rota agora. Tenta de novo em instante.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Iniciar agora";
  }
}
