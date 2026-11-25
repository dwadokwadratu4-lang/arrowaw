import * as THREE from 'three';
import {
  createAmberVeinTexture,
  createDragonEyeTexture,
  createReptileScaleTexture,
} from './textures';

export type OrbVariant = 'emerald' | 'amber' | 'ruby';

export interface AmberArrowRig {
  group: THREE.Group;
  amberMat: THREE.MeshPhysicalMaterial;
  goldMat: THREE.MeshStandardMaterial;
  coreMat: THREE.MeshStandardMaterial;
  light: THREE.PointLight;
  tipLocalZ: number;
  tailLocalZ: number;
}

/**
 * Pomocnicza funkcja dodająca trójkąt z obliczonymi współrzędnymi UV (rzut XZ)
 * do niestandardowej geometrii fasetowanej ostrza.
 */
function pushFacetTriangle(
  positions: number[],
  uvs: number[],
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
): void {
  positions.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  uvs.push(
    a[0] * 0.9 + 0.5,
    (a[2] + 1.5) * 0.35,
    b[0] * 0.9 + 0.5,
    (b[2] + 1.5) * 0.35,
    c[0] * 0.9 + 0.5,
    (c[2] + 1.5) * 0.35,
  );
}

/**
 * Buduje o 50% dłuższy, trójwymiarowy model historycznego kutego grotu strzały/bełtu:
 * - Stożkowata tuleja (ok. 60% długości) zwężająca się płynnie w wąską szyjkę,
 * - Ostre liściaste ostrze z centralnym żebrem i dwoma ostrymi zadziorami (skrzydełkami) w dół.
 * Całkowita długość w układzie lokalnym: z = -1.46 (grot) do z = +1.46 (tuleja).
 */
