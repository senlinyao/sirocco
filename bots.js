// Metres, +Y up, -Z forward. Saltline's rigid-weight rig: one shared geometry,
// material groups, and an independent Skeleton for each active opponent.
export function createBots(g) {
  const T = g.THREE, E = window.SaltlineEngine, random = () => g.rng();
  const surface = (name, color) => g.mats.get(name, {color, triplanar: true, vertexColors: true, interior: true});
  const mats = {
    navy: surface('glove_fabric', 0x30465a), tan: surface('glove_fabric', 0xb09b73),
    vest: surface('glove_fabric', 0x59604d), black: surface('polymer_black', 0x34383a),
    steel: surface('gunmetal', 0x687078),
    skin: new T.MeshStandardMaterial({color: 0xb98766, roughness: .85, vertexColors: true}),
    lens: new T.MeshStandardMaterial({color: 0x344b55, roughness: .22, metalness: .35, vertexColors: true}),
    patch: surface('glove_fabric', 0xb7c2a7),
  };
  const slots = {uniform:mats.navy, webbing:mats.vest, polymer:mats.black, metal:mats.steel, skin:mats.skin, lens:mats.lens, patch:mats.patch};
  const builder = new E.RigBuilder(), sourceParts = [];
  function bone(name, parent, x = 0, y = 0, z = 0) { builder.bone(name, parent, x, y, z); return name; }
  function add(joint, name, geometry, slot, pos = [0,0,0], color = [1,1,1], rotation = [0,0,0]) {
    geometry.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(...rotation)));
    geometry.translate(...pos);
    builder.add(slot, joint, geometry, color);
    sourceParts.push({name, joint, slot});
  }
  // Normal welding across UV seams, quantized at 0.5 mm as in Saltline's soft props.
  function weldNormals(geo) {
    geo.computeVertexNormals();
    const p = geo.attributes.position, n = geo.attributes.normal, sums = new Map();
    const key = i => [p.getX(i),p.getY(i),p.getZ(i)].map(v => Math.round(v*2000)).join(',');
    for (let i=0;i<p.count;i++) {
      const k=key(i), sum=sums.get(k)||new T.Vector3();
      sum.add(new T.Vector3(n.getX(i),n.getY(i),n.getZ(i))); sums.set(k,sum);
    }
    for (let i=0;i<p.count;i++) { const v=sums.get(key(i)).normalize(); n.setXYZ(i,v.x,v.y,v.z); }
    return geo;
  }
  function softBox(w,h,d,round = .025, fold = .002) {
    const geo=E.roundedBox(w,h,d,round), p=geo.attributes.position;
    for(let i=0;i<p.count;i++) {
      const x=p.getX(i), y=p.getY(i), z=p.getZ(i), t=y/h+.5;
      const waist=.88+.12*Math.sin(t*Math.PI*.65), ripple=fold*Math.sin(t*17+x*28)*Math.sin(t*Math.PI);
      p.setXYZ(i,x*waist,y,z*(.96+.04*Math.sin(t*Math.PI))+Math.sign(z)*ripple);
    }
    return weldNormals(geo);
  }
  // Closed elliptical loft. Section radii define cloth volume, joints and cuffs.
  function sleeve(length, width, depth, taper = .7) {
    const positions=[],uv=[],indices=[], rings=9, sides=12;
    for(let ring=0;ring<rings;ring++) {
      const t=ring/(rings-1), radius=1+(taper-1)*t+.10*Math.sin(t*Math.PI);
      const fold=.018*Math.sin(t*Math.PI*6)*Math.sin(t*Math.PI);
      for(let side=0;side<=sides;side++) {
        const angle=side/sides*Math.PI*2;
        positions.push(Math.cos(angle)*width*.5*(radius+fold),-t*length,Math.sin(angle)*depth*.5*(radius+fold));
        uv.push(angle*Math.max(width,depth)*.5,t*length);
        if(ring<rings-1 && side<sides) {
          const a=ring*(sides+1)+side,b=a+1,c=a+sides+1,d=c+1;
          indices.push(a,b,c,b,d,c);
        }
      }
    }
    for(const ring of [0,rings-1]) {
      const base=positions.length/3, t=ring/(rings-1);
      positions.push(0,-t*length,0); uv.push(0,0);
      for(let side=0;side<sides;side++) {
        const offset=(ring*(sides+1)+side)*3;
        positions.push(positions[offset],positions[offset+1],positions[offset+2]);
        uv.push(positions[offset],positions[offset+2]);
      }
      for(let side=0;side<sides;side++) {
        const a=base+1+side,b=base+1+(side+1)%sides;
        indices.push(...(ring===0?[base,b,a]:[base,a,b]));
      }
    }
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));
    geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
    return geo;
  }
  const pelvis=bone('pelvis',null,0,.89,0), torso=bone('upper-body',pelvis,0,.32,0);
  add(pelvis,'trousers-seat',softBox(.34,.20,.24,.055),'uniform');
  add(pelvis,'belt',E.roundedBox(.365,.042,.25,.015),'polymer',[0,.075,0]);
  add(pelvis,'belt-buckle',E.beveledBox(.055,.04,.012,.004),'metal',[0,.075,-.132]);
  add(torso,'jacket',softBox(.405,.44,.255,.065,.004),'uniform');
  add(torso,'armour-front',softBox(.355,.31,.065,.025),'webbing',[0,-.005,-.145]);
  add(torso,'armour-back',softBox(.355,.30,.06,.025),'webbing',[0,0,.14]);
  add(torso,'daypack',softBox(.27,.32,.14,.045),'webbing',[0,-.02,.23]);
  for(const x of [-.16,.16]) add(torso,'shoulder-strap',E.roundedBox(.047,.34,.024,.008),'polymer',[x,.035,-.155]);
  for(const x of [-.12,0,.12]) {
    add(torso,'magazine-pouch',softBox(.105,.15,.065,.018),'webbing',[x,-.055,-.202]);
    add(torso,'pouch-flap',E.roundedBox(.105,.025,.071,.008),'polymer',[x,.01,-.207]);
  }
  add(torso,'identification-patch',E.beveledBox(.12,.04,.009,.003),'patch',[0,.10,-.184]);
  const head=bone('head',torso,0,.37,0);
  add(head,'balaclava',new T.SphereGeometry(1,16,12).scale(.132,.155,.132),'polymer');
  add(head,'face-exposure',new T.SphereGeometry(1,14,10).scale(.102,.058,.03),'skin',[0,.025,-.115]);
  for(const x of [-.058,.058]) add(head,'goggle-lens',E.roundedBox(.105,.052,.022,.015),'lens',[x,.042,-.14]);
  add(head,'goggle-bridge',E.roundedBox(.035,.021,.026,.007),'polymer',[0,.042,-.144]);
  add(head,'helmet-shell',new T.SphereGeometry(1,16,8,0,Math.PI*2,0,Math.PI/2).scale(.158,.142,.165),'uniform',[0,.035,.008]);
  const rim=new T.TorusGeometry(.155,.009,6,24).scale(1,1.04,1).rotateX(Math.PI/2);
  add(head,'helmet-rim',rim,'polymer',[0,.035,.008]);
  for(const x of [-.14,.14]) add(head,'headset-earcup',E.roundedBox(.038,.082,.06,.018),'polymer',[x,-.02,.005]);
  for(const side of [-1,1]) {
    const suffix=side<0?'left':'right';
    const hip=bone('hip-'+suffix,pelvis,side*.108,-.01,0);
    add(hip,'trouser-upper-'+suffix,sleeve(.39,.178,.215,.80),'uniform');
    add(hip,'cargo-pocket-'+suffix,softBox(.035,.16,.12,.015),'webbing',[side*.09,-.18,.008]);
    const knee=bone('knee-'+suffix,hip,0,-.39,0);
    add(knee,'trouser-lower-'+suffix,sleeve(.34,.143,.164,.68),'uniform');
    add(knee,'kneepad-'+suffix,E.roundedBox(.125,.12,.036,.022),'polymer',[0,-.025,-.086]);
    const ankle=bone('ankle-'+suffix,knee,0,-.34,0);
    add(ankle,'boot-'+suffix,E.roundedBox(.16,.14,.28,.035),'polymer',[0,-.075,-.045]);
    add(ankle,'boot-sole-'+suffix,E.roundedBox(.166,.025,.286,.012),'polymer',[0,-.132,-.045],[.7,.7,.7]);
    const shoulder=bone('shoulder-'+suffix,torso,side*.225,.19,-.005);
    add(shoulder,'sleeve-upper-'+suffix,sleeve(.29,.16,.18,.78),'uniform');
    const elbow=bone('elbow-'+suffix,shoulder,0,-.29,0);
    add(elbow,'sleeve-lower-'+suffix,sleeve(.27,.123,.143,.72),'uniform');
    add(elbow,'elbow-reinforcement-'+suffix,E.roundedBox(.11,.075,.025,.012),'webbing',[0,-.035,.066]);
    const wrist=bone('wrist-'+suffix,elbow,0,-.27,0);
    add(wrist,'glove-'+suffix,softBox(.095,.11,.07,.025),'polymer',[0,-.035,0]);
    add(wrist,'thumb-'+suffix,E.roundedBox(.025,.065,.035,.012),'polymer',[-side*.047,-.025,-.015],[.9,.9,.9],[0,0,side*.4]);
  }
  const gun=bone('held-rifle',torso,.06,0,-.29);
  add(gun,'rifle-receiver',E.beveledBox(.065,.10,.29,.009),'metal');
  add(gun,'rifle-stock',E.roundedBox(.065,.105,.23,.016),'polymer',[0,-.02,.235]);
  add(gun,'rifle-foregrip',E.roundedBox(.07,.08,.23,.015),'polymer',[0,.005,-.23]);
  add(gun,'rifle-grip',E.beveledBox(.05,.12,.065,.008),'polymer',[0,-.09,.075],[1,1,1],[-.2,0,0]);
  add(gun,'rifle-magazine',E.beveledBox(.052,.18,.08,.007),'metal',[0,-.12,-.015],[.7,.7,.7]);
  add(gun,'rifle-sight',E.beveledBox(.04,.025,.075,.004),'polymer',[0,.065,-.09]);
  add(gun,'rifle-barrel',new T.CylinderGeometry(.014,.014,.25,12).rotateX(Math.PI/2),'metal',[0,.012,-.46]);
  const definition=builder.build();
  for(const geometries of Object.values(builder.slots)) for(const geometry of geometries) geometry.dispose();
  definition.geometry.name='sentinel-shared-rigid-skin';
  const uniformSlot=definition.slots.indexOf('uniform');
  const list = [], eye = new T.Vector3(), aim = new T.Vector3(), muzzle = new T.Vector3();
  const end = new T.Vector3(), clipped = new T.Vector3(), step = new T.Vector3(), center = new T.Vector3();
  const ray = new T.Ray(), bounds = new T.Sphere(), contact = new T.Vector3();
  let role = 'attack';
  // 关卡难度：命中率倍率 / 反应阈值 / 射速倍率 / 伤害倍率。
  let difficulty = { accuracy: 1, reaction: .65, fireRate: 1, damage: 1 };
  // Two-bone aiming pose in torso coordinates. Wrist targets are shared rifle datums.
  function holdRifle(bones, suffix, target, bend) {
    const shoulder=bones['shoulder-'+suffix], elbow=bones['elbow-'+suffix], wrist=bones['wrist-'+suffix];
    const start=shoulder.position.clone(), reach=new T.Vector3(...target).sub(start);
    const distance=reach.length(), direction=reach.normalize(), upper=.29, lower=.27;
    const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
    const across=new T.Vector3(...bend).addScaledVector(direction,-new T.Vector3(...bend).dot(direction)).normalize();
    const middle=start.clone().addScaledVector(direction,along).addScaledVector(across,Math.sqrt(Math.max(0,upper*upper-along*along)));
    shoulder.quaternion.setFromUnitVectors(new T.Vector3(0,-1,0),middle.clone().sub(start).normalize());
    const forearm=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,-1,0),new T.Vector3(...target).sub(middle).normalize());
    elbow.quaternion.copy(shoulder.quaternion).invert().multiply(forearm);
    wrist.quaternion.copy(forearm).invert().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),Math.PI/2));
  }
  function create(id) {
    const rig=E.createRig(definition,slots,{radius:1.25,center:[0,.9,0]});
    const root=rig.group, bones=rig.bones;
    root.name=`tactical-bot-${id}`;root.visible=false;g.scene.add(root);
    rig.mesh.name='sentinel-skin';
    holdRifle(bones,'right',[.06,-.07,-.21],[1,-1,0]);
    holdRifle(bones,'left',[.04,.01,-.46],[-1,-1,0]);
    const flash=new T.Object3D();flash.name='muzzle-marker';flash.position.set(0,.012,-.595);bones['held-rifle'].add(flash);flash.visible=false;
    const legs=['left','right'].map(side=>bones['hip-'+side]);
    const knees=['left','right'].map(side=>bones['knee-'+side]);
    const arms=['left','right'].map(side=>bones['shoulder-'+side]);
    root.userData.asset={sourceParts,joints:definition.bones.length,meshes:1,triangles:definition.tris,materialGroups:definition.slots.length,sharedGeometry:true,rig:'rigid-weight SkinnedMesh'};
    return {id,name:`SENTINEL ${String(id+1).padStart(2,'0')}`,root,torso:bones['upper-body'],head:bones.head,legs,knees,arms,flash,uniform:[rig.mesh],mesh:rig.mesh,skeleton:rig.skeleton,pos:root.position,
      vel:new T.Vector3(),home:new T.Vector3(),goal:new T.Vector3(),lastSeen:new T.Vector3(),
      health:100,alive:false,state:'patrol',path:[],waypoint:0,patrol:0,wait:0,
      planTime:0,reaction:0,nextShot:0,memory:0,stride:0,flashTime:0,
      strafeDir:1,strafeTimer:0,retreat:0,burstLeft:0};
  }
  // 8 具骨架常驻，实际出场人数由关卡的 botSpawns 长度决定。
  for(let i=0;i<8;i++) list.push(create(i));
  // ==== AI ====
  // 参数直接借鉴原版 Saltline/Sirocco 引擎的敌人 TUNE：视锥 200°、感知节流、丢失记忆 4 秒、
  // 搜索 8 秒、同时开火令牌 2 人、射程带、点射四发后冷却、距离散布、转身速率上限。
  const AI = {
    sightRange: 36, coneCos: Math.cos(100 * Math.PI / 180), nearSense: 3.5,
    senseMin: .05, senseMax: .09,
    loseSight: 4, searchTime: 8, hearRadius: 45,
    maxTokens: 2, tokenGap: 1.25,
    rangeMin: 5.5, rangeMax: 17,
    burstMin: 2, burstMax: 4, burstGapMin: .09, burstGapMax: .14,
    coolMin: 1.7, coolMax: 2.8,
    patrolSpeed: 1.5, stalkSpeed: 2.4, rushSpeed: 3.1, retreatSpeed: 2.7,
    coverTime: 1.4, searchRadius: 4.5, turnRate: 3.2,
  };
  const tokens = { held: 0, lastAt: -99 };
  const coverProbe = new T.Vector3(), coverEye = new T.Vector3();
  function reactionTime(b) { return b.forceReaction || Math.max(.26, (difficulty.reaction || .6) + (b.jitter || 0)); }
  function requestToken(b) {
    if (b.hasToken) return true;
    if (tokens.held >= AI.maxTokens) return false;
    if (g.time.t - tokens.lastAt < AI.tokenGap) return false;
    b.hasToken = true; tokens.held++; tokens.lastAt = g.time.t; return true;
  }
  function releaseToken(b) { if (b.hasToken) { b.hasToken = false; tokens.held = Math.max(0, tokens.held - 1); } }
  // 感知：视锥内 + 有视线才算看见；正前方之外留 100° 盲区，贴脸 3.5 米内才全向。
  function sense(b, dt) {
    b.losHold = Math.max(0, (b.losHold || 0) - dt);
    b.senseT -= dt;
    if (b.senseT > 0) { b.los = b.losHold > 0; return b.los; }
    b.senseT = AI.senseMin + random() * (AI.senseMax - AI.senseMin);
    if (!g.player.alive) { b.los = false; b.losHold = 0; return false; }
    const dx = g.player.pos.x - b.pos.x, dz = g.player.pos.z - b.pos.z;
    const flat = Math.hypot(dx, dz) || 1e-4;
    if (flat > AI.sightRange) { b.los = false; b.losHold = 0; return false; }
    const fx = -Math.sin(b.root.rotation.y), fz = -Math.cos(b.root.rotation.y);
    const facing = (fx * dx + fz * dz) / flat;
    const inCone = facing > AI.coneCos || flat < AI.nearSense;
    if (inCone && g.physics.lineOfSight(eye, g.player.eye)) {
      // 看见就留 0.7 秒「视线余温」：沙袋、柱子造成的瞬间半遮挡不该让人马上失明。
      b.losHold = .7; b.los = true; return true;
    }
    b.los = b.losHold > 0;
    return b.los;
  }
  // 找掩体：绕自己撒点，优先「站得住 + 从该点看不到玩家」的位置，再考虑离得近。
  function findCover(b) {
    let best = null, bestScore = -1e9;
    for (let i = 0; i < 12; i++) {
      const angle = random() * Math.PI * 2, radius = 2.4 + random() * 3.6;
      const x = b.pos.x + Math.cos(angle) * radius, z = b.pos.z + Math.sin(angle) * radius;
      if (g.physics.nav && g.physics.nav.isWalkable && !g.physics.nav.isWalkable(x, z)) continue;
      coverProbe.set(x, b.pos.y, z);
      coverEye.copy(coverProbe); coverEye.y += 1.55;
      const hidden = !g.physics.lineOfSight(coverEye, g.player.eye);
      const score = (hidden ? 14 : 0) - coverProbe.distanceTo(b.pos) - Math.abs(radius - 4) * .6;
      if (score > bestScore) { bestScore = score; best = coverProbe.clone(); }
    }
    return best;
  }
  function reset(nextRole, spawns, tuning) {
    role = nextRole;
    if (tuning) Object.assign(difficulty, tuning);
    tokens.held = 0; tokens.lastAt = -99;
    list.forEach((b, i) => {
      b.alive = i < spawns.length; b.root.visible = b.alive; b.health = 100;
      b.pos.copy(spawns[i] || spawns[0] || b.home); b.home.copy(b.pos); b.goal.copy(b.pos); b.lastSeen.copy(b.pos);
      b.vel.set(0, 0, 0); b.root.rotation.set(0, role === 'attack' ? 0 : Math.PI, 0);
      b.path = []; b.waypoint = b.patrol = 0; b.wait = .3 + i * .2;
      b.planTime = i * .12; b.reaction = b.nextShot = b.memory = b.stride = b.flashTime = b.stuckTime = 0;
      b.strafeTimer = 0; b.strafeDir = i % 2 ? -1 : 1; b.retreat = 0; b.burstLeft = 0;
      b.mode = 'patrol'; b.state = 'patrol'; b.modeT = 0; b.coverT = 0; b.coverGoal = null; b.losHold = 0; b.los = false;
      b.los = false; b.seeT = 0; b.noSeeT = 0; b.exposure = 0;
      b.senseT = .05 + i * .07; b.hasToken = false;
      b.searchA = random() * 6.283; b.jitter = (random() - .5) * .26;
      b.scan = random() * 6.283; b.aimYaw = 0;
      b.flash.visible = false; b.torso.rotation.set(0, 0, 0); b.head.rotation.set(0, 0, 0);
      b.legs.forEach(l => l.rotation.set(0, 0, 0)); b.knees.forEach(k => k.rotation.set(0, 0, 0));
      b.uniform.forEach(mesh => { mesh.material[uniformSlot] = role === 'attack' ? mats.navy : mats.tan; });
    });
  }
  // 枪声/队友倒下：附近守军前往查看，而不是立刻知道玩家坐标。
  function alert(pos) {
    for (const b of list) if (b.alive && b.pos.distanceToSquared(pos) < AI.hearRadius * AI.hearRadius) {
      if (b.mode === 'engage' && b.los) continue;
      b.lastSeen.copy(pos); b.memory = 5;
      b.mode = 'investigate'; b.modeT = AI.searchTime;
      b.goal.copy(pos); b.path = []; b.planTime = 0;
    }
  }
  function look(b, target, dt) {
    const yaw = Math.atan2(b.pos.x - target.x, b.pos.z - target.z);
    const difference = Math.atan2(Math.sin(yaw - b.root.rotation.y), Math.cos(yaw - b.root.rotation.y));
    // 转身有速度上限，不能瞬间把枪口甩到人身上。
    const limit = AI.turnRate * dt;
    b.root.rotation.y += Math.max(-limit, Math.min(limit, difference * Math.min(1, dt * 9)));
    return Math.abs(difference);
  }
  function move(b, target, dt, speed = AI.stalkSpeed) {
    if (b.planTime <= 0) {
      b.path = g.physics.nav.findPath(b.pos, target) || []; b.waypoint = 0; b.planTime = 1 + random() * .15;
      if (!b.path.length && b.mode === 'patrol') { b.goal.copy(b.pos); b.wait = .2; }
    }
    while (b.waypoint < b.path.length && Math.hypot(b.path[b.waypoint].x - b.pos.x, b.path[b.waypoint].z - b.pos.z) < .38) b.waypoint++;
    const point = b.path[b.waypoint]; b.vel.x = b.vel.z = 0;
    if (!point || Math.hypot(target.x - b.pos.x, target.z - b.pos.z) < .35) return;
    step.subVectors(point, b.pos).setY(0).normalize().multiplyScalar(speed);
    for (const other of list) if (other !== b && other.alive) {
      const dx = b.pos.x - other.pos.x, dz = b.pos.z - other.pos.z, d = Math.hypot(dx, dz);
      if (d > .01 && d < .7) { step.x += dx / d * (.7 - d) * 3; step.z += dz / d * (.7 - d) * 3; }
    }
    step.clampLength(0, speed); b.vel.x = step.x; b.vel.z = step.z; look(b, point, dt);
  }
  function fire(b, distance) {
    b.root.updateMatrixWorld(true); b.flash.getWorldPosition(muzzle);
    aim.copy(g.player.eye); aim.y -= .28;
    // 命中率随距离衰减（原版 spreadNear/spreadFar 的思路），自己或目标在移动时更差。
    const moving = Math.hypot(b.vel.x, b.vel.z) > .7;
    const playerMoving = Math.hypot(g.player.vel.x, g.player.vel.z) > .7;
    const falloff = Math.min(1, Math.max(0, (distance - 4) / 26));
    let chance = (1 - falloff * .62) * (difficulty.accuracy || 1);
    if (moving) chance *= .8;
    if (playerMoving) chance *= .88;
    if (b.mode === 'cover') chance *= .82;
    chance = Math.min(.9, Math.max(.08, chance));
    const hit = random() < chance;
    end.copy(aim);
    if (!hit) { end.x += (random() < .5 ? -1 : 1) * (.55 + random() * .6); end.y += .3 + random() * .6; }
    // 能不能打中，以「眼睛这条视线」为准：眼睛看得见就算命中判定有效。
    // 枪口位置只用来做视觉上的遮挡裁剪，否则站在沙袋后开枪会永远打空。
    const clear = g.physics.lineOfSight(eye, end);
    if (!g.physics.lineOfSight(muzzle, end)) {
      // 枪口被自己这边的掩体挡住：横向挪一步换个射界，别对着沙袋打空枪。
      b.strafeDir *= -1; b.strafeTimer = .45;
    }
    if (!clear) {
      let low = 0, high = 1;
      for (let i = 0; i < 8; i++) {
        const mid = (low + high) / 2; clipped.lerpVectors(muzzle, end, mid);
        if (g.physics.lineOfSight(muzzle, clipped)) low = mid; else high = mid;
      }
      end.lerpVectors(muzzle, end, low);
    }
    g.trace(muzzle.clone(), end.clone(), 0xffc384);
    g.fx?.muzzleFlash(muzzle, step.subVectors(end, muzzle).normalize(), {scale: .7});
    g.audio.play('rifle_shot', { pos: muzzle.clone(), gain: .42, pitch: .94 + random() * .1 });
    b.flashTime = .045; b.flash.visible = true;
    // 点射：一组 2-4 发紧凑连发，组间冷却 1.7-2.8 秒；继续开火需要重新拿令牌。
    const gap = (AI.burstGapMin + random() * (AI.burstGapMax - AI.burstGapMin)) / difficulty.fireRate;
    const cool = (AI.coolMin + random() * (AI.coolMax - AI.coolMin)) / difficulty.fireRate;
    if (b.burstLeft > 0) b.burstLeft--;
    else b.burstLeft = AI.burstMin + Math.floor(random() * (AI.burstMax - AI.burstMin + 1)) - 1;
    if (b.burstLeft > 0) b.nextShot = gap;
    else { b.nextShot = cool; releaseToken(b); }
    if (hit && clear) g.onPlayerHit(Math.round((7 + Math.floor(random() * 4)) * difficulty.damage), b.pos);
  }
  function update(dt) {
    if (g.game.phase !== 'playing') return;
    let defuser = null;
    const bomb = g.game.bomb;
    for (const b of list) {
      if (!b.alive) continue;
      b.planTime -= dt; b.nextShot -= dt; b.modeT -= dt; b.coverT = Math.max(0, b.coverT - dt);
      b.memory = Math.max(0, b.memory - dt);
      b.flashTime -= dt; b.flash.visible = b.flashTime > 0;
      eye.copy(b.pos).y += 1.58;
      const distance = eye.distanceTo(g.player.eye);
      const los = sense(b, dt);
      if (los) {
        b.seeT += dt; b.noSeeT = 0; b.lastSeen.copy(g.player.pos); b.memory = AI.loseSight;
        b.exposure = Math.min(1, b.exposure + dt * .1);
        if (b.seeT >= reactionTime(b)) { b.mode = 'engage'; b.modeT = 0; }
      } else {
        b.seeT = Math.max(0, b.seeT - dt * .6); b.noSeeT += dt;
        b.exposure = Math.max(0, b.exposure - dt * .45);
        // 听脚步：12 米内玩家在跑动，就算在背后也会警觉起来过去查看。
        const playerSpeed = Math.hypot(g.player.vel.x, g.player.vel.z);
        if (playerSpeed > 1.2 && distance < 12 && b.mode !== 'search' && b.mode !== 'investigate') {
          b.lastSeen.copy(g.player.pos); b.memory = 5;
          b.mode = 'investigate'; b.modeT = AI.searchTime; b.goal.copy(g.player.pos); b.path = []; b.planTime = 0;
        }
        if (b.mode === 'engage' && b.noSeeT > AI.loseSight) {
          b.mode = 'search'; b.modeT = AI.searchTime; releaseToken(b);
          b.searchA = Math.atan2(b.pos.z - b.lastSeen.z, b.pos.x - b.lastSeen.x);
        }
      }
      b.vel.x = b.vel.z = 0;
      if (b.coverT > 0 && b.mode !== 'search') {
        if (!b.coverGoal) b.coverGoal = findCover(b);
        // 中枪后会真的挪到掩体后面，而不是站在原地对枪。
        if (b.coverGoal && b.mode !== 'cover') b.mode = 'cover';
      }

      if (b.mode === 'alert' || (los && b.seeT < reactionTime(b))) {
        // 已经看见玩家但还在反应时间内：停下脚步、转过去举枪，等准心稳住再开火。
        b.mode = 'alert';
        b.vel.set(0, 0, 0);
        look(b, g.player.pos, dt);
        // 目标脱离视线超过 1 秒就解除警戒，转为过去查看最后位置，避免站着不动卡死。
        if (!los && b.noSeeT > 1) { b.mode = 'investigate'; b.goal.copy(b.lastSeen); b.modeT = AI.searchTime; }
      } else if (b.mode === 'engage' && los) {
        const angle = look(b, g.player.pos, dt);
        b.strafeTimer -= dt;
        if (b.strafeTimer <= 0) { b.strafeTimer = .9 + random() * 1.3; b.strafeDir = random() < .5 ? -1 : 1; }
        step.set(g.player.pos.x - b.pos.x, 0, g.player.pos.z - b.pos.z);
        const flat = step.length() || 1; step.multiplyScalar(1 / flat);
        // 射程带：太远压上、太近后撤、合适距离只横向拉扯，不站桩。
        const advance = flat > AI.rangeMax ? AI.rushSpeed : flat < AI.rangeMin ? -AI.retreatSpeed : 0;
        const strafe = flat > 6 ? 1.5 : 1.1;
        b.vel.x = -step.z * b.strafeDir * strafe + step.x * advance;
        b.vel.z = step.x * b.strafeDir * strafe + step.z * advance;
        b.vel.clampLength(0, AI.rushSpeed);
        if (angle < .22 && b.nextShot <= 0) { if (requestToken(b)) fire(b, distance); }
      } else if (b.mode === 'cover' && b.coverGoal) {
        look(b, g.player.pos, dt);
        if (b.pos.distanceTo(b.coverGoal) > .45) move(b, b.coverGoal, dt, AI.retreatSpeed);
        else {
          b.vel.set(0, 0, 0);
          if (b.coverT > .4 && b.nextShot <= 0 && distance < AI.rangeMax && random() < .6) {
            if (requestToken(b)) fire(b, distance);
          }
          if (b.coverT <= 0) { b.mode = 'engage'; b.coverGoal = null; }
        }
      } else if (b.mode === 'search') {
        if (b.modeT <= 0) { b.mode = 'patrol'; b.goal.copy(b.home); b.path = []; b.planTime = 0; }
        else {
          b.searchA += .55 * dt;
          b.goal.set(b.lastSeen.x + Math.cos(b.searchA) * AI.searchRadius, b.lastSeen.y, b.lastSeen.z + Math.sin(b.searchA) * AI.searchRadius);
          move(b, b.goal, dt, AI.stalkSpeed);
        }
      } else if (b.mode === 'investigate') {
        b.goal.copy(b.lastSeen);
        if (b.pos.distanceTo(b.lastSeen) < 1.6) { b.mode = 'search'; b.modeT = AI.searchTime; b.searchA = b.root.rotation.y; }
        else move(b, b.goal, dt, AI.stalkSpeed);
      } else if (bomb.planted && role === 'attack') {
        b.mode = 'retake'; b.goal.copy(bomb.pos);
        aim.copy(bomb.pos).y += .25;
        if (b.pos.distanceTo(bomb.pos) < 1.6 && g.physics.lineOfSight(eye, aim)) {
          if (!defuser) defuser = b; look(b, bomb.pos, dt);
        } else move(b, b.goal, dt, AI.stalkSpeed);
      } else if (b.memory > 0) {
        b.mode = 'investigate'; b.goal.copy(b.lastSeen); move(b, b.goal, dt, AI.stalkSpeed);
      } else {
        b.mode = 'patrol'; b.wait -= dt;
        if (b.wait <= 0 && b.pos.distanceToSquared(b.goal) < .36) {
          b.patrol = (b.patrol + 1) % 4;
          const angle = b.patrol * Math.PI / 2 + b.id * .7;
          // 每隔一个点走到守点附近：守军要覆盖 A/B 点，而不是只在出生点转圈。
          const sites = g.level && g.level.sites;
          const site = sites && sites.length ? sites[b.id % sites.length] : null;
          const origin = site && b.patrol % 2 === 0 ? site.pos : b.home;
          const radius = site && b.patrol % 2 === 0 ? 5.5 : 4.2;
          b.goal.copy(origin).add(step.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius)); b.wait = 1.4 + random() * 1.6;
          if (role === 'defend' && bomb.planted && b.home.distanceTo(bomb.pos) > 10)
            b.goal.copy(bomb.pos).add(step.set(Math.cos(angle) * 4, 0, Math.sin(angle) * 4));
        }
        if (b.wait <= 0) move(b, b.goal, dt, AI.patrolSpeed);
        b.scan += dt * 1.1;
        // 巡逻时枪口左右扫视 ±28°：人会边走边看两侧，不会像炮台一样只朝一个方向。
        const baseYaw = Math.atan2(-(b.goal.x - b.pos.x), -(b.goal.z - b.pos.z));
        const swayYaw = baseYaw + Math.sin(b.scan) * .5;
        const turnDiff = Math.atan2(Math.sin(swayYaw - b.root.rotation.y), Math.cos(swayYaw - b.root.rotation.y));
        const turnLimit = AI.turnRate * dt;
        b.root.rotation.y += Math.max(-turnLimit, Math.min(turnLimit, turnDiff * Math.min(1, dt * 6)));
      }
      b.state = b.mode;

      const oldX = b.pos.x, oldZ = b.pos.z, intendedMove = Math.hypot(b.vel.x, b.vel.z) > .2;
      b.vel.y -= 21 * dt; g.physics.moveCapsule(b.pos, b.vel, dt, .32, 1.8, true);
      const walkStall = b.mode === 'patrol' && b.wait <= 0 && b.pos.distanceToSquared(b.goal) > .36 && (!intendedMove || Math.hypot(b.pos.x - oldX, b.pos.z - oldZ) < dt * .1);
      const fightStall = b.mode === 'engage' && intendedMove && Math.hypot(b.pos.x - oldX, b.pos.z - oldZ) < dt * .08;
      b.stuckTime = (walkStall || fightStall) ? (b.stuckTime || 0) + dt : 0;
      if (b.stuckTime > 1.2 && b.mode === 'engage') { b.strafeDir *= -1; b.strafeTimer = 1.1; b.stuckTime = 0; }
      else if (b.stuckTime > 2) { b.goal.copy(b.pos); b.wait = .2; b.stuckTime = 0; b.planTime = 0; }
      const speed = Math.hypot(b.vel.x, b.vel.z); b.stride += speed * dt * 4.3;
      b.legs.forEach((leg, i) => {
        const swing = Math.sin(b.stride + i * Math.PI) * Math.min(.48, speed * .2);
        leg.rotation.x = swing; b.knees[i].rotation.x = Math.max(0, -swing) * 1.2;
      });
      b.torso.rotation.z = Math.sin(b.stride) * speed * .008;
      b.head.rotation.x = los ? Math.atan2(eye.y - g.player.eye.y, Math.max(1, distance)) * .4 : Math.sin(b.scan) * .06;
      b.head.rotation.y = los ? 0 : Math.sin(b.scan) * .5;
    }
    // A single bot contributes progress; the mission owns reset/cancel policy.
    g.onBotDefuse(defuser ? dt : 0, defuser?.id ?? null);
  }
  function raycast(origin, direction, maxDist) {
    ray.set(origin, step.copy(direction).normalize()); let best = null, limit = maxDist;
    for (const b of list) if (b.alive) {
      for (const [height, radius, headshot] of [[1.58, .17, true], [1.22, .28, false], [.84, .27, false], [.43, .24, false]]) {
        center.copy(b.pos).y += height; bounds.set(center, radius);
        if (!ray.intersectSphere(bounds, contact)) continue;
        const dist = origin.distanceTo(contact);
        if (dist < limit && g.physics.lineOfSight(origin, contact)) {
          limit = dist; best = { bot: b, point: contact.clone(), dist, headshot };
        }
      }
    }
    return best;
  }
  function damage(hit, amount) {
    const b = hit?.bot; if (!b?.alive || !(amount > 0)) return;
    b.health = Math.max(0, b.health - amount); b.memory = 4; b.lastSeen.copy(g.player.pos);
    b.retreat = Math.max(b.retreat || 0, .9 + random() * .8); b.strafeDir = random() < .5 ? -1 : 1; b.strafeTimer = .5;
    // 中枪立刻知道枪口方向，并就近找掩体；残血更保守。
    b.seeT = Math.max(b.seeT, reactionTime(b) * (b.health < 45 ? .4 : .8));
    b.coverT = b.health < 45 ? 1.8 + random() * 1.4 : .9 + random() * .8; b.coverGoal = null;
    if (!b.los) { b.mode = 'investigate'; b.goal.copy(g.player.pos); b.path = []; b.planTime = 0; }
    if (b.health === 0) {
      b.alive = false; b.root.visible = false; b.flash.visible = false; b.vel.set(0, 0, 0); releaseToken(b);
      g.onBotKilled(b, !!hit.headshot);
    }
  }
  return { reset, update, raycast, damage, alert, list, get aliveCount() { return list.filter(b => b.alive).length; } };
}
