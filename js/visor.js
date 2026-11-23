// Visor 3D de la vivienda E3 · Joaquín Andrés Arquitectos
// Sitio estático (GitHub Pages). Modelos glTF (.glb, meshopt). Marco local del levantamiento: X = x, Y = z, Z = -y.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const $ = s => document.querySelector(s);
const cfg = await (await fetch('datos/modelo.json')).json();
const recData = await (await fetch(cfg.recintos)).json();
const fmt = (v, d = 2) => v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d });
const cota = z => (z > 0 ? '+' : z < 0 ? '−' : '±') + fmt(Math.abs(z));

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
scene.add(new THREE.HemisphereLight(0xffffff, 0xb8b2a6, 2.2));
const sol = new THREE.DirectionalLight(0xffffff, 0.8);
sol.position.set(-30, 50, 40); scene.add(sol);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true; orbit.maxPolarAngle = Math.PI * 0.495; orbit.screenSpacePanning = true;

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
  g.userData = { ...n, malla: new THREE.Group(), techo: new THREE.Group(), volumen: new THREE.Group(), rotulos: new THREE.Group() };
  g.add(g.userData.malla, g.userData.techo, g.userData.volumen, g.userData.rotulos);
  raiz.add(g); niveles[n.id] = g;
}

// ---------- carga ----------
// En el móvil se cargan los modelos con texturas reducidas (modelos/movil/): con las de escritorio se queda sin memoria.
const movil = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700;
if (movil) renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
const url = u => movil && !u.includes('volumenes') ? u.replace('modelos/', 'modelos/movil/') : u;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const barra = $('#carga .barra div');
function prepara(obj) {
  obj.traverse(o => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(m => { m.clippingPlanes = planos; m.side = THREE.DoubleSide; m.metalness = 0; m.roughness = 1; });
  });
}
async function carga(u, destino) {
  try { const g = await loader.loadAsync(url(u)); prepara(g.scene); destino.add(g.scene); return true; }
  catch (e) { console.warn('No se ha podido cargar', u, e); return false; }
}
// primero el exterior y la cubierta (se ve la casa enseguida); los interiores siguen cargando detrás
const primero = [...cfg.exterior.map(u => [u, gExterior]), ...niveles.cubierta.userData.muros.map(u => [u, niveles.cubierta.userData.malla])];
let hechos = 0;
await Promise.all(primero.map(async ([u, d]) => { await carga(u, d); barra.style.width = `${(++hechos / primero.length) * 100}%`; }));
const interiores = cfg.niveles.filter(n => n.id !== 'cubierta').flatMap(n => n.muros.map(u => [u, niveles[n.id].userData.malla]));
const aviso = document.createElement('div'); aviso.id = 'cargando'; document.body.appendChild(aviso);
(async () => {
  let k = 0;
  for (let i = 0; i < interiores.length; i += 3) {
    aviso.textContent = `Cargando interiores… ${Math.round(100 * k / interiores.length)} %`;
    await Promise.all(interiores.slice(i, i + 3).map(([u, d]) => carga(u, d))); k += 3;
  }
  aviso.remove();
})();
// los techos solo hacen falta en el paseo o si se piden: se cargan la primera vez
let techosPedidos = false;
function cargaTechos() {
  if (techosPedidos) return; techosPedidos = true;
  cfg.niveles.forEach(n => (n.techos || []).forEach(u => carga(u, niveles[n.id].userData.techo)));
}

