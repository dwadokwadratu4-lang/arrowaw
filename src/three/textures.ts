import * as THREE from 'three';

/**
 * Tworzy proceduralną teksturę bursztynu ze złotym żyłkowaniem (CanvasTexture).
 */
export function createAmberVeinTexture(maxAnisotropy = 4): {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  // Głęboki bursztynowy gradient bazowy
  const grad = ctx.createRadialGradient(
    size * 0.45,
    size * 0.35,
    20,
    size * 0.5,
    size * 0.5,
    size * 0.72,
  );
  grad.addColorStop(0, '#fff3b0');
  grad.addColorStop(0.28, '#ffb732');
  grad.addColorStop(0.65, '#d97706');
  grad.addColorStop(1, '#7c2d12');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Wewnętrzne drobinki i inkluzje bursztynowe
  for (let i = 0; i < 160; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1.5 + Math.random() * 5.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle =
      Math.random() > 0.35
        ? `rgba(255, 232, 145, ${0.14 + Math.random() * 0.28})`
        : `rgba(120, 42, 8, ${0.14 + Math.random() * 0.22})`;
    ctx.fill();
  }

  // Złote żyłkowanie (organiczne rozgałęzienia)
  ctx.lineCap = 'round';
  for (let v = 0; v < 28; v++) {
    let x = Math.random() * size;
    let y = Math.random() * size;
    let angle = Math.random() * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const steps = 16 + Math.floor(Math.random() * 14);
    for (let s = 0; s < steps; s++) {
      angle += (Math.random() - 0.5) * 0.75;
      x += Math.cos(angle) * 16;
      y += Math.sin(angle) * 16;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle =
      v % 3 === 0
        ? 'rgba(255, 250, 210, 0.78)'
        : 'rgba(251, 191, 36, 0.55)';
    ctx.lineWidth = 1.2 + Math.random() * 2.4;
    ctx.stroke();
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  // Mapa chropowatości dla głębi żyłek
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 256;
  roughCanvas.height = 256;
  const rCtx = roughCanvas.getContext('2d')!;
  rCtx.fillStyle = '#333333';
  rCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 40; i++) {
    rCtx.strokeStyle = 'rgba(130,130,130,0.45)';
    rCtx.lineWidth = 1.5 + Math.random() * 2;
    rCtx.beginPath();
    const sx = Math.random() * 256;
    const sy = Math.random() * 256;
    rCtx.moveTo(sx, sy);
    rCtx.quadraticCurveTo(
      sx + (Math.random() - 0.5) * 80,
      sy + (Math.random() - 0.5) * 80,
      sx + (Math.random() - 0.5) * 120,
      sy + (Math.random() - 0.5) * 120,
    );
    rCtx.stroke();
  }
  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;

  // Delikatna faktura kutego rzemiosła (bumpMap z wgłębieniami po młotku kowalskim)
  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = 256;
  bumpCanvas.height = 256;
  const bCtx = bumpCanvas.getContext('2d')!;
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 220; i++) {
    const cx = Math.random() * 256;
    const cy = Math.random() * 256;
    const rx = 5 + Math.random() * 11;
    const ry = 4 + Math.random() * 9;
    const rot = Math.random() * Math.PI;
    const g = bCtx.createRadialGradient(cx, cy, 1, cx, cy, Math.max(rx, ry));
    g.addColorStop(0, 'rgba(52, 52, 52, 0.55)');
    g.addColorStop(0.75, 'rgba(135, 135, 135, 0.35)');
    g.addColorStop(1, 'rgba(128, 128, 128, 0)');
    bCtx.save();
    bCtx.translate(cx, cy);
    bCtx.rotate(rot);
    bCtx.scale(1, ry / rx);
    bCtx.beginPath();
    bCtx.arc(0, 0, rx, 0, Math.PI * 2);
    bCtx.fillStyle = g;
    bCtx.fill();
    bCtx.restore();
  }
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;

  return { map, roughnessMap, bumpMap };
}

/**
 * Tekstura tęczówki Smoczego Oka (złoto-pomarańczowy ogień z pionową gadzią źrenicą).
 */
