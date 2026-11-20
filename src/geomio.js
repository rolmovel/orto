// E/S y procesado de mallas: STL/PLY/OBJ + ZIP, soldado de vértices, limpieza de
// fragmentos sueltos, color "realista" sintético, mapa de contacto (oclusión),
// exportar STL binario y guardar/abrir casos (.tresdmodels = ZIP). Código propio.
import * as THREE from 'three';
import { STLLoader } from 'three/addons/STLLoader.js';
import { PLYLoader } from 'three/addons/PLYLoader.js';
import { OBJLoader } from 'three/addons/OBJLoader.js';
import * as fflate from 'fflate';

const EXT = /\.(stl|ply|obj)$/i;

/* ---------------- entrada de archivos ---------------- */
export async function cargarArchivos(files, onProgreso) {
  const salida = [];
  const lista = [...files];
  for (let i = 0; i < lista.length; i++) {
    const f = lista[i];
    if (/\.zip$/i.test(f.name)) {
      onProgreso?.(`Abriendo ${f.name}…`, i / lista.length);
      const des = fflate.unzipSync(new Uint8Array(await f.arrayBuffer()));
      for (const nombre in des) {
        if (EXT.test(nombre) || /\.tresdmodels$/i.test(nombre)) {
          const nf = new File([des[nombre].buffer.slice(des[nombre].byteOffset, des[nombre].byteOffset + des[nombre].byteLength)], nombre.split('/').pop());
          lista.push(nf);
        }
      }
      continue;
    }
    if (/\.tresdmodels$/i.test(f.name)) { salida.push({ caso: f }); continue; }
    if (!EXT.test(f.name)) continue;
    onProgreso?.(`Abriendo ${f.name} (${i + 1} de ${lista.length})…`, i / lista.length);
    const buf = await f.arrayBuffer();
    const geo = await parsear(buf, f.name);
    salida.push({ nombre: f.name.replace(EXT, ''), geometria: geo, file: f });
  }
  return salida;
}

async function parsear(buf, nombre) {
  const ext = nombre.match(EXT)[1].toLowerCase();
  let geo;
  if (ext === 'stl') geo = new STLLoader().parse(buf);
  else if (ext === 'ply') geo = new PLYLoader().parse(buf);
  else {
    const g = new OBJLoader().parse(new TextDecoder().decode(buf));
    geo = null;
    g.traverse(o => { if (o.isMesh && !geo) geo = o.geometry; });
    if (!geo) throw new Error('OBJ vacío');
  }
  if (!geo.attributes.normal) geo.computeVertexNormals();
  return geo;
}

