// tresD Models (clon) — aplicación principal: UI, estado, medidas, casos.
// Reimplementación propia inspirada en https://tresdmodels.com/app/
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { Visor } from './viewer.js';
import {
  cargarArchivos, procesar, colorRealista, distanciaOclusion,
  coloresOclusion, stlBinario, guardarCaso, abrirCaso,
} from './geomio.js';
import {
  seccionMalla, lazosDe, rellenarAgujeros, indiceSinVertices, marcarRadio,
  marcarLazo, adyacencia, marcarMagico, verticeMasCercano, marcarCercaDeBorde,
  marcarPaladar, quitarProtuberancia, anadir, arrastrar, suavizar,
  rejillaDe, crearZocalo, matrizAlineacion,
} from './edicion.js';
import { analizarDientes, spriteTexto, bolton, anchosArcada, resalte, relacion } from './analisis.js';

/* ============ estado ============ */
const S = {
  modelos: [],           // {id,nombre,arco,mesh,geo,bytes,nombreArchivo,color,realista,colRealista,colArchivo,oclusionOn}
  medidas: [],           // {id,tipo,puntos,valor,grupo,etiqueta}
  herramienta: null,     // 'distancia' | 'angulo' | 'superficie'
  pendiente: [],         // puntos elegidos de la medida en curso
  oclusion: false,
  super: { fase: 'off', a: null, b: null, pares: [], espera: 'a', matrizAntes: null },
  corte: { activo: false, eje: 'axial', pos: .5, segs: [], med2d: [] },
  deshacer: [], rehacer: [],
  tema: 'light',
  contadorMed: 0,
};
let idSeq = 1;

/* ============ DOM base ============ */
const app = document.getElementById('app');
app.innerHTML = `
<div class="topbar">
  <a class="brand" href="#" title="tresD Models (clon)"><span class="logo-txt"><span class="t1">tres</span><span class="t2">D</span><span class="t3"> Models</span></span></a>
  <button class="btn-primary" id="b-add" hidden>Añadir escáner</button>
  <button class="btn-ghost" id="b-carpeta" hidden>+ Carpeta</button>
  <button class="btn-ghost" id="b-nuevo" hidden>Nuevo caso</button>
  <div class="spacer"></div>
  <button class="btn-ghost btn-icon" id="b-abrir" hidden title="Abrir caso (.tresdmodels)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19l2.757 -7.351a1 1 0 0 1 .936 -.649h12.307a1 1 0 0 1 .986 1.164l-.996 5.211a2 2 0 0 1 -1.964 1.625h-14.026a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2h4l3 3h7a2 2 0 0 1 2 2v2"/></svg></button>
  <button class="btn-ghost btn-icon" id="b-guardar" hidden title="Guardar caso"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4h10l4 4v10a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2"/><path d="M10 14a2 2 0 1 0 4 0a2 2 0 1 0 -4 0"/><path d="M14 4l0 4l-6 0l0 -4"/></svg></button>
  <button class="btn-ghost btn-icon" id="b-imagen" hidden title="Imagen: guardar lo que se ve (PNG)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h1a2 2 0 0 0 2 -2a1 1 0 0 1 1 -1h6a1 1 0 0 1 1 1a2 2 0 0 0 2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2"/><path d="M9 13a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"/></svg></button>
  <button class="btn-ghost btn-icon" id="b-deshacer" hidden title="Deshacer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14l-4 -4l4 -4"/><path d="M5 10h11a4 4 0 1 1 0 8h-1"/></svg></button>
  <button class="btn-ghost btn-icon" id="b-rehacer" hidden title="Rehacer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14l4 -4l-4 -4"/><path d="M19 10h-11a4 4 0 1 0 0 8h1"/></svg></button>
  <button class="btn-ghost btn-icon" id="b-letra" title="Tamaño de letra"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l3 0"/><path d="M14 20l7 0"/><path d="M6.9 15l6.9 0"/><path d="M10.2 6.3l5.8 13.7"/><path d="M5 20l6 -16l2 0l7 16"/></svg></button>
  <button class="btn-ghost btn-icon" id="b-tema" title="Tema claro / oscuro"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M12 3l0 18"/><path d="M12 9l4.65 -4.65"/><path d="M12 14.3l7.37 -7.37"/><path d="M12 19.6l8.85 -8.85"/></svg></button>
</div>
<div class="viewbar" id="viewbar" hidden></div>
<div class="cuerpo">
  <div class="panel izq" id="panel-izq" hidden>
    <h3>Herramientas <button class="tab" data-pl="izq" title="Replegar el panel">⟨</button></h3>
    <div class="cuerpo-panel" id="herramientas"></div>
  </div>
  <div class="visor" id="visor"></div>
  <div class="panel der" id="panel-der" hidden>
    <h3>Modelos <button class="tab" data-pl="der" title="Replegar el panel">⟩</button></h3>
    <div class="cuerpo-panel">
      <div class="todas"><input type="checkbox" id="cb-todas"><label for="cb-todas">Ocultar todos</label></div>
      <div id="lista-modelos"></div>
      <h3 style="padding-left:0">Medidas</h3>
      <div id="lista-medidas"></div>
    </div>
  </div>
</div>
<div class="portada" id="portada">
  <span class="logo-txt"><span class="t1">tres</span><span class="t2">D</span><span class="t3"> Models</span></span>
  <p class="lema">Arrastra aquí los escáneres (STL, PLY u OBJ, o un ZIP con ellos) o pulsa para buscarlos</p>
  <div class="botones">
    <button class="btn-primary" id="b-add2">Añadir escáner</button>
    <button class="btn-ghost" id="b-carpeta2">Abrir una carpeta</button>
    <button class="btn-ghost" id="b-caso2">Abrir un caso guardado</button>
  </div>
  <p class="pie">Clon con fines educativos · Los archivos no salen de tu ordenador · <a href="https://tresdmodels.com/app/" target="_blank" rel="noopener">Original: tresD Models</a></p>
</div>
<div class="toasts" id="toasts"></div>
<div class="carga" id="carga" hidden>
  <div class="caja">
    <span class="logo-txt"><span class="t1">tres</span><span class="t2">D</span><span class="t3"> Models</span></span>
    <div class="txt" id="carga-txt">Abriendo…</div>
    <div class="barra"><i id="carga-barra"></i></div>
  </div>
</div>
`;

const $ = s => document.querySelector(s);
const visorEl = $('#visor');
const visor = new Visor(visorEl);

/* ============ utilidades UI ============ */
function toast(titulo, cuerpo = '', tipo = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + tipo;
  t.innerHTML = `<b>${titulo}</b>${cuerpo}`;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 6000);
}

function cargando(txt, frac) {
  const c = $('#carga');
  if (txt === null) { c.hidden = true; return; }
  c.hidden = false;
  $('#carga-txt').textContent = txt;
  if (frac != null) $('#carga-barra').style.width = Math.round(frac * 100) + '%';
}

let menuEl = null;
function cerrarMenu() { menuEl?.remove(); menuEl = null; }
function abrirMenu(btn, items) {
  cerrarMenu();
  menuEl = document.createElement('div');
  menuEl.className = 'menu';
  for (const it of items) {
    if (it === '-') { menuEl.appendChild(document.createElement('hr')); continue; }
    if (it.sub) { const s = document.createElement('div'); s.className = 'sub'; s.textContent = it.sub; menuEl.appendChild(s); continue; }
    const b = document.createElement('button');
    b.className = 'item' + (it.sel ? ' sel' : '');
    b.textContent = it.txt;
    b.onclick = () => { cerrarMenu(); it.fn?.(); };
    menuEl.appendChild(b);
  }
  document.body.appendChild(menuEl);
  const r = btn.getBoundingClientRect();
  menuEl.style.top = (r.bottom + 6) + 'px';
  menuEl.style.left = Math.min(r.left, innerWidth - menuEl.offsetWidth - 8) + 'px';
  setTimeout(() => addEventListener('pointerdown', e => { if (!menuEl?.contains(e.target)) cerrarMenu(); }, { once: true }));
}

/* inputs de archivo */
const inputFiles = document.createElement('input');
inputFiles.type = 'file'; inputFiles.multiple = true;
inputFiles.accept = '.stl,.ply,.obj,.zip,.tresdmodels';
inputFiles.onchange = () => { loadFiles([...inputFiles.files]); inputFiles.value = ''; };
const inputDir = document.createElement('input');
inputDir.type = 'file'; inputDir.setAttribute('webkitdirectory', '');
inputDir.onchange = () => { loadFiles([...inputDir.files]); inputDir.value = ''; };
const inputCaso = document.createElement('input');
inputCaso.type = 'file'; inputCaso.accept = '.tresdmodels';
inputCaso.onchange = () => { if (inputCaso.files[0]) loadFiles([inputCaso.files[0]]); inputCaso.value = ''; };

/* ============ viewbar ============ */
const viewbar = $('#viewbar');
const VISTAS = ['Frontal', 'Derecha', 'Izquierda', 'Posterior', 'Oclusal', 'Superior', 'Inferior'];
for (const v of VISTAS) {
  const b = document.createElement('button');
  b.className = 'btn-ghost'; b.textContent = v;
  b.onclick = () => visor.setVista(v.toLowerCase());
  viewbar.appendChild(b);
}
const bMulti = document.createElement('button');
bMulti.className = 'btn-ghost'; bMulti.textContent = 'Multivista';
bMulti.title = 'Las vistas a la vez, cada una con su cámara';
bMulti.onclick = () => { bMulti.classList.toggle('activo', toggleMultivista()); };
viewbar.appendChild(bMulti);
const bRot = document.createElement('button');
bRot.className = 'btn-ghost'; bRot.textContent = '⟳ Rotación';
bRot.title = 'Girar los modelos sin parar (un clic en el visor la para)';
bRot.onclick = () => bRot.classList.toggle('activo', visor.toggleRotacion());
viewbar.appendChild(bRot);
const bOrto = document.createElement('button');
bOrto.className = 'btn-ghost'; bOrto.textContent = 'Ortogonal';
bOrto.title = 'Vista ortogonal, sin perspectiva';
bOrto.onclick = () => bOrto.classList.toggle('activo', visor.toggleOrto());
viewbar.appendChild(bOrto);
const bCuad = document.createElement('button');
bCuad.className = 'btn-ghost'; bCuad.textContent = 'Cuadrícula';
bCuad.title = 'Papel milimetrado: una raya cada milímetro y una gruesa cada centímetro';
bCuad.onclick = () => bCuad.classList.toggle('activo', visor.toggleCuadricula());
viewbar.appendChild(bCuad);
const bVis = document.createElement('button');
bVis.className = 'btn-ghost'; bVis.textContent = 'Visualización ▾';
const ESTILOS = [['estudio', 'Estudio'], ['intraoral', 'Foto intraoral'], ['esmalte', 'Esmalte translúcido'], ['catalogo', 'Catálogo'], ['dramatico', 'Dramático']];
bVis.onclick = () => abrirMenu(bVis, ESTILOS.map(([k, n]) => ({
  txt: n, sel: visor.estilo === k,
  fn: () => visor.aplicarEstilo(k),
})));
viewbar.appendChild(bVis);

/* ============ panel de herramientas ============ */
const herr = $('#herramientas');
herr.innerHTML = `
<div class="herr-grupo">
  <button class="btn-seg" data-seg="editar">Editar modelos</button>
  <div class="herr-sub" id="sub-editar" hidden>
    <div class="nota">El editor se abre como barra inferior: elige modelo, enciende una herramienta y actúa sobre ella.</div>
  </div>
</div>
<div class="herr-grupo">
  <button class="btn-seg" data-seg="analisis">Análisis</button>
  <div class="herr-sub" id="sub-analisis" hidden>
    <div class="tit">Medir (elige y marca con un clic)</div>
    <button class="btn-ghost herramienta" data-h="distancia" title="Dos puntos en línea recta">Distancia</button>
    <button class="btn-ghost herramienta" data-h="angulo" title="Tres puntos; el del medio es el vértice">Ángulo</button>
    <button class="btn-ghost herramienta" data-h="superficie" title="Recorrido sobre el modelo: doble clic en el último punto para terminar">Superficie</button>
    <hr>
    <button class="btn-ghost" id="b-cortes" title="Un corte del modelo, a tamaño real, debajo del visor">Cortes 2D</button>
    <hr>
    <button class="btn-ghost" id="b-oclusion" title="Dónde y cuánto se tocan las dos arcadas">Oclusión</button>
    <hr>
    <button class="btn-ghost" id="b-molares" title="Distancia y giro de los primeros molares respecto a los caninos">Rotación de molares</button>
    <button class="btn-ghost" id="b-bonwill" title="Carta con la forma del arco, anchos y triángulo">Carta de Bonwill–Hawley (beta)</button>
    <button class="btn-ghost" id="b-anamodelos" title="Bolton, anchos de arcada, resalte y relación molar">Análisis de modelos (beta)</button>
    <div class="nota">Las medidas y el mapa de contacto son orientativos.</div>
  </div>
</div>
<div class="herr-grupo">
  <button class="btn-seg" data-seg="zocalo">Zocalado virtual</button>
  <div class="herr-sub" id="sub-zocalo" hidden>
    <button class="btn-ghost" id="b-zocalo">Crear los zócalos</button>
    <div class="slider-fila"><span>Altura (mm)</span><input type="range" id="zocalo-h" min="8" max="25" value="14"></div>
    <button class="btn-ghost" id="b-zocalo-quitar">Quitar los zócalos</button>
    <div class="nota">Una base de escayola bajo cada modelo, a la altura de la margen. Orientativo.</div>
  </div>
</div>
<div class="herr-grupo">
  <button class="btn-seg" data-seg="super">Superposición</button>
  <div class="herr-sub" id="sub-super" hidden>
    <div class="tit">Llevar «B» sobre «A» con puntos coincidentes</div>
    <label class="lbl sub-fila">A&nbsp;<select id="sel-a"></select></label>
    <label class="lbl sub-fila">B&nbsp;<select id="sel-b"></select></label>
    <button class="btn-ghost" id="b-pares">Marcar puntos</button>
    <button class="btn-ghost" id="b-alinear" disabled>Alinear</button>
    <button class="btn-ghost" id="b-restablecer">Restablecer posición</button>
    <div class="nota">Marca tres puntos o más, un clic en A y otro en B por turnos. Orientativo.</div>
  </div>
</div>`;

