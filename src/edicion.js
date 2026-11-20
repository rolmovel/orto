// Operaciones sobre las mallas: secciones 2D, relleno de agujeros, pinceles,
// zócalo virtual y superposición por pares de puntos. Código propio.
import * as THREE from 'three';
import earcut from '../assets/lib/earcut.js';

/* ---------------- sección de la malla por un plano ---------------- */
// Devuelve los segmentos de intersección como pares de Vector3.
export function seccionMalla(geo, origen, normal) {
  const pos = geo.attributes.position;
  const idx = geo.index ? geo.index.array : null;
  const n = idx ? idx.length : pos.count;
  const at = i => { const k = idx ? idx[i] : i; return [pos.getX(k), pos.getY(k), pos.getZ(k)]; };
  const segs = [];
  const d = new Array(3), v = [new Array(3), new Array(3), new Array(3)];
  for (let t = 0; t < n; t += 3) {
    let pos_ = 0, neg = 0;
    for (let e = 0; e < 3; e++) {
      v[e] = at(t + e);
      d[e] = (v[e][0] - origen.x) * normal.x + (v[e][1] - origen.y) * normal.y + (v[e][2] - origen.z) * normal.z;
      if (d[e] > 1e-6) pos_++; else if (d[e] < -1e-6) neg++;
    }
    if (pos_ === 0 || neg === 0) continue;
    const pts = [];
    for (let e = 0; e < 3; e++) {
      const a = e, b = (e + 1) % 3;
      if ((d[a] > 0) === (d[b] > 0)) continue;
      const f = d[a] / (d[a] - d[b]);
      pts.push(new THREE.Vector3(
        v[a][0] + (v[b][0] - v[a][0]) * f,
        v[a][1] + (v[b][1] - v[a][1]) * f,
        v[a][2] + (v[b][2] - v[a][2]) * f,
      ));
    }
    if (pts.length >= 2) segs.push([pts[0], pts[1]]);
  }
  return segs;
}

/* ---------------- encadenar segmentos en lazos ---------------- */
export function lazosDe(segs, tol = 1e-3) {
  const clave = p => `${Math.round(p.x / tol)},${Math.round(p.y / tol)},${Math.round(p.z / tol)}`;
  const adj = new Map(); // clave de punto -> [índices de segmento]
  segs.forEach((s, i) => {
    for (const p of s) {
      const k = clave(p);
      let a = adj.get(k); if (!a) adj.set(k, a = []);
      a.push(i);
    }
  });
  const vistos = new Uint8Array(segs.length);
  const lazos = [];
  const otroExtremo = (s, p) => s[0].distanceToSquared(p) < s[1].distanceToSquared(p) ? s[1] : s[0];
  for (let i = 0; i < segs.length; i++) {
    if (vistos[i]) continue;
    const cad = [segs[i][0], segs[i][1]];
    vistos[i] = 1;
    let porFin = true; // último extremo por el que creció la cadena
    for (let pasos = 0; pasos < segs.length + 4; pasos++) {
      const ini = cad[0], fin = cad[cad.length - 1];
      if (cad.length >= 4 && ini.distanceToSquared(fin) < tol * tol * 9) {
        if (porFin) cad.pop(); else cad.shift(); // quitar el punto duplicado de cierre
        break;
      }
      const p = porFin ? fin : ini;
      const cands = (adj.get(clave(p)) || []).filter(s => !vistos[s]);
      if (!cands.length) {
        if (porFin) { porFin = false; continue; } // probar por el otro extremo
        break;
      }
      let mejor = cands[0];
      if (cands.length > 1 && cad.length >= 2) {
        // en una unión, seguir por el segmento más colineal con la dirección actual
        const q = porFin ? cad[cad.length - 2] : cad[1];
        const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
        const dl = Math.hypot(dx, dy, dz) + 1e-12;
        let bScore = -2;
        for (const s of cands) {
          const o = otroExtremo(segs[s], p);
          const ex = o.x - p.x, ey = o.y - p.y, ez = o.z - p.z;
          const sc = (dx * ex + dy * ey + dz * ez) / (dl * Math.hypot(ex, ey, ez) + 1e-12);
          if (sc > bScore) { bScore = sc; mejor = s; }
        }
      }
      const o = otroExtremo(segs[mejor], p);
      vistos[mejor] = 1;
      if (porFin) cad.push(o); else cad.unshift(o);
    }
    if (cad.length >= 3) lazos.push(cad);
  }
  return lazos;
}

