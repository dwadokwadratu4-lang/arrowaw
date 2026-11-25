import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { soundEngine } from '../audio/soundEngine';
import { SensorSnapshot } from '../hooks/useDeviceSensors';
import { normalizeSignedAngle } from '../utils/geo';
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
  vx: number;
  vz: number;
  rotY: number;
  rotVelY: number;
  radius: number;
  lastBumpSound: number;
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
  vx: number;
  vz: number;
  radius: number;
  state: 'opening' | 'open' | 'closing' | 'fleeing';
  openAmount: number;
  openUntil: number;
  lastTapTime: number;
}

const MAX_RIPPLES = 16;
const SURFACE_Y_ARROW = 0.032;
const SURFACE_Y_ORB = 0.08;
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

  // Historyczny grot strzały i jego ciężka bezwładność
  private arrowRig!: AmberArrowRig;
  private arrowX = 0;
  private arrowZ = 0;
  private arrowY = -3.8;
  private arrowVx = 0;
  private arrowVz = 0;
  private arrowAngleRad = 0;
  private arrowOmega = 0;
  private arrowGlow = 0;

  // Stany kompasu i wyciszenie po 3–4 stuknięciach o krawędź
  private activated = false;
  private phase: CompassPhase = 'waiting';
  private lockTapCount = 0;
  private lockMaxTaps = 3;
  private nextLockTapTime = 0;
  private nextSeekTapTime = 0;
  private seekTapCount = 0;
  private seekMaxTaps = 3;
  private seekSettled = false;
  private tapRefHeadingDeg = 0;
  private lastTapResetShakeTime = 0;
  private lastHandledShakeTime = 0;
  private nextWakeTime = 0;
  private wakeSide = 1;

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
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2),
    );
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.style.touchAction = 'none';
    this.container.appendChild(this.renderer.domElement);

    // 3. Scena i liniowa mgła głębinowa (0% mgły dla y >= -0.22, pełna czerń poniżej y = -3.4)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);
    this.scene.fog = new THREE.Fog(0x000000, 14.22, 17.4);

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

    // 7. Gładka głęboka woda + szkło + historyczny grot
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
    const hemi = new THREE.HemisphereLight(0x8aa4d6, 0x060402, 1.05);
    this.scene.add(hemi);

    // Kontrastowy kierunkowy klucz tworzący świetliste refleksy na grzbietach fal i kulach
    const key = new THREE.DirectionalLight(0xffebc2, 2.1);
    key.position.set(3.2, 9.5, -4.0);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0xb5d3ff, 1.15);
    rim.position.set(-4.5, 6.5, 4.5);
    this.scene.add(rim);
  }

  /**
   * Matematyczny model falowania (zsynchronizowany między GLSL wody a fizyką kul w JS).
   * Prędkość falowania spowolniona o ~50% dla efektu ciężkiej, oleistej głębi.
   */
  private evalWaterHeight(px: number, pz: number, t: number): number {
    let h =
      Math.sin(px * 0.95 + t * 0.34) * Math.cos(pz * 0.88 - t * 0.29) * 0.026 +
      Math.sin((px * 0.72 - pz * 0.65) * 1.55 - t * 0.48) * 0.014 +
      Math.cos((px + pz) * 1.2 + t * 0.24) * 0.01;

    const ripples = this.waterUniforms.uRipples.value;
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const rip = ripples[i];
      const age = t - rip.z;
      if (age > 0 && age < 4.5 && rip.w > 0) {
        const dx = px - rip.x;
        const dz = pz - rip.y;
        const dist = Math.hypot(dx, dz);
        const radius = age * 1.45;
        const diff = dist - radius;
        const band = Math.exp(-(diff * diff) * 4.84);
        const decay = Math.exp(-age * 0.95);
        h += Math.sin(diff * 8.5) * band * decay * rip.w * 0.052;
      }
    }
    return h;
  }

  private createBlackWaterSurface(): void {
    // Gęsta, gładka siatka z miękkim cieniowaniem + per-pixel normalne w fragment shaderze (zero widocznych trójkątów)
    const geo = new THREE.PlaneGeometry(16, 16, 200, 200);
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();

      const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x020408),
      roughness: 0.05,
      metalness: 0.28,
      clearcoat: 1.0,
      clearcoatRoughness: 0.025,
      envMapIntensity: 2.35,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      flatShading: false,
    });

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.waterUniforms.uTime;
      shader.uniforms.uRipples = this.waterUniforms.uRipples;

      const waveFnGlsl = `
        uniform float uTime;
        uniform vec4 uRipples[${MAX_RIPPLES}];

        float evalWave(vec2 p, float t) {
          float h = sin(p.x * 0.95 + t * 0.34) * cos(p.y * 0.88 - t * 0.29) * 0.026;
          h += sin((p.x * 0.72 - p.y * 0.65) * 1.55 - t * 0.48) * 0.014;
          h += cos((p.x + p.y) * 1.2 + t * 0.24) * 0.010;
          for (int i = 0; i < ${MAX_RIPPLES}; i++) {
            vec4 rip = uRipples[i];
            float age = t - rip.z;
            if (age > 0.0 && age < 4.5 && rip.w > 0.0) {
              float dist = length(p - rip.xy);
              float radius = age * 1.45;
              float band = exp(-pow((dist - radius) * 2.2, 2.0));
              float decay = exp(-age * 0.95);
              h += sin((dist - radius) * 8.5) * band * decay * rip.w * 0.052;
            }
          }
          return h;
        }

        float evalWakeGlow(vec2 p, float t) {
          float g = 0.0;
          for (int i = 0; i < ${MAX_RIPPLES}; i++) {
            vec4 rip = uRipples[i];
            float age = t - rip.z;
            if (age > 0.0 && age < 2.2 && rip.w > 0.0) {
              float dist = length(p - rip.xy);
              float radius = age * 1.45;
              float ring = exp(-pow((dist - radius) * 3.8, 2.0));
              float crest = max(0.0, cos((dist - radius) * 8.5));
              float fade = exp(-age * 1.45);
              g += ring * crest * fade * rip.w;
            }
          }
          return clamp(g, 0.0, 1.0);
        }
      `;

      shader.vertexShader =
        waveFnGlsl +
        `
        varying vec2 vWaterXZ;
        varying vec3 vViewAxisX;
        varying vec3 vViewAxisY;
        varying vec3 vViewAxisZ;
        ` +
        shader.vertexShader;

      shader.vertexShader = shader.vertexShader.replace(
        '#include <beginnormal_vertex>',
        `
        #include <beginnormal_vertex>
        vec2 wp2 = position.xz;
        float eps = 0.03;
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
        vWaterXZ = position.xz;
        vViewAxisX = normalize((modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
        vViewAxisY = normalize((modelViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
        vViewAxisZ = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
        `,
      );

      shader.fragmentShader =
        waveFnGlsl +
        `
        varying vec2 vWaterXZ;
        varying vec3 vViewAxisX;
        varying vec3 vViewAxisY;
        varying vec3 vViewAxisZ;
        ` +
        shader.fragmentShader;

      // Analityczna normalna per-pixel całkowicie eliminuje widoczne krawędzie trójkątów
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        `
        #include <normal_fragment_maps>
        float fEps = 0.018;
        float fhC = evalWave(vWaterXZ, uTime);
        float fhX = evalWave(vWaterXZ + vec2(fEps, 0.0), uTime);
        float fhZ = evalWave(vWaterXZ + vec2(0.0, fEps), uTime);
        vec3 smoothWorldN = normalize(vec3(fhC - fhX, fEps, fhC - fhZ));
        normal = normalize(
          vViewAxisX * smoothWorldN.x +
          vViewAxisY * smoothWorldN.y +
          vViewAxisZ * smoothWorldN.z
        );
        `,
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <clearcoat_normal_fragment_maps>',
        `
        #include <clearcoat_normal_fragment_maps>
        #ifdef USE_CLEARCOAT
        clearcoatNormal = normal;
        #endif
        `,
      );

      // Srebrzysto-złoty połysk na grzbietach fal + świetlisty kilwater wzdłuż rozchodzących się zmarszczek
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `
        #include <emissivemap_fragment>
        float crestSlope = clamp(length(vec2(fhC - fhX, fhC - fhZ)) / fEps, 0.0, 1.0);
        float crestPeak = smoothstep(0.008, 0.042, fhC);
        float glint = pow(crestSlope, 1.65) * (0.35 + 0.65 * crestPeak);
        vec3 silverGold = mix(vec3(0.45, 0.54, 0.72), vec3(0.96, 0.75, 0.34), crestPeak);
        float wakeLum = evalWakeGlow(vWaterXZ, uTime);
        vec3 wakeColor = vec3(0.86, 0.72, 0.42);
        totalEmissiveRadiance += silverGold * glint * 0.24 + wakeColor * wakeLum * 0.22;
        `,
      );
    };

    this.waterMesh = new THREE.Mesh(geo, mat);
    this.waterMesh.position.y = 0.0;
    this.waterMesh.renderOrder = 10;
    this.scene.add(this.waterMesh);
  }

  private createGlassOverlay(): void {
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
          float streak = exp(-pow((p.x * 0.85 + p.y * 0.52 - 0.06) * 14.0, 2.0)) * 0.025;
          float edgeVignette = smoothstep(0.22, 0.52, length(p));
          float alpha = streak + edgeVignette * 0.16;
          vec3 col = mix(vec3(0.0), vec3(0.75, 0.84, 0.98), streak * 14.0);
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });

    const glassMesh = new THREE.Mesh(glassGeo, glassMat);
    glassMesh.position.y = 0.95;
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

    // Skala dopasowana do o 50% dłuższego grotu (długość lokalna ~2.92 jednostki)
    const effectiveHalfW = Math.min(this.halfW, this.halfH * 0.72);
    this.arrowScale = THREE.MathUtils.clamp(effectiveHalfW * 0.44, 0.58, 1.32);
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

    const snap = this.getSnapshot();
    this.arrowAngleRad = -THREE.MathUtils.degToRad(snap.relativeAngleDeg);
    this.arrowOmega = 0;
    this.arrowX = 0;
    this.arrowZ = 0;
    this.arrowVx = 0;
    this.arrowVz = 0;
    this.arrowY = SURFACE_Y_ARROW;
    this.arrowRig.group.position.set(this.arrowX, this.arrowY, this.arrowZ);
    this.arrowRig.group.rotation.set(0, this.arrowAngleRad, 0);
    this.arrowRig.light.intensity = 4.8;

    this.spawnSurfaceOrbImmediately();
    this.nextOrbSpawnTime = this.elapsed + 4.4;

    this.onMotion();
    const nowPerf = performance.now();
    this.lastHandledShakeTime = nowPerf;
    this.lastTapResetShakeTime = nowPerf;
    this.tapRefHeadingDeg = snap.compassHeadingDeg;
    this.seekTapCount = 0;
    this.seekMaxTaps = 3 + Math.floor(Math.random() * 2);
    this.lockMaxTaps = 3 + Math.floor(Math.random() * 2);
    this.seekSettled = false;
    this.nextSeekTapTime = this.elapsed + 0.25;
    this.addRipple(0, 0, 1.45);
    soundEngine.playSplash(0.8);
  }

  public triggerWakeSplash(): void {
    const nowPerf = performance.now();
    if (nowPerf < this.scaredUntil) return;
    this.waitingMotionAfterScare = false;
    this.onMotion();
    this.lastHandledShakeTime = nowPerf;
    this.lastTapResetShakeTime = nowPerf;
    this.tapRefHeadingDeg = this.getSnapshot().compassHeadingDeg;
    this.seekTapCount = 0;
    this.seekMaxTaps = 3 + Math.floor(Math.random() * 2);
    this.lockMaxTaps = 3 + Math.floor(Math.random() * 2);
    this.seekSettled = false;
    this.nextSeekTapTime = this.elapsed + 0.18;
    const wasSleeping = this.phase === 'sleeping' || this.phase === 'scared';
    if (wasSleeping) {
      this.phase = 'seeking';
      soundEngine.stopAbyssMurmur();
      this.arrowY = Math.max(this.arrowY, -0.3);
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

    _raycaster.setFromCamera(_pointer, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const waterHit = new THREE.Vector3();
    _raycaster.ray.intersectPlane(plane, waterHit);

    const hit = this.raycastInteractive(e.clientX, e.clientY);
    const nowPerf = performance.now();

    if (hit === 'dragonEye' && this.dragonEye && this.dragonEye.state !== 'fleeing') {
      if (nowPerf - this.dragonEye.lastTapTime < 420) {
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

    // Dotyk pustej tafli wody: powolne rozchodzące się kręgi + budzenie przy podwójnym stuknięciu
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
    this.scene.remove(orb.rig.group);
    this.orbs = this.orbs.filter((o) => o.id !== orb.id);

    if (this.dragonEye) {
      this.scene.remove(this.dragonEye.rig.group);
    }

    const rig = createDragonEye(this.renderer.capabilities.getMaxAnisotropy());
    rig.group.position.set(orb.x, Math.max(orb.y, SURFACE_Y_ORB), orb.z);
    this.scene.add(rig.group);

    this.dragonEye = {
      rig,
      x: orb.x,
      z: orb.z,
      y: Math.max(orb.y, SURFACE_Y_ORB),
      vx: orb.vx * 0.4,
      vz: orb.vz * 0.4,
      radius: 0.4,
      state: 'opening',
      openAmount: 0,
      openUntil: this.elapsed + 0.42 + 3.5,
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

    soundEngine.stopAbyssMurmur();
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
    const rig = createAbyssOrb(variant, this.renderer.capabilities.getMaxAnisotropy());

    const safeX = Math.max(0.65, this.halfW * 0.52);
    const x = (Math.random() > 0.5 ? 1 : -1) * safeX;
    const z = -Math.min(1.15, this.halfH * 0.25);
    const y = SURFACE_Y_ORB + this.evalWaterHeight(x, z, this.elapsed) * 2.4;

    rig.group.position.set(x, y, z);
    this.scene.add(rig.group);
    this.addRipple(x, z, 0.85);

    this.orbs.push({
      id: this.nextOrbId++,
      rig,
      x,
      z,
      y,
      vx: THREE.MathUtils.randFloat(-0.22, 0.22),
      vz: THREE.MathUtils.randFloat(-0.22, 0.22),
      rotY: Math.random() * Math.PI * 2,
      rotVelY: THREE.MathUtils.randFloat(-0.4, 0.4),
      radius: 0.31,
      lastBumpSound: 0,
      state: 'floating',
      tappedGlass: true,
      spawnTime: this.elapsed,
      floatUntil: this.elapsed + 11.0,
      bobPhase: Math.random() * Math.PI * 2,
    });
  }

  private spawnRandomOrb(): void {
    const variants: OrbVariant[] = ['emerald', 'amber', 'ruby'];
    const variant = variants[Math.floor(Math.random() * variants.length)];
    const rig = createAbyssOrb(variant, this.renderer.capabilities.getMaxAnisotropy());

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
      vx: THREE.MathUtils.randFloat(-0.28, 0.28),
      vz: THREE.MathUtils.randFloat(-0.28, 0.28),
      rotY: Math.random() * Math.PI * 2,
      rotVelY: THREE.MathUtils.randFloat(-0.5, 0.5),
      radius: 0.31,
      lastBumpSound: 0,
      state: 'rising',
      tappedGlass: false,
      spawnTime: this.elapsed,
      floatUntil: this.elapsed + THREE.MathUtils.randFloat(8.5, 12.5),
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
    const marginX = Math.max(0.45, this.halfW - 0.16);
    const topLimit = Math.max(0.55, this.halfH - 0.48);
    const botLimit = Math.max(0.55, this.halfH - 0.24);

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

    // Odległość od środka grotu (z=0) do czubka ostrza (z=-1.46)
    const tipDist = 1.46 * this.arrowScale;
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

    if (nowPerf < this.scaredUntil) {
      this.phase = 'scared';
      this.arrowY = THREE.MathUtils.damp(this.arrowY, -4.4, 9, dt);
      this.arrowGlow = THREE.MathUtils.damp(this.arrowGlow, 0, 10, dt);
      this.arrowRig.group.position.set(this.arrowX, this.arrowY, this.arrowZ);
      this.arrowRig.light.intensity = 0;
      return;
    }

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

    // Wybudzenie potrząśnięciem po 15s uśpienia
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

    // Usypianie po 15 sekundach bezruchu
    const idleMs = nowPerf - snapshot.lastMotionTime;
    if (idleMs >= SLEEP_TIMEOUT_MS) {
      if (this.phase !== 'sleeping') {
        this.phase = 'sleeping';
        soundEngine.startAbyssMurmur();
      }
      this.arrowY = THREE.MathUtils.damp(this.arrowY, -3.6, 1.0, dt);
      this.arrowGlow = THREE.MathUtils.damp(this.arrowGlow, 0, 3, dt);
      this.arrowRig.group.position.set(this.arrowX, this.arrowY, this.arrowZ);
      this.arrowRig.light.intensity = THREE.MathUtils.damp(
        this.arrowRig.light.intensity,
        0,
        2.2,
        dt,
      );
      return;
    }

    soundEngine.stopAbyssMurmur();

    // Kontrola wypoziomowania (beta lub gamma > 25°)
    if (!snapshot.isFlat) {
      this.phase = 'tilted';
      const botZ = Math.max(0.25, this.halfH - 1.38 * this.arrowScale - 0.2);
      const ax = (0 - this.arrowX) * 8.5;
      const az = (botZ - this.arrowZ) * 8.5;
      this.arrowVx = (this.arrowVx + ax * dt) * Math.exp(-3.8 * dt);
      this.arrowVz = (this.arrowVz + az * dt) * Math.exp(-3.8 * dt);
      this.arrowX += this.arrowVx * dt;
      this.arrowZ += this.arrowVz * dt;
      this.arrowY = THREE.MathUtils.damp(this.arrowY, SURFACE_Y_ARROW - 0.14, 3.5, dt);
      this.arrowGlow = THREE.MathUtils.damp(this.arrowGlow, 0, 4, dt);

      const targetRot = Math.PI;
      const diff = Math.atan2(
        Math.sin(targetRot - this.arrowAngleRad),
        Math.cos(targetRot - this.arrowAngleRad),
      );
      this.arrowOmega += diff * 8.0 * dt;
      this.arrowOmega *= Math.exp(-3.8 * dt);
      this.arrowAngleRad += this.arrowOmega * dt;

      this.arrowRig.group.rotation.set(-0.16, this.arrowAngleRad, 0);
      this.arrowRig.group.position.set(this.arrowX, this.arrowY, this.arrowZ);
      this.arrowRig.light.intensity = 2.6;
      return;
    }

    if (this.phase === 'sleeping' || this.phase === 'tilted') {
      this.phase = 'seeking';
    }

    // Reset licznika 3–4 uderzeń wyłącznie po wyraźnym obrocie (> 20°) lub potrząśnięciu
    const headingShift = Math.abs(
      normalizeSignedAngle(snapshot.compassHeadingDeg - this.tapRefHeadingDeg),
    );
    if (
      snapshot.lastShakeTime > this.lastTapResetShakeTime ||
      headingShift > 20
    ) {
      this.seekTapCount = 0;
      this.seekMaxTaps = 3 + Math.floor(Math.random() * 2);
      this.lockMaxTaps = 3 + Math.floor(Math.random() * 2);
      this.seekSettled = false;
      this.tapRefHeadingDeg = snapshot.compassHeadingDeg;
      this.lastTapResetShakeTime = snapshot.lastShakeTime;
      this.nextSeekTapTime = this.elapsed + 0.14;
    }

    const relDeg = snapshot.relativeAngleDeg;
    const absRel = Math.abs(relDeg);

    if (this.phase === 'locked' || this.phase === 'locking') {
      if (absRel > 10) {
        this.phase = 'seeking';
      }
    } else if (absRel <= 7) {
      if (this.seekSettled) {
        // Po wcześniejszym uspokojeniu bez obrotu > 20° grot płynnie przechodzi w spokojne wskazanie Zamku
        this.phase = 'locked';
        soundEngine.playMagicGlow();
      } else {
        this.phase = 'locking';
        this.lockTapCount = 0;
        this.nextLockTapTime = this.elapsed + 0.16;
      }
    } else {
      this.phase = 'seeking';
    }

    // Duża bezwładność obrotowa w gęstej cieczy
    const desiredRotY = -THREE.MathUtils.degToRad(relDeg);
    const rotDelta = Math.atan2(
      Math.sin(desiredRotY - this.arrowAngleRad),
      Math.cos(desiredRotY - this.arrowAngleRad),
    );
    this.arrowOmega += rotDelta * 14.5 * dt;
    this.arrowOmega *= Math.exp(-5.0 * dt);
    this.arrowAngleRad += this.arrowOmega * dt;

    const dirX = Math.sin(-this.arrowAngleRad);
    const dirZ = -Math.cos(-this.arrowAngleRad);
    const { anchorX, anchorZ, tipX, tipZ } = this.computeEdgeAnchor(dirX, dirZ);

    const waveH = this.evalWaterHeight(this.arrowX, this.arrowZ, this.elapsed);
    let targetX = anchorX;
    let targetZ = anchorZ;
    let targetY = SURFACE_Y_ARROW + waveH * 0.58;
    let targetGlow = 0;

    if (this.phase === 'seeking') {
      const pullBack = this.seekSettled ? 0.22 : 0.28;
      targetX = anchorX - dirX * pullBack;
      targetZ = anchorZ - dirZ * pullBack;

      if (
        !this.seekSettled &&
        this.seekTapCount < this.seekMaxTaps &&
        this.elapsed >= this.nextSeekTapTime
      ) {
        this.seekTapCount += 1;
        this.nextSeekTapTime =
          this.elapsed + THREE.MathUtils.randFloat(0.62, 0.92);
        // Impuls pędu ku ściance szkła
        this.arrowVx += dirX * 1.95;
        this.arrowVz += dirZ * 1.95;
        soundEngine.playGlassTap(0.62 + Math.random() * 0.24);
        safeVibrate(35);
        this.addRipple(tipX, tipZ, 0.78);

        if (this.seekTapCount >= this.seekMaxTaps) {
          this.seekSettled = true;
          this.tapRefHeadingDeg = snapshot.compassHeadingDeg;
        }
      }

      const sway = Math.sin(this.elapsed * 0.9) * (this.seekSettled ? 0.025 : 0.065);
      const perpX = -dirZ;
      const perpZ = dirX;
      targetX += perpX * sway;
      targetZ += perpZ * sway;

      const springK = this.seekSettled ? 8.5 : 14.0;
      const accelX = (targetX - this.arrowX) * springK;
      const accelZ = (targetZ - this.arrowZ) * springK;
      this.arrowVx = (this.arrowVx + accelX * dt) * Math.exp(-4.8 * dt);
      this.arrowVz = (this.arrowVz + accelZ * dt) * Math.exp(-4.8 * dt);
      this.arrowX += this.arrowVx * dt;
      this.arrowZ += this.arrowVz * dt;
    } else if (this.phase === 'locking') {
      // Maksymalnie 3 lub 4 dostojne uderzenia w górną krawędź, po czym pełne wyciszenie
      const topAnchor = this.computeEdgeAnchor(0, -1);
      const pullBack = 0.24;
      targetX = topAnchor.anchorX;
      targetZ = topAnchor.anchorZ + pullBack;

      if (this.elapsed >= this.nextLockTapTime && this.lockTapCount < this.lockMaxTaps) {
        this.lockTapCount += 1;
        this.nextLockTapTime = this.elapsed + 0.29;
        this.arrowVz -= 1.85;
        soundEngine.playGlassTap(0.88);
        safeVibrate(32);
        this.addRipple(topAnchor.tipX, topAnchor.tipZ, 0.98);

        if (this.lockTapCount >= this.lockMaxTaps) {
          this.phase = 'locked';
          this.seekSettled = true;
          this.tapRefHeadingDeg = snapshot.compassHeadingDeg;
          soundEngine.playMagicGlow();
        }
      }

      const accelX = (targetX - this.arrowX) * 16.0;
      const accelZ = (targetZ - this.arrowZ) * 16.0;
      this.arrowVx = (this.arrowVx + accelX * dt) * Math.exp(-4.8 * dt);
      this.arrowVz = (this.arrowVz + accelZ * dt) * Math.exp(-4.8 * dt);
      this.arrowX += this.arrowVx * dt;
      this.arrowZ += this.arrowVz * dt;
      targetGlow = 0.55;
    } else if (this.phase === 'locked') {
      targetX = 0;
      targetZ = -Math.min(0.28, this.halfH * 0.08);
      targetY = SURFACE_Y_ARROW + 0.022 + waveH * 0.58;
      targetGlow = 1.0;

      const accelX = (targetX - this.arrowX) * 9.5;
      const accelZ = (targetZ - this.arrowZ) * 9.5;
      this.arrowVx = (this.arrowVx + accelX * dt) * Math.exp(-4.8 * dt);
      this.arrowVz = (this.arrowVz + accelZ * dt) * Math.exp(-4.8 * dt);
      this.arrowX += this.arrowVx * dt;
      this.arrowZ += this.arrowVz * dt;
    }

    // Subtelny świetlisty kilwater na boki podczas płynięcia lub obracania się grotu
    const speed = Math.hypot(this.arrowVx, this.arrowVz);
    const absOmega = Math.abs(this.arrowOmega);
    if ((speed > 0.14 || absOmega > 0.22) && this.elapsed >= this.nextWakeTime) {
      this.wakeSide *= -1;
      const perpX = -dirZ;
      const perpZ = dirX;
      const wakeX =
        this.arrowX -
        dirX * 0.34 * this.arrowScale +
        perpX * this.wakeSide * 0.28 * this.arrowScale;
      const wakeZ =
        this.arrowZ -
        dirZ * 0.34 * this.arrowScale +
        perpZ * this.wakeSide * 0.28 * this.arrowScale;
      const wakeStrength = THREE.MathUtils.clamp(
        0.38 + speed * 0.22 + absOmega * 0.16,
        0.38,
        0.65,
      );
      this.addRipple(wakeX, wakeZ, wakeStrength);
      this.nextWakeTime = this.elapsed + 0.14;
    }

    this.arrowY = THREE.MathUtils.damp(this.arrowY, targetY, 4.5, dt);
    this.arrowGlow = THREE.MathUtils.damp(this.arrowGlow, targetGlow, 3.5, dt);

    // Majestatyczne kołysanie na falach podczas obrotu i płynięcia
    const roll =
      Math.sin(this.elapsed * 0.95) * 0.04 +
      THREE.MathUtils.clamp(-this.arrowOmega * 0.08, -0.14, 0.14);
    const pitch = Math.cos(this.elapsed * 0.75) * 0.03;

    this.arrowRig.group.position.set(this.arrowX, this.arrowY, this.arrowZ);
    this.arrowRig.group.rotation.set(pitch, this.arrowAngleRad, roll);

    const pulse = 1 + Math.sin(this.elapsed * 2.8) * 0.1 * this.arrowGlow;
    this.arrowRig.amberMat.emissiveIntensity =
      (0.75 + this.arrowGlow * 1.4) * pulse;
    this.arrowRig.coreMat.emissiveIntensity =
      (2.0 + this.arrowGlow * 2.2) * pulse;
    this.arrowRig.goldMat.emissiveIntensity = 0.55 + this.arrowGlow * 0.85;
    this.arrowRig.light.intensity = (4.8 + this.arrowGlow * 3.6) * pulse;
  }

  /**
   * Fizyka kolizji i sprężystego odbijania się kul, Smoczego Oka oraz kutego grotu strzały.
   * Zapewnia brak przenikania się obiektów.
   */
  private resolveCollisions(dt: number): void {
    const activeBodies: Array<{
      kind: 'orb' | 'eye';
      obj: ActiveOrb | ActiveDragonEye;
      radius: number;
    }> = [];

    for (const orb of this.orbs) {
      if (orb.y > -0.55 && orb.state !== 'sinking') {
        activeBodies.push({ kind: 'orb', obj: orb, radius: orb.radius });
      }
    }
    if (
      this.dragonEye &&
      this.dragonEye.y > -0.55 &&
      this.dragonEye.state !== 'fleeing'
    ) {
      activeBodies.push({
        kind: 'eye',
        obj: this.dragonEye,
        radius: this.dragonEye.radius,
      });
    }

    // 1. Kolizje kula ↔ kula oraz kula ↔ Smocze Oko
    for (let i = 0; i < activeBodies.length; i++) {
      for (let j = i + 1; j < activeBodies.length; j++) {
        const A = activeBodies[i];
        const B = activeBodies[j];
        const dx = B.obj.x - A.obj.x;
        const dz = B.obj.z - A.obj.z;
        const dist = Math.hypot(dx, dz);
        const minDist = A.radius + B.radius;

        if (dist < minDist) {
          const nx = dist > 1e-4 ? dx / dist : 1;
          const nz = dist > 1e-4 ? dz / dist : 0;
          const overlap = minDist - dist;

          A.obj.x -= nx * overlap * 0.5;
          A.obj.z -= nz * overlap * 0.5;
          B.obj.x += nx * overlap * 0.5;
          B.obj.z += nz * overlap * 0.5;

          const rvx = B.obj.vx - A.obj.vx;
          const rvz = B.obj.vz - A.obj.vz;
          const velAlongNormal = rvx * nx + rvz * nz;

          if (velAlongNormal < 0) {
            const restitution = 0.84;
            const impulse = -(1 + restitution) * velAlongNormal * 0.5;
            A.obj.vx -= impulse * nx;
            A.obj.vz -= impulse * nz;
            B.obj.vx += impulse * nx;
            B.obj.vz += impulse * nz;

            // Lekki obrót po odbiciu
            const tang = rvx * -nz + rvz * nx;
            if (A.kind === 'orb') (A.obj as ActiveOrb).rotVelY += tang * 1.4;
            if (B.kind === 'orb') (B.obj as ActiveOrb).rotVelY -= tang * 1.4;

            if (Math.abs(velAlongNormal) > 0.14) {
              this.addRipple((A.obj.x + B.obj.x) * 0.5, (A.obj.z + B.obj.z) * 0.5, 0.55);
              soundEngine.playOrbTap();
            }
          }
        }
      }
    }

    // 2. Kolizje kul / oka z historycznym grotem strzały (segment grot–tuleja)
    if (this.activated && this.arrowY > -0.6 && this.phase !== 'sleeping' && this.phase !== 'scared') {
      const dirX = Math.sin(-this.arrowAngleRad);
      const dirZ = -Math.cos(-this.arrowAngleRad);
      const tipX = this.arrowX + dirX * 1.36 * this.arrowScale;
      const tipZ = this.arrowZ + dirZ * 1.36 * this.arrowScale;
      const tailX = this.arrowX - dirX * 1.36 * this.arrowScale;
      const tailZ = this.arrowZ - dirZ * 1.36 * this.arrowScale;

      const segX = tipX - tailX;
      const segZ = tipZ - tailZ;
      const segLenSq = segX * segX + segZ * segZ;

      for (const body of activeBodies) {
        const px = body.obj.x - tailX;
        const pz = body.obj.z - tailZ;
        const t =
          segLenSq > 1e-5
            ? THREE.MathUtils.clamp((px * segX + pz * segZ) / segLenSq, 0, 1)
            : 0.5;
        const closestX = tailX + segX * t;
        const closestZ = tailZ + segZ * t;

        // Szerszy promień kolizji przy zadziorach ostrza (t ~ 0.45..0.75)
        const bladeFactor = t > 0.4 && t < 0.8 ? 0.34 : 0.18;
        const arrowHullRadius = bladeFactor * this.arrowScale;
        const minDist = body.radius + arrowHullRadius;

        const dx = body.obj.x - closestX;
        const dz = body.obj.z - closestZ;
        const dist = Math.hypot(dx, dz);

        if (dist < minDist) {
          const nx = dist > 1e-4 ? dx / dist : -dirZ;
          const nz = dist > 1e-4 ? dz / dist : dirX;
          const overlap = minDist - dist;

          body.obj.x += nx * overlap;
          body.obj.z += nz * overlap;

          const relVx = body.obj.vx - this.arrowVx;
          const relVz = body.obj.vz - this.arrowVz;
          const vn = relVx * nx + relVz * nz;

          if (vn < 0) {
            const restitution = 0.86;
            const j = -(1 + restitution) * vn;
            body.obj.vx += j * nx;
            body.obj.vz += j * nz;

            if (body.kind === 'orb') {
              const orb = body.obj as ActiveOrb;
              orb.rotVelY += (relVx * -nz + relVz * nx) * 2.1;
              if (this.elapsed - orb.lastBumpSound > 0.32 && Math.abs(vn) > 0.12) {
                orb.lastBumpSound = this.elapsed;
                this.addRipple(closestX, closestZ, 0.62);
                soundEngine.playOrbTap();
              }
            }
          }
        }
      }
    }

    // 3. Odbijanie kul od szklanych ścian pojemnika
    const boundX = Math.max(0.45, this.halfW - 0.38);
    const topBound = Math.max(0.45, this.halfH - 0.72);
    const botBound = Math.max(0.45, this.halfH - 0.52);

    for (const body of activeBodies) {
      if (body.obj.x < -boundX) {
        body.obj.x = -boundX;
        body.obj.vx = Math.abs(body.obj.vx) * 0.85;
      } else if (body.obj.x > boundX) {
        body.obj.x = boundX;
        body.obj.vx = -Math.abs(body.obj.vx) * 0.85;
      }

      if (body.obj.z < -topBound) {
        body.obj.z = -topBound;
        body.obj.vz = Math.abs(body.obj.vz) * 0.85;
      } else if (body.obj.z > botBound) {
        body.obj.z = botBound;
        body.obj.vz = -Math.abs(body.obj.vz) * 0.85;
      }

      // Opór gęstej cieczy dla kul
      body.obj.vx *= Math.exp(-0.45 * dt);
      body.obj.vz *= Math.exp(-0.45 * dt);
    }
  }

  private updateOrbsAndDragonEye(dt: number, snapshot: SensorSnapshot): void {
    const nowPerf = performance.now();
    const isScared = nowPerf < this.scaredUntil || this.waitingMotionAfterScare;
    const isAsleep = this.phase === 'sleeping';

    // Spawn nowych kul co kilka sekund (maks. 3 naraz dla ciekawych kolizji)
    if (
      this.activated &&
      !isScared &&
      !isAsleep &&
      !this.dragonEye &&
      this.orbs.length < 3 &&
      this.elapsed >= this.nextOrbSpawnTime
    ) {
      this.spawnRandomOrb();
      this.nextOrbSpawnTime = this.elapsed + THREE.MathUtils.randFloat(3.8, 6.2);
    }

    const eps = 0.06;
    const remainingOrbs: ActiveOrb[] = [];

    for (const orb of this.orbs) {
      if (isScared || isAsleep) {
        orb.state = 'sinking';
      }

      // Płynięcie na powierzchni i kołysanie na falach
      const waveH = this.evalWaterHeight(orb.x, orb.z, this.elapsed);
      const hx = this.evalWaterHeight(orb.x + eps, orb.z, this.elapsed);
      const hz = this.evalWaterHeight(orb.x, orb.z + eps, this.elapsed);

      // Delikatne popychanie kul przez nachylenie fal
      if (orb.state === 'floating') {
        orb.vx += ((waveH - hx) / eps) * 0.14 * dt;
        orb.vz += ((waveH - hz) / eps) * 0.14 * dt;
        orb.x += orb.vx * dt;
        orb.z += orb.vz * dt;
        orb.rotY += orb.rotVelY * dt;
        orb.rotVelY *= Math.exp(-0.7 * dt);
      }

      if (orb.state === 'rising') {
        const targetSurfY = SURFACE_Y_ORB + waveH * 2.5;
        orb.y = THREE.MathUtils.damp(orb.y, targetSurfY, 2.2, dt);
        if (orb.y >= targetSurfY - 0.12 && !orb.tappedGlass) {
          orb.tappedGlass = true;
          orb.state = 'floating';
          this.addRipple(orb.x, orb.z, 0.75);
          soundEngine.playOrbTap();
          safeVibrate(20);
        }
      } else if (orb.state === 'floating') {
        // Bezpośrednie powiązanie wysokości zanurzenia kuli z wysokością fali wody w punkcie (x, z)
        const targetWaveY = SURFACE_Y_ORB + waveH * 2.6;
        orb.y = THREE.MathUtils.damp(orb.y, targetWaveY, 9.0, dt);
        if (this.elapsed >= orb.floatUntil) {
          orb.state = 'sinking';
        }
      } else {
        const sinkSpeed = isScared ? 8.5 : 1.05;
        orb.y = THREE.MathUtils.damp(orb.y, -3.7, sinkSpeed, dt);
      }

      orb.rig.group.position.set(orb.x, orb.y, orb.z);
      // Kołysanie kul zgodnie z nachyleniem fali oraz obrót po odbiciach
      const tiltX = ((hz - waveH) / eps) * 0.28;
      const tiltZ = ((waveH - hx) / eps) * 0.28;
      orb.rig.group.rotation.set(tiltX, orb.rotY, tiltZ);

      const pulse = 0.9 + Math.sin(this.elapsed * 2.6 + orb.bobPhase) * 0.1;
      orb.rig.coreMat.emissiveIntensity = 0.9 * pulse;
      orb.rig.light.intensity =
        THREE.MathUtils.clamp((orb.y + 2.5) / 2.6, 0, 1) * 1.25 * pulse;
      orb.rig.meniscusMat.opacity =
        THREE.MathUtils.clamp((orb.y + 0.35) / 0.5, 0, 1) * 0.55;

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

      const eyeWave = this.evalWaterHeight(eye.x, eye.z, this.elapsed);

      if (eye.state === 'opening') {
        eye.openAmount = Math.min(1, eye.openAmount + dt / 0.42);
        eye.y = THREE.MathUtils.damp(eye.y, SURFACE_Y_ORB + 0.14 + eyeWave * 1.8, 7, dt);
        if (eye.openAmount >= 1) {
          eye.state = 'open';
        }
      } else if (eye.state === 'open') {
        eye.openAmount = 1;
        eye.x += eye.vx * dt;
        eye.z += eye.vz * dt;
        eye.y = SURFACE_Y_ORB + 0.14 + eyeWave * 2.2;
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

      const easedOpen =
        eye.openAmount * eye.openAmount * (3 - 2 * eye.openAmount);
      eye.rig.upperLid.rotation.x = -easedOpen * 1.25;
      eye.rig.lowerLid.rotation.x = easedOpen * 1.25;

      const rad = THREE.MathUtils.degToRad(snapshot.relativeAngleDeg);
      const gazeX = Math.sin(rad) * 0.24;
      const gazeZ = -Math.cos(rad) * 0.24;
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

    // Rozwiązywanie kolizji po aktualizacji pozycji
    this.resolveCollisions(dt);
  }

  private tick = (): void => {
    if (this.disposed) return;

    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.06);
    this.elapsed += dt;
    this.waterUniforms.uTime.value = this.elapsed;

    const snapshot = this.getSnapshot();
    this.updateArrowPhysics(dt, snapshot);
    this.updateOrbsAndDragonEye(dt, snapshot);

    this.renderer.render(this.scene, this.camera);

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
