// api/_auth-admin.js
//
// Confere se quem chamou a API é um administrador do Linde Guia.
// (O prefixo "_" faz a Vercel NÃO publicar este arquivo como função.)
//
// Como funciona, sem depender de nenhuma chave nova:
//  1. O painel admin manda o ID token do Firebase em "Authorization: Bearer <token>".
//  2. Aqui lemos "usuarios_admin/{uid}" pela API REST do Firestore USANDO esse token.
//     O Firestore valida a assinatura do token e aplica as regras: só um
//     admin consegue ler esse documento (ver firestore.rules). Token falso,
//     expirado ou de usuário comum => 401/403.

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "linde-guia";

function uidDoToken(token) {
  try {
    const partes = token.split(".");
    if (partes.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(partes[1], "base64url").toString("utf8"));
    return typeof payload.user_id === "string" ? payload.user_id : payload.sub || null;
  } catch {
    return null;
  }
}

export async function exigirAdmin(req, res) {
  const cabecalho = req.headers.authorization || "";
  const token = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7).trim() : "";
  const uid = token ? uidDoToken(token) : null;

  if (!token || !uid || !/^[A-Za-z0-9]{6,128}$/.test(uid)) {
    res.status(401).json({ erro: "Login de administrador obrigatório" });
    return false;
  }

  try {
    const resposta = await fetch(
      `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/usuarios_admin/${uid}`,
      { headers: { authorization: `Bearer ${token}` } }
    );
    if (resposta.ok) return true;
    const status = resposta.status === 401 ? 401 : 403;
    res.status(status).json({ erro: "Acesso restrito a administradores" });
    return false;
  } catch (erro) {
    console.error("[auth-admin] Falha ao validar admin:", erro);
    res.status(502).json({ erro: "Não consegui validar o acesso agora" });
    return false;
  }
}
