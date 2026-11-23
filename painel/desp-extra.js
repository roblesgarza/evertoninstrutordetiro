// ---------- despachante: checklist de pedido por cliente (tiro esportivo e caça) — 23/11/2026 ----------
let DCK = { cli: "", serv: "renovar_cr" };
const DCK_SERV = {
  renovar_cr: ["Renovar o CR", "tiro", ["IDENTIDADE", "CR", "ANTECEDENTES", "DECL_IDONEIDADE", "OCUPACAO", "RESIDENCIA", "DSA", "EXAME_PSICOLOGICO", "EXAME_TECNICO", "FILIACAO", "HABITUALIDADE", "CRAF", "TAXA"]],
  renovar_craf: ["Renovar CRAF", "tiro", ["IDENTIDADE", "CR", "CRAF", "ANTECEDENTES", "EXAME_PSICOLOGICO", "EXAME_TECNICO", "RESIDENCIA", "TAXA"]],
  aquisicao: ["Autorização de aquisição (comprar arma)", "tiro", ["IDENTIDADE", "CR", "ANTECEDENTES", "DECL_IDONEIDADE", "OCUPACAO", "RESIDENCIA", "DSA", "EXAME_PSICOLOGICO", "EXAME_TECNICO", "FILIACAO", "HABITUALIDADE", "TAXA"]],
  guia: ["Guia de trânsito (treino e competição)", "tiro", ["IDENTIDADE", "CR", "CRAF", "FILIACAO", "HABITUALIDADE", "TAXA"]],
  primeiro_cr: ["Primeiro CR", "tiro", ["IDENTIDADE", "ANTECEDENTES", "DECL_IDONEIDADE", "OCUPACAO", "RESIDENCIA", "DSA", "EXAME_PSICOLOGICO", "EXAME_TECNICO", "FILIACAO", "TAXA"]],
  apostilamento: ["Mudança de endereço (apostilamento)", "tiro", ["IDENTIDADE", "CR", "RESIDENCIA", "TAXA"]],
  guia_manejo: ["Guia de trânsito para manejo de javali", "caca", ["IDENTIDADE", "CR", "CRAF", "CTF", "SIMAF", "AUT_PROPRIEDADE", "TAXA"]],
  simaf: ["Autorização de manejo (SIMAF)", "caca", ["CR", "CTF", "CAR", "AUT_PROPRIEDADE"]],
  ctf: ["CTF do IBAMA", "caca", ["IDENTIDADE", "CR", "RESIDENCIA"]],
};
const DCK_ITENS = {
  IDENTIDADE: ["Documento de identificação", "RG ou CNH, com CPF.", "pedido"],
  CR: ["Certificado de Registro (CR)", "Precisa estar válido.", "doc"],
  CRAF: ["CRAFs das armas", "Registros válidos das armas envolvidas.", "doc"],
  ANTECEDENTES: ["Certidões de antecedentes", "Justiças federal, estadual, militar e eleitoral; valem 90 dias.", "doc"],
  DECL_IDONEIDADE: ["Declaração de idoneidade", "Assinada no próprio pedido.", "pedido"],
  OCUPACAO: ["Ocupação lícita", "IR, holerite, pró-labore ou DECORE.", "pedido"],
  RESIDENCIA: ["Comprovante de residência", "Recente e no nome do cliente.", "doc"],
  DSA: ["Declaração de segurança do acervo", "Assinada no pedido.", "pedido"],
  EXAME_PSICOLOGICO: ["Laudo psicológico", "Psicólogo credenciado pela PF.", "doc"],
  EXAME_TECNICO: ["Capacidade técnica", "Instrutor credenciado pela PF.", "doc"],
  FILIACAO: ["Filiação ao clube", "Declaração de filiação em dia.", "doc"],
  HABITUALIDADE: ["Habitualidade", "Declaração de treinos e competições do clube.", "pedido"],
  TAXA: ["Comprovante da taxa (GRU)", "Pago no pedido.", "pedido"],
  CTF: ["CTF do IBAMA", "Cadastro técnico federal com certificado de regularidade.", "doc"],
  SIMAF: ["Autorização de manejo (SIMAF)", "Vigente para a área do manejo.", "doc"],
  AUT_PROPRIEDADE: ["Autorização do proprietário", "Da fazenda onde é feito o manejo.", "doc"],
  CAR: ["CAR da propriedade", "Cadastro ambiental rural da área.", "doc"],
};
function dckSit(docs, k, hoje) {
  const ds = docs.filter((d) => d.tipo === k || (k === "RESIDENCIA" && d.tipo === "OUTRO" && /resid/i.test(d.nome_tipo || "")));
  if (!ds.length) return { cls: "cr", txt: "falta", falta: true };
  const n = (d) => d.validade ? dspDias(d.validade, hoje) : null;
  if (k === "CRAF") { const venc = ds.filter((d) => n(d) !== null && n(d) < 0).length, logo = ds.filter((d) => n(d) !== null && n(d) >= 0 && n(d) <= 60).length; return venc ? { cls: "cr", txt: venc + " vencido(s)", falta: true } : logo ? { cls: "at", txt: logo + " vence(m) em 60 dias", falta: false } : { cls: "ok", txt: ds.length + " em dia", falta: false }; }
  const best = ds.slice().sort((a, b) => (n(b) === null ? 1e6 : n(b)) - (n(a) === null ? 1e6 : n(a)))[0], dd = n(best);
  if (dd === null) return { cls: "ok", txt: "guardado", falta: false };
  if (dd < 0) return { cls: "cr", txt: "venceu " + br(best.validade), falta: true };
  if (dd <= 30) return { cls: "at", txt: "vence " + br(best.validade), falta: false };
  return { cls: "ok", txt: "até " + br(best.validade), falta: false };
}
function dckHtml(c, hoje) {
  if (DCK.cli !== c.id) return "";
  const sv = DCK_SERV[DCK.serv] || DCK_SERV.renovar_cr, falta = [];
  const linhas = sv[2].map((k) => {
    const it = DCK_ITENS[k];
    if (it[2] === "pedido") return `<div class="dsp-doc"><span><b>${it[0]}</b><br><span class="pequeno">${it[1]}</span></span><span class="etiqueta">no pedido</span></div>`;
    const s = dckSit(c.docs, k, hoje); if (s.falta) falta.push(it[0] + (s.txt === "falta" ? "" : " (" + s.txt + ")"));
    return `<div class="dsp-doc"><span><b>${it[0]}</b><br><span class="pequeno">${it[1]}</span></span><span class="etiqueta ${s.cls}">${s.txt}</span></div>`;
  }).join("");
  const grupo = (g) => Object.entries(DCK_SERV).filter(([, v]) => v[1] === g).map(([k, v]) => `<option value="${k}"${DCK.serv === k ? " selected" : ""}>${esc(v[0])}</option>`).join("");
  const nome1 = String(c.nome || "").split(" ")[0];
  const msg = falta.length ? `Olá, ${nome1}! Para o pedido de ${sv[0].toLowerCase()}, preciso de: ${falta.join("; ")}. Pode mandar pelo Ática (foto ou PDF) que eu já recebo aqui.` : "";
  return `<div class="dsp-editor" style="margin-top:10px"><div class="caca-campos"><label style="grid-column:1/-1">Checklist do pedido<select data-dck-serv="${c.id}"><optgroup label="Tiro esportivo">${grupo("tiro")}</optgroup><optgroup label="Caça (manejo de javali)">${grupo("caca")}</optgroup></select></label></div>
    <div class="dsp-docs">${linhas}</div>
    <p class="pequeno" style="margin:8px 0 0">${falta.length ? `<span class="cr">${falta.length} item(ns) faltando ou vencido(s).</span>` : '<span class="ok">Tudo o que depende de documento está em dia.</span>'} Itens "no pedido" são preenchidos ou pagos na hora do protocolo.</p>
    <div class="caca-envia">${falta.length ? `<a class="btn" href="https://wa.me/${esc(String(c.whatsapp || "").replace(/\D/g, ""))}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Pedir o que falta no WhatsApp</a>` : ""}<button class="btn sec" data-dnovo="${c.id}">Abrir processo</button><button class="btn sec" data-dck-fecha="1">Fechar checklist</button></div></div>`;
}
document.addEventListener("click", (e) => {
  const b = e.target && e.target.closest && e.target.closest("[data-dchk],[data-dck-fecha]");
  if (!b) return;
  e.stopPropagation(); e.preventDefault();
  if (b.dataset.dckFecha) DCK.cli = ""; else DCK.cli = DCK.cli === b.dataset.dchk ? "" : b.dataset.dchk;
  render();
}, true);
document.addEventListener("change", (e) => { const s = e.target; if (s && s.dataset && s.dataset.dckServ) { e.stopPropagation(); DCK.serv = s.value; render(); } }, true);