// desplegables de cada grupo; «Editar modelos» abre la barra inferior
herr.querySelectorAll('.btn-seg').forEach(seg => {
  seg.onclick = () => {
    if (seg.dataset.seg === 'editar') { seg.classList.toggle('abierto', toggleEditar()); return; }
    const sub = $('#sub-' + seg.dataset.seg);
    sub.hidden = !sub.hidden;
    seg.classList.toggle('abierto', !sub.hidden);
    if (seg.dataset.seg === 'super' && !sub.hidden) rellenarSelects();
  };
});

herr.querySelectorAll('.herramienta').forEach(b => {
  b.onclick = () => setHerramienta(S.herramienta === b.dataset.h ? null : b.dataset.h);
});
$('#b-oclusion').onclick = () => toggleOclusion();
$('#b-cortes').onclick = () => toggleCorte();
$('#b-zocalo').onclick = () => crearZocalos();
$('#b-zocalo-quitar').onclick = () => quitarZocalos();
$('#b-pares').onclick = () => marcarPares();
$('#b-alinear').onclick = () => alinear();
$('#b-restablecer').onclick = () => restablecer();

function setHerramienta(h) {
  S.herramienta = h;
  S.pendiente = [];
  S.piezaPts = [];
  document.querySelectorAll('.herramienta').forEach(b => b.classList.toggle('sel', b.dataset.h === h));
  const arrastrando = ['quitar', 'goma', 'anadir', 'suavizar', 'arrastrar', 'lazo'].includes(h);
  // con el pincel o el lazo, el botón izquierdo edita: orbitar pasa al derecho
  visor.controls.mouseButtons.LEFT = arrastrando ? null : THREE.MOUSE.ROTATE;
  pincelEl.hidden = !['quitar', 'goma', 'anadir', 'suavizar', 'arrastrar', 'magico'].includes(h);
  if (S.super.fase === 'marcando' && h !== 'pares') cancelarPares();
  if (H_EDICION.has(h) && editarEl && editarEl.hidden) toggleEditar(true);
  hint(h === 'distancia' ? 'Distancia: marca dos puntos'
    : h === 'angulo' ? 'Ángulo: marca tres puntos; el del medio es el vértice'
    : h === 'superficie' ? 'Superficie: marca el recorrido; doble clic para terminar'
    : h === 'quitar' || h === 'goma' ? 'Arrastra sobre el modelo para borrar caras'
    : h === 'anadir' ? 'Añadir: arrastra sobre el modelo para dar volumen'
    : h === 'suavizar' ? 'Suavizar: arrastra sobre el modelo para alisar'
    : h === 'arrastrar' ? 'Arrastrar: empuja la superficie con el pincel'
    : h === 'magico' ? 'Mágico: clic en la zona a eliminar (crece hasta el radio del pincel)'
    : h === 'lazo' ? 'Lazo: rodea la zona a borrar arrastrando'
    : h === 'protuberancia' ? 'Clic sobre el elemento a eliminar (bracket, atache, retenedor…)'
    : h && h.startsWith('pieza-') ? 'Clic sobre el modelo para colocar la pieza'
    : h === 'margen' ? 'Margen gingival: marca puntos sobre la línea de la encía; termina apagando la herramienta'
    : h === 'pares' ? 'Marca un punto en «' + nombreDe(S.super.a) + '»'
    : h === 'molar-punto' ? 'Clic en un punto (molar rosa / canino turquesa) para seleccionarlo y luego clic en su nueva posición'
    : '');
  actualizarPendiente();
}

let hintEl = null;
function hint(txt) {
  if (!hintEl) { hintEl = document.createElement('div'); hintEl.className = 'hint-visor'; visorEl.appendChild(hintEl); }
  hintEl.textContent = txt || '';
  hintEl.hidden = !txt;
}

/* ============ carga de modelos ============ */
async function loadFiles(files) {
  if (!files.length) return;
  cargando('Abriendo…', 0);
  try {
    const entradas = await cargarArchivos(files, (t, f) => cargando(t, f * .5));
    let k = 0;
    for (const e of entradas) {
      if (e.caso) { await restaurarCaso(e.caso); continue; }
      k++;
      cargando(`Preparando ${e.nombre}…`, .5 + .4 * k / entradas.length);
      await new Promise(r => setTimeout(r, 30)); // que pinte el aviso antes de soldar
      const { geometria, quitados, areaQuitada } = procesar(e.geometria);
      await anadirModelo(e, geometria);
      if (quitados) toast('Escáner limpiado', `Se han quitado ${quitados} trozos sueltos (${(100 * areaQuitada / Math.max(1, areaTotal(e.geometria))).toFixed(1)} % de la superficie).`);
    }
    cargando(null);
    if (S.modelos.length) {
      $('#portada').hidden = true;
      mostrarUI(true);
      if (!visor.radio) visor.encuadrar(false);
      sugerir();
    }
  } catch (err) {
    cargando(null);
    console.error(err);
    toast('No se pudo abrir', String(err.message || err), 'error');
  }
}

function areaTotal(geo) {
  const p = geo.attributes.position;
  let s = 0; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const idx = geo.index ? geo.index.array : null;
  const n = idx ? idx.length : p.count;
  for (let t = 0; t < n; t += 3) {
    const i0 = idx ? idx[t] : t, i1 = idx ? idx[t + 1] : t + 1, i2 = idx ? idx[t + 2] : t + 2;
    a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
    s += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return s;
}

function arcoDe(nombre, geo) {
  const n = nombre.toLowerCase();
  if (/(upper|maxil|sup\b|superior|up\b)/.test(n)) return 'sup';
  if (/(lower|mand|inf\b|inferior|low\b)/.test(n)) return 'inf';
  return '';
}

async function anadirModelo(e, geo) {
  const m = {
    id: idSeq++, nombre: e.nombre, nombreArchivo: e.file?.name,
    bytes: e.file ? await e.file.arrayBuffer() : e.bytes?.buffer,
    arco: arcoDe(e.nombre, geo),
    color: '#d8cfae', realista: true, geo,
    colArchivo: geo.attributes.color || null, colRealista: null, oclusionOn: false,
  };
  const mat = visor.materialModelo(m.color);
  m.mesh = new THREE.Mesh(geo, mat);
  m.mesh.name = m.nombre;
  visor.addModelo(m);

  // color realista en segundo plano
  const tick = f => cargando(`Preparando el color realista…`, .9 + f * .1);
  try {
    m.colRealista = geo.attributes.color || await colorRealista(geo, tick, m.arco);
  } catch { m.colRealista = null; }
  if (m.colRealista) { geo.setAttribute('color', m.colRealista); mat.vertexColors = true; mat.color.set('#ffffff'); mat.needsUpdate = true; }

  S.modelos.push(m);
  renderModelos();
  registrar({
    hacer: () => { visor.addModelo(m); if (!S.modelos.includes(m)) S.modelos.push(m); renderModelos(); },
    deshacer: () => { visor.removeModelo(m); S.modelos = S.modelos.filter(x => x !== m); renderModelos(); },
  });
  return m;
}

function mostrarUI(v) {
  for (const id of ['#b-add', '#b-carpeta', '#b-nuevo', '#b-abrir', '#b-guardar', '#b-imagen', '#b-deshacer', '#b-rehacer']) $(id).hidden = !v;
  $('#viewbar').hidden = !v;
  $('#panel-izq').hidden = !v;
  $('#panel-der').hidden = !v;
}

/* ============ tarjetas de modelo ============ */
function renderModelos() {
  const lista = $('#lista-modelos');
  lista.innerHTML = '';
  for (const m of S.modelos) {
    const card = document.createElement('div');
    card.className = 'tarjeta';
    card.innerHTML = `
      <div class="fila">
        <input type="checkbox" class="cb-vis" ${m.mesh.visible ? 'checked' : ''} title="Mostrar / ocultar">
        <button class="chip-color" title="Color del modelo"><input type="color" value="${m.color}"></button>
        <span class="nom" title="${m.nombre}">${m.nombre}</span>
        ${m.arco ? `<span class="tag">${m.arco}.</span>` : ''}
        <button class="ico-btn b-bajar" title="Descargar STL"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2"/><path d="M7 11l5 5l5 -5"/><path d="M12 4l0 12"/></svg></button>
        <button class="ico-btn peligro b-borrar" title="Quitar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7l16 0"/><path d="M10 11l0 6"/><path d="M14 11l0 6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/></svg></button>
      </div>
      <div class="sub-fila">
        <label class="lbl"><input type="checkbox" class="cb-real" ${m.realista ? 'checked' : ''}> Color realista</label>
        <label class="lbl"><input type="checkbox" class="cb-rej"> Rejilla</label>
      </div>
      <div class="slider-fila"><span>Opacidad</span><input type="range" min="10" max="100" value="100"></div>`;
    const mat = m.mesh.material;
    card.querySelector('.cb-vis').onchange = ev => { m.mesh.visible = ev.target.checked; visor.encuadrar(false); };
    card.querySelector('input[type=color]').oninput = ev => {
      m.color = ev.target.value; m.realista = false;
      mat.vertexColors = false; mat.color.set(m.color); mat.needsUpdate = true;
      card.querySelector('.cb-real').checked = false;
    };
    card.querySelector('.cb-real').onchange = ev => {
      m.realista = ev.target.checked;
      if (m.realista && m.colRealista) { m.geo.setAttribute('color', m.colRealista); mat.vertexColors = true; mat.color.set('#ffffff'); }
      else { mat.vertexColors = false; mat.color.set(m.color); }
      mat.needsUpdate = true;
    };
    card.querySelector('.cb-rej').onchange = ev => { mat.wireframe = ev.target.checked; };
    card.querySelector('input[type=range]').oninput = ev => {
      const o = ev.target.value / 100;
      mat.opacity = o; mat.transparent = o < 1; mat.depthWrite = o >= 1;
    };
    card.querySelector('.b-bajar').onclick = () => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(stlBinario(m.mesh));
      a.download = m.nombre + '.stl'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
    card.querySelector('.b-borrar').onclick = () => {
      visor.removeModelo(m);
      S.modelos = S.modelos.filter(x => x !== m);
      renderModelos();
      registrar({
        hacer: () => { visor.removeModelo(m); S.modelos = S.modelos.filter(x => x !== m); renderModelos(); },
        deshacer: () => { visor.addModelo(m); if (!S.modelos.includes(m)) S.modelos.push(m); renderModelos(); },
      });
      if (!S.modelos.length) nuevoCaso(true);
    };
    lista.appendChild(card);
  }
}

$('#cb-todas').onchange = ev => {
  const v = !ev.target.checked;
  for (const m of S.modelos) m.mesh.visible = v;
  renderModelos();
  document.querySelectorAll('#lista-modelos .cb-vis').forEach(cb => cb.checked = v);
};

/* ============ medidas ============ */
const RADIO_PUNTO = () => Math.max(visor.radio * .012, .35);
let gPendiente = new THREE.Group();
visor.marcadores.add(gPendiente);
const matPunto = new THREE.MeshBasicMaterial({ color: '#0EA5B7', depthTest: false });
const matLinea = new THREE.LineBasicMaterial({ color: '#0EA5B7', depthTest: false });

function esferaPunto(p) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(RADIO_PUNTO(), 20, 14), matPunto);
  s.position.copy(p); s.renderOrder = 10;
  return s;
}

function actualizarPendiente() {
  gPendiente.clear();
  for (const p of S.pendiente) gPendiente.add(esferaPunto(p));
  if (S.pendiente.length > 1) {
    const g = new THREE.BufferGeometry().setFromPoints(S.pendiente);
    const l = new THREE.Line(g, matLinea); l.renderOrder = 9;
    gPendiente.add(l);
  }
}