// volúmenes del levantamiento: nodos "<nivel>__<fase>__<tipo>"
const colFase = { '1971': 0xc9a77c, '2000': 0x8fae86, '2004': 0x7f9fbf, 'sin': 0xd8d5cf };
const colTipo = { muro: 0xf6f4ef, losa: 0x9a9894, suelo: 0xe9e2d4, cubierta: 0xe3c3a8, canto: 0xc9a284, cubierta_inf: 0xd9d2c8, madera: 0xc8aa82, chimenea: 0xf2f2f2 };
const matsVol = [];
try {
  const v = await loader.loadAsync(cfg.volumenes);
  v.scene.traverse(o => {
    if (!o.isMesh) return;
    const [nivel, fase = 'sin', tipo = 'muro'] = (o.name || o.parent?.name || '').split('__');
    const m = new THREE.MeshStandardMaterial({ color: colTipo[tipo] ?? 0xf4f2ee, roughness: 0.95, metalness: 0,
      clippingPlanes: planos, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    m.userData = { fase, tipo }; matsVol.push(m); o.material = m;
    o.add(new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry, 30),
      new THREE.LineBasicMaterial({ color: 0x3a3a38, clippingPlanes: planos, transparent: true, opacity: 0.55 })));
    o.userData.nivel = nivel;
  });
  [...v.scene.children].forEach(nodo => {
    let nivel = nodo.name.split('__')[0];
    if (!niveles[nivel]) nodo.traverse(o => { if (o.userData.nivel) nivel = o.userData.nivel; });
    (niveles[nivel]?.userData.volumen ?? gExterior).add(nodo);
  });
} catch (e) { console.warn('Sin volúmenes', e); }
$('#carga').remove();

// ---------- rótulos de recintos ----------
for (const r of recData.recintos) {
  const g = niveles[r.nivel]; if (!g || r.x == null) continue;
  const el = document.createElement('div');
  el.className = 'rotulo'; el.innerHTML = `<b>${r.n}</b><span>${r.nombre}</span>`; el.title = r.nombre;
  el.addEventListener('pointerdown', ev => ev.stopPropagation());
  el.addEventListener('click', ev => { ev.stopPropagation(); ficha(r); });
  const o = new CSS2DObject(el);
  o.position.copy(P(r.x, r.y, r.z + 1.1));
  g.userData.rotulos.add(o);
}
const FASES = { '1971': 'a más tardar en julio de 1971 (núcleo de la vivienda)', '2000': 'antes de agosto de 2000 (porche)',
  '2004': 'entre agosto de 2000 y mayo de 2004 (bloque noreste)', 'sin': 'sin datar (sótanos)' };
function ficha(r) {
  const f = $('#ficha'); f.hidden = false;
  f.querySelector('.nombre').textContent = `${r.n} · ${r.nombre}`;
  f.querySelector('.datos').innerHTML =
    `<div>${niveles[r.nivel].userData.nombre} (plano ${r.plano}) · suelo a ${cota(r.z)}</div>` +
    `<div>Superficie útil: ${fmt(r.sup)} m²</div>` + (r.nota ? `<div>${r.nota[0].toUpperCase() + r.nota.slice(1)}</div>` : '') +
    `<div>Construcción: ${FASES[r.fase] ?? 'sin datar'}</div>`;
}
$('#ficha .cerrar').onclick = () => $('#ficha').hidden = true;

// ---------- encuadre ----------
const centro = P(19, 19, 1.5);
let estado = { visible: Object.fromEntries(cfg.niveles.map(n => [n.id, true])), explota: 0, vista: 'exterior' };
function encuadra(dir = new THREE.Vector3(-0.75, 0.62, 1)) {
  const expl = estado.explota > 0.5;
  const t = centro.clone(); if (expl) t.y += cfg.separacion_explotada * 1.5;
  const d = (expl ? 62 : 46) * Math.max(1, 0.9 / Math.min(1, camera.aspect));
  orbit.target.copy(t); camera.position.copy(t).add(dir.normalize().multiplyScalar(d)); orbit.update();
}
encuadra();

// ---------- controles del panel ----------
const contNiv = $('#niveles');
[...cfg.niveles].sort((a, b) => b.orden - a.orden).forEach(n => {
  const b = document.createElement('button'); b.className = 'activo';
  b.innerHTML = `${n.nombre}<span>${cota(n.cota)}</span>`; b.title = n.nota || '';
  b.onclick = () => {
    if (estado.vista === 'interior' || estado.vista === 'paseo') {
      // casa de muñecas: se ve la planta elegida y las de debajo
      for (const m of cfg.niveles) estado.visible[m.id] = m.id !== 'cubierta' && m.orden <= n.orden;
      if (n.id === 'cubierta') estado.visible.cubierta = true;
    } else estado.visible[n.id] = !estado.visible[n.id];
    aplica();
  };
  b.dataset.nivel = n.id; contNiv.appendChild(b);
});
const sCorte = $('#corte'), sExpl = $('#explota');
sCorte.oninput = () => {
  const z = +sCorte.value, sin = z >= +sCorte.max - 0.01;
  corte.constant = sin ? 1e3 : z;
  $('#corteValor').textContent = sin ? 'sin corte' : `a ${cota(z)} m`;
};
sExpl.oninput = () => { estado.explota = +sExpl.value; aplica(); };
['verFachadas', 'verMalla', 'verTechos', 'verVolumen', 'verRecintos', 'verFases'].forEach(id => $('#' + id).onchange = aplica);

