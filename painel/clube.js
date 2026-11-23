// ---------- clube de tiro: estoque de munição, saídas pelo celular, atiradores, acervo e relatório (23/11/2026) ----------
const CLUBE_API = "https://qlgumtqedhlkkgpoydvs.supabase.co/functions/v1/clube-api";
let CLB = { lista: null, podeCriar: false, clubeId: guardar.get("cac_clube") || "", dados: null, carregando: false, erro: "", aba: "saida", msg: "", falha: "",
  saida: { passo: "ler", codigo: "", produto: null, lotes: [], lote: "", caixas: 1, atiradorId: "", atiradorNome: "", busca: "", ultimo: null, enviando: false, novoProd: null },
  rel: { de: "", ate: "", dados: null, gerando: false }, form: null };
async function clbApi(acao, extra = {}) {
  const token = guardar.get("cac_token");
  let r;
  try { r = await fetch(CLUBE_API, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) }, body: JSON.stringify({ acao, ...extra }) }); }
  catch { return { ok: false, erro: "Sem conexão com a internet." }; }
  return r.json().catch(() => ({ ok: false, erro: "Falha de conexão." }));
}
async function clbListar() {
  const r = await clbApi("clubes");
  if (r && r.ok) { CLB.lista = r.clubes || []; CLB.podeCriar = !!r.pode_criar; if (!CLB.lista.some((c) => c.id === CLB.clubeId)) CLB.clubeId = CLB.lista.length ? CLB.lista[0].id : ""; }
  else CLB.lista = CLB.lista || [];
  if (tela === "conta" || tela === "clube") render();
}
async function clbCarregar() {
  if (!CLB.clubeId) return;
  CLB.carregando = true; const r = await clbApi("clube_painel", { clube_id: CLB.clubeId }); CLB.carregando = false;
  if (r && r.ok) { CLB.dados = r; CLB.erro = ""; } else CLB.erro = (r && r.erro) || "Não foi possível carregar agora.";
  if (tela === "clube") render();
}
document.addEventListener("click", (e) => { if (e.target && e.target.closest && e.target.closest("#bt-clube")) irPara("clube", ""); });
const clbProd = (id) => ((CLB.dados && CLB.dados.produtos) || []).find((p) => p.id === id);
const clbHora = (iso) => { const d = new Date(iso); return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); };

// leitor de código de barras pela câmera (BarcodeDetector) ou por leitor físico/teclado
let CLB_CAM = null;
async function clbCamera(alvo, aoLer) {
  clbCameraParar();
  if (!("BarcodeDetector" in window)) { CLB.falha = "Este navegador não lê código pela câmera. Use um leitor de código (ele digita no campo) ou digite os números."; render(); return; }
  try {
    const det = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "itf", "qr_code", "data_matrix"] });
    const st = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
    const v = document.createElement("video"); v.setAttribute("playsinline", ""); v.muted = true; v.srcObject = st;
    v.style.cssText = "width:100%;max-height:300px;object-fit:cover;border-radius:12px;background:#000";
    alvo.innerHTML = ""; alvo.appendChild(v); await v.play();
    CLB_CAM = { st, ativo: true };
    const passo = async () => {
      if (!CLB_CAM || !CLB_CAM.ativo) return;
      try { const r = await det.detect(v); if (r && r.length && r[0].rawValue) { const val = r[0].rawValue; clbCameraParar(); if (navigator.vibrate) navigator.vibrate(80); aoLer(val); return; } } catch (e) {}
      setTimeout(passo, 250);
    };
    passo();
  } catch (e) { CLB.falha = "Não consegui abrir a câmera. Libere a câmera para o site ou digite o código."; clbCameraParar(); render(); }
}
function clbCameraParar() { if (CLB_CAM) { CLB_CAM.ativo = false; try { CLB_CAM.st.getTracks().forEach((t) => t.stop()); } catch (e) {} } CLB_CAM = null; }

async function clbLerCodigo(cod) {
  const S = CLB.saida; cod = String(cod || "").trim(); if (!cod) return;
  S.codigo = cod; CLB.falha = ""; CLB.msg = "";
  const r = await clbApi("clube_codigo", { clube_id: CLB.clubeId, codigo_barras: cod });
  if (!r.ok) { CLB.falha = r.erro || "Não consegui consultar."; render(); return; }
  if (!r.produto) { S.novoProd = { codigo: r.codigo || cod, descricao: "", calibre: "", un: 50 }; S.passo = "novo"; render(); return; }
  S.produto = r.produto; S.lotes = r.lotes || []; S.lote = S.lotes.length === 1 ? S.lotes[0].lote : ""; S.caixas = 1; S.passo = CLB.aba === "entrada" ? "entrada" : "dados"; render();
}