export function createAmberArrow(
  isSoftwareGl: boolean,
  maxAnisotropy: number,
): AmberArrowRig {
  const group = new THREE.Group();
  const { map, roughnessMap, bumpMap } = createAmberVeinTexture(maxAnisotropy);

  // Jasny fosforyzujący bursztyn ze złotym połyskiem i delikatną fakturą kutego rzemiosła
  const amberMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffbe38'),
    map,
    roughnessMap,
    bumpMap,
    bumpScale: 0.018,
    roughness: 0.2,
    metalness: 0.22,
    emissive: new THREE.Color(0xff9900),
    emissiveIntensity: 0.75,
    clearcoat: 0.95,
    clearcoatRoughness: 0.12,
    transparent: false,
    iridescence: isSoftwareGl ? 0 : 0.22,
    ior: 1.55,
  });

  const goldMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffe07d'),
    bumpMap,
    bumpScale: 0.01,
    metalness: 0.9,
    roughness: 0.2,
    emissive: new THREE.Color('#ffb703'),
    emissiveIntensity: 0.55,
  });

  const coreMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#fffbeb'),
    emissive: new THREE.Color('#ffd166'),
    emissiveIntensity: 2.0,
    roughness: 0.1,
    metalness: 0.15,
  });

  // 1. STOŻKOWATA TULEJA (TRZON) — ok. 60% długości (z = +1.46 do szyjki z = -0.26)
  // Po rotateX(-PI/2) oś +Y staje się kierunkiem -Z (do przodu).
  const lathePts: THREE.Vector2[] = [
    new THREE.Vector2(0.088, -1.46), // wewnętrzne wyżłobienie tulei na dole
    new THREE.Vector2(0.152, -1.46), // krawędź podstawy tulei
    new THREE.Vector2(0.165, -1.41), // kuty pierścień u nasady
    new THREE.Vector2(0.146, -1.34),
    new THREE.Vector2(0.128, -1.10),
    new THREE.Vector2(0.106, -0.78),
    new THREE.Vector2(0.082, -0.42),
    new THREE.Vector2(0.058, -0.05),
    new THREE.Vector2(0.044, 0.16), // wąska szyjka tuż przed ostrzem
    new THREE.Vector2(0.058, 0.27), // przejście w nasadę ostrza
    new THREE.Vector2(0.0, 0.30),
  ];
  const socketGeo = new THREE.LatheGeometry(lathePts, 36);
  socketGeo.rotateX(-Math.PI / 2);
  socketGeo.computeVertexNormals();
  const socketMesh = new THREE.Mesh(socketGeo, amberMat);
  group.add(socketMesh);

  // Złoty kuty kołnierz na końcu tulei i pierścień przy szyjce
  const baseCollarGeo = new THREE.TorusGeometry(0.156, 0.017, 12, 32);
  const baseCollar = new THREE.Mesh(baseCollarGeo, goldMat);
  baseCollar.position.set(0, 0, 1.40);
  group.add(baseCollar);

  const neckCollarGeo = new THREE.TorusGeometry(0.054, 0.013, 10, 24);
  const neckCollar = new THREE.Mesh(neckCollarGeo, goldMat);
  neckCollar.position.set(0, 0, -0.18);
  group.add(neckCollar);

  // 2. OSTRE LIŚCIASTE OSTRZE Z CENTRALNYM ŻEBREM I DWOMA ZADZIORAMI (z = -0.22 do -1.46)
  const T: readonly [number, number, number] = [0, 0.012, -1.46]; // ostry czubek
  const U1: readonly [number, number, number] = [0, 0.145, -0.82]; // górny grzbiet żebra
  const U0: readonly [number, number, number] = [0, 0.11, -0.22]; // podstawa górnego żebra
  const L1: readonly [number, number, number] = [0, -0.095, -0.82]; // dolny grzbiet żebra
  const L0: readonly [number, number, number] = [0, -0.075, -0.22]; // podstawa dolnego żebra

  const ML: readonly [number, number, number] = [-0.26, 0.01, -0.62]; // lewa krawędź liścia
  const MR: readonly [number, number, number] = [0.26, 0.01, -0.62]; // prawa krawędź liścia
  const BL: readonly [number, number, number] = [-0.41, 0.0, 0.08]; // lewy zadzior w dół
  const BR: readonly [number, number, number] = [0.41, 0.0, 0.08]; // prawy zadzior w dół
  const NL: readonly [number, number, number] = [-0.068, 0.01, -0.26]; // wcięcie lewego zadziora przy szyjce
  const NR: readonly [number, number, number] = [0.068, 0.01, -0.26]; // wcięcie prawego zadziora przy szyjce

  const bladePos: number[] = [];
  const bladeUvs: number[] = [];

  // Górne połacie ostrza (lewa strona żebra)
  pushFacetTriangle(bladePos, bladeUvs, T, ML, U1);
  pushFacetTriangle(bladePos, bladeUvs, U1, ML, U0);
  pushFacetTriangle(bladePos, bladeUvs, U0, ML, BL);
  pushFacetTriangle(bladePos, bladeUvs, U0, BL, NL);

  // Górne połacie ostrza (prawa strona żebra)
  pushFacetTriangle(bladePos, bladeUvs, T, U1, MR);
  pushFacetTriangle(bladePos, bladeUvs, U1, U0, MR);
  pushFacetTriangle(bladePos, bladeUvs, U0, BR, MR);
  pushFacetTriangle(bladePos, bladeUvs, U0, NR, BR);

  // Dolne połacie ostrza (lewa strona)
  pushFacetTriangle(bladePos, bladeUvs, T, L1, ML);
  pushFacetTriangle(bladePos, bladeUvs, L1, L0, ML);
  pushFacetTriangle(bladePos, bladeUvs, L0, BL, ML);
  pushFacetTriangle(bladePos, bladeUvs, L0, NL, BL);

  // Dolne połacie ostrza (prawa strona)
  pushFacetTriangle(bladePos, bladeUvs, T, MR, L1);
  pushFacetTriangle(bladePos, bladeUvs, L1, MR, L0);
  pushFacetTriangle(bladePos, bladeUvs, L0, MR, BR);
  pushFacetTriangle(bladePos, bladeUvs, L0, BR, NR);

  // Zamknięcie tylnej nasady ostrza przy szyjce
  pushFacetTriangle(bladePos, bladeUvs, U0, NL, L0);
  pushFacetTriangle(bladePos, bladeUvs, U0, L0, NR);

  const bladeGeo = new THREE.BufferGeometry();
  bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute(bladePos, 3));
  bladeGeo.setAttribute('uv', new THREE.Float32BufferAttribute(bladeUvs, 2));
  bladeGeo.computeVertexNormals();
  const bladeMesh = new THREE.Mesh(bladeGeo, amberMat);
  group.add(bladeMesh);

  // 3. Wyraźne złote żebro grzbietowe pośrodku ostrza + złote krawędzie zadziorów
  const ridgeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.11, -0.22),
    new THREE.Vector3(0, 0.148, -0.82),
    new THREE.Vector3(0, 0.018, -1.46),
  ]);
  const ridgeGeo = new THREE.TubeGeometry(ridgeCurve, 24, 0.016, 8, false);
  const ridgeMesh = new THREE.Mesh(ridgeGeo, goldMat);
  group.add(ridgeMesh);

  const edgeCurve = new THREE.CatmullRomCurve3(
    [
      new THREE.Vector3(0, 0.014, -1.46),
      new THREE.Vector3(0.26, 0.012, -0.62),
      new THREE.Vector3(0.41, 0.004, 0.08),
      new THREE.Vector3(0.068, 0.012, -0.26),
      new THREE.Vector3(-0.068, 0.012, -0.26),
      new THREE.Vector3(-0.41, 0.004, 0.08),
      new THREE.Vector3(-0.26, 0.012, -0.62),
      new THREE.Vector3(0, 0.014, -1.46),
    ],
    false,
    'catmullrom',
    0.1,
  );
  const edgeGeo = new THREE.TubeGeometry(edgeCurve, 64, 0.011, 6, false);
  const edgeMesh = new THREE.Mesh(edgeGeo, goldMat);
  group.add(edgeMesh);

  // 4. Żarzący się kryształ w nasadzie szyjki
  const coreGeo = new THREE.OctahedronGeometry(0.055, 0);
  coreGeo.scale(1, 0.85, 1.5);
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  coreMesh.position.set(0, 0.065, -0.20);
  group.add(coreMesh);

  // Mocne światło punktowe podążające tuż nad grotem
  const light = new THREE.PointLight(0xffb732, 4.8, 8.2, 1.35);
  light.position.set(0, 0.95, -0.35);
  group.add(light);

  return {
    group,
    amberMat,
    goldMat,
    coreMat,
    light,
    tipLocalZ: -1.46,
    tailLocalZ: 1.46,
  };
}

