/**
 * Aurore — aurore boréale plein écran pour Three.js.
 * Un seul quad, un seul fragment shader, un seul draw call.
 *
 * Deux façons de l'utiliser :
 *
 *   1) Autonome (le module gère renderer, boucle et resize) :
 *        import { mountAurora } from './aurora.js';
 *        const aurora = mountAurora(THREE, { canvas: document.querySelector('#bg') });
 *        // aurora.uniforms.uIntensity.value = 0.8;  aurora.dispose() pour nettoyer
 *
 *   2) Dans votre propre scène (vous gardez votre renderer et votre boucle) :
 *        import { createAuroraMaterial } from './aurora.js';
 *        const mat = createAuroraMaterial(THREE);
 *        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
 *        // Rendez-le avec new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
 *        // Chaque frame : mat.uniforms.uTime.value = t;
 *        // Au resize :   mat.uniforms.uRes.value.set(w * dpr, h * dpr);
 *
 * Le paramètre THREE est passé explicitement pour ne pas imposer un chemin
 * d'import ; tout Three.js à partir de r100 environ convient, y compris les
 * versions récentes (ShaderMaterial n'est pas affecté par outputColorSpace).
 */

export const AURORA_VERTEX = /* glsl */ `
void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const AURORA_FRAGMENT = /* glsl */ `// Aurore — fragment shader plein écran (GLSL ES 1.0, compatible WebGL 1 et 2)
// Uniforms attendus :
//   uTime   (float)  secondes écoulées
//   uRes    (vec2)   taille du framebuffer en pixels (largeur, hauteur)
//   uMouse  (vec2)   position souris normalisée [-1, 1], lissée côté JS
//   uColorA (vec3)   couleur basse des rideaux   (défaut : vert  0.18, 0.96, 0.58)
//   uColorB (vec3)   couleur haute des rideaux   (défaut : violet 0.50, 0.28, 0.98)
//   uColorC (vec3)   pointe rosée tout en haut    (défaut : rose  0.95, 0.35, 0.55)
//   uIntensity (float) gain global des rideaux    (défaut : 0.62)
//   uSpeed  (float)  multiplicateur temporel      (défaut : 1.0)
//   uStars  (float)  densité d'étoiles 0..1       (défaut : 1.0)
//   uRidge  (float)  1.0 = crête de montagnes, 0.0 = ciel seul

precision highp float;

uniform float uTime;
uniform vec2  uRes;
uniform vec2  uMouse;
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform vec3  uColorC;
uniform float uIntensity;
uniform float uSpeed;
uniform float uStars;
uniform float uRidge;

