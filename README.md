# Vivienda E3 · Visor 3D

Visor web del estado actual de la vivienda principal (E3), hecho con el levantamiento con dron y escáner del 18/10/2026. Es un sitio estático: no necesita servidor ni base de datos y se publica tal cual en GitHub Pages.

Joaquín Andrés Arquitectos.

## Qué hace
- **Exterior**: la malla fotográfica del dron.
- **Interior**: quita la cubierta y muestra los escaneos de cada planta.
- **Explotada**: separa los niveles en vertical (sótanos, planta baja, planta alta y altillo, cubiertas).
- **Paseo**: recorrido en primera persona, con ratón y teclado o con los botones en el móvil.
- **Corte horizontal** a cualquier altura, **niveles** que se encienden y apagan, **nombres de las estancias** con su superficie útil y **fases** de construcción (1971 / 2000 / 2000-2004).

## Estructura
```
index.html            página
css/visor.css         estilos
js/visor.js           visor (three.js 0.170, en vendor/, sin CDN)
datos/modelo.json     niveles, cotas y archivos de cada nivel
datos/recintos.json   estancias: número, nombre, m² útiles, fase y punto del rótulo
modelos/*.glb         modelos 3D (ver abajo)
vendor/three/         three.js (licencia MIT, vendor/three/LICENSE)
```

## Modelos (`modelos/`)
| Archivo | Contenido |
|---|---|
| `exterior_1.glb`, `exterior_2.glb` | Malla del dron de E3 recortada a la vivienda y su entorno (en dos archivos por el límite de subida) |
| `cubierta.glb` | Solo los faldones y la azotea (malla del dron por encima de los techos) |
| `esc_<nivel>_muros_NN.glb` | Escaneos interiores registrados por zonas, sin techo (NN = zona del registro) |
| `esc_<nivel>_techo_NN.glb` | Techos de los mismos escaneos (se ven en el paseo) |
| `volumenes.glb` | Modelo de volúmenes de las plantas P1 a P3; cada nodo se llama `nivel__fase__nombre` |

Coordenadas locales del levantamiento: x, y de las plantas y z desde el suelo de planta baja (±0,00 = cota 60,46), con el eje Y del glTF hacia arriba.

Hay que aligerarlos para que vayan fluidos en el móvil (unos 20-40 MB en total):
```
npx @gltf-transform/cli simplify entrada.glb tmp.glb --ratio 0.15 --error 0.002
npx @gltf-transform/cli resize tmp.glb tmp2.glb --width 2048 --height 2048
npx @gltf-transform/cli webp tmp2.glb tmp3.glb
npx @gltf-transform/cli meshopt tmp3.glb salida.glb
```
GitHub no admite archivos de más de 100 MB.

Versión publicada también como artefacto de Claude (los .glb van como recursos del artefacto).

## Probar en local
```
python -m http.server 8000
```
y abrir http://localhost:8000 (abriendo el `index.html` directamente no carga, porque el navegador bloquea los módulos).

## Publicar en GitHub Pages
1. Crear el repositorio y subir el contenido de esta carpeta a la rama `main`.
2. Ir a Settings → Pages → Source: «Deploy from a branch», rama `main`, carpeta `/ (root)`.
3. La web queda en `https://<usuario>.github.io/<repositorio>/`.

**Privacidad:** con un repositorio público, cualquiera puede ver la web y descargar los modelos, que muestran el interior de la casa y lo que hay dentro. Hay tres opciones:
- un repositorio privado con GitHub Pages, que requiere un plan de pago y en el que la web sigue siendo accesible para quien tenga el enlace;
- un nombre de repositorio que no se pueda adivinar y no difundirlo;
- quitar de los escaneos las estancias que no deban verse.

La página lleva `noindex` para que los buscadores no la indexen.