export interface AbyssOrbRig {
  group: THREE.Group;
  hitMesh: THREE.Mesh;
  coreMat: THREE.MeshStandardMaterial;
  shellMat: THREE.MeshPhysicalMaterial;
  meniscusMat: THREE.MeshBasicMaterial;
  light: THREE.PointLight;
  variant: OrbVariant;
}

const ORB_PALETTES: Record<
  OrbVariant,
  {
    core: number;
    emissive: number;
    shell: number;
    light: number;
    rgb: [number, number, number];
  }
> = {
  emerald: {
    core: 0xa7f3d0,
    emissive: 0x10b981,
    shell: 0x34d399,
    light: 0x10b981,
    rgb: [0.08, 0.82, 0.56],
  },
  amber: {
    core: 0xfef3c7,
    emissive: 0xf59e0b,
    shell: 0xfbbf24,
    light: 0xf59e0b,
    rgb: [0.98, 0.65, 0.12],
  },
  ruby: {
    core: 0xfecdd3,
    emissive: 0xe11d48,
    shell: 0xf43f5e,
    light: 0xf43f5e,
    rgb: [0.92, 0.16, 0.34],
  },
};

/**
 * Tworzy trójwymiarową fosforyzującą kulę (nieaktywne Smocze Oko) z wyraźnym światłocieniem:
 * ciemniejszy cień od spodu zanurzonego w wodzie i jasny refleks na górnej kopule.
 */
