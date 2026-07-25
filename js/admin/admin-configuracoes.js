/**
 * admin-configuracoes.js — js/admin/admin-configuracoes.js
 * Linde Guia — Treze Tílias
 *
 * Aba "Configurações" do admin — hoje só o número de WhatsApp de contato,
 * usado pelo botão flutuante (js/core/contato-whatsapp.js) e pelo banner
 * "Anuncie aqui" quando o destino for WhatsApp
 * (js/core/banner-patrocinado.js).
 */
import { buscarConfiguracoes, salvarConfiguracoes } from "../data/configuracoes-data.js";

function iniciarAdminConfiguracoes() {
  document.addEventListener("linde-guia:admin-autenticado", carregarConfiguracoes);
  document.getElementById("btn-salvar-configuracoes").addEventListener("click", salvarConfiguracoesDoFormulario);
}
document.addEventListener("DOMContentLoaded", iniciarAdminConfiguracoes);

async function carregarConfiguracoes() {
  try {
    const config = await buscarConfiguracoes();
    document.getElementById("campo-config-whatsapp").value = config.whatsappNumero || "";
  } catch (erro) {
    console.error("[admin-configuracoes] Erro ao carregar:", erro);
  }
}

async function salvarConfiguracoesDoFormulario() {
  const statusEl = document.getElementById("status-configuracoes");
  const numero = document.getElementById("campo-config-whatsapp").value.trim();

  statusEl.textContent = "Salvando...";
  statusEl.dataset.tipo = "";

  try {
    await salvarConfiguracoes({ whatsappNumero: numero });
    statusEl.textContent = "Salvo!";
    statusEl.dataset.tipo = "ok";
  } catch (erro) {
    console.error("[admin-configuracoes] Erro ao salvar:", erro);
    const detalhe = erro.code || erro.message || "erro desconhecido";
    statusEl.textContent = `Não consegui salvar (${detalhe}). Se disser "permission-denied", falta liberar a coleção "configuracoes" nas regras do Firestore.`;
    statusEl.dataset.tipo = "erro";
  }
}
