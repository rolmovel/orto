// Detección de dientes y utilidades de análisis dental (orientativo).
// Aísla los vértices "diente" por el color realista (verde alto = marfil),
// construye el arco en planta (XZ), encuentra un pico por diente y asigna
// posiciones FDI contando desde la línea media. Código propio.
import * as THREE from 'three';

const D2R = Math.PI / 180;

// ---------- discriminador diente/encía ----------
function esDiente(geo, col, arco, i, yOcl, banda) {
  if (col) return col.getY(i) > .42; // marfil (g≈.85) vs encía (g≈.16), sRGB lineal
  const y = geo.attributes.position.getY(i);
  return arco === 'inf' ? y > yOcl - banda : y < yOcl + banda;
}

// ---------- frente/posterior por casco convexo ----------
// La arista del casco cuyo punto medio queda más lejos de cualquier punto
// diente es la apertura posterior de la U; su normal interior es el frente.
function frentePosterior(pts2, centro) {
  const P = [...pts2].sort((a, b) => a.x - b.x || a.y - b.y);
  const cruz = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const inf = [], sup = [];
  for (const p of P) { while (inf.length > 1 && cruz(inf[inf.length - 2], inf[inf.length - 1], p) <= 0) inf.pop(); inf.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (sup.length > 1 && cruz(sup[sup.length - 2], sup[sup.length - 1], p) <= 0) sup.pop(); sup.push(p); }
  inf.pop(); sup.pop();
  const casco = [...inf, ...sup];
  let eG = 0, dG = -1;
  for (let i = 0; i < casco.length; i++) {
    const a = casco[i], b = casco[(i + 1) % casco.length];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    let dm = 1e9;
    for (const p of pts2) { const d = (p.x - mx) ** 2 + (p.y - my) ** 2; if (d < dm) dm = d; }
    if (dm > dG) { dG = dm; eG = i; }
  }
  const a = casco[eG], b = casco[(eG + 1) % casco.length];
  const medio = new THREE.Vector2((a.x + b.x) / 2, (a.y + b.y) / 2);
  const frente = new THREE.Vector2(centro[0] - medio.x, centro[1] - medio.y).normalize();
  return { frente, fin: [a, b], medio };
}