function clbSaidaHtml() {
  const S = CLB.saida, D2 = CLB.dados;
  if (S.passo === "ok" && S.ultimo) {
    const u = S.ultimo;
    return `<div class="card" style="text-align:center"><div style="font-size:42px;color:var(--verde)">✓</div><h3 style="margin:4px 0">${u.tipo === "entrada" ? "Entrada registrada" : "Saída registrada"}</h3>
      <p class="pequeno">${esc(u.prod)} · lote ${esc(u.lote)} · ${u.caixas} caixa(s)${u.atirador ? " · " + esc(u.atirador) : ""}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:12px"><button class="btn" id="cl-proxima">Próxima leitura</button><button class="btn sec" id="cl-desfazer">Desfazer</button></div>
      <p class="pequeno" style="margin-top:8px">Dá para desfazer nos primeiros 5 minutos.</p></div>`;
  }
  if (S.passo === "novo") {
    const n = S.novoProd;
    return `<div class="card"><div class="rotulo">Código novo: ${esc(n.codigo)}</div><p class="pequeno">Essa munição ainda não está cadastrada no clube. Cadastre uma vez e as próximas leituras já reconhecem.</p>
      <div style="display:grid;gap:10px;margin-top:10px">
        <label>Descrição<input id="cl-np-desc" maxlength="120" placeholder="Ex.: 9mm Luger 124gr ETPP" value="${esc(n.descricao)}"></label>
        <label>Calibre<input id="cl-np-cal" maxlength="40" placeholder="Ex.: 9mm" value="${esc(n.calibre)}"></label>
        <label>Cartuchos por caixa<input id="cl-np-un" inputmode="numeric" value="${esc(n.un)}"></label>
        ${CLB.falha ? `<div class="aviso critico"><span class="pequeno">${esc(CLB.falha)}</span></div>` : ""}
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="cl-np-ok">Cadastrar e continuar</button><button class="btn sec" id="cl-cancela">Cancelar</button></div></div></div>`;
  }
  if (S.passo === "dados" || S.passo === "entrada") {
    const p = S.produto, ent = S.passo === "entrada";
    const ats = (D2.atiradores || []).filter((a) => a.ativo !== false);
    const q = S.busca.trim().toLowerCase();
    const sug = q.length >= 2 ? ats.filter((a) => a.nome.toLowerCase().includes(q)).slice(0, 6) : [];
    return `<div class="card"><div class="rotulo" style="color:var(--verde)">Munição identificada</div><h3 style="margin:4px 0">${esc(p.descricao)}</h3><div class="pequeno">Código ${esc(p.codigo_barras)} · caixa com ${p.unidades_caixa}</div></div>
      <div class="card" style="margin-top:12px;display:grid;gap:12px">
        <label>Lote${S.lotes.length ? ` <span class="pequeno">(em estoque: ${S.lotes.map((l) => esc(l.lote) + " = " + l.caixas).join(", ")})</span>` : ""}
          <div style="display:flex;gap:8px"><input id="cl-lote" maxlength="60" autocapitalize="characters" value="${esc(S.lote)}" style="flex:1"><button class="btn sec" id="cl-lote-cam" type="button" aria-label="Ler lote pela câmera">Câmera</button></div></label>
        <div id="cl-cam-lote"></div>
        <div><div class="pequeno">Quantidade de caixas</div><div style="display:flex;align-items:center;gap:12px;margin-top:6px"><button class="btn sec" id="cl-menos" aria-label="Diminuir" style="min-width:56px;font-size:22px">−</button><input id="cl-cx" inputmode="numeric" value="${S.caixas}" style="text-align:center;font-size:24px;font-weight:700;max-width:110px"><button class="btn sec" id="cl-mais" aria-label="Aumentar" style="min-width:56px;font-size:22px">+</button></div>
          <div class="pequeno" style="margin-top:4px">${(S.caixas || 0) * p.unidades_caixa} cartuchos</div></div>
        ${ent ? "" : `<label>Atirador<input id="cl-at" maxlength="120" placeholder="Digite o nome" value="${esc(S.atiradorId ? S.atiradorNome : S.busca)}" autocomplete="off"></label>
        ${S.atiradorId ? `<div class="pequeno">Selecionado: <b>${esc(S.atiradorNome)}</b> · <a href="#" id="cl-at-limpa">trocar</a></div>` : sug.length ? `<div class="lista">${sug.map((a) => `<button class="linha caca-doc" data-at="${a.id}" style="text-align:left;width:100%"><div class="t">${esc(a.nome)}</div>${a.assinante_id ? '<div class="pequeno">assinante do Ática</div>' : ""}</button>`).join("")}</div>` : q.length >= 3 ? '<div class="pequeno">Não achou? Ao registrar, o nome digitado vira um atirador novo do clube.</div>' : ""}`}
        ${CLB.falha ? `<div class="aviso critico"><span class="pequeno">${esc(CLB.falha)}</span></div>` : ""}
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="cl-registrar"${S.enviando ? " disabled" : ""}>${S.enviando ? "Registrando…" : ent ? "Registrar entrada" : "Registrar saída"}</button><button class="btn sec" id="cl-cancela">Cancelar</button></div>
      </div>`;
  }
  return `<div class="card"><div class="rotulo">${CLB.aba === "entrada" ? "Entrada de estoque" : "Saída de munição"}</div>
    <p class="pequeno" style="margin:6px 0 10px">Leia o código de barras da caixa pela câmera ou com o leitor, ou digite os números.</p>
    <div id="cl-cam"></div>
    <div style="display:flex;gap:8px;margin-top:10px"><input id="cl-codigo" inputmode="numeric" placeholder="Código de barras" style="flex:1" autocomplete="off"><button class="btn sec" id="cl-buscar">OK</button></div>
    <button class="btn" id="cl-abrir-cam" style="margin-top:10px;width:100%">Abrir câmera</button>
    ${CLB.falha ? `<div class="aviso critico" style="margin-top:10px"><span class="pequeno">${esc(CLB.falha)}</span></div>` : ""}</div>`;
}

