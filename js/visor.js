// Visor 3D de la vivienda E3 · Joaquín Andrés Arquitectos
// Sitio estático (GitHub Pages). Modelos en glTF binario (.glb, Draco o meshopt).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const $ = s => document.querySelector(s);
const cfg = await (await fetch('datos/modelo.json')).json();
const recData = await (await fetch(cfg.recintos)).json();

// ---------- escena ----------
const cont = $('#visor');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.localClippingEnabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
cont.appendChild(renderer.domElement);

const etiq = new CSS2DRenderer();
etiq.setSize(innerWidth, innerHeight);
Object.assign(etiq.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none' });
cont.appendChild(etiq.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeceae6);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 2000);
scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b2a6, 1.6));
const sol = new THREE.DirectionalLight(0xffffff, 1.2);
sol.position.set(-30, 50, 40); scene.add(sol);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true; orbit.maxPolarAngle = Math.PI * 0.495;

// coordenadas del levantamiento → three.js
const P = (x, y, z = 0) => new THREE.Vector3(x, z, -y);

// plano de corte horizontal (conserva lo que queda por debajo)
const corte = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e3);
const planos = [corte];

// ---------- grupos ----------
const raiz = new THREE.Group(); scene.add(raiz);
const gExterior = new THREE.Group(); gExterior.name = 'exterior'; raiz.add(gExterior);
const niveles = {};
for (const n of cfg.niveles) {
  const g = new THREE.Group(); g.name = n.id;
  g.userData = { ...n, malla: new THREE.Group(), volumen: new THREE.Group(), rotulos: new THREE.Group() };
  g.add(g.userData.malla, g.userData.volumen, g.userData.rotulos);
  raiz.add(g); niveles[n.id] = g;
}

// ---------- carga ----------
const draco = new DRACOLoader().setDecoderPath('vendor/three/addons/libs/draco/gltf/');
const loader = new GLTFLoader().setDRACOLoader(draco).setMeshoptDecoder(MeshoptDecoder);
const barra = $('#carga .barra div');
const lista = [...cfg.exterior.map(u => [u, gExterior]),
  ...cfg.niveles.flatMap(n => n.modelos.map(u => [u, niveles[n.id].userData.malla]))];
let hechos = 0, cargados = 0;

function prepara(obj) {
  obj.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(m => { m.clippingPlanes = planos; m.side = THREE.DoubleSide; });
  });
}
async function carga(url, destino) {
  try {
    const g = await loader.loadAsync(url);
    prepara(g.scene); destino.add(g.scene); cargados++;
  } catch (e) { console.warn('No se ha podido cargar', url); }
  barra.style.width = `${(++hechos / (lista.length + 1)) * 100}%`;
}
await Promise.all(lista.map(([u, d]) => carga(u, d)));

