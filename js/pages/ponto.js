/**
 * ponto.js
 * Linde Guia — Treze Tílias
 *
 * Lógica da página de detalhe de um local (pages/ponto.html?id=...).
 * Lê o POI pelo id na URL e desenha: horário (com "aberto agora" calculado
 * na hora), endereço + botão pro Google Maps, sobre, Instagram e WhatsApp
 * (se o local tiver), e o botão de favoritar.
 */
import { buscarPoiPorId } from "../data/pois-data.js";
import { alternarFavorito, ehFavorito } from "../core/favoritos-local.js";

const NOMES_DIAS = {
  domingo: "Domingo", segunda: "Segunda", terca: "Terça", quarta: "Quarta",
  quinta: "Quinta", sexta: "Sexta", sabado: "Sábado",
};
const ORDEM_DIAS = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];

const CATEGORIAS_LABEL = {
  gastronomia: "Gastronomia", historico: "História", natureza: "Natureza",
  compras: "Compras", lazer: "Lazer", cultura: "Cultura",
};

async function iniciarPagina() {
  const id = new URLSearchParams(window.location.search).get("id");

  if (!id) {
    mostrarNaoEncontrado();
    return;
  }

  const poi = await buscarPoiPorId(id);

  if (!poi) {
    mostrarNaoEncontrado();
    return;
  }

  desenharLocal(poi);
}

document.addEventListener("DOMContentLoaded", iniciarPagina);

function mostrarNaoEncontrado() {
  document.getElementById("estado-carregando").hidden = true;
  document.getElementById("estado-nao-encontrado").hidden = false;
}

function desenharLocal(poi) {
  document.title = `${poi.nome} — Linde Guia`;
  document.getElementById("estado-carregando").hidden = true;
  document.getElementById("conteudo-local").hidden = false;

  document.getElementById("local-tag").textContent = CATEGORIAS_LABEL[poi.categoria] || poi.categoria || "";
  document.getElementById("local-nome").textContent = poi.nome;
  document.getElementById("local-sobre").textContent =
    poi.descricaoLonga || poi.descricaoCurta || "Sem descrição cadastrada ainda.";
  document.getElementById("local-endereco").textContent = poi.endereco || "Endereço não cadastrado ainda.";

  desenharStatusAgora(poi);
  desenharHorarios(poi);
  desenharBotaoMapa(poi);
  desenharContato(poi);
  desenharBotaoFavoritar(poi);
}

// ============================================================
// "ABERTO AGORA" — mesma lógica de estaAbertoNoHorario em motor-rota.js,
// mas calculada aqui pra exibição (essa página não fala com o motor).
// ============================================================
function desenharStatusAgora(poi) {
  const el = document.getElementById("status-agora");
  const textoEl = document.getElementById("status-agora-texto");

  if (poi.statusOperacional === "em_reforma") {
    el.dataset.aberto = "false";
    textoEl.textContent = "Em reforma";
    return;
  }
  if (poi.statusOperacional === "fechado_temporariamente") {
    el.dataset.aberto = "false";
    textoEl.textContent = "Fechado temporariamente";
    return;
  }

  const aberto = estaAbertoAgora(poi.horarioFuncionamento);
  el.dataset.aberto = String(aberto);
  textoEl.textContent = aberto ? "Aberto agora" : "Fechado agora";
}

function estaAbertoAgora(horarioFuncionamento) {
  if (!horarioFuncionamento) return true; // sem dado cadastrado, não afirma que está fechado

  const agora = new Date();
  const dia = ORDEM_DIAS[agora.getDay()];
  const janela = horarioFuncionamento[dia];
  if (!janela || janela.fechado) return false;

  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  const [abreH, abreM] = (janela.abre || "00:00").split(":").map(Number);
  const [fechaH, fechaM] = (janela.fecha || "23:59").split(":").map(Number);
  return minutosAgora >= abreH * 60 + abreM && minutosAgora <= fechaH * 60 + fechaM;
}

function desenharHorarios(poi) {
  const container = document.getElementById("lista-horarios");
  container.innerHTML = "";

  if (!poi.horarioFuncionamento) {
    container.innerHTML = `<p style="color:var(--tinta-suave); font-size:0.875rem;">Horário não cadastrado ainda.</p>`;
    return;
  }

  const hoje = ORDEM_DIAS[new Date().getDay()];

  ORDEM_DIAS.forEach((dia) => {
    const janela = poi.horarioFuncionamento[dia];
    const linha = document.createElement("div");
    linha.className = "linha-horario" + (dia === hoje ? " linha-horario--hoje" : "");
    const texto = !janela || janela.fechado ? "Fechado" : `${janela.abre} – ${janela.fecha}`;
    linha.innerHTML = `<span class="linha-horario__dia">${NOMES_DIAS[dia]}</span><span>${texto}</span>`;
    container.appendChild(linha);
  });
}

function desenharBotaoMapa(poi) {
  const btn = document.getElementById("btn-como-chegar");
  if (!poi.localizacao) {
    btn.style.display = "none";
    return;
  }
  btn.href = `https://www.google.com/maps/dir/?api=1&destination=${poi.localizacao.lat},${poi.localizacao.lng}&travelmode=walking`;
}

// ============================================================
// CONTATO — WhatsApp com mensagem pronta ("vim pelo aplicativo") e
// Instagram. IMPORTANTE: o Instagram não tem um link público que já abra
// o chat com uma mensagem preenchida (diferente do WhatsApp, que tem esse
// recurso oficial via wa.me) — o botão de Instagram abre o perfil, não uma
// mensagem automática.
// ============================================================
function desenharContato(poi) {
  const secao = document.getElementById("secao-contato");
  const btnWhats = document.getElementById("btn-whatsapp");
  const btnInsta = document.getElementById("btn-instagram");

  let temAlgum = false;

  if (poi.whatsapp) {
    const numero = poi.whatsapp.replace(/\D/g, "");
    const numeroComPais = numero.startsWith("55") ? numero : `55${numero}`;
    const mensagem = encodeURIComponent(`Olá! Vim pelo aplicativo Linde Guia e queria saber mais sobre o ${poi.nome}.`);
    btnWhats.href = `https://wa.me/${numeroComPais}?text=${mensagem}`;
    btnWhats.hidden = false;
    temAlgum = true;
  }

  if (poi.instagram) {
    const usuario = poi.instagram.replace(/^@/, "").trim();
    btnInsta.href = `https://instagram.com/${usuario}`;
    btnInsta.hidden = false;
    temAlgum = true;
  }

  secao.hidden = !temAlgum;
}

// ============================================================
// FAVORITAR
// ============================================================
function desenharBotaoFavoritar(poi) {
  const btn = document.getElementById("btn-favoritar");
  atualizarVisualFavorito(btn, ehFavorito(poi.id));

  btn.addEventListener("click", () => {
    const agoraEhFavorito = alternarFavorito(poi);
    atualizarVisualFavorito(btn, agoraEhFavorito);
  });
}

function atualizarVisualFavorito(btn, favoritado) {
  btn.dataset.favorito = String(favoritado);
  btn.textContent = favoritado ? "♥" : "♡";
  btn.setAttribute("aria-label", favoritado ? "Remover dos salvos" : "Salvar para conhecer depois");
}