function clbEstoqueHtml() {
  const D2 = CLB.dados, sal = (D2.saldos || []).filter((s) => s.caixas !== 0);
  return `<div class="card"><div class="caca-topo"><div class="rotulo">Estoque por lote</div><button class="btn sec" id="cl-ir-entrada" style="min-height:36px;padding:6px 12px">+ Entrada</button></div>
    ${sal.length ? `<div style="overflow-x:auto;margin-top:8px"><table style="width:100%;border-collapse:collapse;min-width:520px"><thead><tr><th style="text-align:left">Munição</th><th style="text-align:left">Lote</th><th style="text-align:right">Caixas</th><th style="text-align:right">Cartuchos</th></tr></thead><tbody>${sal.sort((a, b) => ((clbProd(a.produto_id) || {}).descricao || "") > ((clbProd(b.produto_id) || {}).descricao || "") ? 1 : -1).map((s) => { const p = clbProd(s.produto_id) || { descricao: "?", unidades_caixa: 0 }; return `<tr><td>${esc(p.descricao)}</td><td>${esc(s.lote)}</td><td style="text-align:right;font-weight:600${s.caixas < 0 ? ";color:var(--vermelho)" : s.caixas <= 3 ? ";color:var(--amarelo)" : ""}">${s.caixas}</td><td style="text-align:right">${s.caixas * p.unidades_caixa}</td></tr>`; }).join("")}</tbody></table></div>` : '<div class="vazio" style="margin-top:8px">Nada em estoque ainda. Lance a primeira entrada lendo o código das caixas.</div>'}</div>
    <div class="card" style="margin-top:14px"><div class="rotulo">Últimos registros</div>
    ${(D2.ultimas || []).length ? `<div class="lista" style="margin-top:8px">${D2.ultimas.slice(0, 40).map((u) => { const p = clbProd(u.produto_id) || { descricao: "?" }; return `<div class="linha caca-doc"${u.cancelado_em ? ' style="opacity:.5"' : ""}><div class="caca-topo"><div><div class="t">${u.tipo === "entrada" ? "Entrada" : esc(u.atirador_nome || "Saída")}</div><div class="pequeno">${esc(p.descricao)} · lote ${esc(u.lote)} · ${u.caixas} cx${u.operador ? " · por " + esc(u.operador.split(" ")[0]) : ""}${u.cancelado_em ? " · desfeito" : ""}</div></div><span class="etiqueta ${u.tipo === "entrada" ? "ok" : ""}" style="white-space:nowrap">${clbHora(u.criado_em)}</span></div>${!u.cancelado_em && D2.papel === "gestor" ? `<button class="btn sec" data-desf="${u.id}" style="min-height:32px;padding:4px 10px;margin-top:6px">Desfazer</button>` : ""}</div>`; }).join("")}</div>` : '<div class="vazio" style="margin-top:8px">Nenhum registro ainda.</div>'}</div>`;
}

function clbAtiradoresHtml() {
  const D2 = CLB.dados, f = CLB.form && CLB.form.tipo === "atirador" ? CLB.form : null;
  return `<div class="card"><div class="caca-topo"><div class="rotulo">Atiradores do clube (${(D2.atiradores || []).length})</div><div style="display:flex;gap:6px;flex-wrap:wrap">${D2.papel === "gestor" ? '<button class="btn sec" id="cl-importar" style="min-height:36px;padding:6px 12px">Puxar do Ática</button>' : ""}<button class="btn sec" id="cl-novo-at" style="min-height:36px;padding:6px 12px">+ Atirador</button></div></div>
    <p class="pequeno" style="margin:6px 0 0">"Puxar do Ática" traz os assinantes que informaram este clube na ficha.</p>
    ${f ? `<div style="display:grid;gap:10px;margin-top:10px"><label>Nome<input id="cl-f-nome" maxlength="120" value="${esc(f.nome || "")}"></label><label>WhatsApp (opcional)<input id="cl-f-wpp" inputmode="tel" value="${esc(f.whatsapp || "")}"></label><div style="display:flex;gap:8px"><button class="btn" id="cl-f-ok">Salvar</button><button class="btn sec" id="cl-f-x">Cancelar</button></div></div>` : ""}
    ${(D2.atiradores || []).length ? `<div class="lista" style="margin-top:10px">${D2.atiradores.map((a) => `<div class="linha caca-doc"><div class="caca-topo"><div><div class="t">${esc(a.nome)}</div><div class="pequeno">${a.assinante_id ? "assinante do Ática" : "cadastrado no clube"}${a.ativo === false ? " · inativo" : ""}</div></div><button class="btn sec" data-ed-at="${a.id}" style="min-height:32px;padding:4px 10px">Editar</button></div></div>`).join("")}</div>` : '<div class="vazio" style="margin-top:10px">Nenhum atirador ainda.</div>'}</div>`;
}

