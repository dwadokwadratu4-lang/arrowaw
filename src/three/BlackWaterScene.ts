import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { soundEngine } from '../audio/soundEngine';
import { SensorSnapshot } from '../hooks/useDeviceSensors';
import {
  AbyssOrbRig,
  AmberArrowRig,
  createAbyssOrb,
  createAmberArrow,
  createDragonEye,
  DragonEyeRig,
  OrbVariant,
} from './models';

export type CompassPhase =
  | 'waiting'
  | 'seeking'
  | 'locking'
  | 'locked'
  | 'tilted'
  | 'sleeping'
  | 'scared';

export interface SceneHudState {
  phase: CompassPhase;
  isLocked: boolean;
  isTilted: boolean;
  isSleeping: boolean;
  isScared: boolean;
  dragonEyeOpen: boolean;
  distanceKm: number;
  relativeAngleDeg: number;
  targetBearingDeg: number;
  compassHeadingDeg: number;
}

interface ActiveOrb {
  id: number;
  rig: AbyssOrbRig;
  x: number;
  z: number;
  y: number;
  state: 'rising' | 'floating' | 'sinking';
  tappedGlass: boolean;
  spawnTime: number;
  floatUntil: number;
  bobPhase: number;
}

interface ActiveDragonEye {
  rig: DragonEyeRig;
  x: number;
  z: number;
  y: number;
  state: 'opening' | 'open' | 'closing' | 'fleeing';
  openAmount: number;
  openUntil: number;
  lastTapTime: number;
}

const MAX_RIPPLES = 12;
const SURFACE_Y = 0.4;
const SLEEP_TIMEOUT_MS = 15000;
const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();

function safeVibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore on unsupported browsers
    }
  }
}

export class BlackWaterScene {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private frameId = 0;
  private disposed = false;

  // Wymiary widocznej tafli na y = 0
  private halfW = 2.6;
  private halfH = 4.5;
  private arrowScale = 1.0;