// ---------- análisis principal ----------
// Devuelve {ok, arco, centro2, frente, derecha, dientes:[{numero,lado,fdi,
//   centro,cuspide,contactos:[c0,c1],ancho}], linea:[Vector2], A, anchoArco}
// o {ok:false} si no encuentra suficiente.
export function analizarDientes(m) {
  if (m.dientes) return m.dientes;
  const geo = m.geo, arco = m.arco || 'sup';
  const pos = geo.attributes.position, col = m.colRealista || geo.attributes.color || null;
  const caja = new THREE.Box3().setFromBufferAttribute(pos);
  const yOcl = arco === 'inf' ? caja.max.y : caja.min.y;

  // 1. nube de puntos de diente proyectados a planta
  const pts = [], pts2 = [];
  for (let i = 0; i < pos.count; i += 2) { // muestreo: basta cada 2 vértices
    if (esDiente(geo, col, arco, i, yOcl, 13)) { pts.push([pos.getX(i), pos.getZ(i), pos.getY(i)]); pts2.push(new THREE.Vector2(pos.getX(i), pos.getZ(i))); }
  }
  if (pts.length < 3000) return { ok: false };

  const c = [0, 0];
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; }
  c[0] /= pts.length; c[1] /= pts.length;

  // 2. contorno por sectores angulares (percentil 75 del radio por sector)
  const NB = 240;
  const sect = new Array(NB);
  for (const p of pts) {
    const a = Math.atan2(p[1] - c[1], p[0] - c[0]);
    const k = Math.floor(((a + Math.PI) / (2 * Math.PI)) * NB);
    (sect[k] || (sect[k] = [])).push(Math.hypot(p[0] - c[0], p[1] - c[1]));
  }
  const r = new Array(NB).fill(0), hay = new Array(NB).fill(false);
  for (let i = 0; i < NB; i++) {
    const a = sect[i]; if (!a) continue;
    a.sort((x, y) => x - y);
    r[i] = a[Math.floor(a.length * .45)]; // ~línea media de corona: contactos y centros
    hay[i] = true;
  }
  // casco: frente (normal interior de la apertura) y extremos reales del arco
  const fp = frentePosterior(pts2, c);
  const norm = a => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const aA = Math.atan2(fp.fin[0].y - c[1], fp.fin[0].x - c[0]);
  const aB = Math.atan2(fp.fin[1].y - c[1], fp.fin[1].x - c[0]);
  const aFr = Math.atan2(fp.frente.y, fp.frente.x);
  const dAB = norm(aB - aA);
  // el recorrido del arco es el intervalo entre extremos que contiene el frente
  const directo = norm(aFr - aA) <= dAB;
  const inicio = directo ? aA : aB, span = directo ? dAB : norm(aA - aB);
  const nInt = Math.max(40, Math.round(span / (2 * Math.PI) * NB));
  const aPi = a => a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI)); // wrap a [-π, π)
  const idxs = [];
  for (let i = 0; i <= nInt; i++) {
    const a = aPi(inicio + (i / nInt) * span);
    const k = Math.floor(((a + Math.PI) / (2 * Math.PI)) * NB) % NB;
    if (!idxs.length || idxs[idxs.length - 1] !== k) idxs.push(k);
  }
  if (idxs.length < 30) return { ok: false };
  // rellenar huecos pequeños interpolando radio
  for (let k = 0; k < idxs.length; k++) {
    if (hay[idxs[k]]) continue;
    let a = k, b = k;
    while (a > 0 && !hay[idxs[a]]) a--;
    while (b < idxs.length - 1 && !hay[idxs[b]]) b++;
    r[idxs[k]] = (r[idxs[a]] * (b - k) + r[idxs[b]] * (k - a)) / Math.max(b - a, 1);
  }
  // suavizado del radio (mediana ±2 bins): quita el zigzag del percentil
  const rs = new Float32Array(idxs.length);
  for (let k = 0; k < idxs.length; k++) {
    const v = [];
    for (let j = Math.max(0, k - 2); j <= Math.min(idxs.length - 1, k + 2); j++) v.push(r[idxs[j]]);
    v.sort((x, y) => x - y);
    rs[k] = v[v.length >> 1];
  }
  // polilínea del arco (ángulo -> punto) y remuestreo por arco ~0.8 mm
  const linea = idxs.map((i, k) => {
    const a = (i / NB) * 2 * Math.PI - Math.PI;
    return new THREE.Vector2(c[0] + Math.cos(a) * rs[k], c[1] + Math.sin(a) * rs[k]);
  });
  const s = [0];
  for (let i = 1; i < linea.length; i++) s.push(s[i - 1] + linea[i].distanceTo(linea[i - 1]));
  const L = s[s.length - 1], pasoArco = .8;
  const M = Math.max(10, Math.round(L / pasoArco));
  const px = new Float32Array(M + 1), py = new Float32Array(M + 1);
  for (let i = 0, j = 0; i <= M; i++) {
    const d = (i / M) * L;
    while (j < s.length - 2 && s[j + 1] < d) j++;
    const t = (d - s[j]) / Math.max(s[j + 1] - s[j], 1e-6);
    px[i] = linea[j].x + (linea[j + 1].x - linea[j].x) * t;
    py[i] = linea[j].y + (linea[j + 1].y - linea[j].y) * t;
  }
  // radio suavizado r(s) respecto al centroide
  const rr = new Float32Array(M + 1);
  for (let i = 0; i <= M; i++) rr[i] = Math.hypot(px[i] - c[0], py[i] - c[1]);

  // 3. propuesta proporcional: los anchos medios conocidos reparten cada
  //    hemiarcada desde la línea media; luego cada pico se ajusta al máximo
  //    local del residual r − media (festón facial de cada corona).
  // posF: punto de la polilínea con máxima proyección sobre el frente
  let posF = 0, mx = -1e9;
  for (let i = 0; i <= M; i++) { const s = px[i] * fp.frente.x + py[i] * fp.frente.y; if (s > mx) { mx = s; posF = i; } }
  posF = Math.max(2, Math.min(M - 2, posF));
  const der2 = new THREE.Vector2(-fp.frente.y, fp.frente.x);
  const s0 = (px[0] - c[0]) * der2.x + (py[0] - c[1]) * der2.y;
  const mmPaso = L / M;
  // residual: r(s) − media móvil ~14 mm
  const WR = Math.round(7 / mmPaso);
  const resid = new Float32Array(M + 1);
  for (let i = 0; i <= M; i++) { let a = 0, n = 0; for (let k2 = -WR; k2 <= WR; k2++) { const j = i + k2; if (j >= 0 && j <= M) { a += rr[j]; n++; } } resid[i] = rr[i] - a / n; }
  // anchos mesiodistales medios (mm) 1→7 por arcada
  const PROP = arco === 'sup' ? [8.5, 6.5, 7.5, 7, 7, 10, 9] : [5, 5.5, 7, 7, 7.5, 10.5, 9.5];
  const dientes = [];
  const proponer = (desde, hasta, lado) => {
    // `desde` = índice junto a la línea media, `hasta` = extremo posterior
    const len = Math.abs(hasta - desde) * mmPaso;
    const n = len > 47 ? 7 : 6;
    const prop = PROP.slice(0, n);
    const esc = len * .97 / prop.reduce((a, b) => a + b, 0);
    const paso = Math.sign(hasta - desde);
    let borde = desde;
    for (let q = 1; q <= n; q++) {
      const w = prop[q - 1] * esc;
      const b2 = Math.max(0, Math.min(M, Math.round(borde + paso * w / mmPaso)));
      let pico = Math.max(0, Math.min(M, Math.round((borde + b2) / 2)));
      // ajuste fino: máximo del residual dentro de ±min(3 mm, w/3)
      const dB = Math.round(Math.min(3, w / 3) / mmPaso);
      let mejor = pico;
      for (let i = Math.max(0, pico - dB); i <= Math.min(M, pico + dB); i++) if (resid[i] > resid[mejor]) mejor = i;
      if (resid[mejor] > resid[pico] + .15) pico = mejor;
      dientes.push({ numero: q, lado, fdi: fdiDe(arco, lado, q),
        pico: new THREE.Vector2(px[pico], py[pico]),
        contactos: [
          q === 1 ? new THREE.Vector2(px[posF], py[posF]) : new THREE.Vector2(px[Math.round(borde)], py[Math.round(borde)]),
          new THREE.Vector2(px[Math.round(b2)], py[Math.round(b2)]),
        ],
        ancho: Math.abs(b2 - borde) * mmPaso });
      borde = b2;
    }
  };
  proponer(posF, 0, s0 > 0 ? 'd' : 'i');  // hemiarcada del extremo 0
  proponer(posF, M, s0 > 0 ? 'i' : 'd');  // hemiarcada del extremo M
  for (const d of dientes) {
    d.centro = puntoOclusal(geo, col, arco, d.pico, yOcl, false);
    d.cuspide = puntoOclusal(geo, col, arco, d.pico, yOcl, true);
  }
  // punto A: valle entre los dos centrales (11/21)
  const d1 = dientes.find(d => d.numero === 1 && d.lado === 'd');
  const d2 = dientes.find(d => d.numero === 1 && d.lado === 'i');
  const A = d1 && d2 ? new THREE.Vector2().addVectors(d1.pico, d2.pico).multiplyScalar(.5) : new THREE.Vector2(px[posF], py[posF]);
  // ejes: frente = normal interior de la apertura posterior (casco)
  const frente = fp.frente;
  const derecha = new THREE.Vector2(-frente.y, frente.x); // gira -90°: derecha del paciente
  // corregir el signo de lado por si el recorrido salió al revés
  for (const d of dientes) d.lado = (d.pico.x - c[0]) * derecha.x + (d.pico.y - c[1]) * derecha.y > 0 ? 'd' : 'i';
  for (const d of dientes) d.fdi = fdiDe(arco, d.lado, d.numero);

  const res = { ok: true, arco, centro2: c, frente, derecha, dientes, linea, A,
    linea3: linea.map(p => new THREE.Vector3(p.x, yOcl, p.y)) };
  m.dientes = res;
  return res;
}

