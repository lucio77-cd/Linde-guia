/**
 * admin-auth.js
 * Linde Guia — Painel administrativo
 *
 * Proteção por senha simples (sem Firebase Auth). Suficiente para esta
 * fase, em que os dados não são ultra-sensíveis e o objetivo é só evitar
 * acesso casual ao link.
 *
 * IMPORTANTE: esta senha fica visível para qualquer pessoa que olhe o
 * código-fonte da página (já que é tudo client-side, sem servidor).
 * TROQUE o valor abaixo antes de subir para produção.
 */

const SENHA_ADMIN = "281223";
const CHAVE_SESSAO = "linde-guia:linden";

function iniciarAuth() {
  // Se já autenticou nesta sessão do navegador, pula a tela de senha
  if (sessionStorage.getItem(CHAVE_SESSAO) === "true") {
    liberarAcesso();
    return;
  }

  const form = document.getElementById("form-senha");
  const inputSenha = document.getElementById("input-senha");
  const erroEl = document.getElementById("erro-senha");

  form.addEventListener("submit", (evento) => {
    evento.preventDefault();

    if (inputSenha.value === SENHA_ADMIN) {
      sessionStorage.setItem(CHAVE_SESSAO, "true");
      liberarAcesso();
    } else {
      erroEl.hidden = false;
      inputSenha.value = "";
      inputSenha.focus();
    }
  });
}

function liberarAcesso() {
  document.getElementById("tela-senha").hidden = true;
  document.getElementById("conteudo-admin").hidden = false;
  document.dispatchEvent(new CustomEvent("linde-guia:admin-autenticado"));
}

document.addEventListener("DOMContentLoaded", iniciarAuth);
