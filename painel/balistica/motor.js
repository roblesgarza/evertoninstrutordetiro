/* Motor balístico Ática — massa pontual (3 graus de liberdade), RK4, tabelas de arrasto padrão G1/G7 (públicas). */
const Balistica = (() => {
  const G1 = [[0,.2629],[.05,.2558],[.1,.2487],[.15,.2413],[.2,.2344],[.25,.2278],[.3,.2214],[.35,.2155],[.4,.2104],[.45,.2061],[.5,.2032],[.55,.202],[.6,.2034],[.7,.2165],[.725,.223],[.75,.2313],[.775,.2417],[.8,.2546],[.825,.2706],[.85,.2901],[.875,.3136],[.9,.3415],[.925,.3734],[.95,.4084],[.975,.4448],[1,.4805],[1.025,.5136],[1.05,.5427],[1.075,.5677],[1.1,.5883],[1.125,.6053],[1.15,.6191],[1.2,.6393],[1.25,.6518],[1.3,.6589],[1.35,.6621],[1.4,.6625],[1.45,.6607],[1.5,.6573],[1.55,.6528],[1.6,.6474],[1.65,.6413],[1.7,.6347],[1.75,.628],[1.8,.621],[1.85,.6141],[1.9,.6072],[1.95,.6003],[2,.5934],[2.05,.5867],[2.1,.5804],[2.15,.5743],[2.2,.5685],[2.25,.563],[2.3,.5577],[2.35,.5527],[2.4,.5481],[2.45,.5438],[2.5,.5397],[2.6,.5325],[2.7,.5264],[2.8,.5211],[2.9,.5168],[3,.5133],[3.1,.5105],[3.2,.5084],[3.3,.5067],[3.4,.5054],[3.5,.504],[3.6,.503],[3.7,.5022],[3.8,.5016],[3.9,.501],[4,.5006],[4.2,.4998],[4.4,.4995],[4.6,.4992],[4.8,.499],[5,.4988]];
  const G7 = [[0,.1198],[.05,.1197],[.1,.1196],[.15,.1194],[.2,.1193],[.25,.1194],[.3,.1194],[.35,.1194],[.4,.1193],[.45,.1193],[.5,.1194],[.55,.1193],[.6,.1194],[.65,.1197],[.7,.1202],[.725,.1207],[.75,.1215],[.775,.1226],[.8,.1242],[.825,.1266],[.85,.1306],[.875,.1368],[.9,.1464],[.925,.166],[.95,.2054],[.975,.2993],[1,.3803],[1.025,.4015],[1.05,.4043],[1.075,.4034],[1.1,.4014],[1.125,.3987],[1.15,.3955],[1.2,.3884],[1.25,.381],[1.3,.3732],[1.35,.3657],[1.4,.358],[1.5,.344],[1.55,.3376],[1.6,.3315],[1.65,.326],[1.7,.3209],[1.75,.316],[1.8,.3117],[1.85,.3078],[1.9,.3042],[1.95,.301],[2,.298],[2.05,.2951],[2.1,.2922],[2.15,.2892],[2.2,.2864],[2.25,.2835],[2.3,.2807],[2.35,.2779],[2.4,.2752],[2.45,.2725],[2.5,.2697],[2.55,.267],[2.6,.2643],[2.65,.2615],[2.7,.2588],[2.75,.2561],[2.8,.2533],[2.85,.2506],[2.9,.2479],[2.95,.2451],[3,.2424],[3.1,.2368],[3.2,.2313],[3.3,.2258],[3.4,.2205],[3.5,.2154],[3.6,.2106],[3.7,.206],[3.8,.2017],[3.9,.1975],[4,.1935],[4.2,.1861],[4.4,.1793],[4.6,.173],[4.8,.1672],[5,.1618]];
  const TAB = { G1, G7 };
  const g = 9.80665, RHO0 = 1.225, LB_IN2 = 703.0696; // 1 lb/in² em kg/m²
  const MOA_POR_MRAD = 3.4377468, SMOA_POR_MRAD = 3.6; // SMOA: 1 pol a 100 jardas

  function cd(tab, mach) {
    if (mach <= tab[0][0]) return tab[0][1];
    let lo = 0, hi = tab.length - 1;
    if (mach >= tab[hi][0]) return tab[hi][1];
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (tab[m][0] <= mach) lo = m; else hi = m; }
    const [m0, c0] = tab[lo], [m1, c1] = tab[hi];
    return c0 + (c1 - c0) * (mach - m0) / (m1 - m0);
  }

  // Atmosfera: modo "pressao" (pressão no local), "altitude" (pressão padrão para a altitude) ou "da" (altitude de densidade).
  function atmosfera(c) {
    const T = c.temperatura, TK = T + 273.15;
    const som = 331.3 * Math.sqrt(TK / 273.15);
    let rho, pressao = null;
    if (c.modo === "da") {
      rho = RHO0 * Math.pow(1 - 2.25577e-5 * c.altitudeDensidade, 4.25588);
    } else {
      pressao = c.modo === "altitude" ? 1013.25 * Math.pow(1 - 2.25577e-5 * c.altitude, 5.25588) : c.pressao;
      const pv = (c.umidade / 100) * 6.1078 * Math.pow(10, 7.5 * T / (T + 237.3));
      rho = ((pressao - pv) * 100) / (287.058 * TK) + (pv * 100) / (461.495 * TK);
    }
    const altDens = (1 - Math.pow(rho / RHO0, 1 / 4.25588)) / 2.25577e-5;
    return { rho, som, pressao, altDens };
  }

  // Integra a trajetória. Eixos: x ao longo da linha de visada, y perpendicular para cima, z para a direita.
  function voar(p, alfa, xMax, passoReg) {
    const tab = TAB[p.arrasto] || G7;
    const k = Math.PI * p.rho / (8 * p.cb * LB_IN2);
    const th = (p.inclinacao || 0) * Math.PI / 180;
    const gx = -g * Math.sin(th), gy = -g * Math.cos(th);
    const d = (p.ventoDir || 0) * Math.PI / 180, w = p.ventoVel || 0;
    const wx = -w * Math.cos(d), wz = -w * Math.sin(d); // direção = de onde o vento vem (0° de frente, 90° da direita)
    let s = [0, -p.alturaMira, 0, p.v0 * Math.cos(alfa), p.v0 * Math.sin(alfa), 0], t = 0;
    const f = (q) => {
      const rx = q[3] - wx, ry = q[4], rz = q[5] - wz, vr = Math.hypot(rx, ry, rz);
      const a = k * vr * cd(tab, vr / p.som);
      return [q[3], q[4], q[5], -a * rx + gx, -a * ry + gy, -a * rz];
    };
    const soma = (q, dq, h) => q.map((v, i) => v + dq[i] * h);
    const pontos = []; let prox = 0, yMax = -Infinity, xyMax = 0;
    const reg = (q, tt) => ({ x: q[0], y: q[1], z: q[2], v: Math.hypot(q[3], q[4], q[5]), t: tt });
    const dt = 0.0004;
    for (let n = 0; n < 200000; n++) {
      const k1 = f(s), k2 = f(soma(s, k1, dt / 2)), k3 = f(soma(s, k2, dt / 2)), k4 = f(soma(s, k3, dt));
      const s2 = s.map((v, i) => v + dt / 6 * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
      while (prox <= xMax + 1e-9 && s2[0] >= prox) {
        const fr = (prox - s[0]) / (s2[0] - s[0]);
        pontos.push(reg(s.map((v, i) => v + (s2[i] - v) * fr), t + dt * fr));
        prox += passoReg;
      }
      if (s2[1] > yMax && s2[0] <= xMax) { yMax = s2[1]; xyMax = s2[0]; }
      s = s2; t += dt;
      if (s[0] >= xMax || s[3] < 30 || s[1] < -5000) break;
    }
    return { pontos, yMax, xyMax };
  }

  function em(p, alfa, x) { // estado exatamente na distância x
    const r = voar(p, alfa, x, x > 0 ? x : 1).pontos;
    return r[r.length - 1].x >= x - 1e-6 ? r[r.length - 1] : null;
  }

  // Ângulo de saída que zera na distância de zeragem (terreno plano, sem vento).
  function zerar(p) {
    const pz = { ...p, inclinacao: 0, ventoVel: 0, rho: p.zeroRho ?? p.rho, som: p.zeroSom ?? p.som, v0: p.zeroV0 ?? p.v0 };
    let alfa = p.alturaMira / p.zero;
    for (let i = 0; i < 8; i++) {
      const e = em(pz, alfa, p.zero);
      if (!e) return null;
      alfa -= e.y / p.zero;
      if (Math.abs(e.y) < 1e-7) break;
    }
    return alfa;
  }

  function correcao(desvio, x, clique) { // desvio em metros (positivo = acima / direita do ponto visado)
    const mrad = x > 0 ? -desvio / x * 1000 : 0;
    return { mrad, moa: mrad * MOA_POR_MRAD, smoa: mrad * SMOA_POR_MRAD, cm: -desvio * 100, cliques: clique > 0 ? mrad / clique : null };
  }

  /* entrada: { massaKg, cb, arrasto, v0, alturaMira (m), zero (m), cliqueV, cliqueH (em mrad),
                rho, som, inclinacao (graus), ventoVel (m/s), ventoDir (graus) } */
  function calcular(p, distancia) {
    const alfa = zerar(p);
    if (alfa === null) return null;
    const e = em(p, alfa, distancia);
    if (!e) return null;
    const en = (v) => 0.5 * p.massaKg * v * v;
    const elev = correcao(e.y, distancia, p.cliqueV), vento = correcao(e.z, distancia, p.cliqueH);
    const corr = voar(p, alfa + elev.mrad / 1000, distancia, distancia);
    return {
      alfa, elev, vento, velocidade: e.v, energia: en(e.v), energiaBoca: en(p.v0), tempo: e.t, mach: e.v / p.som,
      quedaCm: e.y * 100, derivaCm: e.z * 100,
      alturaMaxCm: Math.max(corr.yMax, 0) * 100, distAlturaMax: corr.yMax > 0 ? corr.xyMax : 0,
      cliqueCmV: p.cliqueV * distancia / 10, cliqueCmH: p.cliqueH * distancia / 10,
    };
  }

  function tabela(p, ini, fim, passo) {
    const alfa = zerar(p);
    if (alfa === null || !(passo > 0) || fim < ini) return [];
    const linhas = [];
    for (let x = ini; x <= fim + 1e-9; x += passo) {
      const e = x === 0 ? { x: 0, y: -p.alturaMira, z: 0, v: p.v0, t: 0 } : em(p, alfa, x);
      if (!e) break;
      linhas.push({ x, v: e.v, energia: 0.5 * p.massaKg * e.v * e.v, t: e.t, quedaCm: e.y * 100, derivaCm: e.z * 100,
        elev: correcao(e.y, x, p.cliqueV), vento: correcao(e.z, x, p.cliqueH) });
    }
    return linhas;
  }

  function curva(p, fim, n = 120) { // pontos para o gráfico (trajetória em relação à linha de visada)
    const alfa = zerar(p);
    if (alfa === null) return [];
    return voar(p, alfa, fim, fim / n).pontos;
  }

  // Fator de estabilidade giroscópica (regra de Miller, com correção de velocidade e de densidade do ar).
  function estabilidade(m) { // { massaKg, diametroMm, comprimentoMm, passoMm, v0, rho }
    const d = m.diametroMm / 25.4, l = m.comprimentoMm / m.diametroMm, t = m.passoMm / m.diametroMm, gr = m.massaKg * 1000 / 0.06479891;
    if (!(d > 0) || !(l > 0) || !(t > 0) || !(gr > 0)) return null;
    return 30 * gr / (t * t * d * d * d * l * (1 + l * l)) * Math.cbrt(m.v0 / 0.3048 / 2800) * (RHO0 / m.rho);
  }

  return { estabilidade, atmosfera, calcular, tabela, curva, cd, TAB, MOA_POR_MRAD, SMOA_POR_MRAD };
})();
