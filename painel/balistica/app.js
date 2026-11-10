const $ = (s) => document.querySelector(s);
const CHAVE = "atica_balistica_v1";
const guardar = { get(){ try{ return JSON.parse(localStorage.getItem(CHAVE)) }catch{ return null } }, set(v){ try{ localStorage.setItem(CHAVE, JSON.stringify(v)) }catch{} } };
const num = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(n) ? n : NaN; };
const fmt = (n, d = 1) => isFinite(n) ? (Math.abs(n) < 0.5 / 10 ** d ? 0 : n).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) : "—";
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const id = () => Math.random().toString(36).slice(2, 9);

const EXEMPLO = () => ({
  rifles: [{ id: "r1", nome: "Meu rifle (exemplo)", passo: "254", direcao: "direita" }],
  miras: [{ id: "m1", nome: "Minha mira (exemplo)", zero: "100", altura: "6,5", unidade: "MRAD", cliqueV: "0,1", cliqueH: "0,1", porVolta: "10", reticulo: "VPR MIL", zeroModo: "mesmo" }],
  municoes: [{ id: "a1", nome: ".308 168 gr (exemplo)", diametro: "7,82", comprimento: "30,86", peso: "168", pesoUn: "gr", cb: "0,224", arrasto: "G7", v0: "755", tempMed: "25", sens: "0" }],
  sel: { rifle: "r1", mira: "m1", municao: "a1" },
  tiro: { distancia: "288", inclinacao: "0", ventoVel: "0", ventoUn: "ms", ventoHora: "3", modo: "da", temperatura: "25", pressao: "1013", umidade: "50", altitude: "0", altitudeDensidade: "1064" },
  tab: { ini: "0", fim: "500", passo: "25" },
});
let E = guardar.get() || EXEMPLO();
const salvar = () => guardar.set(E);
const atual = (tipo) => { const lista = E[tipo === "rifle" ? "rifles" : tipo === "mira" ? "miras" : "municoes"]; return lista.find((x) => x.id === E.sel[tipo]) || lista[0]; };

// ---------- montagem dos parâmetros ----------
function parametros() {
  const mira = atual("mira"), mun = atual("municao"), t = E.tiro;
  if (!mira || !mun) return { erro: "Cadastre uma mira e uma munição na aba Cadastro." };
  const fator = mira.unidade === "MOA" ? 1 / Balistica.MOA_POR_MRAD : 1;
  const peso = num(mun.peso), massaKg = mun.pesoUn === "g" ? peso / 1000 : peso * 0.06479891 / 1000;
  const temperatura = num(t.temperatura);
  const clima = { modo: t.modo, temperatura, pressao: num(t.pressao), umidade: num(t.umidade), altitude: num(t.altitude), altitudeDensidade: num(t.altitudeDensidade) };
  const falta = [];
  if (!(massaKg > 0)) falta.push("peso do projétil");
  if (!(num(mun.cb) > 0)) falta.push("coeficiente balístico");
  if (!(num(mun.v0) > 30)) falta.push("velocidade na boca");
  if (!(num(mira.zero) > 0)) falta.push("distância de zeragem");
  if (!(num(mira.altura) >= 0)) falta.push("altura da mira");
  if (!isFinite(temperatura)) falta.push("temperatura");
  if (t.modo === "da" && !isFinite(clima.altitudeDensidade)) falta.push("altitude de densidade");
  if (t.modo === "pressao" && !(clima.pressao > 300)) falta.push("pressão");
  if (t.modo === "altitude" && !isFinite(clima.altitude)) falta.push("altitude");
  if (falta.length) return { erro: "Confira: " + falta.join(", ") + "." };
  if (!isFinite(clima.umidade)) clima.umidade = 50;
  const atm = Balistica.atmosfera(clima);
  const sens = num(mun.sens), tm = num(mun.tempMed);
  const v0 = num(mun.v0) + (isFinite(sens) && isFinite(tm) ? sens * (temperatura - tm) : 0);
  const vv = num(t.ventoVel) || 0;
  let zero = {};
  if (mira.zeroModo === "pressao" || mira.zeroModo === "da") {
    const zt = num(mira.zeroTemp), zp = num(mira.zeroPressao) * (mira.zeroPressaoUn === "mmHg" ? 1.33322 : 1), zu = num(mira.zeroUmidade), zd = num(mira.zeroAltDens);
    if (!isFinite(zt) || (mira.zeroModo === "pressao" ? !(zp > 300) : !isFinite(zd))) return { erro: "Confira o clima da zeragem no cadastro da mira." };
    const za = Balistica.atmosfera({ modo: mira.zeroModo, temperatura: zt, pressao: zp, umidade: isFinite(zu) ? zu : 50, altitudeDensidade: zd });
    zero = { zeroRho: za.rho, zeroSom: za.som, zeroV0: num(mun.v0) + (isFinite(sens) && isFinite(tm) ? sens * (zt - tm) : 0) };
  }
  const rifle = atual("rifle");
  const sg = rifle ? Balistica.estabilidade({ massaKg, diametroMm: num(mun.diametro), comprimentoMm: num(mun.comprimento), passoMm: num(rifle.passo), v0, rho: atm.rho }) : null;
  return {
    mira, mun, atm, unidade: mira.unidade, fator, sg: isFinite(sg) ? sg : null, porVolta: num(mira.porVolta),
    p: { massaKg, cb: num(mun.cb), arrasto: mun.arrasto, v0, alturaMira: num(mira.altura) / 100, zero: num(mira.zero),
      cliqueV: (num(mira.cliqueV) || 0) * fator, cliqueH: (num(mira.cliqueH) || 0) * fator, rho: atm.rho, som: atm.som,
      inclinacao: num(t.inclinacao) || 0, ventoVel: t.ventoUn === "kmh" ? vv / 3.6 : vv, ventoDir: (num(t.ventoHora) % 12) * 30, ...zero },
  };
}
const naUnidade = (c, un) => un === "MOA" ? c.moa : c.mrad;
const cliques = (c) => c.cliques === null ? "—" : fmt(Math.abs(Math.round(c.cliques)), 0);