let abajoEn = null;
visorEl.addEventListener('pointerdown', e => { abajoEn = [e.clientX, e.clientY]; });
visorEl.addEventListener('pointerup', e => {
  // solo cuenta como "clic" si no ha sido un arrastre para orbitar
  const fueClic = abajoEn && Math.hypot(e.clientX - abajoEn[0], e.clientY - abajoEn[1]) < 6;
  abajoEn = null;
  if (e.button !== 0 || !fueClic || !S.herramienta || S.multi) return;
  const hit = S.herramienta === 'molar-punto' ? pickUniversal(e.clientX, e.clientY) : visor.pick(e.clientX, e.clientY);
  if (!hit) return;
  if (S.herramienta === 'molar-punto') { clicMolares(hit); return; }
  if (S.herramienta === 'pares') {
    const m = modeloDe(hit.objeto);
    if (!m || m.id !== S.super[S.super.espera]) {
      toast('Superposición', `Este punto debe ir en «${nombreDe(S.super[S.super.espera])}».`, 'aviso');
      return;
    }
    const lado = S.super.espera;
    const s = esferaPunto(hit.punto.clone());
    s.material = lado === 'a' ? matA : matB;
    gSuper.add(s);
    if (lado === 'a') {
      S.super.par = { a: hit.punto.clone() };
      S.super.espera = 'b';
      hint(`Punto ${S.super.pares.length + 1} en «${nombreDe(S.super.b)}»`);
    } else {
      S.super.par.b = hit.punto.clone();
      S.super.pares.push(S.super.par);
      S.super.espera = 'a';
      $('#b-alinear').disabled = S.super.pares.length < 3;
      hint(`Punto ${S.super.pares.length + 1} en «${nombreDe(S.super.a)}» (${S.super.pares.length} pares)`);
    }
    return;
  }
  const m = modeloDe(hit.objeto);
  if (m && ['magico', 'protuberancia', 'margen', 'pieza-pontico', 'pieza-barra', 'pieza-turbo', 'pieza-espolon'].includes(S.herramienta)) {
    clicEdicion(hit, m);
    return;
  }
  if (!['distancia', 'angulo', 'superficie'].includes(S.herramienta)) return;
  S.pendiente.push(hit.punto.clone());
  actualizarPendiente();
  const n = S.herramienta === 'distancia' ? 2 : S.herramienta === 'angulo' ? 3 : Infinity;
  if (S.pendiente.length >= n) terminarMedida();
});
visorEl.addEventListener('pointerdown', e => {
  if (visor.controls.autoRotate) { visor.toggleRotacion(false); bRot.classList.remove('activo'); }
});
visorEl.addEventListener('dblclick', () => {
  if (S.herramienta === 'superficie' && S.pendiente.length >= 2) terminarMedida();
});

function terminarMedida() {
  const pts = S.pendiente; S.pendiente = [];
  const tipo = S.herramienta;
  let valor, txt;
  if (tipo === 'distancia') {
    valor = pts[0].distanceTo(pts[1]);
    txt = `Distancia: ${fmt(valor)} mm`;
  } else if (tipo === 'angulo') {
    const v1 = pts[0].clone().sub(pts[1]), v2 = pts[2].clone().sub(pts[1]);
    valor = THREE.MathUtils.radToDeg(v1.angleTo(v2));
    txt = `Ángulo: ${fmt(valor)}°`;
  } else {
    valor = 0;
    for (let i = 1; i < pts.length; i++) valor += pts[i].distanceTo(pts[i - 1]);
    txt = `Superficie: ${fmt(valor)} mm`;
  }
  const md = { id: idSeq++, tipo, puntos: pts, valor, nombre: txt.split(':')[0] };
  setHerramienta(null);
  anadirMedida(md);
  registrar({ hacer: () => anadirMedida(md), deshacer: () => quitarMedida(md) });
  hint(txt);
}

const fmt = v => v.toFixed(2).replace('.', ',');

function anadirMedida(md) {
  if (!md.grupo) {
    md.grupo = new THREE.Group();
    for (const p of md.puntos) md.grupo.add(esferaPunto(p));
    const segs = md.tipo === 'angulo' ? [[md.puntos[0], md.puntos[1]], [md.puntos[1], md.puntos[2]]]
      : md.puntos.slice(0, -1).map((p, i) => [p, md.puntos[i + 1]]);
    for (const [a, b] of segs) {
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), matLinea);
      l.renderOrder = 9; md.grupo.add(l);
    }
  }
  visor.marcadores.add(md.grupo);
  if (!md.etiqueta) {
    md.etiqueta = document.createElement('div');
    md.etiqueta.className = 'etiqueta';
    md.etiqueta.textContent = `${md.nombre}: ${fmt(md.valor)}${md.tipo === 'angulo' ? '°' : ' mm'}`;
    visorEl.appendChild(md.etiqueta);
  }
  if (!S.medidas.includes(md)) S.medidas.push(md);
  renderMedidas();
}

function quitarMedida(md) {
  visor.marcadores.remove(md.grupo);
  md.etiqueta?.remove();
  S.medidas = S.medidas.filter(x => x !== md);
  renderMedidas();
}

function renderMedidas() {
  const lista = $('#lista-medidas');
  lista.innerHTML = '';
  if (!S.medidas.length) { lista.innerHTML = '<div class="nota">Aún no hay medidas.</div>'; return; }
  for (const md of S.medidas) {
    const card = document.createElement('div');
    card.className = 'tarjeta fila';
    card.innerHTML = `
      <span class="punto"></span><span class="nom">${md.nombre}</span>
      <span class="valor-medida">${fmt(md.valor)}${md.tipo === 'angulo' ? '°' : ' mm'}</span>
      <button class="ico-btn b-ojo" title="Mostrar / ocultar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0"/><path d="M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6"/></svg></button>
      <button class="ico-btn peligro b-borrar" title="Quitar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7l16 0"/><path d="M10 11l0 6"/><path d="M14 11l0 6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7v-3a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/></svg></button>`;
    card.querySelector('.b-ojo').onclick = () => {
      md.grupo.visible = !md.grupo.visible;
      md.etiqueta.style.display = md.grupo.visible ? '' : 'none';
    };
    card.querySelector('.b-borrar').onclick = () => {
      quitarMedida(md);
      registrar({ hacer: () => quitarMedida(md), deshacer: () => anadirMedida(md) });
    };
    lista.appendChild(card);
  }
}

// mueve las etiquetas HTML con la cámara
(function loopEtiquetas() {
  requestAnimationFrame(loopEtiquetas);
  for (const md of S.medidas) {
    if (!md.etiqueta || !md.grupo.visible) continue;
    const ref = md.tipo === 'angulo' ? md.puntos[1] : md.puntos[Math.floor(md.puntos.length / 2)];
    const p = visor.proyectar(ref);
    md.etiqueta.style.left = p.x + 'px';
    md.etiqueta.style.top = p.y + 'px';
    md.etiqueta.style.display = p.detras ? 'none' : '';
  }
})();

/* ============ edición de modelos ---------------- */
const pincelEl = document.createElement('div');
pincelEl.className = 'pincel';
pincelEl.hidden = true;
visorEl.appendChild(pincelEl);

function modeloDe(objeto) {
  let o = objeto;
  while (o) { const m = S.modelos.find(m => m.mesh === o); if (m) return m; o = o.parent; }
  return null;
}

/* ============ edición de modelos (barra inferior) ============ */
const editarEl = document.createElement('div');
editarEl.id = 'editar';
editarEl.hidden = true;
editarEl.innerHTML = `
  <div class="editar-barra">
    <b>Editar modelos</b>
    <label class="lbl">Modelo <select id="edit-modelo"></select></label>
    <span class="espacio"></span>
    <button class="btn-ghost btn-mini" id="edit-revertir">Revertir cambios</button>
    <button class="ico-btn" id="edit-x" title="Cerrar el editor">✕</button>
  </div>
  <div class="editar-grupos">
    <span class="etq">Pinceles</span>
    <button class="btn-ghost btn-mini herramienta" data-h="anadir" title="Da volumen bajo el pincel">⊕ Añadir</button>
    <button class="btn-ghost btn-mini herramienta" data-h="quitar" title="Borra las caras bajo el pincel">⊖ Quitar</button>
    <button class="btn-ghost btn-mini herramienta" data-h="suavizar" title="Alisa la superficie">〰 Suavizar</button>
    <button class="btn-ghost btn-mini herramienta" data-h="arrastrar" title="Empuja la superficie">✥ Arrastrar</button>
    <span class="etq">Limpiar</span>
    <button class="btn-ghost btn-mini herramienta" data-h="magico" title="Borra la zona conexa bajo el clic">✦ Mágico</button>
    <button class="btn-ghost btn-mini herramienta" data-h="goma" title="Como Quitar, con pincel más ancho">Goma</button>
    <button class="btn-ghost btn-mini herramienta" data-h="lazo" title="Rodea la zona a borrar">◌ Lazo</button>
    <button class="btn-ghost btn-mini" id="edit-rellenar" title="Tapa los agujeros pequeños">Rellenar agujeros</button>
    <button class="btn-ghost btn-mini" id="edit-borde" title="Quita los triángulos sueltos del contorno">Limpiar borde</button>
    <button class="btn-ghost btn-mini" id="edit-paladar" title="Quita el paladar por encima de la margen">Limpiar paladar</button>
    <span class="etq">Eliminar</span>
    <button class="btn-ghost btn-mini herramienta" data-h="protuberancia" title="Clic sobre el elemento; se quita y se rellena">Eliminar brackets</button>
    <button class="btn-ghost btn-mini herramienta" data-h="protuberancia">Eliminar 1 bracket/atache</button>
    <button class="btn-ghost btn-mini herramienta" data-h="protuberancia">Eliminar ataches</button>
    <button class="btn-ghost btn-mini herramienta" data-h="protuberancia">Eliminar retenedor fijo</button>
    <span class="etq">Piezas</span>
    <button class="btn-ghost btn-mini herramienta" data-h="pieza-pontico" title="Pieza dental provisional en el hueco">Póntico</button>
    <button class="btn-ghost btn-mini herramienta" data-h="pieza-barra" title="Barra entre dos puntos">+ Barra</button>
    <button class="btn-ghost btn-mini herramienta" data-h="pieza-turbo" title="Bloque de mordida">+ Bites turbo</button>
    <button class="btn-ghost btn-mini herramienta" data-h="pieza-espolon" title="Espolón para control de hábitos">+ Espolones</button>
    <span class="etq">Encía</span>
    <button class="btn-ghost btn-mini herramienta" data-h="margen" title="Marca la línea del margen gingival">Margen gingival</button>
  </div>
  <div class="editar-pie">
    <label class="lbl">Pincel <input type="range" id="pincel-r" min="2" max="15" value="6"></label>
    <span class="nota">Enciende una herramienta; vuelve a pulsarla o haz clic fuera del modelo para apagarla. Sin ninguna, el ratón gira el modelo.</span>
  </div>`;
visorEl.appendChild(editarEl);

const H_EDICION = new Set(['anadir', 'quitar', 'goma', 'suavizar', 'arrastrar', 'lazo',
  'magico', 'protuberancia', 'pieza-pontico', 'pieza-barra', 'pieza-turbo', 'pieza-espolon', 'margen']);

function modeloEdit() { return S.modelos.find(m => m.id === S.editModelo) || S.modelos[0]; }

function toggleEditar(abrir) {
  S.editar = { abierto: abrir ?? editarEl.hidden };
  editarEl.hidden = !S.editar.abierto;
  $('[data-seg=editar]').classList.toggle('abierto', S.editar.abierto);
  if (S.editar.abierto) {
    const sel = $('#edit-modelo');
    sel.innerHTML = '';
    for (const m of S.modelos) { const o = document.createElement('option'); o.value = m.id; o.textContent = m.nombre; sel.appendChild(o); }
    if (!S.editModelo && S.modelos[0]) S.editModelo = S.modelos[0].id;
    sel.value = S.editModelo;
  } else if (H_EDICION.has(S.herramienta)) setHerramienta(null);
  return S.editar.abierto;
}
$('#edit-modelo').onchange = e => { S.editModelo = +e.target.value; };
$('#edit-x').onclick = () => toggleEditar(false);
$('#edit-revertir').onclick = () => restaurar(S.editModelo);
editarEl.querySelectorAll('.herramienta').forEach(b => {
  b.onclick = () => setHerramienta(S.herramienta === b.dataset.h ? null : b.dataset.h);
});