/* ---------------- soldado + limpieza ---------------- */
// Los STL de escáneres suelen ser "sopa de triángulos": cada triángulo trae sus
// propios vértices con un pequeño temblor, así que el soldado por redondeo de
// mergeVertices no basta. Se agrupan los vértices por proximidad (union-find
// sobre una rejilla uniforme) y se reindexa. Devuelve geometría indexada.
function soldar(geometria, eps = 0.01) {
  const pos = geometria.attributes.position;
  const n = pos.count;
  const idx = geometria.index ? geometria.index.array : null;
  const col = geometria.attributes.color || null;

  const padre = new Int32Array(n);
  for (let i = 0; i < n; i++) padre[i] = i;
  const raiz = i => { while (padre[i] !== i) { padre[i] = padre[padre[i]]; i = padre[i]; } return i; };

  const grid = new Map();
  const clave = (x, y, z) => x + ',' + y + ',' + z;
  const e2 = eps * eps;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const cx = Math.floor(x / eps), cy = Math.floor(y / eps), cz = Math.floor(z / eps);
    let unido = false;
    for (let dx = -1; dx <= 1 && !unido; dx++) for (let dy = -1; dy <= 1 && !unido; dy++) for (let dz = -1; dz <= 1 && !unido; dz++) {
      const a = grid.get(clave(cx + dx, cy + dy, cz + dz));
      if (!a) continue;
      for (const j of a) {
        const d2 = (x - pos.getX(j)) ** 2 + (y - pos.getY(j)) ** 2 + (z - pos.getZ(j)) ** 2;
        if (d2 <= e2) { padre[raiz(i)] = raiz(j); unido = true; break; }
      }
    }
    const k = clave(cx, cy, cz);
    let a = grid.get(k); if (!a) grid.set(k, a = []);
    a.push(i);
  }

  // clúster -> id compacto; posición = centroide del clúster
  const idDe = new Map();
  const nPos = [], nCol = col ? [] : null, cuenta = [];
  const clusterDe = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const r = raiz(i);
    let id = idDe.get(r);
    if (id === undefined) { id = idDe.size; idDe.set(r, id); nPos.push(0, 0, 0); if (nCol) nCol.push(0, 0, 0); cuenta.push(0); }
    clusterDe[i] = id;
    nPos[id * 3] += pos.getX(i); nPos[id * 3 + 1] += pos.getY(i); nPos[id * 3 + 2] += pos.getZ(i);
    if (nCol) { nCol[id * 3] += col.getX(i); nCol[id * 3 + 1] += col.getY(i); nCol[id * 3 + 2] += col.getZ(i); }
    cuenta[id]++;
  }
  for (let i = 0; i < idDe.size; i++) {
    const c = cuenta[i] || 1;
    nPos[i * 3] /= c; nPos[i * 3 + 1] /= c; nPos[i * 3 + 2] /= c;
    if (nCol) { nCol[i * 3] /= c; nCol[i * 3 + 1] /= c; nCol[i * 3 + 2] /= c; }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(nPos, 3));
  if (nCol) g.setAttribute('color', new THREE.Float32BufferAttribute(nCol, 3));
  const nI = idx ? idx.length : n;
  const ni = new Uint32Array(nI);
  for (let k = 0; k < nI; k++) ni[k] = clusterDe[idx ? idx[k] : k];
  g.setIndex(new THREE.BufferAttribute(ni, 1));
  g.computeVertexNormals();
  return g;
}

// suelda vértices próximos y quita componentes conexas diminutas.
// devuelve { geometria, quitados, areaQuitada }
export function procesar(geometria) {
  const idx = geometria.index;
  // si ya viene indexada y razonablemente soldada, no hace falta reindexar
  const yaSoldada = idx && geometria.attributes.position.count < idx.count * 0.8;
  const g = yaSoldada ? geometria : soldar(geometria);
  const { restantes, quitados, areaQuitada } = filtrarComponentes(g);
  const salida = restantes || g;
  if (!salida.attributes.normal) salida.computeVertexNormals();
  return { geometria: salida, quitados, areaQuitada };
}

function filtrarComponentes(g) {
  const idx = g.index.array, nT = idx.length / 3;
  if (!nT) return { restantes: g, quitados: 0, areaQuitada: 0 };
  // union-find sobre triángulos que comparten arista
  const padre = new Int32Array(nT);
  for (let i = 0; i < nT; i++) padre[i] = i;
  const raiz = i => { while (padre[i] !== i) { padre[i] = padre[padre[i]]; i = padre[i]; } return i; };
  const aristas = new Map();
  for (let t = 0; t < nT; t++) {
    for (let e = 0; e < 3; e++) {
      const a = idx[t * 3 + e], b = idx[t * 3 + (e + 1) % 3];
      const k = a < b ? a + '_' + b : b + '_' + a;
      const otro = aristas.get(k);
      if (otro === undefined) aristas.set(k, t);
      else { const r1 = raiz(t), r2 = raiz(otro); if (r1 !== r2) padre[r2] = r1; }
    }
  }
  const comps = new Map(); // raiz -> [triángulos]
  for (let t = 0; t < nT; t++) {
    const r = raiz(t);
    let arr = comps.get(r); if (!arr) comps.set(r, arr = []);
    arr.push(t);
  }
  if (comps.size <= 1) return { restantes: null, quitados: 0, areaQuitada: 0 };
  // área por componente para decidir qué es "suelto"
  const pos = g.attributes.position;
  const areaTri = t => {
    const a = new THREE.Vector3().fromBufferAttribute(pos, idx[t * 3]);
    const b = new THREE.Vector3().fromBufferAttribute(pos, idx[t * 3 + 1]);
    const c = new THREE.Vector3().fromBufferAttribute(pos, idx[t * 3 + 2]);
    return b.sub(a).cross(c.sub(a)).length() / 2;
  };
  let areaTotal = 0;
  const areas = new Map();
  for (const [r, tris] of comps) {
    let s = 0; for (const t of tris) s += areaTri(t);
    areas.set(r, s); areaTotal += s;
  }
  const umbral = Math.max(areaTotal * 0.002, .5); // <0.2 % del área = suelto
  const quitar = new Set();
  let quitados = 0, areaQuitada = 0;
  for (const [r, tris] of comps) {
    if (areas.get(r) < umbral) { quitados++; areaQuitada += areas.get(r); for (const t of tris) quitar.add(t); }
  }
  if (!quitar.size) return { restantes: null, quitados: 0, areaQuitada: 0 };
  const ni = new (idx.length > 65535 * 3 ? Uint32Array : Uint32Array)(idx.length - quitar.size * 3);
  let w = 0;
  for (let t = 0; t < nT; t++) if (!quitar.has(t)) { ni[w++] = idx[t * 3]; ni[w++] = idx[t * 3 + 1]; ni[w++] = idx[t * 3 + 2]; }
  const ng = g.clone();
  ng.setIndex(new THREE.BufferAttribute(ni, 1));
  return { restantes: ng, quitados, areaQuitada };
}