  // Woda i zmarszczki
  private waterMesh!: THREE.Mesh;
  private waterUniforms = {
    uTime: { value: 0 },
    uRipples: {
      value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0)),
    },
  };
  private rippleIndex = 0;

  // Strzałka bursztynowa i jej fizyka
  private arrowRig!: AmberArrowRig;
  private arrowX = 0;
  private arrowZ = 0;
  private arrowY = -3.8;
  private arrowAngleRad = 0;
  private arrowGlow = 0;

  // Stany kompasu
  private activated = false;
  private phase: CompassPhase = 'waiting';
  private lockTapCount = 0;
  private nextLockTapTime = 0;
  private nextSeekTapTime = 0;
  private seekJabOffset = 0;
  private lastHandledShakeTime = 0;

  // Stany Easter Egga (Dragon Eye) i kul
  private orbs: ActiveOrb[] = [];
  private nextOrbId = 1;
  private nextOrbSpawnTime = 0;
  private dragonEye: ActiveDragonEye | null = null;
  private scaredUntil = 0;
  private waitingMotionAfterScare = false;
  private lastEmptyTapTime = 0;

  // Czasy i callbacki
  private clock = new THREE.Clock();
  private elapsed = 0;
  private lastHudPush = 0;
  private getSnapshot: () => SensorSnapshot;
  private onMotion: () => void;
  private onHudUpdate: (hud: SceneHudState) => void;

  // Handlery zdarzeń
  private boundResize: () => void;
  private boundPointerDown: (e: PointerEvent) => void;
  private boundDblClick: (e: MouseEvent) => void;
  private boundContextLost: (e: Event) => void;

  constructor(
    container: HTMLElement,
    getSnapshot: () => SensorSnapshot,
    onMotion: () => void,
    onHudUpdate: (hud: SceneHudState) => void,
  ) {
    this.container = container;
    this.getSnapshot = getSnapshot;
    this.onMotion = onMotion;
    this.onHudUpdate = onHudUpdate;

    // 1. Detekcja Software WebGL (SwiftShader / llvmpipe / WARP)
    this.isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // 2. Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    this.container.appendChild(this.renderer.domElement);

    // 3. Scena i liniowa mgła głębinowa (0% mgły dla y >= -0.18, pełna czerń poniżej y = -3.5)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.Fog(0x000000, 14.18, 17.5);

    // 4. Kamera z góry (-Z = góra ekranu, +X = prawo, +Y = do obserwatora)
    const width = Math.max(1, container.clientWidth || window.innerWidth);
    const height = Math.max(1, container.clientHeight || window.innerHeight);
    this.camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 40);
    this.camera.position.set(0, 14, 0);
    this.camera.up.set(0, 0, -1);
    this.camera.lookAt(0, 0, 0);

    // 5. Studio Environment Map (RoomEnvironment)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // 6. Światła
    this.setupLighting();

    // 7. Pojemnik z czarną wodą + tafla szkła + bursztynowa strzałka
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.createBlackWaterSurface();
    this.createGlassOverlay();
    this.arrowRig = createAmberArrow(this.isSoftwareGl, maxAniso);
    this.arrowRig.group.position.set(0, this.arrowY, 0);
    this.scene.add(this.arrowRig.group);

    this.updateViewportBounds(width, height);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // 8. Zdarzenia
    this.boundResize = () => {
      const w = Math.max(1, this.container.clientWidth || window.innerWidth);
      const h = Math.max(1, this.container.clientHeight || window.innerHeight);
      this.updateViewportBounds(w, h);
    };
    this.boundPointerDown = (e) => this.handlePointerDown(e);
    this.boundDblClick = (e) => this.handleDoubleClick(e);
    this.boundContextLost = (e) => {
      e.preventDefault();
    };

    window.addEventListener('resize', this.boundResize);
    this.renderer.domElement.addEventListener('pointerdown', this.boundPointerDown);
    this.renderer.domElement.addEventListener('dblclick', this.boundDblClick);
    this.renderer.domElement.addEventListener('webglcontextlost', this.boundContextLost);

    this.tick();
  }

  private setupLighting(): void {
    const hemi = new THREE.HemisphereLight(0x6b7fa3, 0x1a1208, 1.15);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffe6ba, 1.85);
    key.position.set(2.5, 9, -3.5);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x9bc4ff, 0.9);
    rim.position.set(-4, 6, 4);
    this.scene.add(rim);
  }

  private createBlackWaterSurface(): void {
    const geo = new THREE.PlaneGeometry(24, 24, 128, 128);
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x030306),
      roughness: 0.08,
      metalness: 0.18,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.waterUniforms.uTime;
      shader.uniforms.uRipples = this.waterUniforms.uRipples;

      shader.vertexShader =
        `
        uniform float uTime;
        uniform vec4 uRipples[${MAX_RIPPLES}];
        varying vec3 vWaterWorldPos;

        float evalWave(vec2 p, float t) {
          float h = sin(p.x * 1.4 + t * 0.7) * cos(p.y * 1.3 - t * 0.6) * 0.008;
          h += sin((p.x + p.y) * 2.6 - t * 1.1) * 0.004;
          for (int i = 0; i < ${MAX_RIPPLES}; i++) {
            vec4 rip = uRipples[i];
            float age = t - rip.z;
            if (age > 0.0 && age < 3.4 && rip.w > 0.0) {
              float dist = length(p - rip.xy);
              float radius = age * 2.65;
              float band = exp(-pow((dist - radius) * 3.1, 2.0));
              float decay = exp(-age * 1.35);
              h += sin((dist - radius) * 16.0) * band * decay * rip.w * 0.055;
            }
          }
          return h;
        }
        ` + shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `
        #include <beginnormal_vertex>
        vec2 wp2 = position.xz;
        float eps = 0.04;
        float hC = evalWave(wp2, uTime);
        float hX = evalWave(wp2 + vec2(eps, 0.0), uTime);
        float hZ = evalWave(wp2 + vec2(0.0, eps), uTime);
        objectNormal = normalize(vec3(hC - hX, eps, hC - hZ));
        `,
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `
        #include <begin_vertex>
        transformed.y += hC;
        vWaterWorldPos = transformed;
        `,
      );
    };

    this.waterMesh = new THREE.Mesh(geo, mat);
    this.waterMesh.position.y = 0.0;
    this.waterMesh.renderOrder = 5;
    this.scene.add(this.waterMesh);
  }

  private createGlassOverlay(): void {
    // Subtelny szklany refleks na wierzchu ekranu
    const glassGeo = new THREE.PlaneGeometry(24, 24);
    glassGeo.rotateX(-Math.PI / 2);

    const glassMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: this.waterUniforms.uTime,
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        void main() {
          vec2 p = vUv - 0.5;
          // Ukośny, bardzo subtelny odblask tafli szkła
          float streak = exp(-pow((p.x * 0.85 + p.y * 0.52 - 0.06) * 14.0, 2.0)) * 0.028;
          float edgeVignette = smoothstep(0.18, 0.5, length(p));
          float alpha = streak + edgeVignette * 0.18;
          vec3 col = mix(vec3(0.0), vec3(0.75, 0.84, 0.98), streak * 14.0);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    const glassMesh = new THREE.Mesh(glassGeo, glassMat);
    glassMesh.position.y = 0.9;
    glassMesh.renderOrder = 20;
    this.scene.add(glassMesh);
  }

  private updateViewportBounds(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );

    const vFovRad = THREE.MathUtils.degToRad(this.camera.fov);
    this.halfH = Math.tan(vFovRad / 2) * this.camera.position.y;
    this.halfW = this.halfH * this.camera.aspect;

    // Długość strzałki ok. połowy szerokości ekranu (z ograniczeniem na bardzo szerokie desktopy)
    const effectiveHalfW = Math.min(this.halfW, this.halfH * 0.72);
    this.arrowScale = THREE.MathUtils.clamp(effectiveHalfW * 0.56, 0.65, 1.65);
    this.arrowRig.group.scale.setScalar(this.arrowScale);
  }

  public addRipple(x: number, z: number, strength = 1.0): void {
    this.waterUniforms.uRipples.value[this.rippleIndex].set(
      x,
      z,
      this.elapsed,
      strength,
    );
    this.rippleIndex = (this.rippleIndex + 1) % MAX_RIPPLES;
  }

  public activate(): void {
    if (this.activated) return;
    this.activated = true;
    this.phase = 'seeking';
    this.scaredUntil = 0;
    this.waitingMotionAfterScare = false;

    // Natychmiastowa widoczność strzałki i pierwszej kuli na powierzchni (+0.4 ponad wodą y=0)
    const snap = this.getSnapshot();
    this.arrowAngleRad = -THREE.MathUtils.degToRad(snap.relativeAngleDeg);
    this.arrowX = 0;
    this.arrowZ = 0;
    this.arrowY = SURFACE_Y;
    this.arrowRig.group.position.set(this.arrowX, this.arrowY, this.arrowZ);
    this.arrowRig.group.rotation.set(0, this.arrowAngleRad, 0);
    this.arrowRig.light.intensity = 4.8;

    this.spawnSurfaceOrbImmediately();
    this.nextOrbSpawnTime = this.elapsed + 5.0;

    this.onMotion();
    this.lastHandledShakeTime = performance.now();
    this.addRipple(0, 0, 1.45);
    soundEngine.playSplash(0.8);
  }

  public triggerWakeSplash(): void {
    const nowPerf = performance.now();
    if (nowPerf < this.scaredUntil) return;
    this.waitingMotionAfterScare = false;
    this.onMotion();
    this.lastHandledShakeTime = nowPerf;
    const wasSleeping = this.phase === 'sleeping' || this.phase === 'scared';
    if (wasSleeping) {
      this.phase = 'seeking';
      soundEngine.stopAbyssMurmur();
      this.arrowY = Math.max(this.arrowY, -0.4);
      if (this.orbs.length === 0) {
        this.spawnSurfaceOrbImmediately();
      }
    }
    this.addRipple(this.arrowX, this.arrowZ, 1.55);
    soundEngine.playSplash(0.9);
    safeVibrate(45);
  }

  private handleDoubleClick(e: MouseEvent): void {
    if (!this.activated) return;
    const hit = this.raycastInteractive(e.clientX, e.clientY);
    if (hit === 'dragonEye') {
      this.triggerDragonScare();
    }
  }

  private handlePointerDown(e: PointerEvent): void {
    if (!this.activated) return;
    this.onMotion();

    const rect = this.renderer.domElement.getBoundingClientRect();
    _pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    _pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    // Przelicz kliknięcie na płaszczyznę tafli wody (y = 0)
    _raycaster.setFromCamera(_pointer, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const waterHit = new THREE.Vector3();
    _raycaster.ray.intersectPlane(plane, waterHit);

    const hit = this.raycastInteractive(e.clientX, e.clientY);
    const nowPerf = performance.now();

    if (hit === 'dragonEye' && this.dragonEye && this.dragonEye.state !== 'fleeing') {
      if (nowPerf - this.dragonEye.lastTapTime < 420) {
        // Podwójny tap w otwarte Smocze Oko -> Easter Egg!
        this.triggerDragonScare();
      } else {
        this.dragonEye.lastTapTime = nowPerf;
        this.addRipple(this.dragonEye.x, this.dragonEye.z, 0.7);
      }
      return;
    }

    if (typeof hit === 'number') {
      const orb = this.orbs.find((o) => o.id === hit);
      if (orb) {
        this.transformOrbToDragonEye(orb);
        return;
      }
    }

    // Dotyk pustej tafli wody: fala + budzenie przy podwójnym stuknięciu
    this.addRipple(waterHit.x, waterHit.z, 0.9);
    if (nowPerf - this.lastEmptyTapTime < 380) {
      if (
        (this.phase === 'sleeping' || !this.waitingMotionAfterScare) &&
        nowPerf >= this.scaredUntil
      ) {
        this.triggerWakeSplash();
      } else if (nowPerf >= this.scaredUntil && this.waitingMotionAfterScare) {
        this.triggerWakeSplash();
      }
    } else {
      soundEngine.playOrbTap();
    }
    this.lastEmptyTapTime = nowPerf;
  }

  private raycastInteractive(
    clientX: number,
    clientY: number,
  ): 'dragonEye' | number | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    _pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_pointer, this.camera);

    const targets: THREE.Object3D[] = [];
    if (this.dragonEye && this.dragonEye.state !== 'fleeing') {
      targets.push(this.dragonEye.rig.hitMesh);
    }
    for (const orb of this.orbs) {
      if (orb.y > -2.4) {
        targets.push(orb.rig.hitMesh);
      }
    }
    if (targets.length === 0) return null;

    const intersects = _raycaster.intersectObjects(targets, false);
    if (intersects.length === 0) return null;

    const first = intersects[0].object;
    if (this.dragonEye && first === this.dragonEye.rig.hitMesh) {
      return 'dragonEye';
    }
    const matchedOrb = this.orbs.find((o) => o.rig.hitMesh === first);
    return matchedOrb ? matchedOrb.id : null;
  }

  private transformOrbToDragonEye(orb: ActiveOrb): void {
    // Usuń klikniętą kulę i zamień ją w gadzią powiekę otwierającą się na 3.5s
    this.scene.remove(orb.rig.group);
    this.orbs = this.orbs.filter((o) => o.id !== orb.id);

    if (this.dragonEye) {
      this.scene.remove(this.dragonEye.rig.group);
    }

    const rig = createDragonEye(this.renderer.capabilities.getMaxAnisotropy());
    rig.group.position.set(orb.x, Math.max(orb.y, -0.04), orb.z);
    this.scene.add(rig.group);

    this.dragonEye = {
      rig,
      x: orb.x,
      z: orb.z,
      y: Math.max(orb.y, -0.04),
      state: 'opening',
      openAmount: 0,
      openUntil: this.elapsed + 0.42 + 3.5, // 3.5s otwartego oka
      lastTapTime: 0,
    };

    this.addRipple(orb.x, orb.z, 1.15);
    soundEngine.playOrbTap();
    safeVibrate(25);
  }

  private triggerDragonScare(): void {
    const nowPerf = performance.now();
    this.scaredUntil = nowPerf + 5000;
    this.waitingMotionAfterScare = true;
    this.phase = 'scared';

    soundEngine.playDragonGroan();
    soundEngine.playSplash(1.0);
    safeVibrate([120, 60, 200]);

    if (this.dragonEye) {
      this.dragonEye.state = 'fleeing';
      this.addRipple(this.dragonEye.x, this.dragonEye.z, 1.8);
    }
    this.addRipple(this.arrowX, this.arrowZ, 1.6);
    for (const orb of this.orbs) {
      orb.state = 'sinking';
      this.addRipple(orb.x, orb.z, 1.2);
    }
  }

  private spawnSurfaceOrbImmediately(): void {
    const variants: OrbVariant[] = ['emerald', 'amber', 'ruby'];
    const variant = variants[Math.floor(Math.random() * variants.length)];
    const rig = createAbyssOrb(variant);

    const safeX = Math.max(0.55, this.halfW * 0.45);
    const x = (Math.random() > 0.5 ? 1 : -1) * safeX;
    const z = -Math.min(1.1, this.halfH * 0.25);
    const y = SURFACE_Y;

    rig.group.position.set(x, y, z);
    this.scene.add(rig.group);
    this.addRipple(x, z, 0.85);

    this.orbs.push({
      id: this.nextOrbId++,
      rig,
      x,
      z,
      y,
      state: 'floating',
      tappedGlass: true,
      spawnTime: this.elapsed,
      floatUntil: this.elapsed + 9.0,
      bobPhase: Math.random() * Math.PI * 2,
    });
  }

  private spawnRandomOrb(): void {
    const variants: OrbVariant[] = ['emerald', 'amber', 'ruby'];
    const variant = variants[Math.floor(Math.random() * variants.length)];
    const rig = createAbyssOrb(variant);

    const safeX = Math.max(0.5, this.halfW - 0.65);
    const safeZTop = Math.max(0.6, this.halfH - 1.15);
    const safeZBot = Math.max(0.6, this.halfH - 1.05);

    const x = THREE.MathUtils.randFloat(-safeX, safeX);
    const z = THREE.MathUtils.randFloat(-safeZTop, safeZBot);
    const y = -2.2;

    rig.group.position.set(x, y, z);
    this.scene.add(rig.group);

    this.orbs.push({
      id: this.nextOrbId++,
      rig,
      x,
      z,
      y,
      state: 'rising',
      tappedGlass: false,
      spawnTime: this.elapsed,
      floatUntil: this.elapsed + THREE.MathUtils.randFloat(7.5, 11.0),
      bobPhase: Math.random() * Math.PI * 2,
    });
  }

  /**
   * Oblicza punkt zderzenia promienia ze środka ekranu ze szklaną ramką.
   */
  private computeEdgeAnchor(dirX: number, dirZ: number): {
    anchorX: number;
    anchorZ: number;
    tipX: number;
    tipZ: number;
  } {
    const marginX = Math.max(0.4, this.halfW - 0.14);
    const topLimit = Math.max(0.5, this.halfH - 0.48); // przestrzeń pod napisem na górze
    const botLimit = Math.max(0.5, this.halfH - 0.22);

    const tx = Math.abs(dirX) > 1e-4 ? marginX / Math.abs(dirX) : 999;
    const tz =
      dirZ < -1e-4
        ? topLimit / -dirZ
        : dirZ > 1e-4
          ? botLimit / dirZ
          : 999;
    const tHit = Math.min(tx, tz);

    const tipX = dirX * tHit;
    const tipZ = dirZ * tHit;

    // Odległość od środka strzałki do samego grota
    const tipDist = 1.04 * this.arrowScale;
    const centerDist = Math.max(0, tHit - tipDist);

    return {
      anchorX: dirX * centerDist,
      anchorZ: dirZ * centerDist,
      tipX,
      tipZ,
    };
  }

  private updateArrowPhysics(dt: number, snapshot: SensorSnapshot): void {
    const nowPerf = performance.now();

    if (!this.activated) {
      this.phase = 'waiting';
      this.arrowY = THREE.MathUtils.damp(this.arrowY, -3.8, 4, dt);
      this.arrowRig.group.position.set(0, this.arrowY, 0);
      this.arrowRig.light.intensity = 0;
      return;
    }

    // Sprawdź czy minęło 5 sekund po ucieczce Smoczego Oka
    if (nowPerf < this.scaredUntil) {
      this.phase = 'scared';
      this.arrowY = THREE.MathUtils.damp(this.arrowY, -4.4, 9, dt);
      this.arrowGlow = THREE.MathUtils.damp(this.arrowGlow, 0, 10, dt);
      this.arrowRig.group.position.set(this.arrowX, this.arrowY, this.arrowZ);
      this.arrowRig.light.intensity = 0;
      return;
    }

    // Po upływie 5s czekaj aż użytkownik poruszy telefonem
    if (this.waitingMotionAfterScare) {
      if (snapshot.lastMotionTime > this.scaredUntil) {
        this.waitingMotionAfterScare = false;
        this.phase = 'seeking';
        this.addRipple(this.arrowX, this.arrowZ, 1.3);
        soundEngine.playSplash(0.8);
      } else {
        this.phase = 'scared';
        this.arrowY = THREE.MathUtils.damp(this.arrowY, -4.4, 6, dt);
        this.arrowRig.group.position.set(this.arrowX, this.arrowY, this.arrowZ);
        this.arrowRig.light.intensity = 0;
        return;
      }
    }

    // Budzenie potrząśnięciem ze stanu uśpienia
    const wasSleeping = this.phase === 'sleeping';
    if (wasSleeping && snapshot.lastShakeTime > this.lastHandledShakeTime) {
      this.lastHandledShakeTime = snapshot.lastShakeTime;
      soundEngine.stopAbyssMurmur();
      this.addRipple(this.arrowX, this.arrowZ, 1.55);
      soundEngine.playSplash(0.95);
      safeVibrate(45);
      this.phase = 'seeking';
      if (this.orbs.length === 0) {
        this.spawnSurfaceOrbImmediately();
      }
    } else {
      this.lastHandledShakeTime = Math.max(
        this.lastHandledShakeTime,
        snapshot.lastShakeTime,
      );
    }

    // Kontrola bezruchu (pełne 15 sekund -> zanurza się pod czarną taflę wody)
    const idleMs = nowPerf - snapshot.lastMotionTime;
    if (idleMs >= SLEEP_TIMEOUT_MS) {
      if (this.phase !== 'sleeping') {
        this.phase = 'sleeping';
        soundEngine.startAbyssMurmur();
      }
      this.arrowY = THREE.MathUtils.damp(this.arrowY, -3.6, 1.15, dt);
      this.arrowGlow = THREE.MathUtils.damp(this.arrowGlow, 0, 3, dt);
      this.arrowRig.group.position.set(this.arrowX, this.arrowY, this.arrowZ);
      this.arrowRig.light.intensity = THREE.MathUtils.damp(
        this.arrowRig.light.intensity,
        0,
        2.5,
        dt,
      );
      return;
    }

    soundEngine.stopAbyssMurmur();

    // Kontrola wypoziomowania (beta lub gamma > 25°)
    if (!snapshot.isFlat) {
      this.phase = 'tilted';
      const botZ = Math.max(0.3, this.halfH - 0.95 * this.arrowScale - 0.25);
      this.arrowX = THREE.MathUtils.damp(this.arrowX, 0, 5, dt);
      this.arrowZ = THREE.MathUtils.damp(this.arrowZ, botZ, 4.5, dt);
      this.arrowY = THREE.MathUtils.damp(this.arrowY, SURFACE_Y - 0.12, 5, dt);
      this.arrowGlow = THREE.MathUtils.damp(this.arrowGlow, 0, 6, dt);

      // Zsuwa się bezwładnie i opada nosem lekko w dół
      const targetRot = Math.PI;
      const diff = Math.atan2(
        Math.sin(targetRot - this.arrowAngleRad),
        Math.cos(targetRot - this.arrowAngleRad),
      );
      this.arrowAngleRad += diff * Math.min(1, dt * 4);
      this.arrowRig.group.rotation.set(-0.18, this.arrowAngleRad, 0);
      this.arrowRig.group.position.set(this.arrowX, this.arrowY, this.arrowZ);
      this.arrowRig.light.intensity = 2.6;
      return;
    }

    // Jeśli właśnie się obudziła z uśpienia lub przechyłu -> powrót na powierzchnię
    if (this.phase === 'sleeping' || this.phase === 'tilted') {
      this.phase = 'seeking';
    }

    const relDeg = snapshot.relativeAngleDeg;
    const absRel = Math.abs(relDeg);

    // Wybór fazy: dobry kierunek (±7°) vs zły kierunek
    if (this.phase === 'locked') {
      if (absRel > 10) {
        this.phase = 'seeking';
      }
    } else if (this.phase === 'locking') {
      if (absRel > 10) {
        this.phase = 'seeking';
      }
    } else if (absRel <= 7) {
      this.phase = 'locking';
      this.lockTapCount = 0;
      this.nextLockTapTime = this.elapsed + 0.12;
    } else {
      this.phase = 'seeking';
    }

    // Obrót strzałki w kierunku celu
    const desiredRotY = -THREE.MathUtils.degToRad(relDeg);
    const rotDelta = Math.atan2(
      Math.sin(desiredRotY - this.arrowAngleRad),
      Math.cos(desiredRotY - this.arrowAngleRad),
    );
    this.arrowAngleRad += rotDelta * Math.min(1, dt * 10);

    const dirX = Math.sin(-this.arrowAngleRad);
    const dirZ = -Math.cos(-this.arrowAngleRad);
    const { anchorX, anchorZ, tipX, tipZ } = this.computeEdgeAnchor(dirX, dirZ);

    let targetX = anchorX;
    let targetZ = anchorZ;
    let targetY = SURFACE_Y + Math.sin(this.elapsed * 2.5) * 0.02;
    let targetGlow = 0;

    if (this.phase === 'seeking') {
      // Nerwowe, bezładne uderzanie grotem o boczną/dolną krawędź ekranu
      const pullBack = 0.24;
      const baseAnchorX = anchorX - dirX * pullBack;
      const baseAnchorZ = anchorZ - dirZ * pullBack;

      if (this.elapsed >= this.nextSeekTapTime) {
        this.seekJabOffset = 0.26;
        this.nextSeekTapTime =
          this.elapsed + THREE.MathUtils.randFloat(0.32, 0.58);
        soundEngine.playGlassTap(0.55 + Math.random() * 0.3);
        safeVibrate(35);
        this.addRipple(tipX, tipZ, 0.72);
      }

      this.seekJabOffset = THREE.MathUtils.damp(this.seekJabOffset, 0, 14, dt);
      const jitter = Math.sin(this.elapsed * 26) * 0.045;
      const perpX = -dirZ;
      const perpZ = dirX;

      targetX = baseAnchorX + dirX * this.seekJabOffset + perpX * jitter;
      targetZ = baseAnchorZ + dirZ * this.seekJabOffset + perpZ * jitter;

      this.arrowX = THREE.MathUtils.damp(this.arrowX, targetX, 11, dt);
      this.arrowZ = THREE.MathUtils.damp(this.arrowZ, targetZ, 11, dt);
    } else if (this.phase === 'locking') {
      // 3 szybkie, radosne stuknięcia w górną krawędź!
      const topAnchor = this.computeEdgeAnchor(0, -1);
      const pullBack = 0.22;
      if (this.elapsed >= this.nextLockTapTime && this.lockTapCount < 3) {
        this.lockTapCount += 1;
        this.seekJabOffset = 0.25;
        this.nextLockTapTime = this.elapsed + 0.21;
        soundEngine.playGlassTap(0.88);
        safeVibrate(32);
        this.addRipple(topAnchor.tipX, topAnchor.tipZ, 0.95);

        if (this.lockTapCount === 3) {
          this.phase = 'locked';
          soundEngine.playMagicGlow();
        }
      }
      this.seekJabOffset = THREE.MathUtils.damp(this.seekJabOffset, 0, 18, dt);
      targetX = topAnchor.anchorX;
      targetZ = topAnchor.anchorZ + pullBack - this.seekJabOffset;
      this.arrowX = THREE.MathUtils.damp(this.arrowX, targetX, 14, dt);
      this.arrowZ = THREE.MathUtils.damp(this.arrowZ, targetZ, 14, dt);
      targetGlow = 0.5;
    } else if (this.phase === 'locked') {
      // Czarodziejsko rozjaśniona strzałka wskazująca prosto ku górze!
      targetX = 0;
      targetZ = -Math.min(0.42, this.halfH * 0.14);
      targetY = SURFACE_Y + 0.05 + Math.sin(this.elapsed * 2.2) * 0.02;
      targetGlow = 1.0;

      this.arrowX = THREE.MathUtils.damp(this.arrowX, targetX, 5.5, dt);
      this.arrowZ = THREE.MathUtils.damp(this.arrowZ, targetZ, 5.5, dt);
    }

    this.arrowY = THREE.MathUtils.damp(this.arrowY, targetY, 7, dt);
    this.arrowGlow = THREE.MathUtils.damp(this.arrowGlow, targetGlow, 4.5, dt);

    this.arrowRig.group.position.set(this.arrowX, this.arrowY, this.arrowZ);
    this.arrowRig.group.rotation.set(0, this.arrowAngleRad, 0);

    // Rozżarzanie bursztynu i mocne światło punktowe tuż nad strzałką
    const pulse = 1 + Math.sin(this.elapsed * 4.0) * 0.12 * this.arrowGlow;
    this.arrowRig.amberMat.emissiveIntensity =
      (0.95 + this.arrowGlow * 1.55) * pulse;
    this.arrowRig.coreMat.emissiveIntensity =
      (2.3 + this.arrowGlow * 2.4) * pulse;
    this.arrowRig.goldMat.emissiveIntensity = 0.72 + this.arrowGlow * 0.95;
    this.arrowRig.light.intensity = (4.8 + this.arrowGlow * 3.8) * pulse;
  }

  private updateOrbsAndDragonEye(dt: number, snapshot: SensorSnapshot): void {
    const nowPerf = performance.now();
    const isScared = nowPerf < this.scaredUntil || this.waitingMotionAfterScare;
    const isAsleep = this.phase === 'sleeping';

    // Spawn nowych kul co kilka sekund
    if (
      this.activated &&
      !isScared &&
      !isAsleep &&
      !this.dragonEye &&
      this.orbs.length < 2 &&
      this.elapsed >= this.nextOrbSpawnTime
    ) {
      this.spawnRandomOrb();
      this.nextOrbSpawnTime = this.elapsed + THREE.MathUtils.randFloat(4.2, 7.2);
    }

    // Aktualizacja kul
    const remainingOrbs: ActiveOrb[] = [];
    for (const orb of this.orbs) {
      if (isScared || isAsleep) {
        orb.state = 'sinking';
      }

      if (orb.state === 'rising') {
        orb.y = THREE.MathUtils.damp(orb.y, SURFACE_Y, 2.6, dt);
        if (orb.y >= SURFACE_Y - 0.14 && !orb.tappedGlass) {
          orb.tappedGlass = true;
          orb.state = 'floating';
          this.addRipple(orb.x, orb.z, 0.75);
          soundEngine.playOrbTap();
          safeVibrate(20);
        }
      } else if (orb.state === 'floating') {
        orb.y = SURFACE_Y + Math.sin(this.elapsed * 2.2 + orb.bobPhase) * 0.03;
        if (this.elapsed >= orb.floatUntil) {
          orb.state = 'sinking';
        }
      } else {
        const sinkSpeed = isScared ? 8.5 : 1.15;
        orb.y = THREE.MathUtils.damp(orb.y, -3.7, sinkSpeed, dt);
      }

      orb.rig.group.position.set(orb.x, orb.y, orb.z);
      const pulse = 0.88 + Math.sin(this.elapsed * 3.5 + orb.bobPhase) * 0.14;
      orb.rig.coreMat.emissiveIntensity = 2.8 * pulse;
      orb.rig.light.intensity =
        THREE.MathUtils.clamp((orb.y + 2.5) / 2.9, 0, 1) * 3.0 * pulse;

      if (orb.y < -3.35 && orb.state === 'sinking') {
        this.scene.remove(orb.rig.group);
      } else {
        remainingOrbs.push(orb);
      }
    }
    this.orbs = remainingOrbs;

    // Aktualizacja Smoczego Oka
    if (this.dragonEye) {
      const eye = this.dragonEye;

      if (isScared && eye.state !== 'fleeing') {
        eye.state = 'fleeing';
      }

      if (eye.state === 'opening') {
        eye.openAmount = Math.min(1, eye.openAmount + dt / 0.42);
        eye.y = THREE.MathUtils.damp(eye.y, SURFACE_Y + 0.04, 7, dt);
        if (eye.openAmount >= 1) {
          eye.state = 'open';
        }
      } else if (eye.state === 'open') {
        eye.openAmount = 1;
        eye.y = SURFACE_Y + 0.04 + Math.sin(this.elapsed * 2.4) * 0.02;
        if (this.elapsed >= eye.openUntil) {
          eye.state = 'closing';
        }
      } else if (eye.state === 'closing') {
        eye.openAmount = Math.max(0, eye.openAmount - dt / 0.36);
        eye.y = THREE.MathUtils.damp(eye.y, -3.7, 2.2, dt);
        if (eye.openAmount <= 0 && eye.y < -3.1) {
          this.scene.remove(eye.rig.group);
          this.dragonEye = null;
          return;
        }
      } else if (eye.state === 'fleeing') {
        eye.openAmount = Math.max(0, eye.openAmount - dt / 0.18);
        eye.y = THREE.MathUtils.damp(eye.y, -4.0, 9, dt);
        if (eye.y < -3.4) {
          this.scene.remove(eye.rig.group);
          this.dragonEye = null;
          return;
        }
      }

      // Animacja otwierania/zamykania gadzich powiek
      const easedOpen =
        eye.openAmount * eye.openAmount * (3 - 2 * eye.openAmount);
      eye.rig.upperLid.rotation.x = -easedOpen * 1.25;
      eye.rig.lowerLid.rotation.x = easedOpen * 1.25;

      // Źrenica wodzi wzrokiem w stronę Zamku Piastowskiego!
      const rad = THREE.MathUtils.degToRad(snapshot.relativeAngleDeg);
      const gazeX = Math.sin(rad) * 0.24;
      const gazeZ = -Math.cos(rad) * 0.24;
      // Pochylenie gałki ocznej w kierunku (gazeX, gazeZ) przy zachowaniu pionowej źrenicy
      eye.rig.eyeball.rotation.z = THREE.MathUtils.damp(
        eye.rig.eyeball.rotation.z,
        -gazeX,
        8,
        dt,
      );
      eye.rig.eyeball.rotation.x = THREE.MathUtils.damp(
        eye.rig.eyeball.rotation.x,
        gazeZ,
        8,
        dt,
      );

      eye.rig.group.position.set(eye.x, eye.y, eye.z);
      eye.rig.light.intensity = easedOpen * 3.4;
      eye.rig.eyeMat.emissiveIntensity = 1.2 + easedOpen * 1.1;
    }
  }

  private tick = (): void => {
    if (this.disposed) return;

    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.08);
    this.elapsed += dt;
    this.waterUniforms.uTime.value = this.elapsed;

    const snapshot = this.getSnapshot();
    this.updateArrowPhysics(dt, snapshot);
    this.updateOrbsAndDragonEye(dt, snapshot);

    this.renderer.render(this.scene, this.camera);

    // Przekazuj stan do React HUD (co ~100ms, bez przerywania renderu)
    if (this.elapsed - this.lastHudPush > 0.1) {
      this.lastHudPush = this.elapsed;
      this.onHudUpdate({
        phase: this.phase,
        isLocked: this.phase === 'locked',
        isTilted: this.phase === 'tilted',
        isSleeping: this.phase === 'sleeping',
        isScared: this.phase === 'scared',
        dragonEyeOpen:
          !!this.dragonEye &&
          (this.dragonEye.state === 'opening' ||
            this.dragonEye.state === 'open'),
        distanceKm: snapshot.distanceKm,
        relativeAngleDeg: snapshot.relativeAngleDeg,
        targetBearingDeg: snapshot.targetBearingDeg,
        compassHeadingDeg: snapshot.compassHeadingDeg,
      });
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  public dispose(): void {
    this.disposed = true;
    soundEngine.stopAbyssMurmur();
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.boundResize);
    this.renderer.domElement.removeEventListener('pointerdown', this.boundPointerDown);
    this.renderer.domElement.removeEventListener('dblclick', this.boundDblClick);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.boundContextLost);

    this.scene.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose());
        } else {
          mesh.material?.dispose();
        }
      }
    });
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