function resguardar(m) {
  if (!m.geoRespaldo) m.geoRespaldo = m.mesh.geometry.clone();
}
// invalida las estructuras auxiliares tras cambiar la malla
const invalidar = m => { m.grid = null; m.ady = null; m.dientes = null; };
// undo de un cambio de índice (caras borradas) sobre la misma geometría
function registrarBorrado(m, idxAntes, quitadas) {
  const g = m.mesh.geometry;
  registrar({
    hacer: () => g.setIndex(new THREE.BufferAttribute(new Uint32Array([...idxAntes].filter((_, t) => !quitadas.has(Math.floor(t / 3)))), 1)),
    deshacer: () => { g.setIndex(new THREE.BufferAttribute(idxAntes.slice(), 1)); invalidar(m); },
  });
  invalidar(m);
}
// aplica una máscara de borrado de una vez (mágico, lazo, borde, paladar)
function aplicarMarcado(m, marcado, que) {
  const g = m.mesh.geometry;
  const idxAntes = g.index.array.slice();
  const quitadas = new Set();
  const ni = indiceSinVertices(g, marcado, quitadas, idxAntes);
  const n = quitadas.size;
  if (!n) { toast(que, 'Nada que quitar ahí.'); return 0; }
  g.setIndex(ni);
  registrarBorrado(m, idxAntes, quitadas);
  return n;
}

/* ---------- trazos de pincel ---------- */
let trazo = null; // {m, idxAntes, posAntes, quitadas:Set, ultimo}
visorEl.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const h = S.herramienta;
  if (h === 'lazo') { iniciarLazo(e); return; }
  if (!['quitar', 'goma', 'anadir', 'suavizar', 'arrastrar'].includes(h)) return;
  const hit = visor.pick(e.clientX, e.clientY);
  const m = hit && modeloDe(hit.objeto);
  if (!m || m !== modeloEdit()) { if (m) hint(`Estás editando «${modeloEdit().nombre}» — cámbialo arriba`); return; }
  resguardar(m);
  const g = m.mesh.geometry;
  trazo = { m, quitadas: new Set(),
    idxAntes: g.index.array.slice(),
    posAntes: g.attributes.position.array.slice(),
    ultimo: hit.punto.clone() };
  if (!m.grid) m.grid = rejillaDe(g, .8);
  aplicarPincel(hit.punto);
});

let ultimoPincel = 0;
visorEl.addEventListener('pointermove', e => {
  const h = S.herramienta;
  if (h === 'lazo') { pincelEl.hidden = true; if (lazoPts && (e.buttons & 1)) seguirLazo(e); return; }
  const editando = ['quitar', 'goma', 'anadir', 'suavizar', 'arrastrar', 'magico'].includes(h);
  if (!editando) { pincelEl.hidden = true; return; }
  const r = visorEl.getBoundingClientRect();
  const radio = +$('#pincel-r').value * (h === 'goma' ? 1.6 : 1);
  const d = visor.cam.position.distanceTo(visor.controls.target);
  const px = r.height / (2 * Math.tan(THREE.MathUtils.degToRad(visor.camP.fov / 2))) * radio / d;
  pincelEl.hidden = false;
  pincelEl.style.width = pincelEl.style.height = Math.max(px * 2, 6) + 'px';
  pincelEl.style.left = (e.clientX - r.left) + 'px';
  pincelEl.style.top = (e.clientY - r.top) + 'px';
  if (!trazo || !(e.buttons & 1)) return;
  const ahora = performance.now();
  if (ahora - ultimoPincel < 45) return;
  ultimoPincel = ahora;
  const hit = visor.pick(e.clientX, e.clientY);
  if (hit && modeloDe(hit.objeto) === trazo.m) aplicarPincel(hit.punto);
});
addEventListener('pointerup', () => {
  if (lazoPts) { cerrarLazo(); return; }
  if (!trazo) return;
  const { m, idxAntes, posAntes, quitadas } = trazo;
  const g = m.mesh.geometry;
  if (quitadas.size) {
    registrarBorrado(m, idxAntes, quitadas);
  } else {
    const posDespues = g.attributes.position.array.slice();
    registrar({
      hacer: () => { g.attributes.position.array.set(posDespues); g.attributes.position.needsUpdate = true; g.computeVertexNormals(); },
      deshacer: () => { g.attributes.position.array.set(posAntes); g.attributes.position.needsUpdate = true; g.computeVertexNormals(); },
    });
  }
  trazo = null;
});

function aplicarPincel(punto) {
  const m = trazo.m, g = m.mesh.geometry;
  const h = S.herramienta;
  const radio = +$('#pincel-r').value * (h === 'goma' ? 1.6 : 1);
  const pLocal = punto.clone();
  m.mesh.worldToLocal(pLocal);
  if (h === 'quitar' || h === 'goma') {
    g.setIndex(indiceSinVertices(g, marcarRadio(g, pLocal, radio), trazo.quitadas, trazo.idxAntes));
  } else if (h === 'anadir') {
    anadir(g, pLocal, radio);
  } else if (h === 'suavizar') {
    suavizar(g, m.grid, .8, pLocal, radio);
  } else if (h === 'arrastrar') {
    const previo = trazo.ultimo.clone();
    m.mesh.worldToLocal(previo);
    const delta = pLocal.clone().sub(previo);
    trazo.ultimo = punto.clone();
    arrastrar(g, pLocal, radio, delta);
  }
}

/* ---------- lazo ---------- */
let lazoPts = null, lazoSvg = null;
function iniciarLazo(e) {
  lazoPts = [[e.clientX, e.clientY]];
  lazoSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  lazoSvg.setAttribute('class', 'lazo-svg');
  lazoSvg.innerHTML = '<polyline fill="rgba(14,165,183,.12)" stroke="#0EA5B7" stroke-width="1.5"/>';
  visorEl.appendChild(lazoSvg);
}
function seguirLazo(e) {
  lazoPts.push([e.clientX, e.clientY]);
  const r = visorEl.getBoundingClientRect();
  lazoSvg.querySelector('polyline').setAttribute('points', lazoPts.map(([x, y]) => `${x - r.left},${y - r.top}`).join(' '));
}
function cerrarLazo() {
  const m = modeloEdit(), g = m && m.mesh.geometry;
  const pts = lazoPts; lazoPts = null;
  lazoSvg.remove(); lazoSvg = null;
  if (!g || pts.length < 5) return;
  resguardar(m);
  const rect = visor.renderer.domElement.getBoundingClientRect();
  const marcado = marcarLazo(g, pts.map(([x, y]) => ({ x, y })), pLocal => {
    const w = pLocal.clone(); m.mesh.localToWorld(w); w.project(visor.cam);
    return { x: (w.x + 1) / 2 * rect.width + rect.left, y: (-w.y + 1) / 2 * rect.height + rect.top };
  });
  aplicarMarcado(m, marcado, 'Lazo');
}

/* ---------- operaciones de un clic ---------- */
function clicEdicion(hit, m) {
  const h = S.herramienta;
  if (m !== modeloEdit()) { toast('Editar modelos', `Estás editando «${modeloEdit().nombre}».`, 'aviso'); return; }
  const g = m.mesh.geometry;
  const pLocal = hit.punto.clone();
  m.mesh.worldToLocal(pLocal);
  resguardar(m);
  if (h === 'magico') {
    if (!m.grid) m.grid = rejillaDe(g, .8);
    if (!m.ady) m.ady = adyacencia(g, g.index.array);
    const semilla = verticeMasCercano(g, m.grid, .8, pLocal);
    if (semilla < 0) return;
    const marcado = marcarMagico(g, m.ady, semilla, pLocal, +$('#pincel-r').value * 2.5);
    aplicarMarcado(m, marcado, 'Mágico');
  } else if (h === 'protuberancia') {
    const antes = g;
    const g2 = quitarProtuberancia(g, pLocal, 4);
    if (!g2) { toast('Eliminar', 'No hay nada que quitar ahí.'); return; }
    if (m.colRealista) g2.setAttribute('color', m.colRealista);
    m.mesh.geometry = g2; m.geo = g2; invalidar(m);
    registrar({ hacer: () => { m.mesh.geometry = g2; m.geo = g2; invalidar(m); }, deshacer: () => { m.mesh.geometry = antes; m.geo = antes; invalidar(m); } });
    toast('Eliminar', 'Elemento quitado y zona rellenada.');
  } else if (h === 'margen') {
    m.margen = m.margen || [];
    m.margen.push(pLocal.clone());
    dibujarMargen(m);
  } else if (h && h.startsWith('pieza-')) {
    S.piezaPts = S.piezaPts || [];
    S.piezaPts.push({ p: pLocal.clone(), n: hit.normal ? hit.normal.clone() : new THREE.Vector3(0, 1, 0), m });
    const necesarios = h === 'pieza-barra' ? 2 : 1;
    if (S.piezaPts.length >= necesarios) { ponerPieza(h, m, S.piezaPts); S.piezaPts = []; }
    else hint('Marca el otro extremo de la barra');
  }
}

function ponerPieza(h, m, pts) {
  let geo;
  if (h === 'pieza-barra') {
    const [a, b] = [pts[0].p, pts[1].p];
    const dir = b.clone().sub(a), largo = dir.length();
    geo = new THREE.CylinderGeometry(1.1, 1.1, largo, 12);
    geo.translate(0, largo / 2, 0);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
    geo.translate(a.x, a.y, a.z);
  } else if (h === 'pieza-turbo') {
    geo = new THREE.BoxGeometry(4.5, 4.5, 3);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), pts[0].n.clone().normalize()));
    geo.translate(pts[0].p.x, pts[0].p.y, pts[0].p.z);
  } else if (h === 'pieza-espolon') {
    geo = new THREE.ConeGeometry(1.1, 4, 10);
    geo.translate(0, 2, 0);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), pts[0].n.clone().normalize()));
    geo.translate(pts[0].p.x, pts[0].p.y, pts[0].p.z);
  } else { // póntico: casete redondeado apoyado en el hueco
    geo = new THREE.SphereGeometry(4, 18, 12);
    geo.scale(1, .8, .75);
    geo.translate(pts[0].p.x, pts[0].p.y, pts[0].p.z);
  }
  const color = h === 'pieza-barra' ? '#9fb4c8' : h === 'pieza-espolon' ? '#e2a2a2' : '#e8e0cd';
  const pieza = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color, roughness: .5, metalness: h === 'pieza-barra' ? .6 : 0 }));
  pieza.userData.noPick = true;
  m.mesh.add(pieza);
  (m.piezas = m.piezas || []).push(pieza);
  registrar({ hacer: () => m.mesh.add(pieza), deshacer: () => m.mesh.remove(pieza) });
  toast('Piezas', 'Pieza añadida al modelo.');
}

/* ---------- margen gingival ---------- */
function dibujarMargen(m) {
  if (m.margenLinea) { m.mesh.remove(m.margenLinea); m.margenLinea = null; }
  if (!m.margen || m.margen.length < 2) return;
  const geo = new THREE.BufferGeometry().setFromPoints(m.margen);
  m.margenLinea = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#e0395e' }));
  m.margenLinea.userData.noPick = true;
  m.mesh.add(m.margenLinea);
}

/* ---------- limpiar / rellenar / revertir ---------- */
$('#edit-rellenar').onclick = () => {
  const m = modeloEdit(); if (!m) return;
  resguardar(m);
  const antes = m.mesh.geometry;
  const { geometria, rellenados } = rellenarAgujeros(antes);
  if (!rellenados) { toast('Rellenar agujeros', 'No hay agujeros que rellenar.'); return; }
  if (m.colRealista) geometria.setAttribute('color', m.colRealista);
  m.mesh.geometry = geometria; m.geo = geometria; invalidar(m);
  registrar({ hacer: () => { m.mesh.geometry = geometria; m.geo = geometria; invalidar(m); }, deshacer: () => { m.mesh.geometry = antes; m.geo = antes; invalidar(m); } });
  toast('Rellenar agujeros', `Se han rellenado ${rellenados} agujeros.`);
};
$('#edit-borde').onclick = () => {
  const m = modeloEdit(); if (!m) return;
  resguardar(m);
  const n = aplicarMarcado(m, marcarCercaDeBorde(m.geo, 3), 'Limpiar borde');
  if (n) toast('Limpiar borde', `Se han quitado ${n} triángulos del contorno.`);
};
$('#edit-paladar').onclick = () => {
  const m = modeloEdit(); if (!m) return;
  if (m.arco !== 'sup') { toast('Limpiar paladar', 'El paladar solo existe en el modelo superior.', 'aviso'); return; }
  resguardar(m);
  const marcado = marcarPaladar(m.geo, m.arco);
  if (!marcado) { toast('Limpiar paladar', 'No se pudo localizar la margen.'); return; }
  const n = aplicarMarcado(m, marcado, 'Limpiar paladar');
  if (n) toast('Limpiar paladar', `Se han quitado ${n} triángulos.`);
};

function restaurar(solo) {
  let hechos = 0;
  for (const m of S.modelos) {
    if (solo && m.id !== solo) continue;
    if (!m.geoRespaldo) continue;
    const antes = m.mesh.geometry, nueva = m.geoRespaldo.clone();
    if (m.colRealista) nueva.setAttribute('color', m.colRealista);
    m.mesh.geometry = nueva; m.geo = nueva; invalidar(m);
    registrar({
      hacer: () => { m.mesh.geometry = nueva; m.geo = nueva; invalidar(m); },
      deshacer: () => { m.mesh.geometry = antes; m.geo = antes; invalidar(m); },
    });
    m.geoRespaldo = null;
    hechos++;
  }
  toast('Revertir cambios', hechos ? 'Se han descartado los cambios.' : 'No hay cambios que revertir.');
}

