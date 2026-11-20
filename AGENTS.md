# tresD Models — clon

Clon educativo, con implementación propia, de https://tresdmodels.com/app/ (visor de
modelos de ortodoncia en el navegador). App estática: vanilla JS + three.js r169 +
fflate, resueltos por import map. Sin build ni dependencias npm.

## Ejecutar

Necesita un servidor estático (los módulos ES no funcionan con file://):

```
python -m http.server 8799
# abrir http://localhost:8799/
```

Los STL de prueba (`test UpperJawScan.stl`, `testLowerJawScan.stl`) se cargan
arrastrándolos al visor o con «Añadir escáner». Todo se procesa en local.

## Estructura

- `index.html` — shell + import map (`three`, `three/addons/`, `fflate`).
- `src/theme.css` — fuentes (Poppins woff2 locales) y variables de tema claro/oscuro.
- `src/app.css` — layout: topbar, viewbar, paneles, tarjetas, menús, toasts.
- `src/viewer.js` — escena three.js: cámaras persp/orto, presets de vista con tween,
  cuadrícula milimétrica (shader), estilos de iluminación, picking, multivista por scissor.
- `src/geomio.js` — parseo STL/PLY/OBJ/ZIP, soldado de vértices por proximidad
  (los STL de escáner son "sopa de triángulos": mergeVertices no basta), limpieza de
  componentes sueltos, color realista sintético (diente/encía por distancia al borde
  oclusal + rugosidad), mapa de contacto de oclusión, STL binario, casos
  `.tresdmodels` (ZIP con `caso.json` + mallas).
- `src/edicion.js` — operaciones de malla: sección por plano + encadenado en lazos,
  relleno de agujeros (earcut), pinceles borrador/suavizar, zócalo virtual
  (extrusión del lazo del corte) y alineación rígida por pares de puntos (Horn).
- `src/analisis.js` — detección de dientes para las herramientas de análisis:
  discrimina diente/encía por el color realista (canal verde), frente y extremos
  del arco por casco convexo (la arista del casco más alejada de la nube es la
  apertura posterior), contorno del arco por percentil radial + propuesta de
  dientes por reparto proporcional de anchos medios con ajuste al residual del
  contorno. También sprites de texto y medidas derivadas (Bolton, anchos,
  resalte, relación de Angle).
- `src/main.js` — estado, UI, medidas (distancia/ángulo/superficie), undo/redo,
  drag&drop, asistente, `window.tresd` (API pública para pruebas: `loadFiles`, `visor`, `estado`).

El panel «Herramientas» se organiza en cuatro grupos como la app original:
**Editar modelos**, **Análisis** (Distancia, Ángulo, Superficie, Cortes 2D,
Oclusión, Rotación de molares, Carta de Bonwill–Hawley, Análisis de modelos),
**Zocalado virtual** y **Superposición** (marcar ≥3 pares de puntos
alternando clic en el modelo A y en el B, luego «Alinear»).

Las tres herramientas avanzadas de análisis comparten la detección de
`analisis.js` y abren una barra inferior con selectores de modelo, «Automático»
y vista oclusal doble (dos cámaras por scissor, reutilizando la multivista):
- **Rotación de molares**: marcadores rosa (molar) y turquesa (canino) por lado,
  línea y lectura distancia/ángulo/mesio-distorrotado. Los puntos son
  propuestos y se corrigen haciendo clic en el marcador y luego en su nuevo
  sitio (el pick usa la cámara del panel en vista doble).
- **Carta de Bonwill–Hawley**: triángulo, arco de Hawley (spline por los picos),
  punto A/línea media, tabla de anchos 1-3 por lado, capas conmutables y
  descarga de la carta en SVG en mm reales (impresión 1:1).
- **Análisis de modelos**: pestañas Bolton (anchos por FDI, ratios
  anterior/total con norma y exceso), Anchos de arcada (intercanino,
  interpremolar, intermolar, perímetro), Resalte y sobremordida y Relación
  molar y canina (desfase sagital + clase de Angle). Los puntos son
  orientativos, como en la beta original.

«Editar modelos» abre una barra inferior con selector de modelo y «Revertir
cambios», replicando la original:
- Pinceles: Añadir (inflar por normal), Quitar/Goma (borrar caras), Suavizar
  (laplaciano local), Arrastrar (empujar superficie).
- Limpiar: Mágico (borra la región conexa por adyacencia hasta el radio del
  pincel ×2.5), Lazo (polígono en pantalla), Rellenar agujeros, Limpiar borde
  (banda de 3 mm junto al contorno), Limpiar paladar (triángulos dentro del
  lazo del corte a la altura de la margen, solo modelo superior).
- Eliminar brackets/ataches/retenedor: borra un disco de ~4 mm y rellena+alisa.
- Piezas: Póntico (casete), +Barra (cilindro entre 2 clics), +Bites turbo
  (bloque), +Espolones (cono) — mallas hijas del modelo, en `m.piezas`.
- Encía: Margen gingival (polilínea rosa por clics, en `m.margen`).

## Verificación

Con un navegador automatizado (puppeteer/playwright), los STL se cargan sin diálogo:

```js
const f = await (await fetch('/testLowerJawScan.stl')).blob();
await tresd.loadFiles([new File([f], 'LowerJawScan.stl')]);
```