// volúmenes del levantamiento: nodos con nombre "<nivel>__<fase>__..." en volumenes.glb
const colFase = { '1971': 0xc9b79c, '2000': 0xb4c3a8, '2004': 0x9fb3c8, 'sin': 0xd8d5cf };
const matVol = new Map();
function materialVol(fase) {
  if (!matVol.has(fase)) matVol.set(fase, new THREE.MeshStandardMaterial({
    color: 0xf4f2ee, roughness: 0.9, clippingPlanes: planos, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
  return matVol.get(fase);
}
try {
  const v = await loader.loadAsync(cfg.volumenes);
  [...v.scene.children].forEach(nodo => {
    const [nivel, fase = 'sin'] = nodo.name.split('__');
    const destino = niveles[nivel]?.userData.volumen ?? gExterior;
    nodo.traverse(o => { if (o.isMesh) { o.userData.fase = fase; o.material = materialVol(fase);
      const ar = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 25),
        new THREE.LineBasicMaterial({ color: 0x3a3a38, clippingPlanes: planos }));
      o.add(ar); } });
    destino.add(nodo);
  });
  cargados++;
} catch { /* sin volúmenes todavía */ }
barra.style.width = '100%';

const prueba = cargados === 0;
if (prueba) modeloDePrueba();
$('#carga').remove();

// ---------- rótulos de recintos ----------
const caja = new THREE.Box3().setFromObject(raiz);
for (const r of recData.recintos) {
  const g = niveles[r.nivel]; if (!g) continue;
  let x = r.x, y = r.y;
  if (x == null) continue; // pendiente de sacar del DXF
  const el = document.createElement('div');
  el.className = 'rotulo'; el.innerHTML = `<b>${r.n}</b>${r.nombre}`;
  el.addEventListener('click', ev => { ev.stopPropagation(); ficha(r); });
  const o = new CSS2DObject(el);
  o.position.copy(P(x, y, g.userData.cota + 1.2));
  g.userData.rotulos.add(o);
}
function ficha(r) {
  const f = $('#ficha'); f.hidden = false;
  f.querySelector('.nombre').textContent = `${r.n} · ${r.nombre}`;
  const nv = niveles[r.nivel].userData.nombre;
  f.querySelector('.datos').innerHTML =
    `<div>${nv}</div><div>Superficie útil: ${r.sup.toLocaleString('es-ES', { minimumFractionDigits: 2 })} m²</div>` +
    (r.fase ? `<div>Construcción: ${r.fase === '1971' ? 'a más tardar en julio de 1971' : r.fase === '2000' ? 'antes de agosto de 2000' : 'entre 2000 y 2004'}</div>` : '<div>Construcción: sin datar</div>');
}
$('#ficha .cerrar').onclick = () => $('#ficha').hidden = true;

// ---------- encuadre ----------
const centro = caja.getCenter(new THREE.Vector3());
const tam = caja.getSize(new THREE.Vector3()).length();
let estado;
function encuadra(dir = new THREE.Vector3(-0.8, 0.65, 1)) {
  const t = centro.clone(); if (estado?.explota > 0.5) t.y += cfg.separacion_explotada * 1.5;
  orbit.target.copy(t);
  camera.position.copy(t).add(dir.normalize().multiplyScalar(tam * (estado?.explota > 0.5 ? 1.6 : 1.15)));
  orbit.update();
}
encuadra();

// ---------- controles del panel ----------
estado = { visible: Object.fromEntries(cfg.niveles.map(n => [n.id, true])), explota: 0, vista: 'exterior' };
const contNiv = $('#niveles');
[...cfg.niveles].sort((a, b) => b.orden - a.orden).forEach(n => {
  const b = document.createElement('button'); b.className = 'activo';
  b.innerHTML = `${n.nombre}<span>${n.cota >= 0 ? '+' : ''}${n.cota.toFixed(2).replace('.', ',')}</span>`;
  b.onclick = () => { estado.visible[n.id] = !estado.visible[n.id]; b.classList.toggle('activo'); aplica(); };
  b.dataset.nivel = n.id; contNiv.appendChild(b);
});
function marcaNiveles() { contNiv.querySelectorAll('button').forEach(b => b.classList.toggle('activo', estado.visible[b.dataset.nivel])); }

const sCorte = $('#corte'), sExpl = $('#explota');
sCorte.oninput = () => {
  const z = +sCorte.value, sin = z >= +sCorte.max - 0.01;
  corte.constant = sin ? 1e3 : z;
  $('#corteValor').textContent = sin ? 'sin corte' : `a ${z >= 0 ? '+' : ''}${z.toFixed(2).replace('.', ',')} m`;
};
sExpl.oninput = () => { estado.explota = +sExpl.value; aplica(); };
['verMalla', 'verVolumen', 'verRecintos', 'verFases'].forEach(id => $('#' + id).onchange = aplica);

function aplica() {
  const malla = $('#verMalla').checked, vol = $('#verVolumen').checked || $('#verFases').checked;
  const fases = $('#verFases').checked;
  gExterior.visible = estado.vista === 'exterior' && malla;
  for (const n of cfg.niveles) {
    const g = niveles[n.id], u = g.userData;
    g.visible = estado.visible[n.id];
    u.malla.visible = malla && estado.vista !== 'exterior' || (prueba && malla);
    u.volumen.visible = vol || (estado.vista !== 'exterior' && !malla);
    u.rotulos.visible = $('#verRecintos').checked && estado.vista !== 'exterior';
    g.position.y = estado.explota * cfg.separacion_explotada * n.orden;
  }
  matVol.forEach((m, f) => m.color.set(fases ? colFase[f] ?? colFase.sin : 0xf4f2ee));
}

function vista(v) {
  salPaseo();
  estado.vista = v;
  document.querySelectorAll('[data-vista]').forEach(b => b.classList.toggle('activo', b.dataset.vista === v));
  if (v === 'exterior') { Object.keys(estado.visible).forEach(k => estado.visible[k] = true); sExpl.value = 0; estado.explota = 0; }
  if (v === 'interior') { estado.visible.cubierta = false; sExpl.value = 0; estado.explota = 0; }
  if (v === 'explotada') { Object.keys(estado.visible).forEach(k => estado.visible[k] = true); anima(1); setTimeout(() => encuadra(), 950); }
  if (v === 'paseo') { estado.visible.cubierta = false; sExpl.value = 0; estado.explota = 0; entraPaseo(); }
  marcaNiveles(); aplica();
}
document.querySelectorAll('[data-vista]').forEach(b => b.onclick = () => vista(b.dataset.vista));

function anima(destino) {
  const ini = estado.explota, t0 = performance.now();
  (function paso(t) {
    const k = Math.min(1, (t - t0) / 900), e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    estado.explota = ini + (destino - ini) * e; sExpl.value = estado.explota; aplica();
    if (k < 1) requestAnimationFrame(paso);
  })(t0);
}

$('#plegar').onclick = () => $('#panel').classList.toggle('plegado');
if (innerWidth < 640) $('#panel').classList.add('plegado');

// ---------- paseo en primera persona ----------
const ojo = 1.60, paseo = { activo: false, yaw: 0, pitch: 0, mov: new Set() };
function entraPaseo() {
  const p = cfg.paseo_inicio;
  paseo.activo = true; orbit.enabled = false;
  camera.position.copy(P(p.x, p.y, p.z + ojo));
  const d = P(p.mira_x, p.mira_y, p.z + ojo).sub(camera.position);
  paseo.yaw = Math.atan2(-d.x, -d.z); paseo.pitch = 0;
  $('#ayudaPaseo').hidden = false;
}
function salPaseo() {
  if (!paseo.activo) return;
  paseo.activo = false; orbit.enabled = true; $('#ayudaPaseo').hidden = true; encuadra();
}
let arr = null;
renderer.domElement.addEventListener('pointerdown', e => { if (paseo.activo) arr = [e.clientX, e.clientY]; });
addEventListener('pointerup', () => arr = null);
addEventListener('pointermove', e => {
  if (!paseo.activo || !arr) return;
  paseo.yaw -= (e.clientX - arr[0]) * 0.004; paseo.pitch -= (e.clientY - arr[1]) * 0.004;
  paseo.pitch = Math.max(-1.2, Math.min(1.2, paseo.pitch)); arr = [e.clientX, e.clientY];
});
const teclas = { ArrowUp: 'adelante', KeyW: 'adelante', ArrowDown: 'atras', KeyS: 'atras', ArrowLeft: 'izquierda', KeyA: 'izquierda', ArrowRight: 'derecha', KeyD: 'derecha' };
addEventListener('keydown', e => { if (e.key === 'Escape' && paseo.activo) vista('interior'); if (teclas[e.code]) paseo.mov.add(teclas[e.code]); });
addEventListener('keyup', e => teclas[e.code] && paseo.mov.delete(teclas[e.code]));
document.querySelectorAll('[data-mov]').forEach(b => {
  b.onpointerdown = e => { e.stopPropagation(); paseo.mov.add(b.dataset.mov); };
  b.onpointerup = b.onpointerleave = () => paseo.mov.delete(b.dataset.mov);
});
// el suelo bajo el visitante: rayo vertical contra los modelos del nivel visible
const rayo = new THREE.Raycaster();
function sueloBajo(pos) {
  rayo.set(pos.clone().add(new THREE.Vector3(0, 0.6, 0)), new THREE.Vector3(0, -1, 0));
  rayo.far = 2.6;
  const h = rayo.intersectObjects(raiz.children, true).find(i => i.object.isMesh && i.object.visible);
  return h ? h.point.y : null;
}
function muevePaseo(dt) {
  camera.rotation.set(paseo.pitch, paseo.yaw, 0, 'YXZ');
  if (!paseo.mov.size) return;
  const v = 1.4 * dt, f = new THREE.Vector3(-Math.sin(paseo.yaw), 0, -Math.cos(paseo.yaw)), l = new THREE.Vector3(-f.z, 0, f.x);
  const d = new THREE.Vector3();
  if (paseo.mov.has('adelante')) d.add(f); if (paseo.mov.has('atras')) d.sub(f);
  if (paseo.mov.has('izquierda')) d.sub(l); if (paseo.mov.has('derecha')) d.add(l);
  if (!d.lengthSq()) return;
  d.normalize().multiplyScalar(v);
  // choque simple con paredes
  rayo.set(camera.position.clone().add(new THREE.Vector3(0, -0.6, 0)), d.clone().normalize()); rayo.far = 0.35;
  if (rayo.intersectObjects(raiz.children, true).some(i => i.object.isMesh && i.object.visible)) return;
  const nueva = camera.position.clone().add(d);
  const s = sueloBajo(nueva.clone().sub(new THREE.Vector3(0, ojo, 0)));
  if (s != null) nueva.y = s + ojo;
  camera.position.copy(nueva);
}

// ---------- bucle ----------
const reloj = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(reloj.getDelta(), 0.05);
  if (paseo.activo) muevePaseo(dt); else orbit.update();
  renderer.render(scene, camera); etiq.render(scene, camera);
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); etiq.setSize(innerWidth, innerHeight);
});
aplica();