/* ---------------- aristas de borde (agujeros) ---------------- */
function lazosBorde(geo) {
  const idx = geo.index ? geo.index.array : null;
  if (!idx) return [];
  const cuentas = new Map(); // arista "a_b" -> [cuenta, a, b]
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = idx[t + e], b = idx[t + (e + 1) % 3];
      const k = a < b ? a + '_' + b : b + '_' + a;
      let c = cuentas.get(k);
      if (!c) cuentas.set(k, c = { n: 0, a, b });
      c.n++;
    }
  }
  const adj = new Map(); // vértice -> [vértices de borde]
  for (const c of cuentas.values()) {
    if (c.n !== 1) continue;
    for (const [u, v] of [[c.a, c.b], [c.b, c.a]]) {
      let a = adj.get(u); if (!a) adj.set(u, a = []);
      a.push(v);
    }
  }
  const lazos = [];
  const vistos = new Set();
  for (const [ini] of adj) {
    if (vistos.has(ini)) continue;
    const lazo = [ini]; vistos.add(ini);
    let u = ini;
    for (let pasos = 0; pasos < idx.length; pasos++) {
      const sig = (adj.get(u) || []).find(v => !vistos.has(v));
      if (sig === undefined) break;
      lazo.push(sig); vistos.add(sig); u = sig;
      if (u === ini) break;
    }
    if (lazo.length >= 3) lazos.push(lazo);
  }
  return lazos;
}

/* ---------------- rellenar agujeros ---------------- */
// Rellena los lazos de borde pequeños (agujeros) con triángulos planos (earcut).
// El lazo mayor es el borde del propio escáner: no se toca.
// Devuelve una geometría nueva y el número de agujeros rellenados.
export function rellenarAgujeros(geo) {
  let lazos = lazosBorde(geo);
  if (!lazos.length) return { geometria: geo, rellenados: 0 };
  // ordenar por perímetro: el mayor es el contorno del modelo
  const per = l => l.reduce((s, v, i) => {
    const a = geo.attributes.position;
    const p = new THREE.Vector3().fromBufferAttribute(a, v);
    const q = new THREE.Vector3().fromBufferAttribute(a, l[(i + 1) % l.length]);
    return s + p.distanceTo(q);
  }, 0);
  lazos.sort((x, y) => per(y) - per(x));
  lazos = lazos.slice(1).filter(l => l.length <= 2000);
  if (!lazos.length) return { geometria: geo, rellenados: 0 };

  const pos = geo.attributes.position;
  const col = geo.attributes.color || null;
  const nIdx = [...(geo.index ? geo.index.array : [])];
  const nPos = [...pos.array];
  const nCol = col ? [...col.array] : null;
  const u = new THREE.Vector3(), w = new THREE.Vector3(), nrm = new THREE.Vector3(), e = new THREE.Vector3();
  let rellenados = 0;
  for (const lazo of lazos) {
    // normal del lazo por Newell
    nrm.set(0, 0, 0);
    const centro = new THREE.Vector3();
    const pts = lazo.map(v => new THREE.Vector3().fromBufferAttribute(pos, v));
    for (const p of pts) centro.add(p);
    centro.divideScalar(pts.length);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      nrm.x += (p.y - q.y) * (p.z + q.z);
      nrm.y += (p.z - q.z) * (p.x + q.x);
      nrm.z += (p.x - q.x) * (p.y + q.y);
    }
    nrm.normalize();
    u.copy(pts[0]).sub(centro).normalize();
    w.crossVectors(nrm, u);
    const plano = [];
    for (const p of pts) {
      e.copy(p).sub(centro);
      plano.push(e.dot(u), e.dot(w));
    }
    const tris = earcut(plano);
    if (!tris.length) continue;
    const off = nPos.length / 3;
    for (const p of pts) nPos.push(p.x, p.y, p.z);
    if (nCol) { const cR = col.getX(lazo[0]), cG = col.getY(lazo[0]), cB = col.getZ(lazo[0]); for (const _ of pts) nCol.push(cR, cG, cB); }
    for (const t of tris) nIdx.push(off + t);
    rellenados++;
  }
  if (!rellenados) return { geometria: geo, rellenados: 0 };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(nPos, 3));
  if (nCol) g.setAttribute('color', new THREE.Float32BufferAttribute(nCol, 3));
  g.setIndex(nIdx);
  g.computeVertexNormals();
  return { geometria: g, rellenados };
}