export function createAbyssOrb(
  variant: OrbVariant,
  maxAnisotropy = 4,
): AbyssOrbRig {
  const palette = ORB_PALETTES[variant];
  const group = new THREE.Group();
  const { bumpMap: scaleBump } = createReptileScaleTexture(maxAnisotropy);

  // Subtelne żarzące jądro widoczne delikatnie od strony oświetlonej kopuły
  const coreMat = new THREE.MeshStandardMaterial({
    color: palette.core,
    emissive: palette.emissive,
    emissiveIntensity: 0.85,
    roughness: 0.25,
    metalness: 0.1,
  });
  const coreMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 20, 20),
    coreMat,
  );
  coreMesh.position.set(-0.04, 0.04, -0.03);
  group.add(coreMesh);

  // Zewnętrzna kula (zamknięte Smocze Oko) z przestrzennym światłocieniem bocznym i łuskami
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: palette.shell,
    bumpMap: scaleBump,
    bumpScale: 0.016,
    emissive: palette.emissive,
    emissiveIntensity: 0.16,
    roughness: 0.15,
    metalness: 0.14,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    ior: 1.56,
  });

  const [cr, cg, cb] = palette.rgb;
  shellMat.onBeforeCompile = (shader) => {
    shader.vertexShader =
      `
      varying vec3 vWorldNorm;
      ` + shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `
      #include <beginnormal_vertex>
      vWorldNorm = normalize((modelMatrix * vec4(objectNormal, 0.0)).xyz);
      `,
    );

    shader.fragmentShader =
      `
      varying vec3 vWorldNorm;
      ` + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      // Wyraźny światłocień boczny 3D (półksiężyc głębokiego cienia z prawej-dolnej strony)
      vec3 wn = normalize(vWorldNorm);
      vec3 keyDir = normalize(vec3(-0.74, 0.54, -0.42));
      float sideLit = dot(wn, keyDir);
      float crescent = smoothstep(-0.34, 0.72, sideLit);
      float submergeShade = smoothstep(-0.35, 0.35, wn.y);
      float shade = crescent * (0.35 + 0.65 * submergeShade);

      vec3 deepShadow = vec3(0.012, 0.016, 0.028);
      vec3 jewelColor = vec3(${cr.toFixed(2)}, ${cg.toFixed(2)}, ${cb.toFixed(2)});
      // Subtelny blask krawędziowy (Fresnel) po stronie światła
      float rim = pow(clamp(1.0 - max(0.0, wn.y), 0.0, 1.0), 2.4) * crescent * 0.35;
      diffuseColor.rgb = mix(deepShadow, jewelColor * 1.12, shade) + jewelColor * rim;
      `,
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `
      #include <emissivemap_fragment>
      vec3 wne = normalize(vWorldNorm);
      float eLit = smoothstep(-0.15, 0.78, dot(wne, normalize(vec3(-0.74, 0.54, -0.42))));
      totalEmissiveRadiance *= (0.06 + 1.15 * eLit);
      `,
    );
  };

  const shellMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.30, 36, 36),
    shellMat,
  );
  group.add(shellMesh);

  // Ciemny menisk wodny na styku kuli z taflą wody
  const meniscusMat = new THREE.MeshBasicMaterial({
    color: 0x020408,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const meniscusRing = new THREE.Mesh(
    new THREE.RingGeometry(0.27, 0.36, 32),
    meniscusMat,
  );
  meniscusRing.rotation.x = -Math.PI / 2;
  meniscusRing.position.y = -0.02;
  group.add(meniscusRing);

  // Niewidoczny powiększony hitbox do wygodnego klikania palcem
  const hitMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.58, 12, 12),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false,
    }),
  );
  group.add(hitMesh);

  const light = new THREE.PointLight(palette.light, 1.25, 3.6, 1.8);
  light.position.set(-0.28, 0.42, -0.18);
  group.add(light);

  return {
    group,
    hitMesh,
    coreMat,
    shellMat,
    meniscusMat,
    light,
    variant,
  };
}

export interface DragonEyeRig {
  group: THREE.Group;
  eyeball: THREE.Mesh;
  upperLid: THREE.Group;
  lowerLid: THREE.Group;
  hitMesh: THREE.Mesh;
  light: THREE.PointLight;
  eyeMat: THREE.MeshPhysicalMaterial;
}

/**
 * Tworzy trójwymiarowe, artykułowane Smocze Oko z gadzią powieką i pionową źrenicą.
 */
export function createDragonEye(maxAnisotropy: number): DragonEyeRig {
  const group = new THREE.Group();

  const irisTex = createDragonEyeTexture(maxAnisotropy);
  const { map: scaleMap, bumpMap: scaleBump } =
    createReptileScaleTexture(maxAnisotropy);

  const eyeGeo = new THREE.SphereGeometry(0.36, 36, 36);
  eyeGeo.rotateZ(Math.PI / 2);
  eyeGeo.rotateY(-Math.PI / 2);

  const eyeMat = new THREE.MeshPhysicalMaterial({
    map: irisTex,
    emissiveMap: irisTex,
    emissive: new THREE.Color('#ff9d00'),
    emissiveIntensity: 1.65,
    roughness: 0.08,
    metalness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
  });
  const eyeball = new THREE.Mesh(eyeGeo, eyeMat);
  group.add(eyeball);

  const lidMat = new THREE.MeshStandardMaterial({
    map: scaleMap,
    bumpMap: scaleBump,
    bumpScale: 0.025,
    roughness: 0.62,
    metalness: 0.22,
  });

  const upperLid = new THREE.Group();
  const upperShellGeo = new THREE.SphereGeometry(
    0.395,
    28,
    18,
    Math.PI,
    Math.PI,
    0,
    Math.PI * 0.53,
  );
  const upperShell = new THREE.Mesh(upperShellGeo, lidMat);
  upperLid.add(upperShell);

  const upperRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.396, 0.028, 10, 28, Math.PI),
    lidMat,
  );
  upperLid.add(upperRim);
  group.add(upperLid);

  const lowerLid = new THREE.Group();
  const lowerShellGeo = new THREE.SphereGeometry(
    0.392,
    28,
    18,
    0,
    Math.PI,
    0,
    Math.PI * 0.53,
  );
  const lowerShell = new THREE.Mesh(lowerShellGeo, lidMat);
  lowerLid.add(lowerShell);

  const lowerRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.393, 0.028, 10, 28, Math.PI),
    lidMat,
  );
  lowerLid.add(lowerRim);
  group.add(lowerLid);

  const hitMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.68, 12, 12),
    new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
      colorWrite: false,
    }),
  );
  group.add(hitMesh);

  const light = new THREE.PointLight(0xff8c1a, 3.4, 5.0, 1.8);
  light.position.set(0, 0.52, 0);
  group.add(light);

  return {
    group,
    eyeball,
    upperLid,
    lowerLid,
    hitMesh,
    light,
    eyeMat,
  };
}