/* ---------------- color realista sintético ---------------- */
// Clasifica diente/encía por rugosidad local (dispersión de normales de vecinos
// próximos en una rejilla uniforme) y pinta marfil → rosa encía. Devuelve el
// atributo 'color'. Se ejecuta por trozos para no bloquear la UI.
export async function colorRealista(geo, onTick, arco = '') {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const n = pos.count;
  const caja = new THREE.Box3().setFromBufferAttribute(pos);
  const tam = caja.getSize(new THREE.Vector3());
  const celda = Math.max(tam.x, tam.y, tam.z) / 90; // ~1 mm en modelos dentales

  // rejilla uniforme de vértices
  const grid = new Map();
  const clave = (x, y, z) => x + ',' + y + ',' + z;
  for (let i = 0; i < n; i++) {
    const k = clave(Math.floor(pos.getX(i) / celda), Math.floor(pos.getY(i) / celda), Math.floor(pos.getZ(i) / celda));
    let a = grid.get(k); if (!a) grid.set(k, a = []);
    a.push(i);
  }

  // rugosidad: 1 - |media de normales vecinas|
  const rug = new Float32Array(n);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(pos.getX(i) / celda), cy = Math.floor(pos.getY(i) / celda), cz = Math.floor(pos.getZ(i) / celda);
    let sx = 0, sy = 0, sz = 0, m = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const a = grid.get(clave(cx + dx, cy + dy, cz + dz));
      if (!a) continue;
      for (const j of a) {
        if (j === i) continue;
        sx += nor.getX(j); sy += nor.getY(j); sz += nor.getZ(j);
        if (++m >= 28) break;
      }
      if (m >= 28) break;
    }
    const len = Math.hypot(sx, sy, sz);
    rug[i] = m ? 1 - len / m : .5;
    if ((i & 8191) === 0) { onTick?.(i / n); await new Promise(r => setTimeout(r)); }
  }

  // umbrales por percentiles (se adapta a cada escáner)
  const ord = Float32Array.from(rug).sort();
  const p = q => ord[Math.min(n - 1, Math.floor(q * n))];
  const rLo = p(.5), rHi = Math.max(p(.9), rLo + 1e-4);
  const suave = t => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
  const rugT = i => suave((rug[i] - rLo) / (rHi - rLo));

  // distancia al borde oclusal: en 'sup' los dientes cuelgan (minY), en 'inf'
  // apuntan arriba (maxY); sin arcada conocida, el extremo más cercano.
  const minY = caja.min.y, maxY = caja.max.y;
  const dOcl = i => {
    const y = pos.getY(i);
    if (arco === 'sup') return y - minY;
    if (arco === 'inf') return maxY - y;
    return Math.min(y - minY, maxY - y);
  };

  // línea oclusal local: minY/maxY por columna XZ (celdas ~3 mm, vecindad 3x3),
  // para que la encía pegada a dientes bajos (molares) también se pinte.
  const celdaXZ = Math.max(tam.x, tam.z) / 24;
  const colMin = new Map(), colMax = new Map();
  const ck = (x, z) => x + ',' + z;
  for (let i = 0; i < n; i++) {
    const k = ck(Math.floor(pos.getX(i) / celdaXZ), Math.floor(pos.getZ(i) / celdaXZ));
    const y = pos.getY(i);
    if (y < (colMin.get(k) ?? 1e9)) colMin.set(k, y);
    if (y > (colMax.get(k) ?? -1e9)) colMax.set(k, y);
  }
  const base = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(pos.getX(i) / celdaXZ), cz = Math.floor(pos.getZ(i) / celdaXZ);
    let lo = 1e9, hi = -1e9;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const k = ck(cx + dx, cz + dz);
      if (colMin.has(k) && colMin.get(k) < lo) lo = colMin.get(k);
      if (colMax.has(k) && colMax.get(k) > hi) hi = colMax.get(k);
    }
    const y = pos.getY(i);
    const dSup = lo < 1e8 ? y - lo : y - minY;
    const dInf = hi > -1e8 ? hi - y : maxY - y;
    base[i] = arco === 'sup' ? dSup : arco === 'inf' ? dInf : Math.min(dSup, dInf);
  }

  const DIENTE = 7, FADE = 5;   // mm: corona clínica aproximada + transición suave

  const col = new Float32Array(n * 3);
  // los colores de vértice se interpretan como lineales: convertir de sRGB
  const marfil = new THREE.Color('#f4ecda').convertSRGBToLinear();
  const encia = new THREE.Color('#cf6f68').convertSRGBToLinear();
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const tOcl = suave((dOcl(i) - DIENTE) / FADE);
    const tBas = suave((base[i] - DIENTE) / FADE);
    // la rugosidad solo contribuye lejos del borde oclusal: evita motas en las
    // caras masticatorias, que son rugosas por naturaleza
    const wRug = .6 * suave((Math.min(dOcl(i), base[i]) - 2) / 3);
    const t = Math.min(1, Math.max(tOcl * .8, tBas * .9, rugT(i) * wRug));
    c.copy(marfil).lerp(encia, t);
    // los surcos se oscurecen un poco, como sombras
    const h = Math.sin(i * 127.1) * 43758.5453;
    const ruido = (h - Math.floor(h) - .5) * .06;
    c.offsetHSL(0, t * .04, ruido - rugT(i) * .04);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    if ((i & 16383) === 0) { onTick?.(.5 + i / n / 2); await new Promise(r => setTimeout(r)); }
  }
  return new THREE.BufferAttribute(col, 3);
}