/* ============ zocalado virtual ============ */
function crearZocalos() {
  const h = +$('#zocalo-h').value;
  let hechos = 0;
  for (const m of S.modelos) {
    quitarZocalo(m);
    const geo = crearZocalo(m.geo, m.arco, h);
    if (!geo) continue;
    const mat = new THREE.MeshPhysicalMaterial({ color: '#ddd5c2', roughness: .85, metalness: 0 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.noPick = true;
    mesh.castShadow = mesh.receiveShadow = true;
    m.mesh.add(mesh);
    m.zocalo = mesh;
    registrar({
      hacer: () => { if (!m.zocalo) { m.mesh.add(mesh); m.zocalo = mesh; } },
      deshacer: () => quitarZocalo(m),
    });
    hechos++;
  }
  toast('Zocalado virtual', hechos ? `Zócalos de ${h} mm creados.` : 'No se pudo crear el zócalo en estos modelos.');
}
function quitarZocalo(m) { if (m.zocalo) { m.mesh.remove(m.zocalo); m.zocalo = null; } }
function quitarZocalos() { for (const m of S.modelos) quitarZocalo(m); }

/* ============ cortes 2D ============ */
const corteEl = document.createElement('div');
corteEl.id = 'corte';
corteEl.hidden = true;
corteEl.innerHTML = `
  <div class="corte-barra">
    <select id="corte-eje">
      <option value="axial">Axial (corta de arriba abajo)</option>
      <option value="sagital">Sagital (corta de lado a lado)</option>
      <option value="coronal">Coronal (corta de delante a atrás)</option>
    </select>
    <input type="range" id="corte-pos" min="0" max="100" value="50">
    <button class="btn-ghost btn-mini" id="corte-dist">Distancia 2D</button>
    <button class="btn-ghost btn-mini" id="corte-borrar">Borrar medidas</button>
    <button class="ico-btn" id="corte-x" title="Quitar el corte">✕</button>
  </div>
  <canvas id="corte-canvas"></canvas>`;
visorEl.appendChild(corteEl);

$('#corte-eje').onchange = e => { S.corte.eje = e.target.value; S.corte.med2d = []; dibujarCorte(); };
$('#corte-pos').oninput = e => { S.corte.pos = e.target.value / 100; S.corte.med2d = []; dibujarCorte(); };
$('#corte-borrar').onclick = () => { S.corte.med2d = []; dibujarCorte(); };
$('#corte-x').onclick = () => toggleCorte();
let midiendo2d = false;
$('#corte-dist').onclick = e => { midiendo2d = !midiendo2d; e.currentTarget.classList.toggle('activo', midiendo2d); S.corte.pendiente2d = []; };

function toggleCorte() {
  S.corte.activo = !S.corte.activo;
  corteEl.hidden = !S.corte.activo;
  $('#b-cortes').classList.toggle('activo', S.corte.activo);
  if (S.corte.activo) dibujarCorte();
}

const EJES = {
  axial:    { n: new THREE.Vector3(0, 1, 0), uv: p => [p.x, p.z] },
  sagital:  { n: new THREE.Vector3(1, 0, 0), uv: p => [p.z, p.y] },
  coronal:  { n: new THREE.Vector3(0, 0, 1), uv: p => [p.x, p.y] },
};

function dibujarCorte() {
  const cv = $('#corte-canvas');
  const w = cv.clientWidth || (cv.width = corteEl.clientWidth - 8);
  const h = cv.height = 170; cv.width = w;
  const ctx = cv.getContext('2d');
  const { n, uv } = EJES[S.corte.eje];
  // caja global de los modelos visibles
  const caja = new THREE.Box3();
  for (const m of S.modelos) if (m.mesh.visible) caja.union(new THREE.Box3().setFromBufferAttribute(m.geo.attributes.position));
  if (caja.isEmpty()) return;
  const corte = caja.min.clone().lerp(caja.max, S.corte.pos);
  const origen = new THREE.Vector3(
    S.corte.eje === 'sagital' ? corte.x : caja.getCenter(new THREE.Vector3()).x,
    S.corte.eje === 'axial' ? corte.y : caja.getCenter(new THREE.Vector3()).y,
    S.corte.eje === 'coronal' ? corte.z : caja.getCenter(new THREE.Vector3()).z,
  );
  const segs = [];
  for (const m of S.modelos) if (m.mesh.visible) segs.push(...seccionMalla(m.geo, origen, n));
  S.corte.segs = segs;

  // encuadre en el lienzo con rejilla de 10 mm
  const box = new THREE.Box2();
  for (const [a, b] of segs) { box.expandByPoint(new THREE.Vector2(...uv(a))); box.expandByPoint(new THREE.Vector2(...uv(b))); }
  const tam = box.getSize(new THREE.Vector2());
  const esc = Math.min((w - 30) / Math.max(tam.x, 1e-3), (h - 30) / Math.max(tam.y, 1e-3));
  const cen = box.getCenter(new THREE.Vector2());
  const map = p => { const [u, v] = uv(p); return [(u - cen.x) * esc + w / 2, (v - cen.y) * esc + h / 2]; };
  S.corte.map = map; S.corte.esc = esc;

  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--viewer-bg') || '#fff';
  ctx.fillRect(0, 0, w, h);
  // rejilla de 10 mm
  ctx.strokeStyle = 'rgba(0,74,70,.13)'; ctx.lineWidth = 1;
  const paso = 10 * esc;
  for (let x = w / 2 - (cen.x * esc) % paso; x < w; x += paso) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = h / 2 - (cen.y * esc) % paso; y < h; y += paso) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  ctx.strokeStyle = '#004A46'; ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const [a, b] of segs) { const [x1, y1] = map(a); const [x2, y2] = map(b); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
  ctx.stroke();
  // medidas 2D
  ctx.strokeStyle = '#0EA5B7'; ctx.fillStyle = '#0EA5B7'; ctx.lineWidth = 1.6;
  for (const md of S.corte.med2d) {
    ctx.beginPath(); ctx.moveTo(md.p1[0], md.p1[1]); ctx.lineTo(md.p2[0], md.p2[1]); ctx.stroke();
    for (const p of [md.p1, md.p2]) { ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 7); ctx.fill(); }
    ctx.font = '600 11px Poppins, sans-serif';
    ctx.fillText(fmt(md.d) + ' mm', (md.p1[0] + md.p2[0]) / 2 + 6, (md.p1[1] + md.p2[1]) / 2 - 6);
  }
  if (S.corte.pendiente2d?.length) {
    const p = S.corte.pendiente2d[0];
    ctx.beginPath(); ctx.arc(p[0], p[1], 3, 0, 7); ctx.fill();
  }
  ctx.fillStyle = 'rgba(91,106,104,.9)'; ctx.font = '10px Poppins, sans-serif';
  ctx.fillText('rejilla: 10 mm', 8, h - 8);
}

$('#corte-canvas').addEventListener('pointerdown', e => {
  if (!midiendo2d) return;
  const r = e.currentTarget.getBoundingClientRect();
  const p = [e.clientX - r.left, e.clientY - r.top];
  S.corte.pendiente2d = S.corte.pendiente2d || [];
  S.corte.pendiente2d.push(p);
  if (S.corte.pendiente2d.length === 2) {
    const [p1, p2] = S.corte.pendiente2d;
    const d = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / S.corte.esc;
    S.corte.med2d.push({ p1, p2, d });
    S.corte.pendiente2d = [];
  }
  dibujarCorte();
});

/* ============ análisis dental (docks) ============ */
// grupo de marcadores: dentro de `grupo` para que el pick los encuentre
const gAnalisis = new THREE.Group();
visor.grupo.add(gAnalisis);
const matMol = new THREE.MeshBasicMaterial({ color: '#e0395e', depthTest: false });
const matCan = new THREE.MeshBasicMaterial({ color: '#0EA5B7', depthTest: false });
const matPto = new THREE.MeshBasicMaterial({ color: '#F59E0B', depthTest: false });
const geoPunto = new THREE.SphereGeometry(1.15, 14, 10);
const geoPuntoPeq = new THREE.SphereGeometry(.75, 12, 8);

function esferaEn(p, mat, peq) {
  const s = new THREE.Mesh(peq ? geoPuntoPeq : geoPunto, mat);
  s.position.copy(p);
  s.userData.noPick = true; // salvo marcadores de molares, que se reactivan
  return s;
}
function lineaDe(pts, color, discontinua) {
  const g = new THREE.BufferGeometry().setFromPoints(pts);
  const l = discontinua
    ? new THREE.Line(g, new THREE.LineDashedMaterial({ color, dashSize: 1.2, gapSize: .8 }))
    : new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
  if (discontinua) l.computeLineDistances();
  l.userData.noPick = true;
  return l;
}
function etiqueta3D(txt, p, alto = 2.6, color) {
  const sp = spriteTexto(txt, { alto, color });
  sp.position.copy(p);
  sp.userData.noPick = true;
  return sp;
}

// selector "sup/inf" con los modelos que hay
function llenarSelectArco(sel, arco) {
  sel.innerHTML = '';
  for (const m of S.modelos) {
    const o = document.createElement('option');
    o.value = m.id; o.textContent = m.nombre;
    if (m.arco === arco) o.selected = true;
    sel.appendChild(o);
  }
  if (!sel.value && S.modelos[0]) sel.value = S.modelos[0].id;
  return modeloDeId(+sel.value);
}