/* ---------------- pinceles ---------------- */
// Quita los triángulos con algún vértice marcado y devuelve el índice nuevo.
// idxBase: índice de referencia (el original del trazo); yaQuitadas guarda
// posiciones de triángulo en ESE índice, así varias pasadas no se pisan.
export function indiceSinVertices(geo, marcado, yaQuitadas, idxBase) {
  const idx = idxBase || geo.index.array;
  const ni = [];
  for (let t = 0; t < idx.length; t += 3) {
    if (yaQuitadas && yaQuitadas.has(t / 3)) continue;
    if (marcado[idx[t]] || marcado[idx[t + 1]] || marcado[idx[t + 2]]) {
      if (yaQuitadas) yaQuitadas.add(t / 3); // triángulo borrado: no reaparece
      continue;
    }
    ni.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  return ni;
}

export function marcarRadio(geo, centro, radio) {
  const pos = geo.attributes.position;
  const r2 = radio * radio;
  const marcado = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - centro.x, dy = pos.getY(i) - centro.y, dz = pos.getZ(i) - centro.z;
    if (dx * dx + dy * dy + dz * dz < r2) marcado[i] = 1;
  }
  return marcado;
}

export function indiceSinCaras(geo, centro, radio, yaQuitadas, idxBase) {
  return indiceSinVertices(geo, marcarRadio(geo, centro, radio), yaQuitadas, idxBase);
}

// Lazo: marca los vértices cuya proyección en pantalla cae dentro del polígono.
// poligono: [{x, y}] en coordenadas de cliente; ver: función (Vector3local)->{x,y}|null
export function marcarLazo(geo, poligono, ver) {
  const pos = geo.attributes.position;
  const marcado = new Uint8Array(pos.count);
  const v = new THREE.Vector3();
  // caja del polígono para descartar rápido
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const p of poligono) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  const dentro = (x, y) => {
    let ok = false;
    for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
      const a = poligono[i], b = poligono[j];
      if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) ok = !ok;
    }
    return ok;
  };
  for (let i = 0; i < pos.count; i++) {
    const p = ver(v.set(pos.getX(i), pos.getY(i), pos.getZ(i)));
    if (p && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && dentro(p.x, p.y)) marcado[i] = 1;
  }
  return marcado;
}

// adyacencia vértice->vértices (aristas) y vértice->triángulos, sobre idxBase
export function adyacencia(geo, idxBase) {
  const idx = idxBase || geo.index.array;
  const n = geo.attributes.position.count;
  const vT = new Array(n), vV = new Array(n);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      (vV[u] || (vV[u] = new Set())).add(v); (vV[v] || (vV[v] = new Set())).add(u);
      (vT[u] || (vT[u] = [])).push(t / 3); (vT[v] || (vT[v] = [])).push(t / 3);
    }
    (vT[c] || (vT[c] = [])).push(t / 3);
  }
  return { vV, vT };
}