// Leitura da torre: volta e marca, a partir do zero (só para correção de subir).
function torre(c, q) {
  if (!(q.porVolta > 0) || c.cliques === null) return "";
  const passo = q.p.cliqueV / q.fator, v = Math.round(c.cliques) * passo;
  if (v < 0) return "";
  const volta = Math.floor(v / q.porVolta + 1e-9), marca = v - volta * q.porVolta;
  return `${volta + 1}ª volta · ${fmt(marca, q.unidade === "MOA" ? 2 : 1)}`;
}

// ---------- TIRO ----------
function renderTiro() {
  const q = parametros(), d = num(E.tiro.distancia), el = $("#resultado");
  desenharRosa();
  if (q.erro) { el.innerHTML = `<div class="erro">${q.erro}</div>`; return; }
  if (!(d > 0) || d > 3000) { el.innerHTML = `<div class="erro">Informe a distância do alvo (até 3.000 m).</div>`; return; }
  const r = Balistica.calcular(q.p, d);
  if (!r) { el.innerHTML = `<div class="erro">O projétil não chega a essa distância com os dados cadastrados.</div>`; return; }
  const un = q.unidade, dec = un === "MOA" ? 2 : 1;
  const heroi = (tit, c, pos, neg) => {
    const v = naUnidade(c, un), nulo = Math.abs(v) < 0.005, n = c.cliques === null ? null : Math.round(c.cliques);
    return `<div class="heroi"><div class="rotulo">${tit}</div>
      <div class="n">${fmt(Math.abs(v), dec)}<small>${un}</small></div>
      <div class="s"><span class="sentido ${nulo ? "neutro" : ""}">${nulo ? "Sem correção" : v > 0 ? pos : neg}</span>${n === null ? "Informe o clique" : nulo ? "" : Math.abs(n) + (Math.abs(n) === 1 ? " clique" : " cliques")}</div></div>`;
  };
  const linha = (tit, c) => `<tr><td>${tit}</td><td>${fmt(c.mrad, 2)}</td><td>${fmt(c.moa, 2)}</td><td>${fmt(c.smoa, 2)}</td><td>${fmt(c.cm, 1)}</td><td>${c.cliques === null ? "—" : fmt(c.cliques, 1)}</td></tr>`;
  const sub = r.mach < 1.2 ? `<div class="aviso" style="border-left-color:var(--azul)">A ${fmt(d, 0)} m o projétil está em Mach ${fmt(r.mach, 2)}, perto ou abaixo da velocidade do som. Nessa faixa a previsão perde precisão.</div>` : "";
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px">
    <div class="herois">${heroi("Elevação", r.elev, "Subir", "Descer")}${heroi("Vento", r.vento, "Direita", "Esquerda")}</div>
    <div class="card" style="padding-top:8px;padding-bottom:8px"><div class="rolagem"><table>
      <tr><th>Correção a ${fmt(d, 0)} m</th><th>MRAD</th><th>MOA</th><th>SMOA</th><th>cm</th><th>Cliques</th></tr>
      ${linha("Elevação", r.elev)}${linha("Vento", r.vento)}</table></div></div>
    <div class="dados">
      <div><span>Velocidade retida</span><b>${fmt(r.velocidade, 0)}</b><em>m/s</em></div>
      <div><span>Energia retida</span><b>${fmt(r.energia, 0)}</b><em>J</em></div>
      <div><span>Energia na boca</span><b>${fmt(r.energiaBoca, 0)}</b><em>J</em></div>
      <div><span>Tempo de voo</span><b>${fmt(r.tempo, 2)}</b><em>s</em></div>
      <div><span>Velocidade do som</span><b>${fmt(q.atm.som, 0)}</b><em>m/s</em></div>
      <div><span>Mach no alvo</span><b>${fmt(r.mach, 2)}</b></div>
      <div><span>1 clique vale</span><b>${fmt(r.cliqueCmV, 1)}</b><em>cm a ${fmt(d, 0)} m</em></div>
      <div><span>Altura máxima</span><b>${fmt(r.alturaMaxCm, 1)}</b><em>cm a ${fmt(r.distAlturaMax, 0)} m</em></div>
      <div><span>Queda no alvo</span><b>${fmt(r.quedaCm, 1)}</b><em>cm</em></div>
      <div><span>Alt. de densidade</span><b>${fmt(q.atm.altDens, 0)}</b><em>m</em></div>
      ${torre(r.elev, q) ? `<div><span>Torre de elevação</span><b>${torre(r.elev, q)}</b></div>` : ""}
      ${q.sg ? `<div><span>Estabilidade (Sg)</span><b class="${q.sg < 1.1 ? "cr" : q.sg < 1.5 ? "at" : ""}">${fmt(q.sg, 2)}</b><em>${q.sg < 1.1 ? "instável" : q.sg < 1.5 ? "marginal" : "estável"}</em></div>` : ""}
    </div>${sub}</div>`;
}
function desenharRosa() {
  const h = num(E.tiro.ventoHora) % 12, a = h * 30 * Math.PI / 180, v = num(E.tiro.ventoVel) || 0;
  const x = 40 + 30 * Math.sin(a), y = 40 - 30 * Math.cos(a), x2 = 40 + 9 * Math.sin(a), y2 = 40 - 9 * Math.cos(a);
  const px = Math.cos(a) * 5, py = Math.sin(a) * 5, bx = 40 + 17 * Math.sin(a), by = 40 - 17 * Math.cos(a);
  $("#rosa").innerHTML = `<circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,.14)"/>
    ${[0, 3, 6, 9].map((k) => { const b = k * 30 * Math.PI / 180; return `<text x="${40 + 27 * Math.sin(b)}" y="${40 - 27 * Math.cos(b) + 3}" fill="#A9A9B2" font-size="8" font-family="Chakra Petch" text-anchor="middle" opacity=".55">${k || 12}</text>`; }).join("")}
    <path d="M40 34v12M34 40h12" stroke="#ECECEF" stroke-width="1.2"/>
    ${v > 0 ? `<line x1="${x}" y1="${y}" x2="${bx}" y2="${by}" stroke="#E2B657" stroke-width="2"/><path d="M${x2} ${y2}L${bx + px} ${by + py}L${bx - px} ${by - py}Z" fill="#E2B657"/>` : ""}`;
}

// ---------- TABELA ----------
function renderTabela() {
  const q = parametros(), el = $("#tabela"), res = $("#tab-resumo");
  if (q.erro) { el.innerHTML = `<div class="erro" style="margin:10px 16px">${q.erro}</div>`; res.textContent = ""; return; }
  let ini = num(E.tab.ini), fim = num(E.tab.fim), passo = num(E.tab.passo);
  if (!(ini >= 0) || !(fim > ini) || !(passo > 0) || fim > 3000) { el.innerHTML = `<div class="erro" style="margin:10px 16px">Informe início, fim (até 3.000 m) e passo válidos.</div>`; res.textContent = ""; return; }
  if ((fim - ini) / passo > 200) passo = (fim - ini) / 200;
  const L = Balistica.tabela(q.p, ini, fim, passo), un = q.unidade, dec = un === "MOA" ? 2 : 1, alvo = num(E.tiro.distancia);
  res.textContent = `${atual("municao").nome} · zeragem ${fmt(q.p.zero, 0)} m · vento ${fmt(q.p.ventoVel, 1)} m/s às ${E.tiro.ventoHora} h · inclinação ${fmt(q.p.inclinacao, 0)}°`;
  el.innerHTML = `<table><tr><th>Dist. m</th><th>Vel. m/s</th><th>Energia J</th><th>Tempo s</th><th>Queda cm</th><th>Elev. ${un}</th><th>Cliques</th><th>Deriva cm</th><th>Vento ${un}</th><th>Cliques</th></tr>` +
    L.map((l) => `<tr class="${Math.abs(l.x - alvo) < 1e-6 ? "alvo" : Math.abs(l.x - q.p.zero) < 1e-6 ? "zero" : ""}"><td>${fmt(l.x, 0)}</td><td>${fmt(l.v, 0)}</td><td>${fmt(l.energia, 0)}</td><td>${fmt(l.t, 3)}</td><td>${fmt(l.quedaCm, 1)}</td><td>${fmt(naUnidade(l.elev, un), dec)}</td><td>${l.elev.cliques === null ? "—" : fmt(Math.round(l.elev.cliques), 0)}</td><td>${fmt(l.derivaCm, 1)}</td><td>${fmt(naUnidade(l.vento, un), dec)}</td><td>${l.vento.cliques === null ? "—" : fmt(Math.round(l.vento.cliques), 0)}</td></tr>`).join("") + "</table>" +
    (L.length ? "" : `<div class="erro" style="margin:10px 16px">Sem resultados para esse intervalo.</div>`);
}

// ---------- GRÁFICO ----------
let curvaAtual = null;
function renderGrafico() {
  const q = parametros(), el = $("#grafico");
  if (q.erro) { el.innerHTML = `<div class="erro">${q.erro}</div>`; return; }
  const alvo = num(E.tiro.distancia), fim = Math.min(3000, Math.max(num(E.tab.fim) || 0, alvo || 0, q.p.zero * 1.5, 50));
  const P = Balistica.curva(q.p, fim, 160);
  if (P.length < 3) { el.innerHTML = `<div class="erro">Sem dados para o gráfico.</div>`; return; }
  const W = 360, H = 250, mE = 40, mD = 10, mT = 12, mB = 28;
  const xMax = P[P.length - 1].x, ys = P.map((p) => p.y * 100);
  let yMin = Math.min(...ys, 0), yMaxV = Math.max(...ys, 0);
  const folga = (yMaxV - yMin) * 0.08 || 1; yMin -= folga; yMaxV += folga;
  const X = (x) => mE + (x / xMax) * (W - mE - mD), Y = (y) => mT + (yMaxV - y) / (yMaxV - yMin) * (H - mT - mB);
  const passoBom = (faixa, n) => { const bruto = faixa / n, pot = Math.pow(10, Math.floor(Math.log10(bruto))), f = bruto / pot; return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pot; };
  const px = passoBom(xMax, 5), py = passoBom(yMaxV - yMin, 5);
  let g = "";
  for (let x = 0; x <= xMax + 1e-6; x += px) g += `<line x1="${X(x)}" y1="${mT}" x2="${X(x)}" y2="${H - mB}" stroke="rgba(255,255,255,.06)"/><text x="${X(x)}" y="${H - mB + 14}" text-anchor="middle">${fmt(x, 0)}</text>`;
  for (let y = Math.ceil(yMin / py) * py; y <= yMaxV; y += py) g += `<line x1="${mE}" y1="${Y(y)}" x2="${W - mD}" y2="${Y(y)}" stroke="rgba(255,255,255,.06)"/><text x="${mE - 5}" y="${Y(y) + 3}" text-anchor="end">${fmt(y, 0)}</text>`;
  const caminho = P.map((p, i) => (i ? "L" : "M") + X(p.x).toFixed(1) + " " + Y(p.y * 100).toFixed(1)).join("");
  const marca = (x, cor, txt) => x > 0 && x <= xMax ? `<line x1="${X(x)}" y1="${mT}" x2="${X(x)}" y2="${H - mB}" stroke="${cor}" stroke-dasharray="3 3" opacity=".7"/><text x="${X(x) + (x > xMax * .85 ? -4 : 4)}" y="${mT + 9}" fill="${cor}" text-anchor="${x > xMax * .85 ? "end" : "start"}">${txt}</text>` : "";
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" font-family="Inter" font-size="9" fill="#A9A9B2" role="img" aria-label="Gráfico da trajetória">
    ${g}<line x1="${mE}" y1="${Y(0)}" x2="${W - mD}" y2="${Y(0)}" stroke="#ECECEF" stroke-width="1" opacity=".55"/>
    ${marca(q.p.zero, "#3FCB7E", "zero")}${marca(alvo, "#E2B657", "alvo")}
    <path d="${caminho}" fill="none" stroke="#E2B657" stroke-width="2" stroke-linejoin="round"/>
    <text x="${W - mD}" y="${H - 3}" text-anchor="end">distância (m)</text><text x="4" y="${mT + 2}" >cm</text>
    <g id="cursor" style="display:none"><line id="cl" y1="${mT}" y2="${H - mB}" stroke="#ECECEF" opacity=".5"/><circle id="cp" r="4" fill="#0A0A0C" stroke="#E2B657" stroke-width="2"/></g></svg>`;
  curvaAtual = { P, X, Y, xMax, mE, mD, W, q };
  const svg = el.querySelector("svg");
  const mover = (ev) => {
    const b = svg.getBoundingClientRect(), cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - b.left;
    const x = Math.max(0, Math.min(xMax, (cx / b.width * W - mE) / (W - mE - mD) * xMax));
    lerPonto(x);
  };
  svg.addEventListener("pointermove", mover); svg.addEventListener("pointerdown", mover);
  lerPonto(alvo > 0 && alvo <= xMax ? alvo : q.p.zero);
}
function lerPonto(x) {
  const c = curvaAtual; if (!c) return;
  let i = c.P.findIndex((p) => p.x >= x); if (i < 0) i = c.P.length - 1; if (i > 0 && x - c.P[i - 1].x < c.P[i].x - x) i--;
  const p = c.P[i], un = c.q.unidade, mrad = p.x > 0 ? -p.y / p.x * 1000 : 0, corr = un === "MOA" ? mrad * Balistica.MOA_POR_MRAD : mrad;
  $("#cursor").style.display = ""; $("#cl").setAttribute("x1", c.X(p.x)); $("#cl").setAttribute("x2", c.X(p.x));
  $("#cp").setAttribute("cx", c.X(p.x)); $("#cp").setAttribute("cy", c.Y(p.y * 100));
  $("#leitura").innerHTML = `<div><span>Dist.</span> ${fmt(p.x, 0)} m</div><div><span>Trajetória</span> ${fmt(p.y * 100, 1)} cm</div><div><span>Elev.</span> ${fmt(corr, un === "MOA" ? 2 : 1)} ${un}</div><div><span>Vel.</span> ${fmt(p.v, 0)} m/s</div><div><span>Tempo</span> ${fmt(p.t, 2)} s</div>`;
}