/* ---------- vista doble (superior | inferior) ---------- */
let dobleCapas = [];
function cerrarDoble() {
  for (const c of dobleCapas) { c.div.remove(); c.controls.dispose(); }
  dobleCapas = [];
  for (const c of multiCapas) { c.div.remove(); c.controls.dispose(); }
  multiCapas = [];
  if (visor.multi) visor.setMultivista(null);
}
// pick que entiende la vista doble: usa la cámara del panel clicado
function pickUniversal(cx, cy) {
  if (dobleCapas.length) {
    const rr = visorEl.getBoundingClientRect();
    const capa = dobleCapas.find(c => {
      const r = c.vista.rect;
      return cx >= rr.left + r.x && cx <= rr.left + r.x + r.w && cy >= rr.top + r.y && cy <= rr.top + r.y + r.h;
    });
    if (capa) {
      const r = capa.vista.rect;
      const nd = new THREE.Vector2(((cx - rr.left - r.x) / r.w) * 2 - 1, -((cy - rr.top - r.y) / r.h) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(nd, capa.vista.cam);
      const meshes = [];
      visor.grupo.traverse(o => { if (o.isMesh && o.visible && !o.userData.noPick) meshes.push(o); });
      const hit = ray.intersectObjects(meshes, false)[0];
      if (!hit) return null;
      const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : null;
      return { punto: hit.point, normal: n, objeto: hit.object };
    }
  }
  return visor.pick(cx, cy);
}
// puntos del análisis están en coordenadas locales del modelo -> mundo
const aMundo = (m, v) => v.clone().applyMatrix4(m.mesh.matrixWorld);

function vistaDoble(mSup, mInf) {
  cerrarDoble();
  const W = visorEl.clientWidth, H = visorEl.clientHeight;
  const vistas = [];
  [['Superior', mSup, [0, -1, .12], [0, 0, 1]], ['Inferior', mInf, [0, 1, .05], [0, 0, -1]]].forEach(([nom, m, dir, up], i) => {
    if (!m) return;
    const x = i * W / 2, w = W / 2;
    const div = document.createElement('div');
    div.style.cssText = `position:absolute;left:${x}px;top:0;width:${w}px;height:${H}px;z-index:6;cursor:grab`;
    const tag = document.createElement('div');
    tag.style.cssText = 'position:absolute;left:10px;top:8px;font-size:.72rem;font-weight:600;color:var(--muted);pointer-events:none;background:rgba(255,255,255,.7);padding:1px 8px;border-radius:8px';
    tag.textContent = nom + '  ' + m.nombre;
    div.appendChild(tag);
    visorEl.appendChild(div);
    const cam = new THREE.PerspectiveCamera(24, w / H, .1, 4000);
    const caja = new THREE.Box3().setFromObject(m.mesh);
    const cen = caja.getCenter(new THREE.Vector3());
    const rad = caja.getBoundingSphere(new THREE.Sphere()).radius;
    cam.position.copy(cen).add(new THREE.Vector3(...dir).normalize().multiplyScalar(rad / Math.sin(cam.fov * Math.PI / 360) * 1.02));
    cam.up.set(...up);
    const controls = new OrbitControls(cam, div);
    controls.target.copy(cen);
    controls.update();
    const vista = { cam, controls, rect: { x, y: 0, w, h: H } };
    vistas.push(vista);
    dobleCapas.push({ div, controls, vista });
  });
  if (vistas.length) visor.setMultivista(vistas);
}
function vistaOclusalDe(m) {
  cerrarDoble();
  const caja = new THREE.Box3().setFromObject(m.mesh);
  const cen = caja.getCenter(new THREE.Vector3());
  const rad = caja.getBoundingSphere(new THREE.Sphere()).radius;
  const sup = m.arco !== 'inf';
  visor.cam.up.set(0, 0, sup ? 1 : -1);
  visor.controls.target.copy(cen);
  visor.cam.position.copy(cen).add(new THREE.Vector3(0, sup ? -1 : 1, sup ? .12 : .05).normalize().multiplyScalar(rad / Math.sin(visor.cam.fov * Math.PI / 360) * 1.02));
  visor.controls.update();
}

/* ---------- rotación de molares ---------- */
const molaresEl = document.createElement('div');
molaresEl.id = 'editar';
molaresEl.hidden = true;
molaresEl.innerHTML = `
  <div class="editar-barra">
    <b>Rotación de molares</b>
    <label class="lbl">Superior <select id="mol-sup"></select></label>
    <label class="lbl">Inferior <select id="mol-inf"></select></label>
    <label class="lbl">Ver <select id="mol-ver"><option value="dos">Las dos</option><option value="sup">Superior</option><option value="inf">Inferior</option></select></label>
    <button class="btn-ghost btn-mini" id="mol-auto">Automático</button>
    <button class="btn-ghost btn-mini" id="mol-vista">Vista inicial</button>
    <span class="espacio"></span>
    <button class="ico-btn" id="mol-x" title="Cerrar">✕</button>
  </div>
  <div class="editar-grupos anal-lineas" id="mol-lineas"><span class="nota">Calculando…</span></div>
  <div class="editar-pie"><span class="nota">Arrastra un punto o haz clic en él y luego en su nuevo sitio; «Automático» los vuelve a proponer. Orientativo.</span></div>`;
visorEl.appendChild(molaresEl);

function analisisDe(m) {
  const r = analizarDientes(m);
  if (!r.ok) toast('Análisis', `No se han podido detectar los dientes en «${m.nombre}».`, 'aviso');
  return r;
}
function dienteN(res, numero, lado) { return res.dientes.find(d => d.numero === numero && d.lado === lado); }

const mol = { abierto: false, sup: null, inf: null, sel: null };
function abrirMolares() {
  mol.abierto = !mol.abierto;
  molaresEl.hidden = !mol.abierto;
  $('#b-molares').classList.toggle('activo', mol.abierto);
  if (!mol.abierto) { cerrarDoble(); gAnalisis.clear(); if (S.herramienta === 'molar-punto') setHerramienta(null); return; }
  mol.sup = llenarSelectArco($('#mol-sup'), 'sup');
  mol.inf = llenarSelectArco($('#mol-inf'), 'inf');
  ejecutarMolares();
  setHerramienta('molar-punto');
}
function ejecutarMolares() {
  redibujarMolares();
  vistaDoble(mol.sup, mol.inf);
}
function redibujarMolares() {
  gAnalisis.clear();
  const lineas = [];
  for (const [clave, m] of [['sup', mol.sup], ['inf', mol.inf]]) {
    if (!m) continue;
    const res = analisisDe(m);
    if (!res.ok) continue;
    for (const lado of ['d', 'i']) {
      const can = dienteN(res, 3, lado), molar = dienteN(res, 6, lado);
      if (!can || !molar) continue;
      const wC = aMundo(m, can.cuspide), wM = aMundo(m, molar.centro);
      const pC = esferaEn(wC, matCan, true), pM = esferaEn(wM, matMol);
      pC.userData.noPick = false; pM.userData.noPick = false;
      pC.userData.molarMarker = { m, lado, que: 'canino', d: can };
      pM.userData.molarMarker = { m, lado, que: 'molar', d: molar };
      // eje del molar: tangente del arco por el premolar anterior (5)
      const ant = dienteN(res, 5, lado) || can;
      const tan = new THREE.Vector2(molar.pico.x - ant.pico.x, molar.pico.y - ant.pico.y).normalize();
      molar.tan = tan;
      gAnalisis.add(pC, pM, lineaDe([wM, wC], '#0EA5B7', true));
      const eje = new THREE.Vector3(tan.x, 0, tan.y).multiplyScalar(5);
      gAnalisis.add(lineaDe([wM.clone().sub(eje), wM.clone().add(eje)], '#e0395e'));
      lineas.push(textoLineaMolar(m, res, lado, can, molar));
    }
  }
  $('#mol-lineas').innerHTML = lineas.length
    ? '<span class="etq">Líneas</span><span class="nota">Orientativo</span>' + lineas.join('')
    : '<span class="nota">Sin datos suficientes.</span>';
}
function textoLineaMolar(m, res, lado, can, molar) {
  const v = new THREE.Vector3().subVectors(can.cuspide, molar.centro);
  const dist = v.length();
  const sag = new THREE.Vector3(res.frente.x, 0, res.frente.y).normalize();
  const porDistal = v.dot(sag) > 0; // canino por delante del molar => el molar queda distal
  // ángulo entre el eje mesiodistal del molar y la recta al canino
  const eje = new THREE.Vector3(molar.tan.x, 0, molar.tan.y);
  const seg = v.clone().setY(0).normalize();
  let ang = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(eje.dot(seg), -1, 1)));
  const signo = Math.sign(eje.clone().cross(seg).y) || 1;
  if (ang > 90) { ang = 180 - ang; }
  const rotado = ang > 12 ? (signo * (lado === 'd' ? 1 : -1) > 0 ? 'mesiorrotado' : 'distorrotado') : 'alineado';
  return `<div class="lin-molar"><b style="color:#e0395e">${molar.fdi}</b> → <b style="color:#0EA5B7">${can.fdi}</b>: a ${fmt(dist)} mm de la cúspide del ${can.fdi}, por ${porDistal ? 'distal' : 'mesial'} · ${fmt(ang)}° · molar ${rotado}.</div>`;
}
// clic: selecciona un marcador o lo mueve al punto clicado
function clicMolares(hit) {
  const u = hit.objeto.userData.molarMarker;
  if (u) { mol.sel = u; hint(`Punto ${u.que} de ${u.d.fdi} seleccionado: clic en su nueva posición`); return true; }
  if (!mol.sel) return false;
  const m2 = modeloDe(hit.objeto);
  if (m2 !== mol.sel.m) return false;
  const d = mol.sel.d;
  const p = hit.punto.clone(); m2.mesh.worldToLocal(p);
  if (mol.sel.que === 'molar') d.centro.copy(p); else d.cuspide.copy(p);
  redibujarMolares();
  mol.sel = null;
  return true;
}
$('#mol-auto').onclick = () => { for (const m of [mol.sup, mol.inf]) if (m) m.dientes = null; ejecutarMolares(); };
$('#mol-vista').onclick = () => vistaDoble(mol.sup, mol.inf);
$('#mol-x').onclick = () => abrirMolares();
$('#mol-ver').onchange = e => {
  if (e.target.value === 'dos') vistaDoble(mol.sup, mol.inf);
  else vistaOclusalDe(e.target.value === 'sup' ? mol.sup : mol.inf);
};
$('#mol-sup').onchange = e => { mol.sup = modeloDeId(+e.target.value); ejecutarMolares(); };
$('#mol-inf').onchange = e => { mol.inf = modeloDeId(+e.target.value); ejecutarMolares(); };
$('#b-molares').onclick = () => abrirMolares();

/* ---------- carta de Bonwill–Hawley ---------- */
const bwEl = document.createElement('div');
bwEl.id = 'editar';
bwEl.hidden = true;
bwEl.innerHTML = `
  <div class="editar-barra">
    <b>Carta de Bonwill–Hawley</b>
    <label class="lbl">Modelo <select id="bw-sup"></select></label>
    <label class="lbl">Usar <select id="bw-usar"><option>Promedio</option><option>Derecho</option><option>Izquierdo</option></select></label>
    <button class="btn-ghost btn-mini" id="bw-auto">Automático</button>
    <button class="btn-ghost btn-mini" id="bw-svg">Descargar carta SVG 1:1</button>
    <span class="espacio"></span>
    <button class="ico-btn" id="bw-x" title="Cerrar">✕</button>
  </div>
  <div class="editar-grupos" id="bw-tabla"></div>
  <div class="editar-grupos" id="bw-capas"></div>
  <div class="editar-pie"><span class="nota">Puntos propuestos por el programa: revísalos antes de leer la carta. Orientativo.</span></div>`;
visorEl.appendChild(bwEl);

const bw = { abierto: false, m: null, res: null, capas: {} };
function abrirBonwill() {
  bw.abierto = !bw.abierto;
  bwEl.hidden = !bw.abierto;
  $('#b-bonwill').classList.toggle('activo', bw.abierto);
  if (!bw.abierto) { gAnalisis.clear(); cerrarDoble(); return; }
  bw.m = llenarSelectArco($('#bw-sup'), 'sup');
  ejecutarBonwill();
}
const BW_CAPAS = [['cons', 'Construcción'], ['arco', 'Forma del arco'], ['puntos', 'Puntos de la carta'], ['med', 'Mediciones'], ['fdi', 'Puntos FDI']];
function ejecutarBonwill() {
  gAnalisis.clear();
  bw.res = bw.m ? analisisDe(bw.m) : null;
  if (!bw.res || !bw.res.ok) { $('#bw-tabla').innerHTML = '<span class="nota">Sin datos.</span>'; return; }
  const res = bw.res;
  // grupos por capa
  bw.capas = {};
  for (const [k] of BW_CAPAS) { const g = new THREE.Group(); bw.capas[k] = g; gAnalisis.add(g); }
  const yOcl = (res.arco === 'inf'
    ? Math.max(...res.dientes.map(d => d.centro.y))
    : Math.min(...res.dientes.map(d => d.centro.y)));
  const y = yOcl + (res.arco === 'inf' ? 1.5 : -1.5);
  const P = v2 => aMundo(bw.m, new THREE.Vector3(v2.x, y, v2.y));
  const frente = res.frente, der = res.derecha;
  const A = res.A;
  // anchos usados por posición
  const usar = $('#bw-usar').value;
  const w = n => {
    const d = res.dientes.find(d => d.numero === n && d.lado === 'd');
    const i = res.dientes.find(d => d.numero === n && d.lado === 'i');
    const pd = d ? d.ancho : 0, pi = i ? i.ancho : 0;
    return usar === 'Derecho' ? pd : usar === 'Izquierdo' ? pi : (pd + pi) / 2;
  };
  const anchos = [w(1), w(2), w(3)];
  const r = anchos.reduce((a, b) => a + b, 0);
  // lado del triángulo: ancho intermolar si hay molares, si no 2.31·r
  const m6d = dienteN(res, 6, 'd'), m6i = dienteN(res, 6, 'i');
  const R = m6d && m6i ? m6d.pico.distanceTo(m6i.pico) * 1.05 : r * 2.31;
  // triángulo equilátero: base C-C' por delante de A, vértice B detrás
  const hTri = R * Math.sqrt(3) / 2;
  const C = new THREE.Vector2().copy(A).addScaledVector(der, R / 2);
  const C2 = new THREE.Vector2().copy(A).addScaledVector(der, -R / 2);
  const B = new THREE.Vector2().copy(A).addScaledVector(frente, -hTri);
  const gC = bw.capas.cons;
  gC.add(lineaDe([P(new THREE.Vector2().copy(A).addScaledVector(frente, 8)), P(new THREE.Vector2().copy(A).addScaledVector(frente, -hTri - 8))], '#b3543f', true));
  gC.add(lineaDe([P(C), P(B), P(C2), P(C)], '#6b7280'));
  gC.add(lineaDe([P(C), P(C2)], '#6b7280'));
  // arco de Hawley: spline por los picos
  if (res.dientes.length >= 4) {
    const ordenados = [...res.dientes].sort((a, b) => a.lado === b.lado ? a.numero - b.numero : a.lado === 'd' ? -1 : 1);
    const ptsArco = ordenados.map(d => P(d.pico));
    const curva = new THREE.CatmullRomCurve3(ptsArco);
    bw.capas.arco.add(new THREE.Mesh(new THREE.TubeGeometry(curva, 80, .22, 6), new THREE.MeshBasicMaterial({ color: '#c9a227' })));
    bw.capas.arco.children[0].userData.noPick = true;
    // círculo ideal del arco anterior con radio r
    const circ = [];
    for (let a = -60; a <= 60; a += 4) {
      const t = a * Math.PI / 180;
      circ.push(P(new THREE.Vector2().copy(B).addScaledVector(new THREE.Vector2(frente.x * Math.cos(t) - frente.y * Math.sin(t), frente.x * Math.sin(t) + frente.y * Math.cos(t)), r * 2.2)));
    }
    bw.capas.arco.add(lineaDe(circ, '#c9a227', true));
  }
  // puntos de la carta
  for (const [p, txt] of [[A, 'A'], [B, 'B'], [C, 'C'], [C2, "C'"]]) {
    bw.capas.puntos.add(esferaEn(P(p), matMol, true), etiqueta3D(txt, P(p).add(new THREE.Vector3(0, res.arco === 'inf' ? 2.5 : -2.5, 0)), 3, '#e0395e'));
  }
  // mediciones y FDI por diente
  for (const d of res.dientes) {
    if (d.numero <= 6) {
      const pc = P(d.pico);
      bw.capas.med.add(etiqueta3D(fmt(d.ancho), pc, 2.2, '#7c3aed'));
      bw.capas.fdi.add(etiqueta3D(String(d.fdi), pc.clone().add(new THREE.Vector3(0, res.arco === 'inf' ? 2 : -2, 0)), 2.4, '#004A46'));
    }
  }
  // tabla
  const filas = ['Central', 'Lateral', 'Canino'].map((nom, n) => {
    const d = res.dientes.find(d => d.numero === n + 1 && d.lado === 'd');
    const i = res.dientes.find(d => d.numero === n + 1 && d.lado === 'i');
    return `<tr><td>${n + 1} · ${nom}</td><td>${d ? `${d.fdi}: ${fmt(d.ancho)}` : '—'}</td><td>${i ? `${i.fdi}: ${fmt(i.ancho)}` : '—'}</td><td><b>${fmt(anchos[n])}</b></td></tr>`;
  }).join('');
  $('#bw-tabla').innerHTML = `<span class="etq">Anchos (mm)</span><table class="tabla-mini"><tr><th></th><th>Derecho</th><th>Izquierdo</th><th>Usado</th></tr>${filas}</table>
    <span class="etq"></span><span class="nota">r = 1 + 2 + 3&nbsp; → &nbsp;<b>${fmt(r)} mm</b> &nbsp;·&nbsp; R (lado del triángulo)&nbsp; → &nbsp;<b>${fmt(R)} mm</b></span>`;
  $('#bw-capas').innerHTML = '<span class="etq">Capas</span>' + BW_CAPAS.map(([k, nom]) =>
    `<label class="lbl cb-capa"><input type="checkbox" data-capa="${k}" checked> ${nom}</label>`).join('');
  $('#bw-capas').querySelectorAll('input').forEach(cb => cb.onchange = () => { bw.capas[cb.dataset.capa].visible = cb.checked; });
  vistaOclusalDe(bw.m);
}
$('#bw-auto').onclick = () => { if (bw.m) bw.m.dientes = null; ejecutarBonwill(); };
$('#bw-usar').onchange = () => ejecutarBonwill();
$('#bw-sup').onchange = e => { bw.m = modeloDeId(+e.target.value); ejecutarBonwill(); };
$('#bw-x').onclick = () => abrirBonwill();
$('#b-bonwill').onclick = () => abrirBonwill();