// Mágico: crece desde la semilla por adyacencia hasta `radio` mm de distancia
// o hasta `maxVerts`. Devuelve los vértices alcanzados (región conexa local).
export function marcarMagico(geo, ady, semilla, centro, radio, maxVerts = 60000) {
  const pos = geo.attributes.position;
  const marcado = new Uint8Array(pos.count);
  const r2 = radio * radio;
  const cola = [semilla];
  marcado[semilla] = 1;
  let n = 0;
  while (cola.length && n < maxVerts) {
    const i = cola.pop(); n++;
    for (const j of (ady.vV[i] || [])) {
      if (marcado[j]) continue;
      const dx = pos.getX(j) - centro.x, dy = pos.getY(j) - centro.y, dz = pos.getZ(j) - centro.z;
      if (dx * dx + dy * dy + dz * dz < r2) { marcado[j] = 1; cola.push(j); }
    }
  }
  return marcado;
}

// vértice más cercano a un punto (sobre la rejilla de celdas)
export function verticeMasCercano(geo, grid, celda, p) {
  const pos = geo.attributes.position;
  const gx = Math.floor(p.x / celda), gy = Math.floor(p.y / celda), gz = Math.floor(p.z / celda);
  let mejor = -1, d2 = Infinity;
  for (let r = 1; r <= 4 && mejor < 0; r++) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
      const a = grid.get((gx + dx) + ',' + (gy + dy) + ',' + (gz + dz));
      if (!a) continue;
      for (const i of a) {
        const ex = pos.getX(i) - p.x, ey = pos.getY(i) - p.y, ez = pos.getZ(i) - p.z;
        const e = ex * ex + ey * ey + ez * ez;
        if (e < d2) { d2 = e; mejor = i; }
      }
    }
  }
  return mejor;
}

// Limpiar borde: borra los triángulos a menos de `distMax` del contorno del escáner
export function marcarCercaDeBorde(geo, distMax) {
  const idx = geo.index.array;
  const cuentas = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = idx[t + e], b = idx[t + (e + 1) % 3];
      const k = a < b ? a + '_' + b : b + '_' + a;
      cuentas.set(k, (cuentas.get(k) || 0) + 1);
    }
  }
  const pos = geo.attributes.position;
  const enBorde = new Uint8Array(pos.count);
  for (const [k, n] of cuentas) {
    if (n !== 1) continue;
    const [a, b] = k.split('_').map(Number);
    enBorde[a] = enBorde[b] = 1;
  }
  // rejilla solo con los vértices de borde
  const celda = Math.max(distMax, 1);
  const grid = new Map();
  for (let i = 0; i < pos.count; i++) {
    if (!enBorde[i]) continue;
    const k = Math.floor(pos.getX(i) / celda) + ',' + Math.floor(pos.getY(i) / celda) + ',' + Math.floor(pos.getZ(i) / celda);
    let a = grid.get(k); if (!a) grid.set(k, a = []);
    a.push(i);
  }
  const marcado = new Uint8Array(pos.count);
  const d2 = distMax * distMax;
  const r = Math.ceil(distMax / celda);
  for (let i = 0; i < pos.count; i++) {
    if (enBorde[i]) { marcado[i] = 1; continue; }
    const gx = Math.floor(pos.getX(i) / celda), gy = Math.floor(pos.getY(i) / celda), gz = Math.floor(pos.getZ(i) / celda);
    let fin = false;
    for (let dx = -r; dx <= r && !fin; dx++) for (let dy = -r; dy <= r && !fin; dy++) for (let dz = -r; dz <= r && !fin; dz++) {
      const a = grid.get((gx + dx) + ',' + (gy + dy) + ',' + (gz + dz));
      if (!a) continue;
      for (const j of a) {
        const ex = pos.getX(j) - pos.getX(i), ey = pos.getY(j) - pos.getY(i), ez = pos.getZ(j) - pos.getZ(i);
        if (ex * ex + ey * ey + ez * ez < d2) { marcado[i] = 1; fin = true; break; }
      }
    }
  }
  return marcado;
}