function aplica() {
  const malla = $('#verMalla').checked, fases = $('#verFases').checked, vol = $('#verVolumen').checked || fases;
  const expl = estado.explota > 0.02;
  // en planta, solo se rotula la planta visible más alta (sin contar la cubierta)
  const superior = paseo.activo ? nivelDe(camera.position.y - ojo) :
    [...cfg.niveles].filter(m => m.id !== 'cubierta' && estado.visible[m.id]).sort((a, b) => b.orden - a.orden)[0]?.id;
  document.body.classList.toggle('compacto', expl);
  gExterior.visible = $('#verFachadas').checked && !expl && estado.visible.baja;
  for (const n of cfg.niveles) {
    const g = niveles[n.id], u = g.userData;
    g.visible = estado.visible[n.id];
    u.malla.visible = n.id === 'cubierta' ? malla || estado.vista === 'exterior' : malla;
    u.techo.visible = malla && $('#verTechos').checked;
    if (u.techo.visible) cargaTechos();
    u.volumen.visible = vol || (!malla && n.id !== 'cubierta');
    u.rotulos.visible = $('#verRecintos').checked && estado.vista !== 'exterior' && estado.visible[n.id] && n.id !== 'cubierta' &&
      (expl || n.id === superior);
    g.position.y = estado.explota * cfg.separacion_explotada * n.orden;
  }
  matsVol.forEach(m => m.color.set(fases && ['suelo', 'cubierta', 'losa'].includes(m.userData.tipo)
    ? colFase[m.userData.fase] ?? colFase.sin : fases && m.userData.tipo === 'muro' ? 0xfbfaf8 : colTipo[m.userData.tipo] ?? 0xf4f2ee));
  $('#leyenda').hidden = !fases;
  contNiv.querySelectorAll('button').forEach(b => b.classList.toggle('activo', estado.visible[b.dataset.nivel]));
}

function vista(v) {
  salPaseo();
  estado.vista = v;
  document.querySelectorAll('[data-vista]').forEach(b => b.classList.toggle('activo', b.dataset.vista === v));
  const todos = () => Object.keys(estado.visible).forEach(k => estado.visible[k] = true);
  if (v === 'exterior') { todos(); anima(0); $('#verFachadas').checked = true; $('#verTechos').checked = false; }
  if (v === 'interior') { todos(); estado.visible.cubierta = false; anima(0); $('#verTechos').checked = false;
    if (estado.explota > 0.5 || paseo.activo) encuadra(); }
  if (v === 'explotada') { todos(); $('#verTechos').checked = false; anima(1, () => encuadra()); }
  if (v === 'paseo') { todos(); estado.visible.cubierta = false; estado.explota = 0; sExpl.value = 0; $('#verTechos').checked = true;
    $('#verMalla').checked = true; entraPaseo(cfg.paseo_inicio); }
  aplica();
}
document.querySelectorAll('[data-vista]').forEach(b => b.onclick = () => vista(b.dataset.vista));

function anima(destino, fin) {
  const ini = estado.explota, t0 = performance.now();
  if (Math.abs(destino - ini) < 1e-3) { fin?.(); return; }
  (function paso(t) {
    const k = Math.min(1, (t - t0) / 900), e = k < .5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    estado.explota = ini + (destino - ini) * e; sExpl.value = estado.explota; aplica();
    if (k < 1) requestAnimationFrame(paso); else fin?.();
  })(t0);
}
$('#plegar').onclick = () => $('#panel').classList.toggle('plegado');
if (innerWidth < 640) $('#panel').classList.add('plegado');