/* ---------------- mapa de contacto (oclusión) ---------------- */
// distancia de cada vértice de geoA al vértice más cercano de geoB mediante una
// rejilla uniforme. Devuelve Float32Array de distancias (mm).
export function distanciaOclusion(geoA, geoB) {
  const pa = geoA.attributes.position, pb = geoB.attributes.position;
  const nb = pb.count;
  const caja = new THREE.Box3().setFromBufferAttribute(pb);
  const celda = Math.max(caja.getSize(new THREE.Vector3()).length() / 80, .4);
  const grid = new Map();
  const clave = (x, y, z) => x + ',' + y + ',' + z;
  for (let j = 0; j < nb; j++) {
    const k = clave(Math.floor(pb.getX(j) / celda), Math.floor(pb.getY(j) / celda), Math.floor(pb.getZ(j) / celda));
    let a = grid.get(k); if (!a) grid.set(k, a = []);
    a.push(j);
  }
  const dist = new Float32Array(pa.count);
  const radio = 6 / celda; // hasta ~6 mm
  for (let i = 0; i < pa.count; i++) {
    const cx = Math.floor(pa.getX(i) / celda), cy = Math.floor(pa.getY(i) / celda), cz = Math.floor(pa.getZ(i) / celda);
    let mejor = Infinity;
    const R = Math.ceil(radio);
    for (let dx = -R; dx <= R; dx++) for (let dy = -R; dy <= R; dy++) for (let dz = -R; dz <= R; dz++) {
      const a = grid.get(clave(cx + dx, cy + dy, cz + dz));
      if (!a) continue;
      for (const j of a) {
        const d = (pa.getX(i) - pb.getX(j)) ** 2 + (pa.getY(i) - pb.getY(j)) ** 2 + (pa.getZ(i) - pb.getZ(j)) ** 2;
        if (d < mejor) mejor = d;
      }
    }
    dist[i] = Math.sqrt(mejor);
  }
  return dist;
}