// Limpiar paladar: en el modelo superior, borra los triángulos cuyo centroide
// cae DENTRO del lazo del corte a la altura de la margen, por el lado del paladar.
export function marcarPaladar(geo, arco) {
  const caja = new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
  const sup = arco !== 'inf';
  const corteY = sup ? caja.min.y + 13 : caja.max.y - 13;
  const lazos = lazosDe(seccionMalla(geo, new THREE.Vector3(0, corteY, 0), new THREE.Vector3(0, 1, 0)));
  if (!lazos.length) return null;
  const areaLazo = l => { let s = 0; for (let i = 0; i < l.length; i++) { const a = l[i], b = l[(i + 1) % l.length]; s += a.x * b.z - b.x * a.z; } return Math.abs(s / 2); };
  lazos.sort((a, b) => areaLazo(b) - areaLazo(a));
  const lazo = lazos[0];
  // punto-en-polígono sobre XZ
  const dentro = (x, z) => {
    let ok = false;
    for (let i = 0, j = lazo.length - 1; i < lazo.length; j = i++) {
      const a = lazo[i], b = lazo[j];
      if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) ok = !ok;
    }
    return ok;
  };
  const pos = geo.attributes.position, idx = geo.index.array;
  const marcado = new Uint8Array(pos.count);
  for (let t = 0; t < idx.length; t += 3) {
    const cx = (pos.getX(idx[t]) + pos.getX(idx[t + 1]) + pos.getX(idx[t + 2])) / 3;
    const cy = (pos.getY(idx[t]) + pos.getY(idx[t + 1]) + pos.getY(idx[t + 2])) / 3;
    const cz = (pos.getZ(idx[t]) + pos.getZ(idx[t + 1]) + pos.getZ(idx[t + 2])) / 3;
    const fuera = sup ? cy > corteY : cy < corteY;
    if (fuera && dentro(cx, cz)) { marcado[idx[t]] = marcado[idx[t + 1]] = marcado[idx[t + 2]] = 1; }
  }
  return marcado;
}

// Eliminar protuberancia (bracket/atache/retenedor): borra un disco pequeño,
// rellena el agujero y alisa — devuelve geometría nueva o la misma si no hubo cambio
export function quitarProtuberancia(geo, punto, radio = 3.5) {
  const ni = indiceSinCaras(geo, punto, radio, null, null);
  if (ni.length >= geo.index.count) return null;
  const g = geo.clone();
  g.setIndex(ni);
  const { geometria } = rellenarAgujeros(g);
  return geometria;
}

// Arrastrar: desplaza los vértices del pincel por `delta` (en coords locales)
export function arrastrar(geo, centro, radio, delta) {
  const pos = geo.attributes.position;
  const r2 = radio * radio;
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - centro.x, dy = pos.getY(i) - centro.y, dz = pos.getZ(i) - centro.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r2) continue;
    const peso = Math.pow(1 - d2 / r2, 1.5); // caída suave
    pos.setXYZ(i, pos.getX(i) + delta.x * peso, pos.getY(i) + delta.y * peso, pos.getZ(i) + delta.z * peso);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

// Añadir: desplaza los vértices hacia fuera a lo largo de su normal (inflar)
export function anadir(geo, centro, radio, cantidad = .6) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  if (!nor) geo.computeVertexNormals();
  const r2 = radio * radio;
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - centro.x, dy = pos.getY(i) - centro.y, dz = pos.getZ(i) - centro.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 >= r2) continue;
    const peso = cantidad * (1 - d2 / r2);
    pos.setXYZ(i, pos.getX(i) + nor.getX(i) * peso, pos.getY(i) + nor.getY(i) * peso, pos.getZ(i) + nor.getZ(i) * peso);
  }
  pos.needsUpdate = true;
}