// ---------- paseo en primera persona ----------
const ojo = 1.60, paseo = { activo: false, yaw: 0, pitch: 0, mov: new Set(), nivel: null };
function nivelDe(z) { return z < -1.0 ? 'sotanos' : z < 2.2 ? 'baja' : 'alta'; }
function entraPaseo(idNivel) {
  const p = niveles[idNivel].userData.ir;
  paseo.activo = true; orbit.enabled = false;
  camera.position.copy(P(p.x, p.y, p.z + ojo));
  const d = P(p.mira_x, p.mira_y, p.z + ojo).sub(camera.position);
  paseo.yaw = Math.atan2(-d.x, -d.z); paseo.pitch = 0; paseo.nivel = idNivel;
  $('#ayudaPaseo').hidden = false; aplica();
}
function salPaseo() {
  if (!paseo.activo) return;
  paseo.activo = false; orbit.enabled = true; $('#ayudaPaseo').hidden = true; encuadra();
}
document.querySelectorAll('[data-ir]').forEach(b => b.onclick = e => { e.stopPropagation(); entraPaseo(b.dataset.ir); });
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
// colisiones y suelo solo contra los escaneos visibles
const rayo = new THREE.Raycaster();
const objetivos = () => cfg.niveles.filter(n => n.id !== 'cubierta' && estado.visible[n.id]).map(n => niveles[n.id].userData.malla);
function sueloBajo(pies) {
  rayo.set(pies.clone().add(new THREE.Vector3(0, 0.55, 0)), new THREE.Vector3(0, -1, 0)); rayo.far = 2.0;
  const h = rayo.intersectObjects(objetivos(), true)[0];
  return h ? h.point.y : null;
}
function muevePaseo(dt) {
  camera.rotation.set(paseo.pitch, paseo.yaw, 0, 'YXZ');
  if (!paseo.mov.size) return;
  const f = new THREE.Vector3(-Math.sin(paseo.yaw), 0, -Math.cos(paseo.yaw)), l = new THREE.Vector3(-f.z, 0, f.x);
  const d = new THREE.Vector3();
  if (paseo.mov.has('adelante')) d.add(f); if (paseo.mov.has('atras')) d.sub(f);
  if (paseo.mov.has('izquierda')) d.sub(l); if (paseo.mov.has('derecha')) d.add(l);
  if (!d.lengthSq()) return;
  d.normalize().multiplyScalar(1.3 * dt);
  rayo.set(camera.position.clone().add(new THREE.Vector3(0, -0.75, 0)), d.clone().normalize()); rayo.far = 0.3;
  if (rayo.intersectObjects(objetivos(), true).length) return;
  const nueva = camera.position.clone().add(d);
  const s = sueloBajo(nueva.clone().sub(new THREE.Vector3(0, ojo, 0)));
  if (s != null) nueva.y = s + ojo;
  camera.position.copy(nueva);
  const nv = nivelDe(nueva.y - ojo); if (nv !== paseo.nivel) { paseo.nivel = nv; aplica(); }
}

// ---------- norte (símbolo del estudio, gira con la cámara) ----------
const norte = P(cfg.norte[0], cfg.norte[1]).normalize();
function giraNorte() {
  // dirección del norte en el espacio de la cámara: x a la derecha, y hacia arriba
  const v = norte.clone().applyQuaternion(camera.quaternion.clone().invert());
  const L = Math.hypot(v.x, v.y) || 1;
  const b = $('#norteBarra'); b.setAttribute('x2', (10 * v.x / L).toFixed(2)); b.setAttribute('y2', (-10 * v.y / L).toFixed(2));
}

// ---------- bucle ----------
const reloj = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(reloj.getDelta(), 0.05);
  if (paseo.activo) muevePaseo(dt); else orbit.update();
  giraNorte();
  renderer.render(scene, camera); etiq.render(scene, camera);
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); etiq.setSize(innerWidth, innerHeight);
});
aplica();
window.app = { vista, estado, aplica, camera, orbit, encuadra, niveles };
