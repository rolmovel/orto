// Visor 3D: escena, cámaras, presets de vista, cuadrícula milimétrica,
// estilos de iluminación, picking y multivista. Código propio sobre three.js r169.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// presets de cámara: dirección (desde el centro) y up
const VISTAS = {
  frontal:   { dir: V3(0, 0, 1),  up: V3(0, 1, 0),  nombre: 'Frontal' },
  derecha:   { dir: V3(-1, 0, 0), up: V3(0, 1, 0),  nombre: 'Derecha' },
  izquierda: { dir: V3(1, 0, 0),  up: V3(0, 1, 0),  nombre: 'Izquierda' },
  posterior: { dir: V3(0, 0, -1), up: V3(0, 1, 0),  nombre: 'Posterior' },
  oclusal:   { dir: V3(0, -1, .12), up: V3(0, 0, 1), nombre: 'Oclusal' },
  superior:  { dir: V3(0, 1, .05),  up: V3(0, 0, -1), nombre: 'Superior' },
  inferior:  { dir: V3(0, -1, .05), up: V3(0, 0, 1),  nombre: 'Inferior' },
};

export class Visor {
  constructor(zona) {
    this.zona = zona;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.inset = '0';
    zona.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#ffffff');

    this.camP = new THREE.PerspectiveCamera(24, 1, .1, 4000);
    this.camP.position.set(0, 0, 200);
    this.camO = new THREE.OrthographicCamera(-1, 1, 1, -1, -4000, 4000);
    this.camO.position.set(0, 0, 200);
    this.cam = this.camP;
    this.orto = false;

    this.controls = new OrbitControls(this.camP, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = .12;
    this.controls.autoRotateSpeed = 1.6;
    this.controls.addEventListener('end', () => this._ponCuadricula());

    this.grupo = new THREE.Group();          // modelos
    this.scene.add(this.grupo);
    this.marcadores = new THREE.Group();     // puntos y líneas de medida
    this.scene.add(this.marcadores);

    // cuadrícula milimétrica (papel detrás de los modelos, perpendicular a la vista)
    this.cuad = this._hacerCuadricula();
    this.cuad.visible = false;
    this.scene.add(this.cuad);

    this._luces();
    this.estilo = 'dramatico';
    this.aplicarEstilo('dramatico');

    this._tween = null;
    this._pickRay = new THREE.Raycaster();
    this.radio = 60;          // radio de la esfera que encuadra los modelos
    this.centro = new THREE.Vector3();

    // multivista: vistas fijas con su propia cámara y OrbitControls sobre una capa
    this.multi = false;
    this.vistasMulti = [];

    new ResizeObserver(() => this._resize()).observe(zona);
    this._resize();

    this.renderer.setAnimationLoop(() => this._render());
  }

  /* ---------------- luces y estilos ---------------- */
  _luces() {
    this.L = {};
    const L = this.L;
    L.hemi = new THREE.HemisphereLight(0xffffff, 0xcfd8d6, .9);
    L.key = new THREE.DirectionalLight(0xffffff, 1.6);
    L.key.position.set(60, 120, 140);
    L.key.castShadow = true;
    L.key.shadow.mapSize.set(2048, 2048);
    L.key.shadow.bias = -0.0002;
    L.fill = new THREE.DirectionalLight(0xdfeaf2, .5);
    L.fill.position.set(-120, 40, 60);
    L.rim = new THREE.DirectionalLight(0xc9e4ef, .9);
    L.rim.position.set(0, 60, -160);
    L.spot = new THREE.SpotLight(0xffffff, 8000, 0, .5, .45, 1.6);
    L.spot.position.set(90, 160, 110);
    L.spot.castShadow = true;
    L.spot.shadow.mapSize.set(2048, 2048);
    L.amb = new THREE.AmbientLight(0xffffff, .35);
    for (const k in L) this.scene.add(L[k]);
    this.scene.add(L.spot.target);
  }

  aplicarEstilo(nombre) {
    this.estilo = nombre;
    const L = this.L;
    const todo = v => { for (const k in L) L[k].visible = v; };
    todo(false);
    const mat = m => {
      this.grupo.traverse(o => {
        if (!o.isMesh || !o.material || !o.material.isMeshPhysicalMaterial) return;
        o.material.clearcoat = m.clearcoat; o.material.clearcoatRoughness = m.ccr;
        o.material.roughness = m.rough; o.material.metalness = 0;
        o.material.sheen = m.sheen || 0; o.material.sheenRoughness = .5;
        o.material.sheenColor = new THREE.Color(m.sheenColor || 0xffffff);
        o.material.needsUpdate = true;
      });
    };
    switch (nombre) {
      case 'estudio':
        L.hemi.visible = L.key.visible = L.fill.visible = true;
        L.hemi.intensity = 1.0; L.key.intensity = 1.15; L.fill.intensity = .55;
        mat({ clearcoat: .25, ccr: .5, rough: .55 });
        break;
      case 'intraoral':           // flash frontal duro, como la cámara intraoral
        L.key.visible = L.amb.visible = true;
        L.key.intensity = 2.6; L.amb.intensity = .5;
        mat({ clearcoat: .9, ccr: .18, rough: .28, sheen: .3 });
        break;
      case 'esmalte':             // translúcido: brillo especular fuerte
        L.hemi.visible = L.key.visible = L.rim.visible = true;
        L.hemi.intensity = .7; L.key.intensity = 1.9; L.rim.intensity = 1.3;
        mat({ clearcoat: 1, ccr: .08, rough: .18, sheen: .4, sheenColor: 0xbfd8ff });
        break;
      case 'catalogo':            // neutro y plano, de catálogo
        L.hemi.visible = L.amb.visible = true;
        L.hemi.intensity = 1.5; L.amb.intensity = .6;
        mat({ clearcoat: .05, ccr: .6, rough: .75 });
        break;
      default:                    // 'dramatico'
        L.spot.visible = L.rim.visible = L.amb.visible = true;
        L.spot.intensity = 8000; L.rim.intensity = 1.5; L.amb.intensity = .55;
        L.hemi.visible = true; L.hemi.intensity = .35;
        mat({ clearcoat: .55, ccr: .3, rough: .4, sheen: .15 });
    }
  }

  /* ---------------- cuadrícula ---------------- */
  _hacerCuadricula() {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color('#9fb8b4') }, uOp: { value: .55 }, uEscala: { value: 100 } },
      vertexShader: `varying vec2 vL; uniform float uEscala;
        void main(){ vL = position.xy * uEscala; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `
        varying vec2 vL; uniform vec3 uColor; uniform float uOp;
        void main(){
          // papel milimetrado: raya fina cada mm y gruesa cada cm
          vec2 p = vL;
          vec2 d1 = (.5 - abs(fract(p) - .5));        // distancia a la línea de mm
          vec2 d10 = (.5 - abs(fract(p / 10.) - .5)) * 10.;  // a la de cm, en mm
          float f1 = 1. - smoothstep(.0, .07, min(d1.x, d1.y));
          float f10 = 1. - smoothstep(.0, .12, min(d10.x, d10.y));
          float a = max(f1 * .45, f10);
          if (a < .02) discard;
          gl_FragColor = vec4(uColor, a * uOp);
        }`,
    });
    const g = new THREE.PlaneGeometry(1, 1);
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = -1;
    return m;
  }

  _ponCuadricula() {
    if (!this.cuad.visible || !this.radio) return;
    // detrás del conjunto, mirando a la cámara
    const fwd = new THREE.Vector3();
    this.cam.getWorldDirection(fwd);
    const d = this.radio * 1.15;
    this.cuad.position.copy(this.centro).addScaledVector(fwd, d);
    this.cuad.lookAt(this.centro);
    const s = Math.max(this.radio * 2.6, 40);
    this.cuad.scale.set(s, s, 1);
    this.cuad.material.uniforms.uEscala.value = s;
  }

  toggleCuadricula(v) {
    this.cuad.visible = v ?? !this.cuad.visible;
    if (this.cuad.visible) this._ponCuadricula();
    return this.cuad.visible;
  }

  /* ---------------- modelos ---------------- */
  materialModelo(color) {
    return new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(color),
      roughness: .4, metalness: 0, clearcoat: .55, clearcoatRoughness: .3,
      vertexColors: false, side: THREE.DoubleSide,
    });
  }

  addModelo(modelo) {
    this.grupo.add(modelo.mesh);
    modelo.mesh.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    this.encuadrar(false);
    this.aplicarEstilo(this.estilo);
  }

  removeModelo(modelo) { this.grupo.remove(modelo.mesh); this.encuadrar(false); }

  _caja() {
    const caja = new THREE.Box3();
    let hay = false;
    this.grupo.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      caja.union(new THREE.Box3().setFromObject(o)); hay = true;
    });
    return hay ? caja : null;
  }

  encuadrar(animado = true, vista = null) {
    const caja = this._caja();
    if (!caja) return;
    const esfera = caja.getBoundingSphere(new THREE.Sphere());
    this.radio = esfera.radius; this.centro.copy(esfera.center);
    const v = vista ? VISTAS[vista] : null;
    let dir = v ? v.dir.clone() : this.cam.position.clone().sub(this.controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);   // cámara aún en el origen
    dir.normalize();
    const dist = this.radio / Math.sin(THREE.MathUtils.degToRad(this.camP.fov / 2)) * 1.02;
    this._irA(esfera.center, esfera.center.clone().addScaledVector(dir, dist), v ? v.up : null, animado);
  }

  setVista(nombre) {
    const v = VISTAS[nombre]; if (!v) return;
    const caja = this._caja();
    if (caja) {
      const esfera = caja.getBoundingSphere(new THREE.Sphere());
      this.radio = esfera.radius; this.centro.copy(esfera.center);
      const dist = this.radio / Math.sin(THREE.MathUtils.degToRad(this.camP.fov / 2)) * 1.02;
      this._irA(esfera.center, esfera.center.clone().addScaledVector(v.dir.clone().normalize(), dist), v.up, true);
    }
  }

  _irA(target, pos, up, animado) {
    this.L.spot.target.position.copy(target);   // el foco mira al centro de los modelos
    this.L.spot.position.copy(target).add(new THREE.Vector3(90, 160, 110).normalize().multiplyScalar(this.radio * 4));
    if (!animado) {
      this.controls.target.copy(target);
      this.cam.position.copy(pos);
      if (up) this.cam.up.copy(up);
      this.camO.position.copy(pos); if (up) this.camO.up.copy(up);
      this.controls.update();
      this._syncOrto();
      this._ponCuadricula();
      return;
    }
    this._tween = {
      t: 0,
      p0: this.cam.position.clone(), p1: pos.clone(),
      t0: this.controls.target.clone(), t1: target.clone(),
      u0: this.cam.up.clone(), u1: up ? up.clone() : this.cam.up.clone(),
    };
  }

  toggleOrto(v) {
    this.orto = v ?? !this.orto;
    const vieja = this.cam;
    this.cam = this.orto ? this.camO : this.camP;
    this.cam.position.copy(vieja.position);
    this.cam.up.copy(vieja.up);
    this.controls.object = this.cam;
    this._syncOrto();
    this.controls.update();
    return this.orto;
  }

  _syncOrto() {
    if (!this.radio) return;
    const aspect = this.zona.clientWidth / Math.max(this.zona.clientHeight, 1);
    const r = this.radio * 1.12;
    this.camO.left = -r * aspect; this.camO.right = r * aspect;
    this.camO.top = r; this.camO.bottom = -r;
    this.camO.updateProjectionMatrix();
  }

  toggleRotacion(v) {
    this.controls.autoRotate = v ?? !this.controls.autoRotate;
    return this.controls.autoRotate;
  }

  setTema(dark) {
    const c = dark ? '#0B0F1A' : '#ffffff';
    this.scene.background = new THREE.Color(c);
    this.cuad.material.uniforms.uColor.value.set(dark ? '#5a6b85' : '#9fb8b4');
  }

  /* ---------------- picking / etiquetas ---------------- */
  pick(cx, cy) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const nd = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this._pickRay.setFromCamera(nd, this.cam);
    const meshes = [];
    this.grupo.traverse(o => { if (o.isMesh && o.visible && !o.userData.noPick) meshes.push(o); });
    const hit = this._pickRay.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : null;
    return { punto: hit.point, normal: n, objeto: hit.object };
  }

  proyectar(p3) {
    const v = p3.clone().project(this.cam);
    const r = this.renderer.domElement.getBoundingClientRect();
    return {
      x: (v.x + 1) / 2 * r.width,
      y: (-v.y + 1) / 2 * r.height,
      detras: v.z > 1,
    };
  }

  snapshot() {
    this._render();
    return this.renderer.domElement.toDataURL('image/png');
  }

  /* ---------------- multivista ---------------- */
  // vistas: [{nombre, cam, controls, rect}] — main.js crea los divs y llama a esto
  setMultivista(vistas) {
    this.multi = !!vistas;
    this.vistasMulti = vistas || [];
    this.renderer.setScissorTest(this.multi);
    this.controls.enabled = !this.multi;
    if (!this.multi) this._resize();
  }

  /* ---------------- bucle ---------------- */
  _resize() {
    const w = this.zona.clientWidth, h = this.zona.clientHeight;
    this.renderer.setSize(w, h);
    this.camP.aspect = w / Math.max(h, 1);
    this.camP.updateProjectionMatrix();
    this._syncOrto();
  }

  _render() {
    if (this._tween) {
      const t = this._tween;
      t.t = Math.min(t.t + .045, 1);
      const e = t.t < .5 ? 2 * t.t * t.t : 1 - Math.pow(-2 * t.t + 2, 2) / 2;
      this.cam.position.lerpVectors(t.p0, t.p1, e);
      this.camO.position.copy(this.cam.position);
      this.controls.target.lerpVectors(t.t0, t.t1, e);
      this.cam.up.lerpVectors(t.u0, t.u1, e).normalize();
      this.camO.up.copy(this.cam.up);
      if (t.t >= 1) { this._tween = null; this._ponCuadricula(); }
    }
    this.controls.update();

    if (!this.multi) {
      this.renderer.setViewport(0, 0, this.zona.clientWidth, this.zona.clientHeight);
      this.renderer.render(this.scene, this.cam);
    } else {
      const w = this.zona.clientWidth, h = this.zona.clientHeight;
      for (const v of this.vistasMulti) {
        v.controls.update();
        this.renderer.setViewport(v.rect.x, h - v.rect.y - v.rect.h, v.rect.w, v.rect.h);
        this.renderer.setScissor(v.rect.x, h - v.rect.y - v.rect.h, v.rect.w, v.rect.h);
        this.renderer.render(this.scene, v.cam);
      }
    }
  }
}