$('#bw-svg').onclick = () => {
  const res = bw.res;
  if (!res || !res.ok) return;
  // proyección XZ -> SVG en mm reales (unidades mm => impresión 1:1)
  const pts = res.linea;
  const caja = new THREE.Box2().setFromPoints(pts);
  caja.expandByScalar(12);
  const [W, H] = [caja.max.x - caja.min.x, caja.max.y - caja.min.y];
  const X = x => (x - caja.min.x).toFixed(2), Y = y => (y - caja.min.y).toFixed(2);
  let rej = '';
  for (let x = Math.ceil(caja.min.x / 10) * 10; x < caja.max.x; x += 10) rej += `<line x1="${X(x)}" y1="0" x2="${X(x)}" y2="${H}" class="r${x % 50 ? '' : 'g'}"/>`;
  for (let y = Math.ceil(caja.min.y / 10) * 10; y < caja.max.y; y += 10) rej += `<line x1="0" y1="${Y(y)}" x2="${W}" y2="${Y(y)}" class="r${y % 50 ? '' : 'g'}"/>`;
  const arco = res.linea.map((p, i) => `${i ? 'L' : 'M'}${X(p.x)},${Y(p.y)}`).join(' ');
  const marcas = res.dientes.filter(d => d.numero <= 6).map(d =>
    `<text x="${X(d.pico.x)}" y="${Y(d.pico.y)}" font-size="2.4" fill="#004A46" text-anchor="middle">${d.fdi} · ${fmt(d.ancho)}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
    <style>.r{stroke:#cfe0dd;stroke-width:.15}.rg{stroke:#9fb8b4;stroke-width:.3}</style>
    ${rej}<path d="${arco}" fill="none" stroke="#c9a227" stroke-width=".7"/>${marcas}</svg>`;
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `carta-${bw.m.nombre}.svg`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Carta Bonwill–Hawley', 'SVG descargado en mm reales: imprímelo a escala 1:1.');
};

/* ---------- análisis de modelos ---------- */
const anamEl = document.createElement('div');
anamEl.id = 'editar';
anamEl.hidden = true;
anamEl.innerHTML = `
  <div class="editar-barra">
    <b>Análisis de modelos</b>
    <label class="lbl">Superior <select id="anam-sup"></select></label>
    <label class="lbl">Inferior <select id="anam-inf"></select></label>
    <button class="btn-ghost btn-mini" id="anam-auto">Automático</button>
    <button class="btn-ghost btn-mini" id="anam-vista">Vista inicial</button>
    <span class="espacio"></span>
    <button class="ico-btn" id="anam-x" title="Cerrar">✕</button>
  </div>
  <div class="editar-grupos anam-tabs" id="anam-tabs">
    <button class="btn-ghost btn-mini sel" data-tab="bolton">Bolton</button>
    <button class="btn-ghost btn-mini" data-tab="anchos">Anchos de arcada</button>
    <button class="btn-ghost btn-mini" data-tab="resalte">Resalte y sobremordida</button>
    <button class="btn-ghost btn-mini" data-tab="relacion">Relación molar y canina</button>
  </div>
  <div class="editar-grupos" id="anam-cont"></div>
  <div class="editar-pie"><span class="nota">Anchos y relaciones estimados a partir de los puntos detectados. Orientativo.</span></div>`;
visorEl.appendChild(anamEl);

const anam = { abierto: false, sup: null, inf: null, tab: 'bolton' };
function abrirAnam() {
  anam.abierto = !anam.abierto;
  anamEl.hidden = !anam.abierto;
  $('#b-anamodelos').classList.toggle('activo', anam.abierto);
  if (!anam.abierto) { gAnalisis.clear(); cerrarDoble(); return; }
  anam.sup = llenarSelectArco($('#anam-sup'), 'sup');
  anam.inf = llenarSelectArco($('#anam-inf'), 'inf');
  ejecutarAnam();
}
function ejecutarAnam() {
  gAnalisis.clear();
  const resS = anam.sup && analisisDe(anam.sup);
  const resI = anam.inf && analisisDe(anam.inf);
  // puntos de contacto + etiquetas FDI sobre cada arcada
  for (const [res, m] of [[resS, anam.sup], [resI, anam.inf]]) {
    if (!res || !res.ok) continue;
    for (const d of res.dientes) {
      if (d.numero > 6) continue;
      const dy = res.arco === 'inf' ? 1.6 : -1.6;
      const wC = aMundo(m, d.cuspide);
      gAnalisis.add(esferaEn(wC, matCan, true));
      gAnalisis.add(etiqueta3D(String(d.fdi), wC.clone().add(new THREE.Vector3(0, dy, 0)), 2.2));
      for (const c2 of d.contactos) if (c2) gAnalisis.add(esferaEn(aMundo(m, new THREE.Vector3(c2.x, d.cuspide.y, c2.y)), matCan, true));
    }
    gAnalisis.add(lineaDe(res.linea3.map(p => aMundo(m, p)), '#0EA5B7'));
  }
  pintarAnam(resS, resI);
  vistaDoble(anam.sup, anam.inf);
}
function pintarAnam(resS, resI) {
  const cont = $('#anam-cont');
  if (!resS?.ok || !resI?.ok) { cont.innerHTML = '<span class="nota">Faltan datos en alguna arcada.</span>'; return; }
  if (anam.tab === 'bolton') {
    const b = bolton(resS, resI);
    const fila = (res, nom) => {
      const celdas = [...Array(6)].map((_, n) => ['d', 'i'].map(l => {
        const d = res.dientes.find(d => d.numero === n + 1 && d.lado === l);
        return `<td><small>${d ? d.fdi : '·'}</small><br>${d ? fmt(d.ancho) : '—'}</td>`;
      }).join('')).join('');
      return `<tr><th>${nom}</th>${celdas}</tr>`;
    };
    const sobre = (v, norma) => { const ex = v.s * norma / 100; const d = v.i - ex; return `${d > 0 ? 'Sobran' : 'Faltan'} <b>${fmt(Math.abs(d))} mm</b> en el ${d > 0 ? 'inferior' : 'superior'}`; };
    cont.innerHTML = `<table class="tabla-mini tabla-bolton">${fila(resS, 'Superior')}${fila(resI, 'Inferior')}</table>
      <table class="tabla-mini"><tr><th></th><th>Anterior (3–3)</th><th>Total (6–6)</th></tr>
      <tr><td>inferior / superior</td><td>${fmt(b.ant.i)} / ${fmt(b.ant.s)} mm</td><td>${fmt(b.tot.i)} / ${fmt(b.tot.s)} mm</td></tr>
      <tr><td>ratio</td><td><b>${fmt(b.ant.ratio)} %</b> (norma ${b.ant.norma} ± ${b.ant.tol} %)</td><td><b>${fmt(b.tot.ratio)} %</b> (norma ${b.tot.norma} ± ${b.tot.tol} %)</td></tr>
      <tr><td>exceso</td><td>${sobre(b.ant, b.ant.norma)}</td><td>${sobre(b.tot, b.tot.norma)}</td></tr></table>`;
  } else if (anam.tab === 'anchos') {
    const a = { s: anchosArcada(resS), i: anchosArcada(resI) };
    const f = v => v == null ? '—' : fmt(v) + ' mm';
    cont.innerHTML = `<table class="tabla-mini"><tr><th></th><th>Intercanino</th><th>Interpremolar</th><th>Intermolar</th><th>Perímetro (6–6)</th></tr>
      <tr><th>Superior</th><td>${f(a.s.canino)}</td><td>${f(a.s.premolar)}</td><td>${f(a.s.molar)}</td><td>${f(a.s.perimetro)}</td></tr>
      <tr><th>Inferior</th><td>${f(a.i.canino)}</td><td>${f(a.i.premolar)}</td><td>${f(a.i.molar)}</td><td>${f(a.i.perimetro)}</td></tr></table>`;
  } else if (anam.tab === 'resalte') {
    const r = resalte(resS, resI);
    cont.innerHTML = r ? `<table class="tabla-mini"><tr><th>Resalte (overjet)</th><th>Sobremordida (overbite)</th></tr>
      <tr><td><b>${fmt(r.resalte)} mm</b></td><td><b>${fmt(r.sobremordida)} mm</b></td></tr></table>
      <span class="nota">Resalte: distancia sagital 11–41. Sobremordida: cubrimiento vertical del borde incisal inferior.</span>`
      : '<span class="nota">No se han detectado los incisivos centrales.</span>';
  } else {
    const m = relacion(resS, resI, 6), c = relacion(resS, resI, 3);
    const cel = (o, nom) => `<table class="tabla-mini"><tr><th>${nom}</th><th>Derecho</th><th>Izquierdo</th></tr>
      <tr><td>desfase sagital</td><td>${o.d ? fmt(o.d.d) + ' mm' : '—'}</td><td>${o.i ? fmt(o.i.d) + ' mm' : '—'}</td></tr>
      <tr><td>clase (Angle)</td><td><b>${o.d?.clase || '—'}</b></td><td><b>${o.i?.clase || '—'}</b></td></tr></table>`;
    cont.innerHTML = cel(m, 'Relación molar (6)') + cel(c, 'Relación canina (3)');
  }
}
anamEl.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
  anam.tab = b.dataset.tab;
  anamEl.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('sel', x === b));
  pintarAnam(anam.sup?.dientes, anam.inf?.dientes);
});
$('#anam-auto').onclick = () => { for (const m of [anam.sup, anam.inf]) if (m) m.dientes = null; ejecutarAnam(); };
$('#anam-vista').onclick = () => vistaDoble(anam.sup, anam.inf);
$('#anam-x').onclick = () => abrirAnam();
$('#anam-sup').onchange = e => { anam.sup = modeloDeId(+e.target.value); ejecutarAnam(); };
$('#anam-inf').onchange = e => { anam.inf = modeloDeId(+e.target.value); ejecutarAnam(); };
$('#b-anamodelos').onclick = () => abrirAnam();

/* ============ superposición ============ */
const matA = new THREE.MeshBasicMaterial({ color: '#0EA5B7', depthTest: false });
const matB = new THREE.MeshBasicMaterial({ color: '#F59E0B', depthTest: false });
let gSuper = new THREE.Group();
visor.marcadores.add(gSuper);

function rellenarSelects() {
  for (const id of ['#sel-a', '#sel-b']) {
    const sel = $(id); sel.innerHTML = '';
    for (const m of S.modelos) {
      const o = document.createElement('option');
      o.value = m.id; o.textContent = m.nombre;
      sel.appendChild(o);
    }
  }
  if (S.modelos[0]) $('#sel-a').value = S.modelos[0].id;
  if (S.modelos[1]) $('#sel-b').value = S.modelos[1].id;
  S.super.a = +$('#sel-a').value; S.super.b = +$('#sel-b').value;
}
$('#sel-a') && ($('#sel-a').onchange = e => S.super.a = +e.target.value);
$('#sel-b') && ($('#sel-b').onchange = e => S.super.b = +e.target.value);