// suavizado laplaciano local usando una rejilla de vecinos (no hace falta topología)
export function suavizar(geo, grid, celda, centro, radio) {
  const pos = geo.attributes.position;
  const clave = (x, y, z) => x + ',' + y + ',' + z;
  const r = Math.ceil(radio / celda);
  const cx = Math.floor(centro.x / celda), cy = Math.floor(centro.y / celda), cz = Math.floor(centro.z / celda);
  const r2 = radio * radio, rVec = celda * 1.6, rVec2 = rVec * rVec;
  const cambios = [];
  for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
    const a = grid.get(clave(cx + dx, cy + dy, cz + dz));
    if (!a) continue;
    for (const i of a) {
      const ddx = pos.getX(i) - centro.x, ddy = pos.getY(i) - centro.y, ddz = pos.getZ(i) - centro.z;
      const d2 = ddx * ddx + ddy * ddy + ddz * ddz;
      if (d2 >= r2) continue;
      // media de los vecinos próximos
      let sx = 0, sy = 0, sz = 0, m = 0;
      const gx = Math.floor(pos.getX(i) / celda), gy = Math.floor(pos.getY(i) / celda), gz = Math.floor(pos.getZ(i) / celda);
      for (let ex = -1; ex <= 1; ex++) for (let ey = -1; ey <= 1; ey++) for (let ez = -1; ez <= 1; ez++) {
        const b = grid.get(clave(gx + ex, gy + ey, gz + ez));
        if (!b) continue;
        for (const j of b) {
          if (j === i) continue;
          const fx = pos.getX(j) - pos.getX(i), fy = pos.getY(j) - pos.getY(i), fz = pos.getZ(j) - pos.getZ(i);
          if (fx * fx + fy * fy + fz * fz < rVec2) { sx += pos.getX(j); sy += pos.getY(j); sz += pos.getZ(j); if (++m > 20) break; }
        }
        if (m > 20) break;
      }
      if (!m) continue;
      const peso = .35 * (1 - d2 / r2); // menos en el borde del pincel
      cambios.push([i, (sx / m - pos.getX(i)) * peso, (sy / m - pos.getY(i)) * peso, (sz / m - pos.getZ(i)) * peso]);
    }
  }
  for (const [i, x, y, z] of cambios) pos.setXYZ(i, pos.getX(i) + x, pos.getY(i) + y, pos.getZ(i) + z);
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

export function rejillaDe(geo, celda) {
  const pos = geo.attributes.position;
  const grid = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = Math.floor(pos.getX(i) / celda) + ',' + Math.floor(pos.getY(i) / celda) + ',' + Math.floor(pos.getZ(i) / celda);
    let a = grid.get(k); if (!a) grid.set(k, a = []);
    a.push(i);
  }
  return grid;
}