// pinta el mapa de contacto: rojo = toca, naranja = cerca, sin tinte = lejos
export function coloresOclusion(geo, dist, colBase) {
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  const toca = new THREE.Color('#d92b2b'), cerca = new THREE.Color('#f59e0b'), lejos = new THREE.Color('#2b9dd9');
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const d = dist[i];
    if (d < .3) c.copy(toca);
    else if (d < 1) c.copy(toca).lerp(cerca, (d - .3) / .7);
    else if (d < 3) c.copy(cerca).lerp(lejos, (d - 1) / 2);
    else c.copy(lejos);
    if (colBase && d > 3) c.setRGB(colBase.getX(i), colBase.getY(i), colBase.getZ(i)).lerp(lejos, .25);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  return new THREE.BufferAttribute(col, 3);
}

/* ---------------- exportar STL binario ---------------- */
export function stlBinario(mesh) {
  const geo = mesh.geometry;
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position, nT = p.count / 3;
  const buf = new ArrayBuffer(84 + nT * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, nT, true);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3();
  let o = 84;
  const w = (v3) => { dv.setFloat32(o, v3.x, true); dv.setFloat32(o + 4, v3.y, true); dv.setFloat32(o + 8, v3.z, true); o += 12; };
  for (let t = 0; t < nT; t++) {
    a.fromBufferAttribute(p, t * 3).applyMatrix4(mesh.matrixWorld);
    b.fromBufferAttribute(p, t * 3 + 1).applyMatrix4(mesh.matrixWorld);
    c.fromBufferAttribute(p, t * 3 + 2).applyMatrix4(mesh.matrixWorld);
    nrm.copy(b).sub(a).cross(c.clone().sub(a)).normalize();
    w(nrm); w(a); w(b); w(c);
    dv.setUint16(o, 0, true); o += 2;
  }
  return new Blob([buf], { type: 'model/stl' });
}

/* ---------------- caso (.tresdmodels = zip) ---------------- */
export function guardarCaso(modelos, medidas) {
  const archivos = {};
  const manifest = { version: 1, modelos: [], medidas: [] };
  for (const m of modelos) {
    const nombre = m.nombreArchivo || (m.nombre + '.stl');
    if (m.bytes) archivos[nombre] = new Uint8Array(m.bytes);
    else archivos[nombre] = new Uint8Array(0); // sin fuente: manifest igualmente
    manifest.modelos.push({
      archivo: nombre, nombre: m.nombre, arco: m.arco,
      color: '#' + m.mesh.material.color.getHexString(),
      realista: m.realista, rejilla: m.mesh.material.wireframe,
      opacidad: m.mesh.material.opacity, visible: m.mesh.visible,
      matriz: m.mesh.matrix.toArray(),
    });
  }
  for (const md of medidas) {
    manifest.medidas.push({ tipo: md.tipo, puntos: md.puntos.map(p => [p.x, p.y, p.z]) });
  }
  archivos['caso.json'] = new TextEncoder().encode(JSON.stringify(manifest));
  return new Blob([fflate.zipSync(archivos, { level: 1 })], { type: 'application/zip' });
}

export async function abrirCaso(file) {
  const des = fflate.unzipSync(new Uint8Array(await file.arrayBuffer()));
  const manifest = des['caso.json'] ? JSON.parse(new TextDecoder().decode(des['caso.json'])) : null;
  const mallas = [];
  for (const nombre in des) {
    if (!EXT.test(nombre)) continue;
    const u = des[nombre];
    const geo = await parsear(u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength), nombre);
    mallas.push({ nombre: nombre.replace(EXT, ''), archivo: nombre, geometria: geo, bytes: u });
  }
  return { manifest, mallas };
}