// ---------- RETÍCULO ----------
let retZoom = "ponto";
function renderReticulo() {
  const q = parametros(), el = $("#reticulo"), nota = $("#ret-nota"), lei = $("#ret-leitura"), d = num(E.tiro.distancia);
  const nome = q.mira && q.mira.reticulo, R = nome && CATALOGO.reticulos[nome];
  $("#ret-tit").textContent = R ? `Retículo ${nome} · ${R.marca}` : "Retículo";
  lei.innerHTML = ""; nota.textContent = "";
  if (q.erro) { el.innerHTML = `<div class="erro">${q.erro}</div>`; return; }
  if (!R) { el.innerHTML = `<div class="erro" style="color:var(--sub);border-color:var(--line)">Esta mira está sem desenho de retículo. Escolha um em Cadastro › Mira › Retículo. Por enquanto só o VPR MIL está disponível; os próximos entram conforme as medidas forem conferidas.</div>`; return; }
  const r = d > 0 ? Balistica.calcular(q.p, d) : null, k = R.unidade === "MOA" ? Balistica.MOA_POR_MRAD : 1, D = R.def;
  const hx = r ? -r.vento.mrad * k : 0, hy = r ? r.elev.mrad * k : 0; // ponto de visada: +y para baixo do centro
  const cor = "#ECECEF", o = [];
  const lin = (x1, y1, x2, y2, w = 0.035) => o.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${cor}" stroke-width="${w}"/>`);
  const txt = (x, y, t, a = "middle") => o.push(`<text x="${x}" y="${y}" font-size="0.42" text-anchor="${a}" fill="#A9A9B2" font-family="Inter" stroke="#0E0E11" stroke-width="0.22" paint-order="stroke">${t}</text>`);
  const marcas = (eixo, sinal, def) => { // eixo "x" ou "y"; sinal ±1
    const ab = D.centro.aberturaAtePrimeiraMarca || 0, ext = def.extensao;
    if (eixo === "x") lin(sinal * ab, 0, sinal * ext, 0); else lin(0, sinal * ab, 0, sinal * ext);
    const pos = new Map();
    for (let v = def.hashPrincipal; v <= ext + 1e-9; v += def.hashPrincipal) pos.set(Math.round(v * 100), (def.marcaLongaEm || []).includes(Math.round(v)) ? 0.5 : 0.3);
    for (const s of def.subHash || []) for (let v = s.de; v <= s.ate + 1e-9; v += s.passo) { const c = Math.round(v * 100); if (!pos.has(c)) pos.set(c, Math.abs(s.passo - 0.5) < 1e-9 ? 0.18 : 0.1); }
    for (const [c, h] of pos) { const v = sinal * c / 100; if (eixo === "x") lin(v, -h, v, h); else lin(-h, v, h, v); }
    for (const n of def.numerados || []) { if (eixo === "x") txt(sinal * n, -0.75, n); else txt(sinal > 0 ? -0.75 : 0.75, sinal * n + 0.15, n, sinal > 0 ? "end" : "start"); }
  };
  marcas("x", 1, { ...D.horizontal, extensao: D.horizontal.extensao.direita }); marcas("x", -1, { ...D.horizontal, extensao: D.horizontal.extensao.esquerda });
  marcas("y", -1, D.verticalAcima); marcas("y", 1, D.verticalAbaixo);
  if (D.arvore && D.arvore.presente) for (const [linha, meia] of Object.entries(D.arvore.meiaLarguraPorLinha)) {
    const y = linha * D.arvore.espacamentoLinhas;
    for (let x = D.arvore.pontosComecamEm; x <= meia + 1e-9; x += D.arvore.espacamentoPontos) {
      const inteiro = Math.abs(x - Math.round(x)) < 1e-9, raio = (inteiro ? D.arvore.pontoGrandeDiametro : D.arvore.pontoPequenoDiametro) / 2 * 1.6;
      for (const sx of [-1, 1]) o.push(`<circle cx="${sx * x}" cy="${y}" r="${raio}" fill="${cor}"/>`);
    }
  }
  o.push(`<circle cx="0" cy="0" r="${Math.max(D.centro.pontoCentralDiametro / 2, 0.03)}" fill="${cor}"/>`);
  const eh = D.horizontal.extensao, x0 = -eh.esquerda - 1, x1 = eh.direita + 1, y0 = -D.verticalAcima.extensao - 1, y1 = D.verticalAbaixo.extensao + 1;
  const dentro = r && hx >= x0 && hx <= x1 && hy >= y0 && hy <= y1;
  let vb = [x0, y0, x1 - x0, y1 - y0];
  if (retZoom === "ponto" && dentro) { const m = Math.max(3, Math.abs(hx) + 1.5, Math.abs(hy) + 1.5); vb = [-m, -m + Math.max(0, hy) / 2, 2 * m, 2 * m]; }
  if (dentro) o.push(`<circle cx="${hx}" cy="${hy}" r="0.16" fill="none" stroke="#E2B657" stroke-width="0.05"/><circle cx="${hx}" cy="${hy}" r="0.04" fill="#E2B657"/><line x1="${hx + 0.22}" y1="${hy}" x2="${hx + 0.9}" y2="${hy}" stroke="#E2B657" stroke-width="0.03"/><text x="${hx + 1}" y="${hy + 0.14}" font-size="0.42" fill="#E2B657" font-family="Inter">${fmt(d, 0)} m</text>`);
  el.innerHTML = `<svg viewBox="${vb.join(" ")}" role="img" aria-label="Desenho do retículo com o ponto de visada">${o.join("")}</svg>`;
  if (r) lei.innerHTML = `<div><span>Segurar</span> ${fmt(Math.abs(hy), 1)} ${R.unidade} ${hy >= 0 ? "abaixo" : "acima"} do centro</div>` + (Math.abs(hx) >= 0.05 ? `<div><span>e</span> ${fmt(Math.abs(hx), 1)} ${R.unidade} à ${hx < 0 ? "esquerda" : "direita"}</div>` : "") + (dentro ? "" : `<div class="cr">fora do retículo: use a torre</div>`);
  nota.textContent = `Coloque o ponto dourado sobre o alvo, sem girar a torre. Vale para plano focal primeiro (FFP); em luneta SFP, só no aumento de referência. Desenho próprio feito com as medidas publicadas pela ${R.marca}; espessuras e tamanhos de traço são ilustrativos.`;
}
document.querySelectorAll("#ret-zoom .chip").forEach((b) => b.onclick = () => { retZoom = b.dataset.z; document.querySelectorAll("#ret-zoom .chip").forEach((x) => x.classList.toggle("ativo", x === b)); renderReticulo(); });

