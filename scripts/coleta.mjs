// Robô de coleta de resultados LINADE + FPTE para evertoninstrutordetiro.com.br
// Roda diariamente no GitHub Actions (Node 20+). Gera data/resultados.json.
// Sem dependências externas.

const CLUBES_LINADE = [/MIRASSOL/i, /RIO PRETO/i];        // nome do clube (coluna CLUBE)
const CLUBES_FPTE = ['ADTM', 'CTRP'];                      // sigla do clube na FPTE
const NOMES_CLUBE = { ADTM: 'ADTM – Mirassol', CTRP: 'Clube de Tiro Rio Preto' };
const JANELA_DIAS = 75;                                    // etapas terminadas há até N dias são (re)coletadas
const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; evertoninstrutordetiro.com.br resultados)' };

const txt = s => String(s ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&ordm;/g, 'º').replace(/&amp;/g, '&').replace(/&#039;|&#39;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/&([a-zA-Z])(acute|grave|tilde|circ|uml);/g, (m, c, t) => (c + { acute: '́', grave: '̀', tilde: '̃', circ: '̂', uml: '̈' }[t]).normalize('NFC'))
  .replace(/&([cC])cedil;/g, (m, c) => (c === 'c' ? 'ç' : 'Ç')).replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n))
  .replace(/\s+/g, ' ').trim();
const br2iso = d => { const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(d); return m ? `${m[3]}-${m[2]}-${m[1]}` : null; };
const hojeISO = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const diasEntre = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

async function get(url, tentativas = 3) {
  for (let i = 1; i <= tentativas; i++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.text();
    } catch (e) {
      if (i === tentativas) throw new Error(url + ' -> ' + e.message);
      await new Promise(r => setTimeout(r, 3000 * i));
    }
  }
}

// ---------------- LINADE ----------------
const LIN = 'https://www.linade.com.br';