function fdiDe(arco, lado, numero) {
  if (numero > 8) return null;
  const q = arco === 'sup' ? (lado === 'd' ? 1 : 2) : (lado === 'i' ? 3 : 4);
  return q * 10 + numero;
}

// vértice de diente más próximo al punto 2D; cuspide=el de cota oclusal extrema
function puntoOclusal(geo, col, arco, p2, yOcl, cuspide) {
  const pos = geo.attributes.position;
  let mejor = -1, md = Infinity, yo = arco === 'inf' ? -1e9 : 1e9;
  for (let i = 0; i < pos.count; i += 3) {
    if (col && col.getY(i) <= .42) continue;
    const dx = pos.getX(i) - p2.x, dz = pos.getZ(i) - p2.y;
    const d2 = dx * dx + dz * dz;
    if (d2 > 16) continue;
    const y = pos.getY(i);
    if (cuspide) {
      const e = arco === 'inf' ? y : -y;
      if (e > (arco === 'inf' ? yo : -yo)) { yo = y; mejor = i; }
    } else if (d2 < md) { md = d2; mejor = i; }
  }
  if (mejor < 0) return new THREE.Vector3(p2.x, yOcl, p2.y);
  return new THREE.Vector3(pos.getX(mejor), pos.getY(mejor), pos.getZ(mejor));
}