/* ---------------- zócalo virtual ---------------- */
// Genera una base de escayola: secciona el modelo a la altura de la margen y
// extruye el lazo mayor hasta un plano base. arco: 'sup' (dientes abajo) o 'inf'.
export function crearZocalo(geo, arco, altura = 14) {
  const caja = new THREE.Box3().setFromBufferAttribute(geo.attributes.position);
  const sup = arco !== 'inf';
  const corteY = sup ? caja.min.y + 13 : caja.max.y - 13;   // ~altura de la margen
  const baseY = sup ? corteY + altura : corteY - altura;
  const origen = new THREE.Vector3(0, corteY, 0);
  const normal = new THREE.Vector3(0, 1, 0);
  const lazos = lazosDe(seccionMalla(geo, origen, normal));
  if (!lazos.length) return null;
  // el lazo de mayor área proyectada en XZ
  const areaLazo = l => {
    let s = 0;
    for (let i = 0; i < l.length; i++) { const a = l[i], b = l[(i + 1) % l.length]; s += a.x * b.z - b.x * a.z; }
    return Math.abs(s / 2);
  };
  lazos.sort((a, b) => areaLazo(b) - areaLazo(a));
  const lazo = lazos[0];
  if (lazo.length < 6) return null;

  const pos = [], idx = [];
  // anillo superior (en el corte) e inferior (en la base)
  for (const p of lazo) pos.push(p.x, p.y, p.z);
  for (const p of lazo) pos.push(p.x, baseY, p.z);
  const n = lazo.length;
  const dir = sup ? 1 : -1; // orientación de las caras de la pared
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (dir > 0) idx.push(i, j, n + j, i, n + j, n + i);
    else idx.push(i, n + j, j, i, n + i, n + j);
  }
  // tapa inferior (plano de la base) y tapa del corte, por earcut en XZ
  const plano = [];
  for (const p of lazo) plano.push(p.x, p.z);
  const tris = earcut(plano);
  const offTapa = pos.length / 3;
  for (const p of lazo) pos.push(p.x, baseY, p.z);
  for (let t = 0; t < tris.length; t += 3) {
    if (dir > 0) idx.push(offTapa + tris[t], offTapa + tris[t + 1], offTapa + tris[t + 2]);
    else idx.push(offTapa + tris[t], offTapa + tris[t + 2], offTapa + tris[t + 1]);
  }
  // tapa del corte (donde seccionamos el modelo)
  const offCorte = pos.length / 3;
  for (const p of lazo) pos.push(p.x, p.y, p.z);
  for (let t = 0; t < tris.length; t += 3) {
    if (dir > 0) idx.push(offCorte + tris[t], offCorte + tris[t + 2], offCorte + tris[t + 1]);
    else idx.push(offCorte + tris[t], offCorte + tris[t + 1], offCorte + tris[t + 2]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/* ---------------- superposición (Horn, cuaternión) ---------------- */
// pares: [[pA, pB], ...] — lleva los puntos B sobre los A. Devuelve Matrix4.
export function matrizAlineacion(pares) {
  const cA = new THREE.Vector3(), cB = new THREE.Vector3();
  for (const [a, b] of pares) { cA.add(a); cB.add(b); }
  cA.divideScalar(pares.length); cB.divideScalar(pares.length);
  let Sxx = 0, Sxy = 0, Sxz = 0, Syx = 0, Syy = 0, Syz = 0, Szx = 0, Szy = 0, Szz = 0;
  for (const [a, b] of pares) {
    const x = b.x - cB.x, y = b.y - cB.y, z = b.z - cB.z;
    const X = a.x - cA.x, Y = a.y - cA.y, Z = a.z - cA.z;
    Sxx += x * X; Sxy += x * Y; Sxz += x * Z;
    Syx += y * X; Syy += y * Y; Syz += y * Z;
    Szx += z * X; Szy += z * Y; Szz += z * Z;
  }
  // matriz simétrica 4x4 de Horn
  const N = [
    Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx,
    Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz,
    Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy,
    Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz,
  ];
  // descomposición de Jacobi para el autovector mayor
  const A = [];
  for (let i = 0; i < 4; i++) A.push(N.slice(i * 4, i * 4 + 4));
  let V = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
  for (let it = 0; it < 60; it++) {
    let p = 0, q = 1, max = 0;
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) if (Math.abs(A[i][j]) > max) { max = Math.abs(A[i][j]); p = i; q = j; }
    if (max < 1e-12) break;
    const th = Math.atan2(2 * A[p][q], A[q][q] - A[p][p]) / 2;
    const c = Math.cos(th), s = Math.sin(th);
    const app = c * c * A[p][p] - 2 * s * c * A[p][q] + s * s * A[q][q];
    const aqq = s * s * A[p][p] + 2 * s * c * A[p][q] + c * c * A[q][q];
    for (let k = 0; k < 4; k++) {
      const akp = A[k][p], akq = A[k][q];
      A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq;
      A[p][k] = A[k][p]; A[q][k] = A[k][q];
      const vkp = V[k][p], vkq = V[k][q];
      V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
    }
    A[p][p] = app; A[q][q] = aqq; A[p][q] = A[q][p] = 0;
  }
  let mi = 0;
  for (let i = 1; i < 4; i++) if (A[i][i] > A[mi][mi]) mi = i;
  const q = new THREE.Quaternion(V[0][mi], V[1][mi], V[2][mi], V[3][mi]).normalize();
  const R = new THREE.Matrix4().makeRotationFromQuaternion(q);
  const cBrot = cB.clone().applyMatrix4(R);
  const t = cA.clone().sub(cBrot);
  R.setPosition(t);
  return R;
}