// ---------- modelo de prueba (mientras no estén los .glb) ----------
function modeloDePrueba() {
  const aviso = document.createElement('div');
  aviso.textContent = 'Modo de prueba: faltan los modelos del levantamiento';
  Object.assign(aviso.style, { position: 'fixed', top: '58px', left: '16px', fontSize: '11px', color: '#8a5a3b' });
  document.body.appendChild(aviso);
  const caja = (g, x0, y0, x1, y1, z0, z1, fase) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, z1 - z0, y1 - y0), materialVol(fase));
    m.position.copy(P((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2));
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0x3a3a38, clippingPlanes: planos })));
    g.add(m);
  };
  const v = id => niveles[id].userData.volumen;
  // cajas aproximadas, solo para probar los controles
  caja(v('sotanos'), 14.3, 13.9, 20.5, 24.8, -2.25, -0.31, 'sin');
  caja(v('sotanos'), 20.5, 23.3, 37.0, 30.0, -2.87, -0.47, 'sin');
  caja(v('baja'), 2.0, 13.4, 10.9, 15.3, 0, 2.6, '1971');
  caja(v('baja'), 10.3, 13.4, 20.6, 24.9, 0, 2.6, '1971');
  caja(v('baja'), 20.6, 13.2, 37.0, 23.3, 0, 2.9, '2004');
  caja(v('baja'), 20.6, 23.3, 37.0, 29.9, 0, 2.8, '2004');
  caja(v('alta'), 10.9, 14.0, 14.3, 24.9, 2.58, 3.3, '1971');
  caja(v('alta'), 20.6, 23.3, 37.0, 29.9, 3.53, 6.25, '2004');
  caja(v('cubierta'), 20.4, 23.0, 37.2, 30.2, 6.25, 6.95, '2004');
  caja(v('cubierta'), 10.3, 13.4, 20.6, 24.9, 2.6, 3.0, '1971');
  $('#verVolumen').checked = true;
}