function clbAcervoHtml() {
  const D2 = CLB.dados, f = CLB.form && CLB.form.tipo === "arma" ? CLB.form : null, g = D2.papel === "gestor";
  const dias = (d) => d ? Math.round((new Date(d + "T12:00:00") - new Date()) / 864e5) : null;
  return `<div class="card"><div class="caca-topo"><div class="rotulo">Acervo do clube (${(D2.armas || []).length})</div>${g ? '<button class="btn sec" id="cl-nova-arma" style="min-height:36px;padding:6px 12px">+ Arma</button>' : ""}</div>
    ${f ? `<div style="display:grid;gap:10px;margin-top:10px"><label>Descrição<input id="cl-a-desc" maxlength="120" placeholder="Ex.: Pistola Taurus G2C" value="${esc(f.descricao || "")}"></label><label>Calibre<input id="cl-a-cal" maxlength="40" value="${esc(f.calibre || "")}"></label><label>Número de série<input id="cl-a-serie" maxlength="60" value="${esc(f.numero_serie || "")}"></label><label>Validade do CRAF<input id="cl-a-craf" type="date" value="${esc(f.craf_validade || "")}"></label><label>Observação<input id="cl-a-obs" maxlength="200" value="${esc(f.observacao || "")}"></label><div style="display:flex;gap:8px"><button class="btn" id="cl-a-ok">Salvar</button><button class="btn sec" id="cl-f-x">Cancelar</button></div></div>` : ""}
    ${(D2.armas || []).length ? `<div class="lista" style="margin-top:10px">${D2.armas.map((a) => { const d = dias(a.craf_validade); return `<div class="linha caca-doc"><div class="caca-topo"><div><div class="t">${esc(a.descricao)}</div><div class="pequeno">${esc(a.calibre || "")}${a.numero_serie ? " · série " + esc(a.numero_serie) : ""}${a.craf_validade ? " · CRAF até " + br(a.craf_validade) : ""}</div></div>${d !== null ? `<span class="etiqueta ${cor(d)}" style="white-space:nowrap">${prazo(d)}</span>` : ""}</div>${g ? `<button class="btn sec" data-ed-arma="${a.id}" style="min-height:32px;padding:4px 10px;margin-top:6px">Editar</button>` : ""}</div>`; }).join("")}</div>` : '<div class="vazio" style="margin-top:10px">Nenhuma arma do clube cadastrada.</div>'}</div>`;
}

