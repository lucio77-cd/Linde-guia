/**
 * contato-whatsapp.js — js/core/contato-whatsapp.js
 * Linde Guia — Treze Tílias
 *
 * Botão flutuante de contato via WhatsApp. O número é configurado no
 * admin (aba "Configurações", salvo em configuracoes-data.js) — nunca
 * fica hardcoded no código, pra poder trocar sem precisar mexer em
 * arquivo nenhum.
 *
 * HTML esperado na página:
 *   <a id="botao-whatsapp-flutuante" class="botao-whatsapp-flutuante"
 *      href="#" target="_blank" rel="noopener" hidden aria-label="Falar no WhatsApp">
 *     <svg>...</svg>
 *   </a>
 *
 * Se não houver número configurado, o botão continua oculto — nunca
 * mostra um link quebrado.
 */
import { buscarConfiguracoes } from "../data/configuracoes-data.js";

async function iniciarContatoWhatsapp(mensagemPadrao = "Olá! Vim pelo Linde Guia.") {
  const botao = document.getElementById("botao-whatsapp-flutuante");
  if (!botao) return;

  let config;
  try {
    config = await buscarConfiguracoes();
  } catch (erro) {
    console.warn("[contato-whatsapp] Não consegui carregar configurações:", erro);
    return;
  }

  if (!config.whatsappNumero) return; // mantém hidden — sem número configurado ainda

  const texto = encodeURIComponent(mensagemPadrao);
  botao.href = `https://wa.me/55${config.whatsappNumero}?text=${texto}`;
  botao.hidden = false;
}

export { iniciarContatoWhatsapp };