export function createDragonEyeTexture(maxAnisotropy = 4): THREE.CanvasTexture {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  // Tło twardówki (ciemne, żarzące się obrzeże)
  ctx.fillStyle = '#180803';
  ctx.fillRect(0, 0, size, size);

  // Tęczówka ognista
  const irisRadius = size * 0.36;
  const irisGrad = ctx.createRadialGradient(cx, cy, 12, cx, cy, irisRadius);
  irisGrad.addColorStop(0, '#fff7ae');
  irisGrad.addColorStop(0.28, '#fbbf24');
  irisGrad.addColorStop(0.62, '#ea580c');
  irisGrad.addColorStop(0.88, '#9a3412');
  irisGrad.addColorStop(1, '#2a0903');

  ctx.beginPath();
  ctx.arc(cx, cy, irisRadius, 0, Math.PI * 2);
  ctx.fillStyle = irisGrad;
  ctx.fill();

  // Promieniste włókna tęczówki gada
  for (let i = 0; i < 140; i++) {
    const a = (i / 140) * Math.PI * 2 + (Math.random() - 0.5) * 0.03;
    const innerR = 16 + Math.random() * 24;
    const outerR = irisRadius * (0.78 + Math.random() * 0.2);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * innerR, cy + Math.sin(a) * innerR);
    ctx.lineTo(
      cx + Math.cos(a + (Math.random() - 0.5) * 0.06) * outerR,
      cy + Math.sin(a + (Math.random() - 0.5) * 0.06) * outerR,
    );
    ctx.strokeStyle =
      i % 2 === 0 ? 'rgba(255, 240, 150, 0.45)' : 'rgba(120, 20, 4, 0.52)';
    ctx.lineWidth = 1.2 + Math.random() * 1.8;
    ctx.stroke();
  }

  // Złota obwódka wokół źrenicy
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.056, size * 0.275, 0, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 245, 180, 0.88)';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Pionowa smocza źrenica
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.27);
  ctx.quadraticCurveTo(cx + size * 0.075, cy, cx, cy + size * 0.27);
  ctx.quadraticCurveTo(cx - size * 0.075, cy, cx, cy - size * 0.27);
  ctx.closePath();
  ctx.fillStyle = '#030202';
  ctx.fill();
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return texture;
}

/**
 * Tekstura gadzich łusek dla powiek Smoczego Oka.
 */
export function createReptileScaleTexture(maxAnisotropy = 4): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  ctx.fillStyle = '#140f0b';
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#202020';
  bCtx.fillRect(0, 0, size, size);

  const rows = 12;
  const cols = 12;
  const cellW = size / cols;
  const cellH = size / rows;

  for (let r = -1; r <= rows; r++) {
    for (let c = -1; c <= cols; c++) {
      const x = c * cellW + (r % 2 === 0 ? 0 : cellW * 0.5);
      const y = r * cellH;
      const rad = cellW * 0.56;

      // Kolor łuski (ciemny obsydian + brązowo-złoty połysk)
      const g = ctx.createRadialGradient(x, y - rad * 0.2, 1, x, y, rad);
      g.addColorStop(0, '#3d2817');
      g.addColorStop(0.65, '#1f150e');
      g.addColorStop(1, '#090705');
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = 'rgba(217, 119, 6, 0.14)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Wypukłość łuski
      const bg = bCtx.createRadialGradient(x, y, 1, x, y, rad);
      bg.addColorStop(0, '#ffffff');
      bg.addColorStop(0.75, '#777777');
      bg.addColorStop(1, '#101010');
      bCtx.beginPath();
      bCtx.arc(x, y, rad, 0, Math.PI * 2);
      bCtx.fillStyle = bg;
      bCtx.fill();
    }
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;

  return { map, bumpMap };
}

/**
 * Tekstura zamkniętego Smoczego Oka w głębokim krwistoczerwonym / rubinowym odcieniu
 * z gadzimi łuskami oraz ciemnym rowkiem zamkniętej powieki pośrodku.
 */
