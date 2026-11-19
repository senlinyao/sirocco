import { createGround } from './ground.js';

// Sirocco: an authored multi-level layout system.
// 几何语法（墙/檐口/基座/窗/拱门/箱/沙袋/天际线）保持不变，
// 只有关卡数据（建筑、站点、掩体、道具、区域）由 levels.js 提供。
export function createMap(g, level) {
  const T = g.THREE;
  const root = new T.Group();
  const levelId = level?.id ?? 1;
  root.name = 'sirocco-level-' + levelId;
  const radarRects = [];
  const collisionStart = g.physics.boxes.length;
  const batches = new Map();
  const transform = new T.Object3D();
  const bounds = { min: new T.Vector3(-28, 0, -28), max: new T.Vector3(28, 20, 28) };
  g.physics.bounds = bounds;

  const cfg = level?.layout || {};
  const buildings = cfg.buildings || [];
  const sites = (cfg.sites || []).map(site => ({
    id: site.id, pos: new T.Vector3(site.x, 0, site.z), radius: site.radius || 3.2,
  }));
  const portalPlan = cfg.portals || [];
  const cratePlan = cfg.crates || [];
  const tarpPlan = cfg.tarpCrates || [];
  const sandbagPlan = cfg.sandbags || [];
  const skylinePlan = cfg.skyline || [];
  const decorPlan = cfg.decor || [];

  const assetSeed = (Number(g.params.seed || 731) + (levelId - 1) * 997) >>> 0;
  let seed = assetSeed;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // The original GPU factory owns shared albedo, ORM and normal textures.
  // Triplanar sampling uses metre coordinates after geometry compilation.
  const surface = (preset, color) => g.mats.get(preset, {
    color, triplanar: true, vertexColors: true,
  });
  // 注意：g.mats 是跨关卡共享的，直接 multiplyScalar 会让颜色逐关累积变亮。
  // 这里 clone 一份并按基础色重置，保证每关颜色一致。
  const stone = color => {
    const material = surface('concrete', color).clone();
    material.color.set(color).multiplyScalar(2.5);
    material.normalScale.setScalar(.65);
    return material;
  };
  const mats = {
    plaster: stone(0xe5d1a6), ochre: stone(0xc8a170), rose: stone(0xc5a08a),
    trim: stone(0xf0dbb3), base: stone(0x9c8767),
    brick: surface('brick', 0xd9b689), roof: stone(0xd9bd91),
    wood: surface('wood_pallet', 0xc7a377),
    shutter: surface('paint_teal', 0x365950),
    dark: surface('polymer_black', 0x29322d),
    metal: surface('steel_worn', 0x49463c),
    dome: surface('paint_teal', 0x648a83),
    red: surface('paint_red', 0xa7472b),
  };
  const materialSlots = new Map(Object.entries(mats).map(([slot, material]) => [material, slot]));
  const masonry = new Set(['plaster', 'ochre', 'rose', 'trim', 'base', 'brick', 'roof']);
  const facadePlan = buildings.flatMap(building => {
    const placements = [];
    for (const side of [-1, 1]) {
      const frontCount = Math.floor(building.w / 2.7);
      for (let bay = 0; bay < frontCount; bay++) placements.push({
        owner: building.id, side: side < 0 ? 'north' : 'south', bay,
        x: building.x - building.w / 2 + building.w * (bay + 0.5) / frontCount,
        y: 4.7, z: building.z + side * (building.d / 2 + 0.015),
        yaw: side < 0 ? Math.PI : 0,
      });
      const sideCount = Math.floor(building.d / 3.1);
      for (let bay = 0; bay < sideCount; bay++) placements.push({
        owner: building.id, side: side < 0 ? 'west' : 'east', bay,
        x: building.x + side * (building.w / 2 + 0.015), y: 4.7,
        z: building.z - building.d / 2 + building.d * (bay + 0.5) / sideCount,
        yaw: side * Math.PI / 2,
      });
    }
    return placements;
  });
  let emittedParts = 0;

  function emit(geometry, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, worldUV = false, raw = false) {
    const geo = geometry.index ? geometry.toNonIndexed() : geometry;
    if (geo !== geometry) geometry.dispose();
    transform.position.set(x, y, z);
    transform.rotation.set(rx, ry, rz);
    transform.scale.set(1, 1, 1);
    transform.updateMatrix();
    geo.applyMatrix4(transform.matrix);
    let batch = batches.get(material);
    if (!batch) { batch = { pos: [], normal: [], uv: [], color: [], parts: 0 }; batches.set(material, batch); }
    batch.parts++;
    emittedParts++;
    const slot = materialSlots.get(material);
    const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
    const sourceColor = geo.attributes.color;
    const noise = SaltlineEngine.valueNoise3, variationSeed = assetSeed * 3.71;
    for (let i = 0; i < p.count; i++) {
      const px = p.getX(i), py = p.getY(i), pz = p.getZ(i);
      const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
      batch.pos.push(px, py, pz);
      batch.normal.push(nx, ny, nz);
      // Same two-octave dirt + hemispherical AO + 20 cm base band as Saltline
      // Kn.finish(), source 44635. Preserve authored prop colors before batching.
      const coarse = noise(px * 1.9 + variationSeed, py * 1.9, pz * 1.9 + 5.3);
      const fine = noise(px * 9 + 2.1, py * 9 + variationSeed, pz * 9);
      const foot = Math.max(0, Math.min(1, 1 - py / .2));
      let shade = (0.82 + .18 * coarse) * (.92 + .08 * fine) *
        (.76 + .24 * Math.max(0, Math.min(1, ny * .6 + .62)));
      shade *= 1 - .42 * foot * foot * (.55 + .45 * fine);
      const grime = raw ? 0 : masonry.has(slot) ? .65 : .35;
      shade = 1 + (shade - 1) * grime;
      batch.color.push((sourceColor ? sourceColor.getX(i) : 1) * shade,
        (sourceColor ? sourceColor.getY(i) : 1) * shade * (1 - .05 * foot * grime),
        (sourceColor ? sourceColor.getZ(i) : 1) * shade * (1 - .12 * foot * grime));
      if (worldUV) {
        const axis = Math.abs(ny) > 0.7 ? 1 : Math.abs(nx) > Math.abs(nz) ? 0 : 2;
        batch.uv.push(axis === 0 ? pz : px, axis === 1 ? pz : py);
      } else batch.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
    }
    geo.dispose();
  }
  function box(x, y, z, w, h, d, mat = mats.plaster, yaw = 0) {
    const bevel = Math.min(0.025, Math.min(w, h, d) * 0.12);
    const geometry = window.SaltlineEngine.beveledBox(w, h, d, bevel);
    emit(geometry, mat, x, y, z, 0, yaw, 0, true);
  }
  function collider(x, z, w, d, h, surfaceType = 'concrete', y = 0, radar = true) {
    g.physics.addBox([x - w / 2, y, z - d / 2], [x + w / 2, y + h, z + d / 2], { surface: surfaceType });
    if (radar) radarRects.push({ x, z, w, d });
  }
  function wall(x, z, w, d, h, material = mats.ochre) {
    box(x, h / 2, z, w, h, d, material);
    box(x, h + 0.12, z, w + 0.12, 0.24, d + 0.12, mats.trim);
    box(x, 0.25, z, w + 0.05, 0.5, d + 0.05, mats.base);
    collider(x, z, w, d, h + 0.24);
  }

  const ground = createGround(g, buildings);
  g.ground = ground;
  root.add(ground.mesh);
  ground.setDebug(g.params.grounddebug === 'mask');
  // Four solid masses leave continuous side lanes and two broad cross streets.
  for (const b of buildings) {
    wall(b.x, b.z, b.w, b.d, b.h, mats[b.color] || mats.plaster);
    box(b.x, b.h - 0.4, b.z, b.w + 0.18, 0.16, b.d + 0.18, mats.trim);
    box(b.x, b.h + 0.44, b.z - b.d / 2 + 0.18, b.w, 0.55, 0.35, mats.roof);
    box(b.x, b.h + 0.44, b.z + b.d / 2 - 0.18, b.w, 0.55, 0.35, mats.roof);
    box(b.x - b.w / 2 + 0.18, b.h + 0.44, b.z, 0.35, 0.55, b.d, mats.roof);
    box(b.x + b.w / 2 - 0.18, b.h + 0.44, b.z, 0.35, 0.55, b.d, mats.roof);
    for (const bay of facadePlan.filter(placement => placement.owner === b.id)) {
      windowBay(bay.x, bay.y, bay.z, bay.yaw);
    }
    // Corner stones and drainpipes give the flat masses a readable construction.
    for (const dx of [-1, 1]) for (const dz of [-1, 1]) {
      const x = b.x + dx * (b.w / 2 - 0.1), z = b.z + dz * (b.d / 2 - 0.1);
      for (let j = 0; j < Math.floor(b.h / 0.55); j++) {
        box(x, 0.3 + j * 0.55, z, j % 2 ? 0.48 : 0.28, 0.35, j % 2 ? 0.28 : 0.48, mats.trim);
      }
    }
  }

  function localBox(x, y, z, yaw, lx, ly, lz, w, h, d, mat) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    box(x + lx * c + lz * s, y + ly, z - lx * s + lz * c, w, h, d, mat, yaw);
  }
  function windowBay(x, y, z, yaw) {
    const b = (lx, ly, lz, w, h, d, mat) => localBox(x, y, z, yaw, lx, ly, lz, w, h, d, mat);
    b(0, 0, 0.035, 1.16, 1.65, 0.08, mats.dark);
    b(0, -0.9, 0.1, 1.55, 0.18, 0.34, mats.trim);
    b(0, 0.9, 0.06, 1.48, 0.18, 0.2, mats.trim);
    for (const s of [-1, 1]) {
      b(s * 0.68, 0, 0.07, 0.14, 1.85, 0.18, mats.trim);
      b(s * 0.29, 0, 0.09, 0.54, 1.55, 0.07, mats.shutter);
      for (let j = 0; j < 8; j++) b(s * 0.29, -0.63 + j * 0.18, 0.14, 0.48, 0.065, 0.06, mats.dark);
    }
  }

  wall(-28, 0, 1, 57, 5.4);
  wall(28, 0, 1, 57, 5.2);
  wall(0, -28, 55, 1, 6.2, mats.plaster);
  wall(0, 28, 55, 1, 5.6, mats.rose);

  // Arched portals have separate piers and a genuine opening; no hidden wall.
  function arch(x, z, width = 10, radius = 3, spring = 2.9, height = 6.6, depth = 0.9, doors = false) {
    const pier = (width - radius * 2) / 2;
    for (const side of [-1, 1]) {
      wall(x + side * (radius + pier / 2), z, pier, depth, height, mats.ochre);
      box(x + side * (radius + 0.16), spring / 2, z, 0.3, spring, depth + 0.22, mats.trim);
    }
    const shape = new T.Shape();
    shape.moveTo(-radius, height);
    shape.lineTo(radius, height);
    shape.lineTo(radius, spring);
    for (let n = 1; n <= 24; n++) {
      const a = n / 24 * Math.PI;
      shape.lineTo(Math.cos(a) * radius, spring + Math.sin(a) * radius);
    }
    shape.closePath();
    emit(new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 }), mats.ochre, x, 0, z - depth / 2);
    for (let n = 0; n < 12; n++) {
      const a = n / 12 * Math.PI + 0.012, b = (n + 1) / 12 * Math.PI - 0.012;
      const band = new T.Shape();
      band.absarc(0, spring, radius + 0.32, a, b, false);
      band.absarc(0, spring, radius, b, a, true);
      band.closePath();
      emit(new T.ExtrudeGeometry(band, { depth: depth + 0.12, bevelEnabled: false, curveSegments: 3 }), mats.trim, x, 0, z - depth / 2 - 0.06);
      const left = -radius + n / 12 * radius * 2, right = left + radius * 2 / 12;
      const near = Math.abs(left) < Math.abs(right) ? left : right;
      const bottom = spring + Math.sqrt(Math.max(0, radius * radius - near * near));
      collider(x + (left + right) / 2, z, right - left, depth, height - bottom, 'concrete', bottom, false);
    }
    box(x, height + 0.25, z, width + 0.2, 0.26, depth + 0.24, mats.trim);
    if (doors) {
      for (const side of [-1, 1]) {
        const dx = x + side * (radius - 0.12), dz = z + 1.05;
        box(dx, 1.42, dz, 0.17, 2.84, 2.5, mats.wood);
        collider(dx, dz, 0.17, 2.5, 2.84, 'wood');
        for (const y of [0.4, 1.35, 2.35]) box(dx, y, dz, 0.2, 0.15, 2.55, mats.metal);
        for (let n = 0; n < 7; n++) box(dx + side * 0.095, 1.42, dz - 1.06 + n * 0.35, 0.015, 2.7, 0.018, mats.dark);
      }
    }
  }
  for (const portal of portalPlan) {
    arch(portal.x, portal.z, portal.width, portal.radius, portal.spring, portal.height, portal.depth, portal.doors);
  }

  // ---------------------------------------------------------------------
  // Skyline: 关卡专属的屋顶轮廓，全部由同一套 box/emit 积木拼出来。
  for (const feature of skylinePlan) {
    const fx = feature.x || 0, fz = feature.z || 0;
    if (feature.type === 'dome') {
      const r = feature.radius || 2.9, baseY = feature.baseY ?? 9.55;
      box(fx, baseY, fz, r * 2.1, 1.3, r * 2.1, mats.plaster);
      emit(new T.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), mats.dome, fx, baseY + 0.65, fz);
      emit(new T.CylinderGeometry(0.07, 0.11, 1.25, 8), mats.metal, fx, baseY + 3.85, fz);
      emit(new T.SphereGeometry(0.18, 10, 6), mats.metal, fx, baseY + 4.45, fz);
    } else if (feature.type === 'tower') {
      const size = feature.size || 3, h = feature.h || 5.6, baseY = feature.baseY ?? 7.2;
      box(fx, baseY + h / 2, fz, size, h, size, mats.ochre);
      box(fx, baseY + h + 0.17, fz, size + 0.7, 0.35, size + 0.7, mats.trim);
      for (const dx of [-1, 1]) for (const dz of [-1, 1])
        box(fx + dx * (size / 2 - 0.35), baseY + h + 0.85, fz + dz * (size / 2 - 0.35), 0.36, 1.15, 0.36, mats.plaster);
      emit(new T.ConeGeometry(size * 0.72, 1.5, 4), mats.roof, fx, baseY + h + 1.65, fz, 0, Math.PI / 4);
    } else if (feature.type === 'balcony') {
      const yaw = feature.yaw || 0;
      localBox(fx, 0, fz, yaw, 0, 3.3, 0.58, 2.8, 0.2, 1.25, mats.trim);
      localBox(fx, 0, fz, yaw, 0, 4.25, 1.16, 2.75, 0.08, 0.08, mats.metal);
      for (let n = 0; n < 9; n++) localBox(fx, 0, fz, yaw, -1.25 + n * 0.3125, 3.78, 1.16, 0.05, 0.9, 0.05, mats.metal);
    } else if (feature.type === 'watertower') {
      const h = feature.h || 7, tank = 2.6;
      for (const dx of [-1, 1]) for (const dz of [-1, 1])
        emit(new T.CylinderGeometry(0.11, 0.13, tank, 6), mats.metal, fx + dx * 1.05, h + tank / 2, fz + dz * 1.05);
      emit(new T.CylinderGeometry(1.55, 1.55, 2.1, 16), mats.metal, fx, h + tank + 1.05, fz);
      emit(new T.CylinderGeometry(1.6, 1.6, 0.12, 16), mats.trim, fx, h + tank + 2.16, fz);
      for (let n = 0; n < 3; n++)
        emit(new T.CylinderGeometry(0.05, 0.05, 1.6, 6), mats.metal, fx - 0.8 + n * 0.8, h + 0.8, fz, 0, 0, Math.PI / 6);
    } else if (feature.type === 'gantry') {
      const h = feature.h || 9, span = 5.4;
      for (const dx of [-1, 1]) {
        box(fx + dx * span, h / 2, fz, 0.42, h, 0.42, mats.metal);
        box(fx + dx * span, 0.3, fz, 1.1, 0.6, 1.1, mats.base);
      }
      box(fx, h + 0.3, fz, span * 2 + 1.2, 0.55, 0.9, mats.metal);
      box(fx, h - 0.6, fz, span * 1.4, 0.3, 0.35, mats.metal);
      for (let n = 0; n < 5; n++)
        emit(new T.CylinderGeometry(0.03, 0.03, 1.4, 5), mats.dark, fx - span + n * span * 0.5, h - 1.5, fz);
    } else if (feature.type === 'antenna') {
      const h = feature.h || 6;
      emit(new T.CylinderGeometry(0.08, 0.14, h + 3, 8), mats.metal, fx, h / 2 + 1.5, fz);
      emit(new T.SphereGeometry(0.26, 8, 6), mats.red, fx, h + 3.2, fz);
      for (const s of [-1, 1])
        emit(new T.CylinderGeometry(0.03, 0.03, 2.4, 5), mats.metal, fx + s * 0.6, h / 2 + 1.4, fz, 0, 0, s * 0.5);
    }
  }

  function crate(x, z, w = 1.8, h = 1.8, d = 1.8, y = 0) {
    box(x, y + h / 2, z, w, h, d, mats.wood);
    collider(x, z, w, d, h, 'wood', y);
    for (const side of [-1, 1]) {
      for (const dy of [0.12, h - 0.12]) box(x, y + dy, z + side * (d / 2 + 0.02), w, 0.16, 0.08, mats.base);
      for (const dx of [-w / 2 + 0.12, w / 2 - 0.12]) box(x + dx, y + h / 2, z + side * (d / 2 + 0.04), 0.16, h, 0.1, mats.base);
      box(x + side * (w / 2 + 0.02), y + h / 2, z, 0.08, 0.14, d, mats.metal);
    }
  }
  // Original soft-form builders retain their deformation, welded normals,
  // metre UVs and source material/color fields. Bake transforms before emission.
  const softProps = [];
  function softCover(name, x, y, z, w, h, d, options = {}) {
    const prop = g.props.build(name, { seed: assetSeed + softProps.length * 31, ...options });
    const size = prop.userData.size;
    prop.position.set(x, y, z); prop.scale.set(w / size[0], h / size[1], d / size[2]);
    prop.updateMatrixWorld(true);
    let triangles = 0;
    prop.traverse(node => {
      if (!node.isMesh) return;
      if (!materialSlots.has(node.material)) materialSlots.set(node.material, 'prop-' + name + '-' + node.material.name);
      const geometry = node.geometry.clone().applyMatrix4(node.matrixWorld);
      triangles += (geometry.index?.count || geometry.attributes.position.count) / 3;
      emit(geometry, node.material, 0, 0, 0, 0, 0, 0, false, true);
    });
    softProps.push({ name, bounds: [x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2], triangles });
  }
  for (const placement of cratePlan) {
    const [x, z, w, h, d, y] = placement;
    crate(x, z, w, h, d, y);
  }
  for (const placement of tarpPlan) {
    const [x, z, w, h, d, y] = placement;
    softCover('tarp_cargo', x, y, z, w, h, d);
    collider(x, z, w, d, h, 'wood', y);
  }
  // Same two cover AABBs as before. Seven courses fill the existing height.
  for (const [x, z, w, h] of sandbagPlan) {
    for (let section = 0; section < 3; section++)
      softCover('sandbags', x + (section - 1) * w / 3, 0, z, w / 3, h, .8, { courses: 7 });
    collider(x, z, w, .8, h, 'dirt');
  }

  // ---------------------------------------------------------------------
  // 站点标识：图集按关卡站点动态生成，不再假设只有 A/B。
  const siteIds = sites.map(site => site.id);
  const labelNames = [...siteIds];
  if (siteIds.includes('A') && siteIds.includes('B')) labelNames.push('A →', '← B');
  const columns = labelNames.length > 2 ? 2 : labelNames.length;
  const rows = Math.ceil(labelNames.length / columns);
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 1024; labelCanvas.height = 512;
  const labelContext = labelCanvas.getContext('2d');
  const labelPadding = 16, labelWidth = 480, labelHeight = 224;
  labelNames.forEach((text, index) => {
    const cell = document.createElement('canvas'); cell.width = labelWidth; cell.height = labelHeight;
    const ctx = cell.getContext('2d');
    // Stencil cuts and seeded wear are authored before atlas packing (38303).
    ctx.fillStyle = '#9d4329'; ctx.font = '900 160px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, labelWidth / 2, labelHeight / 2 + 4);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillRect(labelWidth / 2 - 3, 8, 6, labelHeight - 16);
    const random = SaltlineEngine.createRng(assetSeed + index * 733);
    for (let n = 0; n < 110; n++) {
      const x = random() * labelWidth, y = random() * labelHeight;
      ctx.fillRect(x, y, 1 + random() * 7, .8 + random() * 2);
    }
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = 'rgba(157,67,41,.004)'; ctx.fillRect(0, 0, labelWidth, labelHeight);
    const x = index % columns * 512 + labelPadding;
    const y = Math.floor(index / columns) * 256 + labelPadding;
    // Expanded border + exact inner copy, matching the source shelf atlas padding.
    labelContext.drawImage(cell, x - labelPadding, y - labelPadding, labelWidth + 2 * labelPadding, labelHeight + 2 * labelPadding);
    labelContext.clearRect(x, y, labelWidth, labelHeight);
    labelContext.drawImage(cell, x, y);
  });
  const labelTexture = new T.CanvasTexture(labelCanvas);
  labelTexture.name = 'sirocco-wayfinding-atlas-l' + levelId;
  labelTexture.colorSpace = T.SRGBColorSpace;
  labelTexture.anisotropy = Math.min(8, g.renderer.capabilities.getMaxAnisotropy());
  const labelMaterial = new T.MeshStandardMaterial({ map: labelTexture, transparent: true, depthWrite: false, side: T.DoubleSide,
    roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  materialSlots.set(labelMaterial, 'wayfinding');
  function decal(text, x, y, z, w, h, yaw = 0, ground = false) {
    const index = labelNames.indexOf(text);
    if (index < 0) return;
    const geometry = new T.PlaneGeometry(w, h);
    const uv = geometry.attributes.uv;
    for (let vertex = 0; vertex < uv.count; vertex++) {
      uv.setXY(vertex, ((index % columns) * 512 + labelPadding + uv.getX(vertex) * labelWidth) / 1024,
        1 - (Math.floor(index / columns) * 256 + labelPadding + (1 - uv.getY(vertex)) * labelHeight) / 512);
    }
    emit(geometry, labelMaterial, x, y, z, ground ? -Math.PI / 2 : 0, yaw, 0, false, true);
  }
  for (const site of sites) {
    emit(new T.RingGeometry(site.radius - 0.3, site.radius - 0.15, 48), mats.red, site.pos.x, 0.012, site.pos.z, -Math.PI / 2);
    decal(site.id, site.pos.x, 0.018, site.pos.z, 3.5, 3.5, 0, true);
  }
  if (levelId === 1) {
    // 只在第 1 关保留原版的墙面导向标识，其余关卡靠站点地标与简报指引。
    decal('A →', 8, 2.3, 17.025, 2.4, 1.2);
    decal('← B', -8, 2.3, 17.025, 2.4, 1.2);
  }
  for (const site of sites) {
    // 站点墙标按站点所在半场贴南墙或北墙，单轴站点不会互相压在同一块墙面。
    const wallZ = site.pos.z < 0 ? -27.48 : 27.48;
    decal(site.id, site.pos.x, 2.5, wallZ, 2, 2, site.pos.z < 0 ? 0 : Math.PI);
  }

  // Utility details stay on façades; they do not introduce invisible blockers.
  for (const b of buildings) {
    for (const side of [-1, 1]) {
      emit(new T.CylinderGeometry(0.045, 0.045, b.h - 0.5, 6), mats.metal,
        b.x + side * (b.w / 2 + 0.06), b.h / 2, b.z + b.d / 2 - 0.7);
    }
  }
  for (const item of decorPlan) {
    if (item.type === 'pipes') {
      for (const z of item.zs || [20, -1, -22]) {
        const curve = new T.CatmullRomCurve3([
          new T.Vector3(-17, 6.9, z), new T.Vector3(0, 5.9, z + 0.2), new T.Vector3(17, 7.3, z),
        ]);
        emit(new T.TubeGeometry(curve, 16, 0.022, 4, false), mats.dark);
      }
    } else if (item.type === 'chipped') {
      const count = item.count || 45;
      for (let n = 0; n < count; n++) {
        const side = n % 2 ? -1 : 1, z = -25 + rand() * 50;
        box(side * 27.48, 0.35 + rand() * 1.4, z, 0.04, 0.24, 0.45 + rand() * 0.5, mats.brick);
      }
    } else if (item.type === 'lanterns') {
      for (const [x, z] of item.points || []) {
        emit(new T.CylinderGeometry(0.035, 0.05, 3.1, 6), mats.metal, x, 1.55, z);
        emit(new T.SphereGeometry(0.13, 8, 6), mats.red, x, 3.2, z);
        emit(new T.CylinderGeometry(0.22, 0.22, 0.06, 8), mats.metal, x, 3.36, z);
      }
    }
  }

  let triangleCount = 2;
  for (const [material, batch] of batches) {
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(batch.pos, 3));
    geometry.setAttribute('normal', new T.Float32BufferAttribute(batch.normal, 3));
    geometry.setAttribute('uv', new T.Float32BufferAttribute(batch.uv, 2));
    geometry.setAttribute('color', new T.Float32BufferAttribute(batch.color, 3));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    const mesh = new T.Mesh(geometry, material);
    mesh.name = 'map-slot-' + materialSlots.get(material);
    mesh.userData.sourceParts = batch.parts;
    mesh.castShadow = material !== mats.red && material !== labelMaterial;
    mesh.receiveShadow = true;
    root.add(mesh);
    triangleCount += batch.pos.length / 9;
  }
  root.userData.plan = { level: levelId, seed: assetSeed, unit: 'metre', buildings, facades: facadePlan,
    portals: portalPlan, crates: cratePlan, softProps, ground: ground.stats, bounds: [-28, -28, 28, 28],
    materials: Object.fromEntries(Object.entries(mats).map(([slot, material]) => [slot, {
      preset: material.name, textureSet: material.userData.set, tileMetres: material.userData.tile,
    }])),
    labels: { atlas: [1024, 512], cells: labelNames.length, paddingPixels: labelPadding, stencil: true },
  };
  root.userData.stats = { level: levelId, staticDrawCalls: root.children.length, triangles: triangleCount,
    emittedParts, materialSlots: batches.size, labelTextures: 1, groundTextures: 3, softProps: softProps.length,
    facadeBays: facadePlan.length, colliders: g.physics.boxes.length - collisionStart };
  g.scene.add(root);
  g.physics.build();
  const start = cfg.playerStart || { x: 0, z: 23, yaw: 0 };
  const defend = cfg.defenderStart || { x: 0, z: -23, yaw: Math.PI };
  return {
    root,
    playerStart: { pos: new T.Vector3(start.x, 0, start.z), yaw: start.yaw || 0 },
    defenderStart: { pos: new T.Vector3(defend.x, 0, defend.z), yaw: defend.yaw || 0 },
    sites,
    botSpawns: (cfg.botSpawns || []).map(([x, z]) => new T.Vector3(x, 0, z)),
    zones: cfg.zones || [],
    radarRects,
    collisionStart,
    groundSurfaceAt: ground.surfaceAt,
    interiorBoxes: [],
    update() {},
  };
}