function clbRelatorioHtml() {
  const R = CLB.rel;
  if (!R.de) { const h = new Date(); const ini = new Date(h.getFullYear(), h.getMonth() - 1, 1), fim = new Date(h.getFullYear(), h.getMonth(), 0); const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); R.de = iso(ini); R.ate = iso(fim); }
  const X = R.dados;
  return `<div class="card"><div class="rotulo">Relatório de munição do período</div>
    <p class="pequeno" style="margin:6px 0 10px">Junta entradas e saídas por lote e por atirador. Sai em PDF (para imprimir ou anexar) e em planilha.</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end"><label>De<input id="cl-r-de" type="date" value="${R.de}"></label><label>Até<input id="cl-r-ate" type="date" value="${R.ate}"></label><button class="btn" id="cl-r-ok"${R.gerando ? " disabled" : ""}>${R.gerando ? "Gerando…" : "Gerar relatório"}</button></div>
    <div class="aviso info" style="margin-top:12px"><span class="pequeno">Modelo provisório. Antes de enviar ao Exército, confira se os campos batem com o formulário exigido pela sua região militar.</span></div>
    ${CLB.falha ? `<div class="aviso critico" style="margin-top:10px"><span class="pequeno">${esc(CLB.falha)}</span></div>` : ""}</div>
    ${X ? `<div class="card" style="margin-top:14px"><div class="caca-topo"><div class="rotulo">${br(X.de)} a ${br(X.ate)}</div><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn sec" id="cl-r-pdf" style="min-height:36px;padding:6px 12px">PDF</button><button class="btn sec" id="cl-r-csv" style="min-height:36px;padding:6px 12px">Planilha</button></div></div>
      ${clbRelTabela(X)}<p class="pequeno" style="margin-top:8px">${X.saidas.length} saída(s) e ${X.entradas.length} entrada(s) no período.</p></div>` : ""}`;
}
function clbRelLinhas(X) {
  const pr = (id) => X.produtos.find((p) => p.id === id) || { descricao: "?", calibre: "", unidades_caixa: 0 };
  return X.resumo.map((r) => { const p = pr(r.produto_id); return { p, lote: r.lote, ini: r.inicial, ent: r.entradas, sai: r.saidas, fim: r.inicial + r.entradas - r.saidas }; }).sort((a, b) => (a.p.descricao + a.lote > b.p.descricao + b.lote ? 1 : -1));
}
function clbRelTabela(X) {
  const L = clbRelLinhas(X);
  if (!L.length) return '<div class="vazio" style="margin-top:8px">Sem movimento nem saldo nesse período.</div>';
  return `<div style="overflow-x:auto;margin-top:8px"><table style="width:100%;border-collapse:collapse;min-width:620px"><thead><tr><th style="text-align:left">Munição</th><th style="text-align:left">Lote</th><th style="text-align:right">Saldo inicial</th><th style="text-align:right">Entradas</th><th style="text-align:right">Saídas</th><th style="text-align:right">Saldo final</th></tr></thead><tbody>${L.map((l) => `<tr><td>${esc(l.p.descricao)}</td><td>${esc(l.lote)}</td><td style="text-align:right">${l.ini}</td><td style="text-align:right">${l.ent}</td><td style="text-align:right">${l.sai}</td><td style="text-align:right;font-weight:600">${l.fim}</td></tr>`).join("")}</tbody></table></div><p class="pequeno" style="margin-top:6px">Valores em caixas.</p>`;
}
function clbRelCsv(X) {
  const pr = (id) => X.produtos.find((p) => p.id === id) || { descricao: "?", calibre: "", unidades_caixa: 0, codigo_barras: "" };
  const q = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const linhas = [["RESUMO POR LOTE"], ["Munição", "Calibre", "Código", "Lote", "Saldo inicial (cx)", "Entradas (cx)", "Saídas (cx)", "Saldo final (cx)", "Saldo final (cartuchos)"]];
  for (const l of clbRelLinhas(X)) linhas.push([l.p.descricao, l.p.calibre, l.p.codigo_barras, l.lote, l.ini, l.ent, l.sai, l.fim, l.fim * l.p.unidades_caixa]);
  linhas.push([], ["SAÍDAS POR ATIRADOR"], ["Data e hora", "Atirador", "Munição", "Calibre", "Lote", "Caixas", "Cartuchos", "Operador"]);
  for (const s of X.saidas) { const p = pr(s.produto_id); linhas.push([clbHora(s.criado_em), s.atirador_nome, p.descricao, p.calibre, s.lote, s.caixas, s.caixas * p.unidades_caixa, s.operador]); }
  linhas.push([], ["ENTRADAS"], ["Data e hora", "Munição", "Lote", "Caixas", "Operador"]);
  for (const s of X.entradas) { const p = pr(s.produto_id); linhas.push([clbHora(s.criado_em), p.descricao, s.lote, s.caixas, s.operador]); }
  const csv = "﻿" + linhas.map((l) => l.map(q).join(";")).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = "relatorio-municao-" + X.de + "-a-" + X.ate + ".csv"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function clbRelPdf(X) {
  const pr = (id) => X.produtos.find((p) => p.id === id) || { descricao: "?", calibre: "", unidades_caixa: 0 };
  const L = clbRelLinhas(X);
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de munição ${br(X.de)} a ${br(X.ate)}</title><style>body{font:12px/1.4 Arial,sans-serif;color:#111;margin:24px}h1{font-size:18px;margin:0}h2{font-size:14px;margin:18px 0 6px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:4px 6px;text-align:left}th{background:#eee}td.n{text-align:right}.p{color:#555}</style></head><body>
    <h1>Relatório de movimentação de munição</h1><div class="p">${esc(X.clube.nome)}${X.clube.cidade ? " – " + esc(X.clube.cidade) : ""} · Período: ${br(X.de)} a ${br(X.ate)} · Gerado em ${new Date().toLocaleString("pt-BR")} pelo Ática</div>
    <h2>Resumo por lote (em caixas)</h2><table><tr><th>Munição</th><th>Lote</th><th>Saldo inicial</th><th>Entradas</th><th>Saídas</th><th>Saldo final</th><th>Cartuchos (final)</th></tr>${L.map((l) => `<tr><td>${esc(l.p.descricao)}</td><td>${esc(l.lote)}</td><td class="n">${l.ini}</td><td class="n">${l.ent}</td><td class="n">${l.sai}</td><td class="n">${l.fim}</td><td class="n">${l.fim * l.p.unidades_caixa}</td></tr>`).join("")}</table>
    <h2>Saídas por atirador</h2><table><tr><th>Data e hora</th><th>Atirador</th><th>Munição</th><th>Lote</th><th>Caixas</th><th>Cartuchos</th><th>Operador</th></tr>${X.saidas.map((s) => { const p = pr(s.produto_id); return `<tr><td>${clbHora(s.criado_em)}</td><td>${esc(s.atirador_nome || "")}</td><td>${esc(p.descricao)}</td><td>${esc(s.lote)}</td><td class="n">${s.caixas}</td><td class="n">${s.caixas * p.unidades_caixa}</td><td>${esc(s.operador || "")}</td></tr>`; }).join("") || '<tr><td colspan="7">Sem saídas no período.</td></tr>'}</table>
    <p class="p" style="margin-top:28px">Responsável: ______________________________________ &nbsp;&nbsp; Data: ____/____/______</p></body></html>`;
  const w = window.open("", "_blank");
  if (!w) { CLB.falha = "O navegador bloqueou a janela do PDF. Libere pop-ups para o site ou use a planilha."; render(); return; }
  w.document.open(); w.document.write(html); w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 400);
}

function renderClube(c) {
  const topo = (t, s) => `<button class="voltar-hub" id="cl-volta">‹ Conta</button><div class="topo"><div><h2>${t}</h2><p>${s}</p></div></div>`;
  const volta = () => { const b = c.querySelector("#cl-volta"); if (b) b.onclick = () => { clbCameraParar(); irPara("conta", ""); }; };
  if (CLB.lista === null) { clbListar(); c.innerHTML = topo("Clube de tiro", "Carregando…") + '<div class="card"><span class="carregando"></span>Carregando…</div>'; return volta(); }
  if (!CLB.lista.length || CLB.novo) {
    c.innerHTML = topo("Clube de tiro", "Estoque de munição, saídas pelo celular, atiradores e relatório.") + (CLB.podeCriar ? `<div class="card"><div class="rotulo">Cadastrar clube</div><div style="display:grid;gap:10px;margin-top:10px"><label>Nome do clube<input id="cl-c-nome" maxlength="120"></label><label>Cidade<input id="cl-c-cid" maxlength="80"></label><label>Outros nomes (separe por vírgula)<input id="cl-c-ap" maxlength="200" placeholder="Ex.: ADTM, Associação de Tiro de Mirassol"></label>${CLB.falha ? `<div class="aviso critico"><span class="pequeno">${esc(CLB.falha)}</span></div>` : ""}<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="cl-c-ok">Cadastrar clube</button>${CLB.lista.length ? '<button class="btn sec" id="cl-c-x">Cancelar</button>' : ""}</div></div></div>` : '<div class="vazio">Você ainda não está em nenhum clube. Peça ao gestor do clube para incluir seu WhatsApp como operador.</div>');
    volta();
    if (c.querySelector("#cl-c-x")) c.querySelector("#cl-c-x").onclick = () => { CLB.novo = false; render(); };
    if (c.querySelector("#cl-c-ok")) c.querySelector("#cl-c-ok").onclick = async () => { const r = await clbApi("clube_criar", { nome: c.querySelector("#cl-c-nome").value, cidade: c.querySelector("#cl-c-cid").value, apelidos: c.querySelector("#cl-c-ap").value }); if (r.ok) { CLB.falha = ""; CLB.novo = false; CLB.clubeId = r.id; guardar.set("cac_clube", r.id); CLB.lista = null; CLB.dados = null; } else CLB.falha = r.erro; render(); };
    return;
  }
  if (!CLB.dados || CLB.dados.clube.id !== CLB.clubeId) { if (!CLB.carregando && !CLB.erro) clbCarregar(); c.innerHTML = topo("Clube de tiro", "Carregando…") + (CLB.erro ? `<div class="aviso critico"><span class="pequeno">${esc(CLB.erro)}</span></div><button class="btn sec" id="cl-de-novo">Tentar de novo</button>` : '<div class="card"><span class="carregando"></span>Carregando…</div>'); if (c.querySelector("#cl-de-novo")) c.querySelector("#cl-de-novo").onclick = () => { CLB.erro = ""; render(); }; return volta(); }
  const D2 = CLB.dados, g = D2.papel === "gestor";
  const abas = [["saida", "Saída"], ["entrada", "Entrada"], ["estoque", "Estoque"], ["atiradores", "Atiradores"], ["acervo", "Acervo"]].concat(g ? [["relatorio", "Relatório"], ["equipe", "Equipe"]] : []);
  if (!abas.some((a) => a[0] === CLB.aba)) CLB.aba = "saida";
  const seletor = CLB.lista.length > 1 || CLB.podeCriar ? `<select id="cl-sel" style="max-width:260px">${CLB.lista.map((k) => `<option value="${k.id}"${k.id === CLB.clubeId ? " selected" : ""}>${esc(k.nome)}</option>`).join("")}${CLB.podeCriar ? '<option value="__novo">+ Cadastrar outro clube</option>' : ""}</select>` : "";
  let corpo = "";
  if (CLB.aba === "saida" || CLB.aba === "entrada") corpo = clbSaidaHtml();
  else if (CLB.aba === "estoque") corpo = clbEstoqueHtml();
  else if (CLB.aba === "atiradores") corpo = clbAtiradoresHtml();
  else if (CLB.aba === "acervo") corpo = clbAcervoHtml();
  else if (CLB.aba === "relatorio") corpo = clbRelatorioHtml();
  else if (CLB.aba === "equipe") corpo = `<div class="card"><div class="rotulo">Quem pode registrar</div><p class="pequeno" style="margin:6px 0 10px">Operadores registram entradas e saídas. Gestores também veem o relatório, cadastram armas e montam a equipe. A pessoa precisa ter conta no Ática.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end"><label style="flex:1;min-width:180px">WhatsApp<input id="cl-m-wpp" inputmode="tel" placeholder="(17) 99999-9999"></label><label>Papel<select id="cl-m-papel"><option value="operador">Operador</option><option value="gestor">Gestor</option></select></label><button class="btn" id="cl-m-ok">Incluir</button></div>
      ${CLB.falha ? `<div class="aviso critico" style="margin-top:10px"><span class="pequeno">${esc(CLB.falha)}</span></div>` : ""}
      ${(D2.membros || []).length ? `<div class="lista" style="margin-top:10px">${D2.membros.map((m) => `<div class="linha caca-doc"><div class="caca-topo"><div><div class="t">${esc(m.nome)}</div><div class="pequeno">${m.papel === "gestor" ? "Gestor" : "Operador"} · final ${esc(m.final)}</div></div><button class="btn sec" data-rem="${m.assinante_id}" style="min-height:32px;padding:4px 10px">Remover</button></div></div>`).join("")}</div>` : '<div class="vazio" style="margin-top:10px">Ninguém incluído ainda.</div>'}</div>`;
  c.innerHTML = topo(esc(D2.clube.nome), "Clube de tiro · " + (g ? "gestor" : "operador")) + (seletor ? `<div style="margin-bottom:10px">${seletor}</div>` : "") +
    `<div class="ip-fator ad-filtros" style="margin-bottom:12px">${abas.map(([k, t]) => `<button data-cla="${k}" class="${CLB.aba === k ? "on" : ""}">${t}</button>`).join("")}</div>` +
    (CLB.msg ? `<div class="aviso info" style="margin-bottom:10px"><span class="pequeno">${esc(CLB.msg)}</span></div>` : "") + corpo;
  volta();
  const q = (s) => c.querySelector(s), S = CLB.saida;
  c.querySelectorAll("[data-cla]").forEach((b) => b.onclick = () => { clbCameraParar(); CLB.aba = b.dataset.cla; CLB.falha = ""; CLB.msg = ""; CLB.form = null; if (CLB.aba === "saida" || CLB.aba === "entrada") { S.passo = "ler"; S.produto = null; } render(); });
  if (q("#cl-sel")) q("#cl-sel").onchange = (e) => { if (e.target.value === "__novo") { CLB.novo = true; render(); return; } CLB.clubeId = e.target.value; guardar.set("cac_clube", CLB.clubeId); CLB.dados = null; render(); };
  // leitura do código
  if (q("#cl-abrir-cam")) q("#cl-abrir-cam").onclick = () => { CLB.falha = ""; q("#cl-abrir-cam").style.display = "none"; clbCamera(q("#cl-cam"), (v) => clbLerCodigo(v)); };
  if (q("#cl-codigo")) { const inp = q("#cl-codigo"); setTimeout(() => { try { inp.focus(); } catch (e) {} }, 50); inp.onkeydown = (e) => { if (e.key === "Enter") clbLerCodigo(inp.value); }; q("#cl-buscar").onclick = () => clbLerCodigo(inp.value); }
  if (q("#cl-cancela")) q("#cl-cancela").onclick = () => { clbCameraParar(); S.passo = "ler"; S.produto = null; S.atiradorId = ""; S.busca = ""; CLB.falha = ""; render(); };
  if (q("#cl-np-ok")) q("#cl-np-ok").onclick = async () => { const n = S.novoProd; n.descricao = q("#cl-np-desc").value; n.calibre = q("#cl-np-cal").value; n.un = q("#cl-np-un").value; const r = await clbApi("clube_produto_salvar", { clube_id: CLB.clubeId, codigo_barras: n.codigo, descricao: n.descricao, calibre: n.calibre, unidades_caixa: n.un }); if (!r.ok) { CLB.falha = r.erro; render(); return; } await clbCarregar(); clbLerCodigo(n.codigo); };
  const lerCampos = () => { if (q("#cl-lote")) S.lote = q("#cl-lote").value.trim().toUpperCase(); if (q("#cl-cx")) S.caixas = Math.max(1, parseInt(q("#cl-cx").value, 10) || 1); if (q("#cl-at") && !S.atiradorId) S.busca = q("#cl-at").value; };
  if (q("#cl-menos")) { q("#cl-menos").onclick = () => { lerCampos(); S.caixas = Math.max(1, S.caixas - 1); render(); }; q("#cl-mais").onclick = () => { lerCampos(); S.caixas += 1; render(); }; q("#cl-cx").onchange = () => { lerCampos(); render(); }; }
  if (q("#cl-lote-cam")) q("#cl-lote-cam").onclick = () => { lerCampos(); clbCamera(q("#cl-cam-lote"), (v) => { S.lote = String(v).trim().toUpperCase(); render(); }); };
  if (q("#cl-at")) { const a = q("#cl-at"); a.oninput = () => { if (S.atiradorId) return; const pos = a.selectionStart; lerCampos(); render(); const n = c.querySelector("#cl-at"); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} } }; }
  c.querySelectorAll("[data-at]").forEach((b) => b.onclick = () => { lerCampos(); const a = D2.atiradores.find((x) => x.id === b.dataset.at); S.atiradorId = a.id; S.atiradorNome = a.nome; render(); });
  if (q("#cl-at-limpa")) q("#cl-at-limpa").onclick = (e) => { e.preventDefault(); lerCampos(); S.atiradorId = ""; S.atiradorNome = ""; S.busca = ""; render(); };
  if (q("#cl-registrar")) q("#cl-registrar").onclick = async () => {
    lerCampos(); const ent = S.passo === "entrada";
    if (!S.lote) { CLB.falha = "Informe o lote."; render(); return; }
    if (!ent && !S.atiradorId && S.busca.trim().length < 3) { CLB.falha = "Informe o atirador."; render(); return; }
    S.enviando = true; CLB.falha = ""; render();
    const r = await clbApi("clube_movimento", { clube_id: CLB.clubeId, tipo: ent ? "entrada" : "saida", produto_id: S.produto.id, lote: S.lote, caixas: S.caixas, atirador_id: S.atiradorId || undefined, atirador_nome: S.atiradorId ? undefined : S.busca });
    S.enviando = false;
    if (!r.ok) { CLB.falha = r.erro || "Não deu certo."; render(); return; }
    S.ultimo = { id: r.id, tipo: ent ? "entrada" : "saida", prod: S.produto.descricao, lote: S.lote, caixas: S.caixas, atirador: r.atirador_nome };
    S.passo = "ok"; S.atiradorId = ""; S.busca = ""; clbCarregar(); render();
  };
  if (q("#cl-proxima")) q("#cl-proxima").onclick = () => { S.passo = "ler"; S.produto = null; render(); };
  if (q("#cl-desfazer")) q("#cl-desfazer").onclick = async () => { const r = await clbApi("clube_movimento_cancelar", { clube_id: CLB.clubeId, id: S.ultimo.id }); if (r.ok) { CLB.msg = "Registro desfeito."; S.passo = "ler"; clbCarregar(); } else CLB.falha = r.erro; render(); };
  // estoque
  if (q("#cl-ir-entrada")) q("#cl-ir-entrada").onclick = () => { CLB.aba = "entrada"; S.passo = "ler"; render(); };
  c.querySelectorAll("[data-desf]").forEach((b) => b.onclick = async () => { if (!confirm("Desfazer este registro?")) return; const r = await clbApi("clube_movimento_cancelar", { clube_id: CLB.clubeId, id: b.dataset.desf }); if (!r.ok) CLB.falha = r.erro; await clbCarregar(); });
  // atiradores
  if (q("#cl-novo-at")) q("#cl-novo-at").onclick = () => { CLB.form = { tipo: "atirador" }; render(); };
  c.querySelectorAll("[data-ed-at]").forEach((b) => b.onclick = () => { const a = D2.atiradores.find((x) => x.id === b.dataset.edAt); CLB.form = { tipo: "atirador", ...a }; render(); window.scrollTo(0, 0); });
  if (q("#cl-f-x")) q("#cl-f-x").onclick = () => { CLB.form = null; render(); };
  if (q("#cl-f-ok")) q("#cl-f-ok").onclick = async () => { const r = await clbApi("clube_atirador_salvar", { clube_id: CLB.clubeId, id: CLB.form.id, nome: q("#cl-f-nome").value, whatsapp: q("#cl-f-wpp").value }); if (!r.ok) { CLB.msg = r.erro; render(); return; } CLB.form = null; CLB.msg = ""; await clbCarregar(); };
  if (q("#cl-importar")) q("#cl-importar").onclick = async () => { const r = await clbApi("clube_importar_atica", { clube_id: CLB.clubeId }); CLB.msg = r.ok ? `${r.importados} atirador(es) trazido(s) do Ática (${r.encontrados} assinante(s) informam este clube).` : r.erro; await clbCarregar(); };
  // acervo
  if (q("#cl-nova-arma")) q("#cl-nova-arma").onclick = () => { CLB.form = { tipo: "arma" }; render(); };
  c.querySelectorAll("[data-ed-arma]").forEach((b) => b.onclick = () => { const a = D2.armas.find((x) => x.id === b.dataset.edArma); CLB.form = { tipo: "arma", ...a }; render(); window.scrollTo(0, 0); });
  if (q("#cl-a-ok")) q("#cl-a-ok").onclick = async () => { const r = await clbApi("clube_arma_salvar", { clube_id: CLB.clubeId, id: CLB.form.id, descricao: q("#cl-a-desc").value, calibre: q("#cl-a-cal").value, numero_serie: q("#cl-a-serie").value, craf_validade: q("#cl-a-craf").value, observacao: q("#cl-a-obs").value }); if (!r.ok) { CLB.msg = r.erro; render(); return; } CLB.form = null; CLB.msg = ""; await clbCarregar(); };
  // relatório
  if (q("#cl-r-ok")) q("#cl-r-ok").onclick = async () => { const R = CLB.rel; R.de = q("#cl-r-de").value; R.ate = q("#cl-r-ate").value; R.gerando = true; CLB.falha = ""; render(); const r = await clbApi("clube_relatorio", { clube_id: CLB.clubeId, de: R.de, ate: R.ate }); R.gerando = false; if (r.ok) R.dados = r; else CLB.falha = r.erro; render(); };
  if (q("#cl-r-pdf")) q("#cl-r-pdf").onclick = () => clbRelPdf(CLB.rel.dados);
  if (q("#cl-r-csv")) q("#cl-r-csv").onclick = () => clbRelCsv(CLB.rel.dados);
  // equipe
  if (q("#cl-m-ok")) q("#cl-m-ok").onclick = async () => { const r = await clbApi("clube_membro_salvar", { clube_id: CLB.clubeId, whatsapp: q("#cl-m-wpp").value, papel: q("#cl-m-papel").value }); if (r.ok) { CLB.falha = ""; CLB.msg = r.nome + " incluído(a)."; } else CLB.falha = r.erro; await clbCarregar(); render(); };
  c.querySelectorAll("[data-rem]").forEach((b) => b.onclick = async () => { if (!confirm("Remover essa pessoa da equipe do clube?")) return; await clbApi("clube_membro_remover", { clube_id: CLB.clubeId, assinante_id: b.dataset.rem }); await clbCarregar(); });
}