export function createRedDragonLidTexture(
  variantTint: 'crimson' | 'ruby' | 'garnet',
  maxAnisotropy = 4,
): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
} {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  const emissiveCanvas = document.createElement('canvas');
  emissiveCanvas.width = size;
  emissiveCanvas.height = size;
  const eCtx = emissiveCanvas.getContext('2d')!;

  const palette =
    variantTint === 'ruby'
      ? { hi: '#8c101d', mid: '#4b060e', edge: '#140103', rim: 'rgba(225, 29, 72, 0.22)' }
      : variantTint === 'garnet'
        ? { hi: '#740d18', mid: '#3b040a', edge: '#0f0102', rim: 'rgba(190, 18, 60, 0.18)' }
        : { hi: '#99111f', mid: '#520710', edge: '#160103', rim: 'rgba(244, 63, 94, 0.20)' };

  ctx.fillStyle = '#140204';
  ctx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#242424';
  bCtx.fillRect(0, 0, size, size);
  eCtx.fillStyle = '#080102';
  eCtx.fillRect(0, 0, size, size);

  const rows = 13;
  const cols = 13;
  const cellW = size / cols;
  const cellH = size / rows;

  for (let r = -1; r <= rows; r++) {
    for (let c = -1; c <= cols; c++) {
      const x = c * cellW + (r % 2 === 0 ? 0 : cellW * 0.5);
      const y = r * cellH;
      const rad = cellW * 0.56;

      const g = ctx.createRadialGradient(x, y - rad * 0.22, 1, x, y, rad);
      g.addColorStop(0, palette.hi);
      g.addColorStop(0.62, palette.mid);
      g.addColorStop(1, palette.edge);
      ctx.beginPath();
      ctx.arc(x, y, rad, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = palette.rim;
      ctx.lineWidth = 0.9;
      ctx.stroke();

      const bg = bCtx.createRadialGradient(x, y, 1, x, y, rad);
      bg.addColorStop(0, '#f0f0f0');
      bg.addColorStop(0.75, '#727272');
      bg.addColorStop(1, '#121212');
      bCtx.beginPath();
      bCtx.arc(x, y, rad, 0, Math.PI * 2);
      bCtx.fillStyle = bg;
      bCtx.fill();
    }
  }

  // Ciemny rowek zamkniętej powieki biegnący po równiku (y = size * 0.5)
  const seamY = size * 0.5;
  const seamBand = ctx.createLinearGradient(0, seamY - 18, 0, seamY + 18);
  seamBand.addColorStop(0, 'rgba(20, 2, 4, 0)');
  seamBand.addColorStop(0.38, 'rgba(14, 1, 3, 0.82)');
  seamBand.addColorStop(0.5, 'rgba(3, 0, 1, 0.98)');
  seamBand.addColorStop(0.62, 'rgba(14, 1, 3, 0.82)');
  seamBand.addColorStop(1, 'rgba(20, 2, 4, 0)');
  ctx.fillStyle = seamBand;
  ctx.fillRect(0, seamY - 18, size, 36);

  // Wyraźne wgłębienie rowka w bumpMap
  const bumpSeam = bCtx.createLinearGradient(0, seamY - 14, 0, seamY + 14);
  bumpSeam.addColorStop(0, 'rgba(128, 128, 128, 0)');
  bumpSeam.addColorStop(0.5, 'rgba(0, 0, 0, 0.98)');
  bumpSeam.addColorStop(1, 'rgba(128, 128, 128, 0)');
  bCtx.fillStyle = bumpSeam;
  bCtx.fillRect(0, seamY - 14, size, 28);

  // Subtelny rubinowy żar sączący się spod zaciśniętej powieki oraz z łusek
  const glowGrad = eCtx.createLinearGradient(0, seamY - 16, 0, seamY + 16);
  glowGrad.addColorStop(0, 'rgba(70, 5, 16, 0.08)');
  glowGrad.addColorStop(0.42, 'rgba(190, 18, 52, 0.45)');
  glowGrad.addColorStop(0.5, 'rgba(244, 63, 94, 0.72)');
  glowGrad.addColorStop(0.58, 'rgba(190, 18, 52, 0.45)');
  glowGrad.addColorStop(1, 'rgba(70, 5, 16, 0.08)');
  eCtx.fillStyle = glowGrad;
  eCtx.fillRect(0, seamY - 16, size, 32);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.ClampToEdgeWrapping;

  const emissiveMap = new THREE.CanvasTexture(emissiveCanvas);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.wrapS = THREE.RepeatWrapping;
  emissiveMap.wrapT = THREE.ClampToEdgeWrapping;
  emissiveMap.anisotropy = maxAnisotropy;

  return { map, bumpMap, emissiveMap };
}

