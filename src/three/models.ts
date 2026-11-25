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
}

/**
 * Buduje wieloczęściową (8 elementów) trójwymiarową bursztynową strzałkę ze złotym żyłkowaniem.
 * Lokalny grot wskazuje kierunek -Z (góra ekranu w widoku z góry).
 */
export function createAmberArrow(
  isSoftwareGl: boolean,
  maxAnisotropy: number,
): AmberArrowRig {
  const group = new THREE.Group();
  const { map, roughnessMap } = createAmberVeinTexture(maxAnisotropy);

  const amberMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#ffcc4d'),
    map,
    roughnessMap,
    roughness: 0.14,
    metalness: 0.08,
    emissive: new THREE.Color(0xff9900),
    emissiveIntensity: 0.95,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    transparent: true,
    opacity: 0.96,
    iridescence: isSoftwareGl ? 0 : 0.25,
    ior: 1.54,
  });

  const goldMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffe58f'),
    metalness: 0.88,
    roughness: 0.18,
    emissive: new THREE.Color('#ffb703'),
    emissiveIntensity: 0.72,
  });

  const coreMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffffff'),
    emissive: new THREE.Color('#ffd166'),
    emissiveIntensity: 2.3,
    roughness: 0.08,
    metalness: 0.15,
  });

  // 1. Główny grot z bursztynu (ExtrudeGeometry leżący w płaszczyźnie XZ, czubek w -Z)
  const headShape = new THREE.Shape();
  headShape.moveTo(0, 0.95); // czubek (+Y w 2D -> po obrocie -X/Z)
  headShape.lineTo(0.32, 0.12);
  headShape.lineTo(0.11, 0.24);
  headShape.lineTo(0, 0.14);
  headShape.lineTo(-0.11, 0.24);
  headShape.lineTo(-0.32, 0.12);
  headShape.closePath();

  const headGeo = new THREE.ExtrudeGeometry(headShape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.045,
    bevelSize: 0.035,
    bevelSegments: 3,
  });
  headGeo.rotateX(-Math.PI / 2); // +Y 2D staje się -Z 3D!
  headGeo.translate(0, -0.07, 0);
  headGeo.computeTangents();
  const headMesh = new THREE.Mesh(headGeo, amberMat);
  group.add(headMesh);

  // 2. Trzon strzałki z bursztynu
  const shaftShape = new THREE.Shape();
  shaftShape.moveTo(0.08, 0.22);
  shaftShape.lineTo(0.065, -0.82);
  shaftShape.lineTo(0.17, -0.96);
  shaftShape.lineTo(0, -0.86);
  shaftShape.lineTo(-0.17, -0.96);
  shaftShape.lineTo(-0.065, -0.82);
  shaftShape.lineTo(-0.08, 0.22);
  shaftShape.closePath();

  const shaftGeo = new THREE.ExtrudeGeometry(shaftShape, {
    depth: 0.1,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  shaftGeo.rotateX(-Math.PI / 2);
  shaftGeo.translate(0, -0.05, 0);
  const shaftMesh = new THREE.Mesh(shaftGeo, amberMat);
  group.add(shaftMesh);

  // 3. Złoty kręgosłup / żyła osiowa
  const spineGeo = new THREE.CylinderGeometry(0.016, 0.024, 1.55, 10);
  spineGeo.rotateX(Math.PI / 2);
  const spineMesh = new THREE.Mesh(spineGeo, goldMat);
  spineMesh.position.set(0, 0.06, -0.04);
  group.add(spineMesh);

  // 4. Złote ostre okucie samego grota (to ono stuka o szybę)
  const tipCapGeo = new THREE.ConeGeometry(0.055, 0.24, 6);
  tipCapGeo.rotateX(-Math.PI / 2);
  const tipCapMesh = new THREE.Mesh(tipCapGeo, goldMat);
  tipCapMesh.position.set(0, 0.01, -0.92);
  group.add(tipCapMesh);

  // 5 & 6. Złote boczne żebra żyłkowania na grocie
  const ribGeo = new THREE.CylinderGeometry(0.01, 0.014, 0.56, 8);
  const ribL = new THREE.Mesh(ribGeo, goldMat);
  ribL.rotation.set(Math.PI / 2, 0, -0.34);
  ribL.position.set(-0.12, 0.05, -0.44);
  group.add(ribL);

  const ribR = new THREE.Mesh(ribGeo, goldMat);
  ribR.rotation.set(Math.PI / 2, 0, 0.34);
  ribR.position.set(0.12, 0.05, -0.44);
  group.add(ribR);

  // 7. Złoty pierścień oprawy kryształu
  const ringGeo = new THREE.TorusGeometry(0.11, 0.02, 10, 24);
  ringGeo.rotateX(Math.PI / 2);
  const ringMesh = new THREE.Mesh(ringGeo, goldMat);
  ringMesh.position.set(0, 0.055, -0.14);
  group.add(ringMesh);

  // 8. Żarzący się kryształ rdzenia
  const coreGeo = new THREE.OctahedronGeometry(0.085, 0);
  coreGeo.scale(1, 0.65, 1.35);
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  coreMesh.position.set(0, 0.06, -0.14);
  group.add(coreMesh);

  // Złota obwódka wokół całego grota dla maksymalnej wyrazistości na ekranach OLED
  const rimPts = [
    new THREE.Vector3(0, 0.06, -0.98),
    new THREE.Vector3(0.32, 0.06, -0.14),
    new THREE.Vector3(0.10, 0.06, -0.24),
    new THREE.Vector3(0.08, 0.06, 0.80),
    new THREE.Vector3(0.17, 0.06, 0.94),
    new THREE.Vector3(0, 0.06, 0.84),
    new THREE.Vector3(-0.17, 0.06, 0.94),
    new THREE.Vector3(-0.08, 0.06, 0.80),
    new THREE.Vector3(-0.10, 0.06, -0.24),
    new THREE.Vector3(-0.32, 0.06, -0.14),
    new THREE.Vector3(0, 0.06, -0.98),
  ];
  const rimCurve = new THREE.CatmullRomCurve3(rimPts, true, 'centripetal', 0.15);
  const rimEdgeGeo = new THREE.TubeGeometry(rimCurve, 72, 0.015, 6, true);
  const rimEdgeMesh = new THREE.Mesh(rimEdgeGeo, goldMat);
  group.add(rimEdgeMesh);

  // Mocne światło punktowe podążające tuż nad strzałką
  const light = new THREE.PointLight(0xffb732, 4.8, 7.5, 1.4);
  light.position.set(0, 0.85, -0.15);
  group.add(light);

  return {
    group,
    amberMat,
    goldMat,
    coreMat,
    light,
    tipLocalZ: -1.04,
  };
}

export interface AbyssOrbRig {
  group: THREE.Group;
  hitMesh: THREE.Mesh;
  coreMat: THREE.MeshStandardMaterial;
  shellMat: THREE.MeshPhysicalMaterial;
  haloMat: THREE.MeshBasicMaterial;
  light: THREE.PointLight;
  variant: OrbVariant;
}

const ORB_PALETTES: Record<
  OrbVariant,
  { core: number; emissive: number; shell: number; light: number }
> = {
  emerald: {
    core: 0x6ee7b7,
    emissive: 0x10b981,
    shell: 0x34d399,
    light: 0x10b981,
  },
  amber: {
    core: 0xfde68a,
    emissive: 0xf59e0b,
    shell: 0xfbbf24,
    light: 0xf59e0b,
  },
  ruby: {
    core: 0xfca5a5,
    emissive: 0xe11d48,
    shell: 0xf43f5e,
    light: 0xf43f5e,
  },
};

/**
 * Tworzy fosforyzującą kulę wypływającą z czarnej głębiny.
 */
export function createAbyssOrb(variant: OrbVariant): AbyssOrbRig {
  const palette = ORB_PALETTES[variant];
  const group = new THREE.Group();

  const coreMat = new THREE.MeshStandardMaterial({
    color: palette.core,
    emissive: palette.emissive,
    emissiveIntensity: 2.8,
    roughness: 0.18,
    metalness: 0.1,
  });
  const coreMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 24, 24),
    coreMat,
  );
  group.add(coreMesh);

  const shellMat = new THREE.MeshPhysicalMaterial({
    color: palette.shell,
    emissive: palette.emissive,
    emissiveIntensity: 0.95,
    roughness: 0.1,
    metalness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.06,
    transparent: true,
    opacity: 0.82,
  });
  const shellMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.30, 28, 28),
    shellMat,
  );
  group.add(shellMesh);

  const haloMat = new THREE.MeshBasicMaterial({
    color: palette.emissive,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const haloRing = new THREE.Mesh(
    new THREE.RingGeometry(0.28, 0.48, 32),
    haloMat,
  );
  haloRing.rotation.x = -Math.PI / 2;
  group.add(haloRing);

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

  const light = new THREE.PointLight(palette.light, 3.0, 5.0, 1.6);
  light.position.set(0, 0.45, 0);
  group.add(light);

  return {
    group,
    hitMesh,
    coreMat,
    shellMat,
    haloMat,
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

  // Gałka oczna (tęczówka skierowana w górę +Y ku użytkownikowi)
  const eyeGeo = new THREE.SphereGeometry(0.36, 36, 36);
  // Obrót geometrii tak, by środek UV (0.5, 0.5) patrzył w górę (+Y), a pionowa źrenica była pionowo na ekranie (-Z/+Z)
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

  // Górna i dolna gadzia powieka obejmujące górną półkulę (+Y), spotykające się na osi X (z = 0)
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

  // Niewidoczny hitbox dla podwójnego kliknięcia
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

  const light = new THREE.PointLight(0xff8c1a, 3.2, 4.8, 1.8);
  light.position.set(0, 0.48, 0);
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