// ---------- CADASTRO ----------
const CAD = {
  rifle: { lista: "rifles", titulo: "Rifle", novo: () => ({ nome: "Novo rifle", passo: "", direcao: "direita" }),
    campos: [["nome", "Nome do rifle", "texto"], ["passo", "Passo do estriamento (mm por volta)"], ["direcao", "Direção do estriamento", [["direita", "À direita"], ["esquerda", "À esquerda"]]]] },
  mira: { lista: "miras", titulo: "Mira", novo: () => ({ nome: "Nova mira", zero: "100", altura: "5", unidade: "MRAD", cliqueV: "0,1", cliqueH: "0,1", porVolta: "", reticulo: "", zeroModo: "mesmo", zeroPressaoUn: "hPa" }),
    campos: [["nome", "Nome da mira", "texto"], ["zero", "Distância de zeragem (m)"], ["altura", "Altura da mira (cm)"], ["unidade", "Unidade do clique", [["MRAD", "MRAD"], ["MOA", "MOA"]]], ["cliqueV", "Clique vertical"], ["cliqueH", "Clique horizontal"], ["porVolta", "Valor por volta da torre"],
      ["reticulo", "Retículo (desenho)", () => [["", "Sem desenho"], ...Object.entries(CATALOGO.reticulos).map(([k, r]) => [k, `${k} · ${r.marca}`])]],
      ["zeroModo", "Clima da zeragem", [["mesmo", "Mesmo do tiro"], ["pressao", "Informar pressão"], ["da", "Informar alt. de densidade"]]],
      ["zeroTemp", "Zeragem: temperatura (°C)", null, "pressao da"], ["zeroPressao", "Zeragem: pressão", null, "pressao"], ["zeroPressaoUn", "Unidade da pressão", [["hPa", "hPa"], ["mmHg", "mmHg"]], "pressao"],
      ["zeroUmidade", "Zeragem: umidade (%)", null, "pressao"], ["zeroAltDens", "Zeragem: alt. de densidade (m)", null, "da"]] },
  municao: { lista: "municoes", titulo: "Munição", novo: () => ({ nome: "Nova munição", diametro: "", comprimento: "", peso: "", pesoUn: "gr", cb: "", arrasto: "G7", v0: "", tempMed: "20", sens: "0" }),
    campos: [["nome", "Nome da munição", "texto"], ["diametro", "Diâmetro do projétil (mm)"], ["comprimento", "Comprimento do projétil (mm)"], ["peso", "Peso do projétil"], ["pesoUn", "Unidade do peso", [["gr", "grains (gr)"], ["g", "gramas (g)"]]], ["cb", "Coeficiente balístico"], ["arrasto", "Função de arrasto", [["G1", "G1"], ["G7", "G7"]]], ["v0", "Velocidade na boca (m/s)"], ["tempMed", "Temperatura da medição (°C)"], ["sens", "Variação da velocidade (m/s por °C)"]] },
};
function renderCadastro() {
  for (const tipo of Object.keys(CAD)) {
    const c = CAD[tipo], lista = E[c.lista], it = atual(tipo), el = $("#cad-" + tipo);
    el.innerHTML = `<div class="item-cab"><label><span class="rotulo">${c.titulo}</span><select data-sel>${lista.map((x) => `<option value="${x.id}" ${it && x.id === it.id ? "selected" : ""}>${esc(x.nome)}</option>`).join("")}</select></label>
      <button class="btn sec" data-novo>Novo</button><button class="btn perigo" data-del ${lista.length < 2 ? "disabled style='opacity:.4'" : ""}>Excluir</button></div>` +
      (it && tipo === "mira" ? `<label style="margin-bottom:10px">Preencher pelo catálogo de lunetas<select data-cat><option value="">Escolher marca e modelo…</option>${["Arken", "Nightforce", "Vortex"].map((b) => `<optgroup label="${b}">${CATALOGO.lunetas.map((x, i) => x.b === b ? `<option value="${i}">${esc(x.m)} · ${x.u}${x.r.length ? " · " + esc(x.r.join(", ")) : ""}</option>` : "").join("")}</optgroup>`).join("")}</select></label>` : "") +
      (it ? `<div class="campos">${c.campos.filter(([, , , so]) => !so || so.split(" ").includes(it.zeroModo)).map(([k, rot, tp]) => { if (typeof tp === "function") tp = tp(); return `<label ${k === "nome" ? 'style="grid-column:1/-1"' : ""}>${rot}${Array.isArray(tp)
        ? `<select data-k="${k}">${tp.map(([v, t]) => `<option value="${v}" ${(it[k] ?? tp[0][0]) === v ? "selected" : ""}>${t}</option>`).join("")}</select>`
        : `<input data-k="${k}" value="${esc(it[k])}" ${tp === "texto" ? 'maxlength="60"' : 'inputmode="decimal"'}>`}</label>`; }).join("")}</div>` : "") +
      (tipo === "mira" ? `<p class="pequeno" style="margin:10px 0 0">Os dados do catálogo vêm das páginas dos fabricantes. Confira clique e valor por volta com o manual da sua luneta. A altura da mira e a zeragem são do seu rifle.</p>` : "") +
      (tipo === "rifle" ? `<p class="pequeno" style="margin:10px 0 0">O estriamento fica guardado para o cálculo de desvio giroscópico, que entra em uma próxima versão.</p>` : "") +
      (tipo === "municao" ? `<p class="pequeno" style="margin:10px 0 0">Use o coeficiente balístico e a velocidade medidos para a sua munição. Se não souber a variação por temperatura, deixe 0.</p>` : "");
    el.querySelector("[data-sel]").onchange = (e) => { E.sel[tipo] = e.target.value; salvar(); renderTudo(); };
    const cat = el.querySelector("[data-cat]");
    if (cat) cat.onchange = () => {
      const x = CATALOGO.lunetas[cat.value]; if (!x) return;
      const br = (n) => String(n).replace(".", ",");
      Object.assign(it, { nome: `${x.b} ${x.m}`.slice(0, 60), unidade: x.u, cliqueV: br(x.c), cliqueH: br(x.c), porVolta: x.v ? br(x.v) : "", reticulo: x.r.find((n) => CATALOGO.reticulos[n]) || "" });
      salvar(); renderTudo();
    };
    el.querySelector("[data-novo]").onclick = () => { const n = { id: id(), ...c.novo() }; lista.push(n); E.sel[tipo] = n.id; salvar(); renderTudo(); el.querySelector('[data-k="nome"]').select(); };
    el.querySelector("[data-del]").onclick = (e) => {
      if (lista.length < 2) return;
      const b = e.currentTarget;
      if (b.dataset.conf !== "1") { b.dataset.conf = "1"; b.textContent = "Confirmar"; setTimeout(() => { b.dataset.conf = ""; b.textContent = "Excluir"; }, 3000); return; }
      E[c.lista] = lista.filter((x) => x.id !== it.id); E.sel[tipo] = E[c.lista][0].id; salvar(); renderTudo();
    };
    el.querySelectorAll("[data-k]").forEach((inp) => {
      const grava = () => { it[inp.dataset.k] = inp.value; salvar(); };
      inp.oninput = grava;
      inp.onchange = () => { grava(); renderTudo(inp.tagName === "SELECT" || inp.dataset.k === "nome" ? null : tipo); };
      if (inp.tagName === "SELECT") inp.oninput = null;
    });
  }
}