const nombreDe = id => (S.modelos.find(m => m.id === id) || {}).nombre || '—';
const modeloDeId = id => S.modelos.find(m => m.id === id);

function marcarPares() {
  if (!S.modelos.length || S.super.a === S.super.b) { toast('Superposición', 'Elige dos modelos distintos en A y B.', 'aviso'); return; }
  S.super.fase = 'marcando';
  S.super.pares = []; S.super.espera = 'a';
  gSuper.clear();
  setHerramienta('pares');
}

function cancelarPares() {
  S.super.fase = 'off'; S.super.pares = []; gSuper.clear();
  $('#b-alinear').disabled = true;
}

function alinear() {
  const pares = S.super.pares;
  const B = modeloDeId(S.super.b);
  if (pares.length < 3 || !B) return;
  const M = matrizAlineacion(pares.map(p => [p.a, p.b]));
  const antes = B.mesh.matrix.clone();
  B.mesh.applyMatrix4(M);
  const Minv = M.clone().invert();
  registrar({
    hacer: () => B.mesh.applyMatrix4(M.clone()),
    deshacer: () => B.mesh.applyMatrix4(Minv.clone()),
  });
  cancelarPares();
  setHerramienta(null);
  toast('Superposición', `«${B.nombre}» alineado con ${pares.length} puntos.`);
}

function restablecer() {
  const B = modeloDeId(S.super.b);
  if (!B) return;
  const antes = B.mesh.matrix.clone();
  B.mesh.position.set(0, 0, 0); B.mesh.quaternion.identity(); B.mesh.scale.set(1, 1, 1);
  const despues = B.mesh.matrix.clone();
  const aplicar = m4 => { B.mesh.matrix.copy(m4); B.mesh.matrix.decompose(B.mesh.position, B.mesh.quaternion, B.mesh.scale); };
  registrar({ hacer: () => aplicar(despues), deshacer: () => aplicar(antes) });
  toast('Superposición', 'Posición restablecida.');
}

/* ============ oclusión ============ */
async function toggleOclusion() {
  if (S.modelos.length < 2) { toast('Oclusión', 'Hacen falta dos modelos para ver los contactos.', 'aviso'); return; }
  S.oclusion = !S.oclusion;
  $('#b-oclusion').classList.toggle('activo', S.oclusion);
  cargando('Calculando los contactos…', .5);
  await new Promise(r => setTimeout(r, 30));
  if (S.oclusion) {
    const [a, b] = S.modelos;
    const da = distanciaOclusion(a.geo, b.geo);
    const db = distanciaOclusion(b.geo, a.geo);
    a.geo.setAttribute('color', coloresOclusion(a.geo, da, a.colRealista));
    b.geo.setAttribute('color', coloresOclusion(b.geo, db, b.colRealista));
    for (const m of [a, b]) { m.mesh.material.vertexColors = true; m.mesh.material.needsUpdate = true; }
    hint('Oclusión: rojo = contacto · naranja = cerca · azul = lejos');
  } else {
    hint('');
    for (const m of S.modelos) {
      if (m.realista && m.colRealista) { m.geo.setAttribute('color', m.colRealista); m.mesh.material.vertexColors = true; }
      else { m.mesh.material.vertexColors = false; }
      m.mesh.material.needsUpdate = true;
    }
  }
  cargando(null);
}

/* ============ multivista ============ */
let multiCapas = [];
function toggleMultivista() {
  if (multiCapas.length) {
    for (const c of multiCapas) { c.div.remove(); c.controls.dispose(); }
    multiCapas = [];
    visor.setMultivista(null);
    return false;
  }
  const defs = [
    ['Frontal', 'frontal'], ['Derecha', 'derecha'], ['Oclusal', 'oclusal'],
    ['Posterior', 'posterior'], ['Izquierda', 'izquierda'], ['Superior', 'superior'],
  ];
  const vistas = [];
  const W = visorEl.clientWidth, H = visorEl.clientHeight;
  const cols = 3, rows = 2;
  defs.forEach(([nom, key], i) => {
    const div = document.createElement('div');
    div.style.cssText = `position:absolute;border:1px solid var(--border);border-radius:10px;z-index:6;cursor:grab`;
    const x = (i % cols) * W / cols, y = Math.floor(i / cols) * H / rows;
    const w = W / cols, h = H / rows;
    div.style.left = x + 'px'; div.style.top = y + 'px';
    div.style.width = w + 'px'; div.style.height = h + 'px';
    const tag = document.createElement('div');
    tag.style.cssText = 'position:absolute;left:8px;top:6px;font-size:.72rem;font-weight:600;color:var(--muted);pointer-events:none';
    tag.textContent = nom;
    div.appendChild(tag);
    visorEl.appendChild(div);
    const cam = new THREE.PerspectiveCamera(24, w / h, .1, 4000);
    const dist = visor.radio * 3.2;
    const v = { frontal: [0, 0, 1], derecha: [-1, 0, 0], oclusal: [0, -1, .12], posterior: [0, 0, -1], izquierda: [1, 0, 0], superior: [0, 1, .05] }[key];
    cam.position.copy(visor.centro).add(new THREE.Vector3(...v).normalize().multiplyScalar(dist));
    if (key === 'oclusal' || key === 'superior') cam.up.set(0, 0, key === 'oclusal' ? 1 : -1);
    const controls = new OrbitControls(cam, div);
    controls.target.copy(visor.centro);
    controls.update();
    const vista = { cam, controls, rect: { x, y, w, h } };
    vistas.push(vista);
    multiCapas.push({ div, controls, vista });
  });
  visor.setMultivista(vistas);
  // recolocar rectángulos al redimensionar
  const ro = new ResizeObserver(() => {
    const W2 = visorEl.clientWidth, H2 = visorEl.clientHeight;
    multiCapas.forEach((c, i) => {
      const x = (i % cols) * W2 / cols, y = Math.floor(i / cols) * H2 / rows;
      const w = W2 / cols, h = H2 / rows;
      Object.assign(c.div.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
      c.vista.rect = { x, y, w, h };
      c.vista.cam.aspect = w / h; c.vista.cam.updateProjectionMatrix();
    });
  });
  ro.observe(visorEl);
  multiCapas.ro = ro;
  return true;
}

/* ============ undo / redo ============ */
function registrar(op) { S.deshacer.push(op); S.rehacer.length = 0; }
function deshacer() { const op = S.deshacer.pop(); if (!op) return; op.deshacer(); S.rehacer.push(op); }
function rehacer() { const op = S.rehacer.pop(); if (!op) return; op.hacer(); S.deshacer.push(op); }
$('#b-deshacer').onclick = deshacer;
$('#b-rehacer').onclick = rehacer;
addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'z') { e.preventDefault(); e.shiftKey ? rehacer() : deshacer(); }
  if (e.ctrlKey && e.key === 'y') { e.preventDefault(); rehacer(); }
});

/* ============ caso: guardar / abrir / nuevo ============ */
$('#b-guardar').onclick = () => {
  const blob = guardarCaso(S.modelos, S.medidas);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'caso.tresdmodels'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Caso guardado', 'caso.tresdmodels');
};

async function restaurarCaso(file) {
  const { manifest, mallas } = await abrirCaso(file);
  for (const mm of mallas) {
    const meta = manifest?.modelos?.find(x => x.archivo === mm.archivo);
    const { geometria } = procesar(mm.geometria);
    const m = await anadirModelo({ nombre: mm.nombre, geometria }, geometria);
    m.bytes = mm.bytes.buffer; m.nombreArchivo = mm.archivo;
    if (meta) {
      m.arco = meta.arco || m.arco;
      m.realista = meta.realista;
      if (meta.matriz) m.mesh.matrix.fromArray(meta.matriz).decompose(m.mesh.position, m.mesh.quaternion, m.mesh.scale);
      m.mesh.material.color.set(meta.color); m.color = meta.color;
      m.mesh.material.wireframe = meta.rejilla;
      m.mesh.material.opacity = meta.opacidad; m.mesh.material.transparent = meta.opacidad < 1;
      m.mesh.visible = meta.visible;
      if (!m.realista) { m.mesh.material.vertexColors = false; m.mesh.material.needsUpdate = true; }
    }
  }
  if (manifest?.medidas) for (const md of manifest.medidas) {
    const puntos = md.puntos.map(p => new THREE.Vector3(...p));
    const valor = md.tipo === 'distancia' ? puntos[0].distanceTo(puntos[1])
      : md.tipo === 'angulo' ? THREE.MathUtils.radToDeg(puntos[0].clone().sub(puntos[1]).angleTo(puntos[2].clone().sub(puntos[1])))
      : puntos.slice(1).reduce((s, p, i) => s + p.distanceTo(puntos[i]), 0);
    const nombre = { distancia: 'Distancia', angulo: 'Ángulo', superficie: 'Superficie' }[md.tipo] || 'Medida';
    anadirMedida({ id: idSeq++, tipo: md.tipo, puntos, valor, nombre });
  }
  renderModelos();
}

function nuevoCaso(silencioso = false) {
  if (!silencioso && S.modelos.length && !confirm('¿Cerrar el caso y empezar otro? Se perderán los cambios no guardados.')) return;
  for (const m of S.modelos) visor.removeModelo(m);
  for (const md of [...S.medidas]) quitarMedida(md);
  S.modelos = []; S.deshacer = []; S.rehacer = [];
  setHerramienta(null);
  renderModelos(); renderMedidas();
  mostrarUI(false);
  $('#portada').hidden = false;
}
$('#b-nuevo').onclick = () => nuevoCaso();

/* ============ botones topbar / portada ============ */
$('#b-add').onclick = $('#b-add2').onclick = () => inputFiles.click();
$('#b-carpeta').onclick = $('#b-carpeta2').onclick = () => inputDir.click();
$('#b-caso2').onclick = () => inputCaso.click();
$('#b-abrir').onclick = () => inputCaso.click();
$('#b-imagen').onclick = () => {
  const a = document.createElement('a');
  a.href = visor.snapshot();
  a.download = 'modelos.png'; a.click();
  toast('Imagen guardada', 'modelos.png');
};
let fsCiclo = 1;
$('#b-letra').onclick = () => {
  fsCiclo = fsCiclo === 1 ? 1.15 : fsCiclo === 1.15 ? 1.3 : 1;
  document.documentElement.style.setProperty('--fs', fsCiclo);
};
$('#b-tema').onclick = () => {
  S.tema = S.tema === 'light' ? 'dark' : 'light';
  document.documentElement.dataset.theme = S.tema;
  visor.setTema(S.tema === 'dark');
};

/* paneles plegables */
document.querySelectorAll('.tab').forEach(t => {
  t.onclick = () => {
    const p = t.closest('.panel');
    p.classList.toggle('plegado');
    if (!p.classList.contains('plegado')) return;
    const abrir = document.createElement('button');
    abrir.className = 'tab';
    abrir.style.cssText = `position:absolute;top:100px;${t.dataset.pl === 'izq' ? 'left:4px' : 'right:4px'};z-index:10`;
    abrir.textContent = t.dataset.pl === 'izq' ? '⟩' : '⟨';
    abrir.onclick = () => { p.classList.remove('plegado'); abrir.remove(); };
    document.querySelector('.cuerpo').appendChild(abrir);
  };
});

/* ============ arrastrar y soltar ============ */
let dragN = 0;
addEventListener('dragenter', e => { e.preventDefault(); if (++dragN === 1) visorEl.classList.add('soltar'); });
addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; visorEl.classList.remove('soltar'); } });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => {
  e.preventDefault(); dragN = 0; visorEl.classList.remove('soltar');
  if (e.dataTransfer?.files?.length) loadFiles([...e.dataTransfer.files]);
});

/* API pública (como window.tresd en la original): útil para pruebas y scripts */
window.tresd = { loadFiles, visor, estado: S };

/* ============ asistente ============ */
let asis = null;
function sugerir() {
  asis?.remove();
  if (S.modelos.filter(m => m.arco === 'sup').length && S.modelos.filter(m => m.arco === 'inf').length) {
    asis = document.createElement('div');
    asis.className = 'asistente';
    asis.innerHTML = `
      <button class="cerrar" title="Cerrar">✕</button>
      <p>Superior e inferior abiertos. ¿Qué quieres hacer ahora?</p>
      <button class="opcion" data-a="oclusal">▸ Vista oclusal</button>
      <button class="opcion sec" data-a="medir">▸ Medir distancia</button>`;
    document.body.appendChild(asis);
    asis.querySelector('.cerrar').onclick = () => asis.remove();
    asis.querySelector('[data-a=oclusal]').onclick = () => { visor.setVista('oclusal'); asis.remove(); };
    asis.querySelector('[data-a=medir]').onclick = () => { $('#seg-medir').click(); setHerramienta('distancia'); asis.remove(); };
    setTimeout(() => asis?.remove(), 20000);
  }
}