// O cabeçalho (nome e datas da etapa) vem em um script jQuery dentro do HTML da página de resultados.
export function parseLinadeCabecalho(html) {
  const t = /titulo-cabecalho h1'\)\.html\('([^']*)'/.exec(html);
  const d = /titulo-cabecalho h2'\)\.html\('(\d{2}\/\d{2}\/\d{4})[^\d]*(\d{2}\/\d{2}\/\d{4})?/.exec(html);
  const ins = /INSCRI[ÇC][ÕO]ES:\s*(\d+)/i.exec(html.slice(0, 400000));
  if (!t || !txt(t[1])) return null;
  return { nome: txt(t[1]), inicio: d ? br2iso(d[1]) : null, fim: d ? br2iso(d[2] || d[1]) : null, inscricoes: ins ? Number(ins[1]) : null };
}

export function parseLinadeResultados(html, filtros = CLUBES_LINADE) {
  const res = [];
  for (const m of html.matchAll(/var rows(\d+)\s*=\s*(\[[\s\S]*?\]);/g)) {
    const id = m[1];
    let rows;
    try { rows = JSON.parse(m[2]); } catch { continue; }
    const p = html.indexOf('scrollArea' + id);
    const h3s = [...html.slice(0, p).matchAll(/<h3[^>]*res_h3[^>]*>([\s\S]*?)<\/h3>/g)];
    const categoria = h3s.length ? txt(h3s[h3s.length - 1][1]) : '';
    const thead = html.slice(html.indexOf('<thead', p), html.indexOf('</thead>', p));
    const cols = [...thead.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(x => txt(x[1]).toUpperCase());
    const cnt = /N[ºo°]\s*ATLETA\(S\):\s*(\d+)/i.exec(html.slice(p, p + 400000).replace(/<[^>]*>/g, ' '));
    const total = cnt ? Number(cnt[1]) : rows.length;
    // Algumas competições usam "CLUBE", outras "CLUBE DEFENSOR"; "CLUBE SEDE" é onde a prova foi feita.
    const iCL = cols.indexOf('CL'), iAt = cols.indexOf('ATLETA'), iTot = cols.indexOf('TOTAL');
    const iClube = cols.indexOf('CLUBE') >= 0 ? cols.indexOf('CLUBE') : cols.indexOf('CLUBE DEFENSOR');
    const iSede = cols.indexOf('CLUBE SEDE');
    for (const r of rows) {
      const tds = [...String(r).matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => txt(x[1]));
      if (tds.length < 4) continue;
      const clube = (iClube >= 0 ? tds[iClube] : '') || '';
      const sede = (iSede >= 0 ? tds[iSede] : '') || '';
      if (!filtros.some(f => f.test(clube) || f.test(sede))) continue;
      const cl = parseInt(tds[iCL], 10);
      res.push({ categoria, cl: Number.isFinite(cl) ? cl : null, atleta: tds[iAt] ?? '', clube: clube || sede, sede, total: tds[iTot] ?? '', participantes: total });
    }
  }
  return res;
}

// A lista de etapas da LINADE é montada por uma API privada; por isso o robô percorre os
// números das etapas (IDs sequenciais) direto nas páginas públicas de resultados.
const LINADE_ID_INICIAL = 220;   // primeiras etapas de 2026 ficam acima deste número

async function coletarLinade(ano, antigo) {
  const hoje = hojeISO();
  const porId = new Map(antigo.map(e => [Number(e.id), e]));
  const maxConhecido = Math.max(LINADE_ID_INICIAL, ...porId.keys());
  let vazios = 0, maxVisto = maxConhecido;
  for (let id = LINADE_ID_INICIAL; id < LINADE_ID_INICIAL + 400; id++) {
    if (id > maxVisto && vazios >= 6) break;                                                   // 6 números seguidos sem etapa: acabou
    const ja = porId.get(id);
    if (ja && ja.status === 'encerrada' && diasEntre(ja.fim, hoje) > JANELA_DIAS) continue;   // já fechada: não baixa de novo
    if (!ja && antigo.length && id < maxConhecido) continue;                                   // número sem etapa do ano em execuções anteriores
    try {
      const html = await get(`${LIN}/etapa/resultados-agrupados/${id}/1/`);
      const cab = parseLinadeCabecalho(html);
      if (!cab) { if (id > maxVisto) vazios++; continue; }
      vazios = 0; maxVisto = Math.max(maxVisto, id);
      if (!cab.inicio || !cab.inicio.startsWith(String(ano)) || /^teste/i.test(cab.nome)) continue;
      const resultados = cab.inicio <= hoje ? parseLinadeResultados(html) : [];
      const status = cab.inicio > hoje ? 'agendada' : (cab.fim >= hoje ? 'em andamento' : 'encerrada');
      porId.set(id, { id: String(id), ...cab, url: `${LIN}/etapa/resultados-categorias/${id}`, status, resultados });
      console.log(`LINADE ${id} ${cab.nome} [${status}]: ${resultados.length} resultados da região`);
    } catch (err) {
      console.error('LINADE falhou', id, err.message);
    }
    await new Promise(r => setTimeout(r, 800));
  }
  return [...porId.values()].filter(e => String(e.inicio || '').startsWith(String(ano))).sort((a, b) => (b.inicio || '').localeCompare(a.inicio || ''));
}

// ---------------- FPTE ----------------
const FP = 'https://www.fpte.org.br';

export function parseFpteEventos(html, ano) {
  const out = [];
  for (const tr of html.split(/<tr[\s>]/i).slice(1)) {
    const m = /pagina=resultados\/(\d{4})\/(\d+)/.exec(tr);
    if (!m) continue;
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => txt(x[1]));
    const d = tds.filter(t => /^\d{2}\/\d{2}$/.test(t));
    const iso = s => s ? `${m[1]}-${s.slice(3, 5)}-${s.slice(0, 2)}` : null;
    const nome = tds.find(t => t.length > 8 && !/^\d{2}\/\d{2}/.test(t)) || '';
    out.push({ id: m[2], ano: m[1], nome, inicio: iso(d[0]), fim: iso(d[1] || d[0]), ambito: tds[tds.length - 1] || '' });
  }
  return out;
}

export function parseFpteResultados(html, siglas = CLUBES_FPTE) {
  const res = [];
  for (const tb of html.split(/<table/i).slice(1)) {
    const thead = /<thead[\s\S]*?<\/thead>/i.exec(tb);
    if (!thead || !/Disciplina/i.test(thead[0])) continue;
    const cols = [...thead[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map(x => txt(x[1]).toUpperCase());
    const iClube = cols.indexOf('CLUBE');
    const body = tb.slice(tb.indexOf('</thead>'), tb.indexOf('</table>') > 0 ? tb.indexOf('</table>') : undefined);
    const linhas = [];
    for (const tr of body.split(/<tr[\s>]/i).slice(1)) {
      const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(x => txt(x[1]));
      if (tds.length < 4) continue;
      linhas.push({ categoria: tds[0], cl: parseInt(tds[1], 10), atleta: tds[2], total: tds[3], clube: tds[iClube >= 0 ? iClube : tds.length - 2] || '' });
    }
    const porCat = {};
    for (const l of linhas) porCat[l.categoria] = (porCat[l.categoria] || 0) + 1;
    for (const l of linhas) {
      if (!siglas.includes(l.clube.toUpperCase())) continue;
      res.push({ ...l, cl: Number.isFinite(l.cl) ? l.cl : null, clube: NOMES_CLUBE[l.clube.toUpperCase()] || l.clube, participantes: porCat[l.categoria] });
    }
  }
  return res;
}

async function coletarFpte(ano, antigo) {
  const eventos = parseFpteEventos(await get(`${FP}/template.php?pagina=resultados`), ano).filter(e => e.ano === String(ano) && !/\(teste\)|^teste/i.test(e.nome));
  const hoje = hojeISO();
  const out = [];
  for (const e of eventos) {
    const url = `${FP}/template.php?pagina=resultados/${e.ano}/${e.id}`;
    const ja = antigo.find(x => x.id === e.id);
    const recente = e.fim && diasEntre(e.fim, hoje) <= JANELA_DIAS;
    if (e.inicio && e.inicio > hoje) { out.push({ ...e, url, status: 'agendada', resultados: [] }); continue; }
    if (ja && !recente) { out.push(ja); continue; }
    try {
      const resultados = parseFpteResultados(await get(url));
      out.push({ ...e, url, status: e.fim >= hoje ? 'em andamento' : 'encerrada', resultados });
      console.log(`FPTE ${e.id} ${e.nome}: ${resultados.length} resultados da região`);
    } catch (err) {
      console.error('FPTE falhou', e.id, err.message);
      if (ja) out.push(ja);
    }
  }
  return out;
}

// ---------------- Notícias ----------------
export function parseNoticias(html, base, padrao) {
  const vistos = new Set(), out = [];
  for (const m of html.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1], t = txt(m[2]);
    if (!padrao.test(href) || t.length < 18 || t.length > 160 || vistos.has(href)) continue;
    vistos.add(href);
    out.push({ titulo: t, url: href.startsWith('http') ? href : base + (href.startsWith('/') ? '' : '/') + href });
    if (out.length >= 6) break;
  }
  return out;
}

async function coletarNoticias() {
  const out = [];
  try {
    const h = await get(`${LIN}/noticias/`);
    const vistos = new Set();
    for (const m of h.matchAll(/<h3[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
      const titulo = txt(m[2]);
      if (!titulo || vistos.has(m[1])) continue;
      vistos.add(m[1]); out.push({ titulo, url: m[1], fonte: 'LINADE' });
      if (vistos.size >= 6) break;
    }
  } catch (e) { console.error('notícias LINADE', e.message); }
  try { out.push(...parseNoticias(await get(`${FP}/template.php?pagina=noticias`), FP, /pagina=noticia[s]?\/\d+/i).map(n => ({ ...n, fonte: 'FPTE' }))); } catch (e) { console.error('notícias FPTE', e.message); }
  return out;
}

// ---------------- Main ----------------
async function main() {
  const fs = await import('node:fs/promises');
  const arq = new URL('../data/resultados.json', import.meta.url);
  let antigo = {};
  try { antigo = JSON.parse(await fs.readFile(arq, 'utf8')); } catch {}
  const ano = Number(hojeISO().slice(0, 4));
  const linade = await coletarLinade(ano, antigo.linade || []);
  const fpte = await coletarFpte(ano, antigo.fpte || []);
  const noticias = await coletarNoticias();
  if (!linade.length && !fpte.length) throw new Error('Nenhuma etapa encontrada: layout dos sites pode ter mudado.');
  const dados = { atualizado: new Date().toISOString(), ano, clubes: ['ADTM – Mirassol', 'Clube de Tiro Rio Preto'], linade, fpte, noticias: noticias.length ? noticias : (antigo.noticias || []) };
  await fs.mkdir(new URL('../data/', import.meta.url), { recursive: true });
  await fs.writeFile(arq, JSON.stringify(dados));
  const n = [...linade, ...fpte].reduce((s, e) => s + e.resultados.length, 0);
  console.log(`OK: ${linade.length} etapas LINADE, ${fpte.length} eventos FPTE, ${n} resultados da região, ${dados.noticias.length} notícias.`);
}

if (typeof process !== 'undefined' && process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch(e => { console.error(e); process.exit(1); });
}