// ---------- geral ----------
function seletores() {
  for (const [tipo, lista] of [["rifle", E.rifles], ["mira", E.miras], ["municao", E.municoes]]) {
    const s = $("#sel-" + tipo), it = atual(tipo);
    s.innerHTML = lista.map((x) => `<option value="${x.id}" ${it && x.id === it.id ? "selected" : ""}>${esc(x.nome)}</option>`).join("");
    s.onchange = () => { E.sel[tipo] = s.value; salvar(); renderTudo(); };
  }
}
function climaModo() {
  document.querySelectorAll("#clima-modo .chip").forEach((b) => b.classList.toggle("ativo", b.dataset.m === E.tiro.modo));
  document.querySelectorAll("[data-modo]").forEach((l) => l.style.display = l.dataset.modo.split(" ").includes(E.tiro.modo) ? "" : "none");
}
function renderTudo(pularCadastro) {
  seletores(); climaModo(); renderTiro(); renderTabela(); renderGrafico(); renderReticulo();
  if (!pularCadastro) renderCadastro();
}
$("#ventoHora").innerHTML = [[12, "12 h · de frente"], [1, "1 h"], [2, "2 h"], [3, "3 h · da direita"], [4, "4 h"], [5, "5 h"], [6, "6 h · de trás"], [7, "7 h"], [8, "8 h"], [9, "9 h · da esquerda"], [10, "10 h"], [11, "11 h"]].map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
for (const k of ["distancia", "inclinacao", "ventoVel", "ventoUn", "ventoHora", "temperatura", "pressao", "umidade", "altitude", "altitudeDensidade"]) {
  const inp = $("#" + k); inp.value = E.tiro[k] ?? "";
  inp.oninput = inp.onchange = () => { E.tiro[k] = inp.value; salvar(); renderTiro(); renderTabela(); renderGrafico(); renderReticulo(); };
}
for (const [k, i] of [["ini", "tabIni"], ["fim", "tabFim"], ["passo", "tabPasso"]]) {
  const inp = $("#" + i); inp.value = E.tab[k] ?? "";
  inp.oninput = () => { E.tab[k] = inp.value; salvar(); renderTabela(); renderGrafico(); };
}
document.querySelectorAll("#clima-modo .chip").forEach((b) => b.onclick = () => { E.tiro.modo = b.dataset.m; salvar(); renderTudo(true); });
document.querySelectorAll("#abas button").forEach((b) => b.onclick = () => {
  document.querySelectorAll("#abas button").forEach((x) => x.classList.toggle("ativo", x === b));
  document.querySelectorAll(".tela").forEach((t) => t.classList.toggle("ativa", t.id === "t-" + b.dataset.t));
  window.scrollTo(0, 0);
});
renderTudo();