// ---------- sprite de texto ----------
export function spriteTexto(txt, { color = '#004A46', alto = 2.6, fondo = 'rgba(255,255,255,.78)' } = {}) {
  const cv = document.createElement('canvas');
  const ctx = cv.getContext('2d');
  ctx.font = '600 44px Poppins, sans-serif';
  const w = Math.ceil(ctx.measureText(txt).width) + 22;
  cv.width = w; cv.height = 56;
  const c2 = cv.getContext('2d');
  c2.fillStyle = fondo; c2.beginPath(); c2.roundRect(0, 0, w, 56, 10); c2.fill();
  c2.font = '600 44px Poppins, sans-serif'; c2.fillStyle = color;
  c2.textBaseline = 'middle'; c2.fillText(txt, 11, 30);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  sp.scale.set(alto * w / 56, alto, 1);
  return sp;
}

// ---------- medidas derivadas para los informes ----------
// Análisis Bolton: sumas de anchos por sector
export function bolton(sup, inf) {
  const suma = (res, nums) => res.dientes.filter(d => nums.includes(d.numero)).reduce((s, d) => s + d.ancho, 0);
  const ant = { s: suma(sup, [1, 2, 3]), i: suma(inf, [1, 2, 3]) };
  const tot = { s: suma(sup, [1, 2, 3, 4, 5, 6]), i: suma(inf, [1, 2, 3, 4, 5, 6]) };
  return {
    ant: { s: ant.s, i: ant.i, ratio: ant.s ? 100 * ant.i / ant.s : 0, norma: 77.2, tol: 1.65 },
    tot: { s: tot.s, i: tot.i, ratio: tot.s ? 100 * tot.i / tot.s : 0, norma: 91.3, tol: 1.91 },
  };
}

export function anchosArcada(res) {
  const entre = n => {
    const a = res.dientes.find(d => d.numero === n && d.lado === 'd');
    const b = res.dientes.find(d => d.numero === n && d.lado === 'i');
    return a && b ? a.centro.distanceTo(b.centro) : null;
  };
  // perímetro de la arcada: suma de anchos 1..6
  const perimetro = res.dientes.filter(d => d.numero <= 6).reduce((s, d) => s + d.ancho, 0);
  return { canino: entre(3), premolar: entre(4), molar: entre(6), perimetro };
}

// resalte/sobremordida entre incisivos centrales, en el marco del modelo sup
export function resalte(sup, inf) {
  const s1 = sup.dientes.find(d => d.numero === 1), i1 = inf.dientes.find(d => d.numero === 1);
  if (!s1 || !i1) return null;
  const sag = new THREE.Vector3(sup.frente.x, 0, sup.frente.y).normalize();
  const pS = s1.cuspide, pI = i1.cuspide;
  return {
    resalte: pS.clone().sub(pI).dot(sag),
    sobremordida: pI.y - pS.y,
  };
}

// relación molar/canina (Angle): desfase sagital entre piezas homónimas
export function relacion(sup, inf, numero) {
  const out = {};
  for (const lado of ['d', 'i']) {
    const s = sup.dientes.find(d => d.numero === numero && d.lado === lado);
    const i = inf.dientes.find(d => d.numero === numero && d.lado === lado);
    if (!s || !i) continue;
    const sag = new THREE.Vector3(sup.frente.x, 0, sup.frente.y).normalize();
    const d = s.centro.clone().sub(i.centro).dot(sag);
    out[lado] = { d, clase: Math.abs(d) < 3.5 ? 'I' : d > 0 ? 'II' : 'III' };
  }
  return out;
}
