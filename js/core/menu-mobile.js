/**
 * menu-mobile.js — js/core/menu-mobile.js
 * Linde Guia — Treze Tílias
 *
 * Abre/fecha o painel de navegação no celular (ver CSS em
 * styles/responsivo.css, seção "MENU HAMBÚRGUER"). Script pequeno e
 * genérico — funciona em qualquer página que tenha:
 *   <button id="botao-menu-mobile" ...>
 *   <nav class="topo__nav" id="menu-nav-principal">
 *
 * Fecha automaticamente ao tocar num link do menu (senão o painel fica
 * aberto cobrindo a tela depois da pessoa já ter navegado) e ao tocar
 * fora dele.
 */
function iniciarMenuMobile() {
  const botao = document.getElementById("botao-menu-mobile");
  const nav = document.getElementById("menu-nav-principal");
  if (!botao || !nav) return; // página não tem esse menu — não faz nada

  function abrirMenu() {
    nav.classList.add("topo__nav--aberto");
    botao.setAttribute("aria-expanded", "true");
  }

  function fecharMenu() {
    nav.classList.remove("topo__nav--aberto");
    botao.setAttribute("aria-expanded", "false");
  }

  botao.addEventListener("click", () => {
    const estaAberto = nav.classList.contains("topo__nav--aberto");
    if (estaAberto) fecharMenu(); else abrirMenu();
  });

  // Fecha ao tocar num link — sem isso, o menu ficaria aberto por cima da
  // próxima página só até o navegador trocar de tela.
  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", fecharMenu);
  });

  // Fecha ao tocar fora do menu (no restante da página).
  document.addEventListener("click", (evento) => {
    const cliqueDentro = nav.contains(evento.target) || botao.contains(evento.target);
    if (!cliqueDentro) fecharMenu();
  });
}

document.addEventListener("DOMContentLoaded", iniciarMenuMobile);