// --- Simplex noise 3D (Ashima Arts / Stefan Gustavson, MIT) ---
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * snoise(p); p *= 2.03; a *= 0.5; } return s; }

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
  p.x += uMouse.x * 0.06;
  float t = uTime * uSpeed;

  // Ciel nocturne
  vec3 col = mix(vec3(0.012, 0.025, 0.07), vec3(0.0, 0.0, 0.012), smoothstep(0.1, 1.0, uv.y));

  // Étoiles (une par cellule de 3 px, jitter aléatoire, scintillement)
  vec2 cell = floor(gl_FragCoord.xy / 3.0);
  float h = hash(cell);
  vec2 jit = vec2(hash(cell + 7.1), hash(cell + 3.7));
  float sd = length(fract(gl_FragCoord.xy / 3.0) - jit);
  float star = step(1.0 - 0.0065 * uStars, h) * smoothstep(0.55, 0.0, sd);
  float tw = 0.55 + 0.45 * sin(t * 1.7 + h * 120.0);
  col += star * tw * 0.85 * smoothstep(0.22, 0.5, uv.y);

  // Rideaux : quatre nappes, bord bas net, bord haut diffus
  vec3 acol = vec3(0.0);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float yc = 0.40 + fi * 0.085 + 0.11 * snoise(vec3(p.x * 0.85 + fi * 3.1, t * 0.11, fi * 2.0));
    float d = p.y - yc;
    float band = d < 0.0 ? exp(-pow(d * 18.0, 2.0)) : exp(-d * 7.0);
    float curt = fbm(vec3(p.x * 2.4 + t * 0.07 + fi * 7.0, d * 1.6 - t * 0.04, fi * 1.7));
    curt = smoothstep(-0.15, 0.65, curt);
    float rays = 0.65 + 0.35 * snoise(vec3(p.x * 14.0 + t * 0.25, fi * 5.0, t * 0.05));
    float a = band * curt * rays;
    vec3 c = mix(uColorA, uColorB, smoothstep(-0.02, 0.28, d));
    c = mix(c, uColorC, smoothstep(0.25, 0.45, d) * 0.5);
    acol += c * a;
  }
  col += acol * uIntensity;

  // Crête de montagnes (optionnelle)
  float m = 0.17 + 0.075 * snoise(vec3(p.x * 1.25, 0.0, 1.0)) + 0.025 * snoise(vec3(p.x * 4.2, 0.0, 2.0)) + 0.008 * snoise(vec3(p.x * 14.0, 0.0, 3.0));
  float ground = smoothstep(m + 0.003, m - 0.003, uv.y) * uRidge;
  vec3 gcol = vec3(0.0, 0.002, 0.006) + acol * 0.05 * smoothstep(m - 0.04, m, uv.y);
  col = mix(col, gcol, ground);

  // Dithering anti-banding
  col += (hash(gl_FragCoord.xy + t) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

const DEFAULTS = {
  colorA: 0x2ef594,     // vert, bas des rideaux
  colorB: 0x8047fa,     // violet, haut des rideaux
  colorC: 0xf2598c,     // pointe rosée
  intensity: 0.62,
  speed: 1.0,
  stars: 1.0,
  ridge: true,
  parallax: true,
  pixelRatio: Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, 2),
  respectReducedMotion: true,
  autoStart: true,
};

/** Construit le ShaderMaterial. Toutes les options sont modifiables ensuite via material.uniforms. */
export function createAuroraMaterial(THREE, options = {}) {
  const o = { ...DEFAULTS, ...options };
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uColorA: { value: new THREE.Color(o.colorA) },
      uColorB: { value: new THREE.Color(o.colorB) },
      uColorC: { value: new THREE.Color(o.colorC) },
      uIntensity: { value: o.intensity },
      uSpeed: { value: o.speed },
      uStars: { value: o.stars },
      uRidge: { value: o.ridge ? 1 : 0 },
    },
    vertexShader: AURORA_VERTEX,
    fragmentShader: AURORA_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });
}

/**
 * Monte l'aurore sur un canvas et gère tout : renderer, resize, souris, boucle.
 * Retourne { uniforms, material, renderer, scene, camera, canvas, start, stop, resize, dispose }.
 */
export function mountAurora(THREE, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const canvas = o.canvas || document.createElement('canvas');
  if (!o.canvas) {
    Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100%', height: '100%', display: 'block' });
    document.body.prepend(canvas);
  }
  const reduced = o.respectReducedMotion && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(o.pixelRatio);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const material = createAuroraMaterial(THREE, o);
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  const uniforms = material.uniforms;

  const mouse = new THREE.Vector2();
  const mouseSmooth = new THREE.Vector2();
  const onMove = (e) => mouse.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
  if (o.parallax) window.addEventListener('pointermove', onMove, { passive: true });

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    uniforms.uRes.value.set(w * o.pixelRatio, h * o.pixelRatio);
  }
  window.addEventListener('resize', resize);
  resize();

  let raf = 0, running = false, time = 0, last = performance.now();
  const timeScale = reduced ? 0.25 : 1;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    time += dt * timeScale;
    uniforms.uTime.value = time;
    mouseSmooth.lerp(mouse, 1 - Math.exp(-dt * 3));
    uniforms.uMouse.value.copy(mouseSmooth);
    renderer.render(scene, camera);
  }
  function start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  function dispose() {
    stop();
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onMove);
    material.dispose();
    renderer.dispose();
    if (!o.canvas) canvas.remove();
  }

  if (o.autoStart) start();
  return { uniforms, material, renderer, scene, camera, canvas, start, stop, resize, dispose };
}
