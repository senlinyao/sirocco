import { LEVELS, levelById } from './levels.js?v=20261117a';
import { createMap } from './map.js?v=20261117a';
import { createWeapons } from './weapons.js?v=20261117a';
import { createBots } from './bots.js?v=20261117a';
import { createAudio } from './audio.js?v=20261117a';
import { createRenderDiagnostics } from './render-diagnostics.js?v=20261117a';

const E = window.SaltlineEngine, T = E.THREE;
const $ = id => document.getElementById(id);
const params = Object.fromEntries(new URLSearchParams(location.search));
const testMode = params.test === '1';
const mobileTouch = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints || 0) > 0 || params.touchui === '1';
const qualityName = params.quality || (mobileTouch ? 'low' : 'high');
const quality = {...E.qualityPresets[qualityName] || E.qualityPresets.high};
if(params.mb==='0' || mobileTouch)quality.motionBlur=false;
if(mobileTouch)document.body.classList.add('is-touch');
const textureSize = quality.tex;
const keys = new Set();

// ---------------------------------------------------------------------------
// 进度：只存在本地，不联网。
const PROGRESS_KEY = 'sirocco.progress.v1';
const progress = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null');
    if (raw && typeof raw.unlocked === 'number') {
      return { unlocked: Math.min(LEVELS.length, Math.max(1, raw.unlocked)), cleared: Array.isArray(raw.cleared) ? raw.cleared : [] };
    }
  } catch (error) {}
  return { unlocked: 1, cleared: [] };
})();
function saveProgress() {
  try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); } catch (error) {}
}

let currentLevel = levelById(Number(params.level) || 1);
let builtLevelId = 0;
const game = {phase:'menu', role:'attack', weapon:'ak', round:1, score:{ct:0,t:0}, time:105, kills:0, armor:100,
  hold:0, bomb:{planted:false,pos:null,site:null,time:40,defuseProgress:0}, result:null};
const g = {THREE:T, params:{...params,wet:0,tex:textureSize,seed:+(params.seed||71),dynres:testMode?'0':params.dynres},quality,events:E.createEvents(),rng:E.createRng(+(params.seed||71)),
  time:{t:0}, game, render:{post:{}}, ground:{isPuddle:()=>false}};
window.__ready = false;
let surfaceDebug = 'final';
const debugMaterials = {};
let accumulator=0, last=performance.now(), manualClock=false, hitTime=0, beep=0, uiTimer=0, freezeTimer=0;
let pointerFire=false;
// 手机端开镜：引擎里 AIM 按钮的开关变量读不到，这里改为直接看按钮的 active 状态。
let touchAdsBtn=null, touchAds=false;
// 引擎内部的 ADS 链路在 Sirocco 里被 weapon.ads 堵死，开镜改由这里直接驱动相机 FOV。
let adsBlend=0;
const ADS_FOV=52, ADS_BASE_FOV=75, FORCE_ADS=params.ads==='1';
let elapsedFrames=0, measuredMs=0, interactSite=null;
const roundLength=105, fuseLength=40, plantSeconds=3.2, defuseSeconds=5;
let renderer, camera, scene, viewScene, viewCamera, bombRoot, bombLed, radar;

// 大气与后处理分两段应用：sun/sky 在渲染器创建前，tune 在之后。
function applyAtmosphere(palette) {
  const p = palette || LEVELS[0].palette;
  E.sunSettings.dir.set(p.sunDir[0], p.sunDir[1], p.sunDir[2]).normalize();
  E.sunSettings.color.setRGB(p.sunColor[0], p.sunColor[1], p.sunColor[2]);
  E.sunSettings.intensity = p.sunIntensity;
  E.skySettings.zenith.setRGB(p.zenith[0], p.zenith[1], p.zenith[2]);
  E.skySettings.horizon.setRGB(p.horizon[0], p.horizon[1], p.horizon[2]);
  E.skySettings.horizonAway.setRGB(p.horizonAway[0], p.horizonAway[1], p.horizonAway[2]);
  E.skySettings.fog.setRGB(p.fog[0], p.fog[1], p.fog[2]);
}
function applyTune(palette) {
  const p = palette || LEVELS[0].palette;
  if (!g.render || !g.render.tune) return;
  Object.assign(g.render.tune, p.tune);
}

async function boot() {
  // Keep Saltline's shader sky/PMREM, PCSS, HDR/depth and post graph intact.
  // Only the authored sun/atmosphere palette changes per level.
  applyAtmosphere(currentLevel.palette);
  g.render=await E.createRenderer(g);
  ({renderer,scene,camera,viewCamera}=g.render);
  g.render.post.wet=0;
  applyTune(currentLevel.palette);
  viewScene=new T.Group(); viewScene.name='viewmodel-space'; camera.add(viewScene);
  const viewFill=new T.HemisphereLight(0xd9e6ef,0x826c4b,.65);
  viewFill.layers.set(1);scene.add(viewFill);
  const rifleFill=new T.DirectionalLight(0xffe4bf,1.5);rifleFill.position.set(-2,4,1);
  rifleFill.layers.set(1);viewScene.add(rifleFill);viewScene.add(rifleFill.target);
  Object.assign(g,{renderer,scene,camera,viewScene,viewCamera});
  g.renderDiagnostics=createRenderDiagnostics(g);
  g.renderDiagnostics.setDebug(params.pass||'final');
  $('boot-msg').textContent='正在构建材质…';
  g.mats=await E.createMaterials(g);g.mats.uniforms.wet.value=0;g.props=E.createProps(g);g.physics=E.createPhysics(g);
  g.physics.bounds.min.set(-28,0,-28);g.physics.bounds.max.set(28,20,28);
  $('boot-msg').textContent='正在构建 '+currentLevel.name+' …';
  g.params.seed = 71 + currentLevel.id * 97;
  g.level=createMap(g,currentLevel);builtLevelId=currentLevel.id;g.physics.build();
  g.input=E.createInput(g);g.player=E.createPlayer(g);g.player.reset(g.level.playerStart);g.player.enabled=false;
  g.events.on('player:dead',()=>finishRound(game.role==='attack'?'ct':'t','你被击倒了'));
  Object.assign(g.player.tuning,{walk:4.6,sprint:4.6,crouch:1.8,ads:4.6,fovSprint:0,fovAds:52,regenRate:0,bobY:.012,bobX:.008});
  g.player.setFov(75);g.audio=createAudio(g);
  Object.assign(g,{shoot,onPlayerHit,trace,onBotKilled,onBotDefuse});
  g.fx=await E.createCombatFX(g);
  // Allocate the world-depth copy before the first effect, not mid-render.
  void g.render.depthTexture;
  g.weapon=createWeapons(g);g.weapon.setVisible(false);
  viewScene.traverse(node=>node.layers.set(1));
  g.bots=createBots(g);g.bots.reset('attack',g.level.botSpawns.slice(0,currentLevel.enemies),currentLevel.difficulty);
  makeBomb();setSurfaceDebug(params.debug);radar=$('radar').getContext('2d');
  wireUI(); resize();setMenuCamera();
  await g.render.onLevelReady();
  $('boot').hidden=true;$('start').disabled=false;$('start').textContent='进入「'+currentLevel.name+'」';
  renderer.setAnimationLoop(loop);window.__ready=true;
  setupTouchStick();
  window.render_game_to_text=()=>JSON.stringify(snapshot());
  window.advanceTime=ms=>{manualClock=true;for(let n=0;n<Math.ceil(ms/(1000/60));n++)step(1/60);render();};
  window.__THREE_GAME_DIAGNOSTICS__={renderer:renderer.info,get state(){return snapshot();}};
  if(testMode) window.__test={g,levels:LEVELS,setSurfaceDebug,setDebugPass:g.renderDiagnostics.setDebug,start:startRound,step:window.advanceTime,pause:togglePause,
    async goto(id){await startAt(id,false);},
    place(x,z,yaw=0){g.player.pos.set(x,0,z);g.player.vel.set(0,0,0);g.player.yaw=yaw;g.player.pitch=0;g.player.update(0);},
    damage:onPlayerHit,finish:finishRound};
  if(params.autostart==='1')startRound(false);
}

// ---------------------------------------------------------------------------
// 关卡装载：只重建地图与物理盒，材质/渲染器/输入/玩家全部复用。
function disposeLevel() {
  if (!g.level || !g.level.root) return;
  g.scene.remove(g.level.root);
  g.level.root.traverse(node => { if (node.geometry) node.geometry.dispose(); });
  if (typeof g.level.collisionStart === 'number') g.physics.boxes.length = g.level.collisionStart;
  g.level = null;
}
async function loadLevel(level) {
  const boot = $('boot');
  boot.hidden = false;
  $('boot-msg').textContent = '正在构建 ' + level.name + ' …';
  await new Promise(resolve => setTimeout(resolve, 30));
  applyAtmosphere(level.palette);
  disposeLevel();
  g.params.seed = 71 + level.id * 97;
  g.level = createMap(g, level);
  g.physics.build();
  builtLevelId = level.id;
  applyTune(level.palette);
  g.player.reset(g.level.playerStart);
  g.bots.reset(game.role, g.level.botSpawns.slice(0, level.enemies), level.difficulty);
  try { await g.render.onLevelReady(); } catch (error) { console.warn(error); }
  boot.hidden = true;
}
async function startAt(levelId, lock = true) {
  const level = levelById(levelId);
  const rebuilding = level.id !== builtLevelId;
  if (rebuilding) {
    currentLevel = level;
    game.round = 1;
    game.score = {ct: 0, t: 0};
    await loadLevel(level);
    renderLevelList();
  } else {
    currentLevel = level;
    game.round = 1;
    game.score = {ct: 0, t: 0};
  }
  renderLevelList();
  // 重建关卡会经过 await，此时已不在用户手势上下文里，指针锁必须交给点击兜底。
  startRound(lock && !rebuilding);
}

function setMenuCamera(){camera.position.set(9,12,23);camera.lookAt(-5,3,-6);camera.fov=60;camera.updateProjectionMatrix();}
function resize(){g.render.resize();}
function renderLevelList() {
  const list = $('level-list');
  if (!list) return;
  list.replaceChildren();
  for (const level of LEVELS) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'level-card' + (level.id === currentLevel.id ? ' selected' : '');
    card.disabled = level.id > progress.unlocked;
    const cleared = progress.cleared.includes(level.id);
    const [fr, fg, fb] = level.palette.fog;
    card.innerHTML =
      '<b>' + String(level.id).padStart(2, '0') + '<i class="tint" style="background:rgb(' +
        Math.round(fr * 255) + ',' + Math.round(fg * 255) + ',' + Math.round(fb * 255) + ')"></i></b>' +
      '<span>' + level.name + (cleared ? '<em>已通关</em>' : '') + '</span>' +
      '<small>' + level.objective + ' · 守军 ' + level.enemies + ' 人</small>';
    card.onclick = () => {
      currentLevel = level;
      renderLevelList();
      syncBriefing();
    };
    list.appendChild(card);
  }
  syncBriefing();
}
function syncBriefing() {
  const brief = $('briefing');
  if (brief) brief.textContent = currentLevel.briefing;
  const tag = $('level-tag');
  if (tag) tag.textContent = currentLevel.code + ' · ' + currentLevel.subtitle + ' · 限时 ' + Math.floor(currentLevel.time / 60) + ':' + String(currentLevel.time % 60).padStart(2, '0');
  const start = $('start');
  if (start && !start.disabled) start.textContent = '进入「' + currentLevel.name + '」';
}

function wireUI(){
  renderLevelList();
  document.querySelectorAll('[data-role]').forEach(btn=>btn.onclick=()=>{game.role=btn.dataset.role;document.querySelectorAll('[data-role]').forEach(b=>b.classList.toggle('selected',b===btn));});
  document.querySelectorAll('[data-weapon]').forEach(btn=>btn.onclick=()=>{game.weapon=btn.dataset.weapon;document.querySelectorAll('[data-weapon]').forEach(b=>b.classList.toggle('selected',b===btn));});
  $('start').onclick=()=>{startAt(currentLevel.id,true).catch(error=>console.error(error));};
  $('next').onclick=()=>{
    if (game.result?.won && currentLevel.id >= LEVELS.length) returnMenu();
    else if (game.result?.won) startAt(currentLevel.id + 1, true).catch(error=>console.error(error));
    else startAt(currentLevel.id, true).catch(error=>console.error(error));
  };
  $('pause').onclick=togglePause;$('resume').onclick=togglePause;
  $('restart').onclick=()=>{startAt(currentLevel.id,true).catch(error=>console.error(error));};
  $('back').onclick=returnMenu;$('result-back').onclick=returnMenu;
  $('sound').onclick=()=>{g.audio.mute(!g.audio.muted);$('sound').textContent=g.audio.muted?'声音：关':'声音：开';};
  window.addEventListener('resize',resize);
  window.addEventListener('keydown',event=>{
    keys.add(event.code);
    if(event.code==='KeyF'&&!event.repeat){if(document.fullscreenElement)document.exitFullscreen();else $('app').requestFullscreen?.().catch(()=>{});}
  });
  window.addEventListener('keyup',event=>keys.delete(event.code));
  window.addEventListener('blur',()=>{keys.clear();if(game.phase==='playing')togglePause();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.phase==='playing')togglePause();});
}
function setupAdsButton(){
  const btn=document.querySelector('.t-ads');
  if(!btn||btn.__adsOurs)return;
  const fresh=btn.cloneNode(true);
  fresh.classList.remove('active');
  fresh.__adsOurs=true;
  btn.replaceWith(fresh);
  // 引擎原先在按钮上吞掉了事件，这里换成一个干净的按钮，按住开镜、松手退出（同桌面版右键手感）。
  const press = event => {
    if (event.cancelable) event.preventDefault();
    touchAds = true;
    fresh.classList.add('active');
  };
  const release = () => {
    touchAds = false;
    fresh.classList.remove('active');
  };
  fresh.addEventListener('pointerdown', press);
  fresh.addEventListener('touchstart', press, { passive: false });
  fresh.addEventListener('pointerup', release);
  fresh.addEventListener('pointercancel', release);
  fresh.addEventListener('pointerleave', release);
  fresh.addEventListener('touchend', release);
  fresh.addEventListener('touchcancel', release);
}
function armLockFallback(){
  const view = $('view');
  if (!view) return;
  view.onpointerdown = () => {
    if (game.phase !== 'playing' || document.pointerLockElement) return;
    try { g.input.requestLock(); } catch (error) {}
  };
  // 指针锁拿不到时引擎的 fire 状态可能一直不置位，这里按下左键就直接补扳机。
  view.onmousedown = event => { if (event.button === 0) pointerFire = true; };
  if(!armLockFallback.adsHook){
    armLockFallback.adsHook = true;
  }
  window.onmouseup = () => { pointerFire = false; };
  window.onblur = () => { pointerFire = false; };
  // 引擎在丢掉鼠标锁时会把 gameplay 关掉（画面还能转但不能走不能打），
  // 这里在失锁的同一刻把状态拉回来，抢在它后面执行。
  if (!armLockFallback.lockHook && g.events && g.events.on) {
    armLockFallback.lockHook = true;
    g.events.on('input:lock', payload => {
      if (!payload || !payload.locked) {
        pointerFire = false;
        if (game.phase === 'playing') g.input.setGameplay(true);
      }
    });
  }
}

function startRound(lock=true){
  g.audio.resetRound();
  game.phase='playing';game.time=currentLevel.time;game.hold=0;game.kills=0;game.armor=100;game.result=null;freezeTimer=0;
  game.bomb={planted:false,pos:null,site:null,time:fuseLength,defuseProgress:0};
  g.rng=E.createRng(71+currentLevel.id*13+game.round);g.player.reset(game.role==='attack'?g.level.playerStart:g.level.defenderStart);
  g.player.enabled=true;g.player.invulnerable=false;g.weapon.reset(game.weapon);g.weapon.setVisible(true);
  g.bots.reset(game.role,g.level.botSpawns.slice(0,currentLevel.enemies),currentLevel.difficulty);bombRoot.visible=false;
  if(game.role==='defend'){
    const site=g.level.sites[0];plantBomb(site);game.bomb.time=55;
  }
  g.input.setGameplay(true);keys.clear();g.audio.resume().catch(()=>{});
  if(lock)g.input.requestLock();
  armLockFallback();
  for(const id of ['menu','pause-menu','result'])$(id).hidden=true;
  $('hud').hidden=false;$('feed').replaceChildren();beep=0;hitTime=0;clearEffects();updateHUD();
  const touchRoot=document.querySelector('.touch');
  if(touchRoot&&g.input.touch)touchRoot.classList.add('on');
  touchAdsBtn=document.querySelector('.t-ads');touchAds=false;
}
function returnMenu(){
  const touchRoot=document.querySelector('.touch');if(touchRoot)touchRoot.classList.remove('on');
  game.phase='menu';g.input.setGameplay(false);g.input.exitLock();g.weapon.setVisible(false);g.audio.resetRound();g.audio.pause(true);$('menu').hidden=false;$('hud').hidden=true;$('pause-menu').hidden=true;$('result').hidden=true;setMenuCamera();renderLevelList();}
function togglePause(){
  if(game.phase!=='playing'&&game.phase!=='paused')return;
  const pause=game.phase==='playing';game.phase=pause?'paused':'playing';g.input.setGameplay(!pause);keys.clear();
  $('pause-menu').hidden=!pause;g.audio.pause(pause);if(pause)g.input.exitLock();else g.input.requestLock();
}
function finishRound(winner,reason){
  if(game.phase!=='playing')return;
  game.phase='result';game.score[winner]++;g.input.setGameplay(false);g.input.exitLock();
  const won=winner===(game.role==='attack'?'t':'ct');
  game.result={winner,reason,wons:won,won};
  if(won){
    if(!progress.cleared.includes(currentLevel.id))progress.cleared.push(currentLevel.id);
    if(currentLevel.id+1<=LEVELS.length)progress.unlocked=Math.max(progress.unlocked,currentLevel.id+1);
    saveProgress();
  }
  $('result-team').textContent=winner==='t'?'进攻方胜利':'防守方胜利';
  $('result-title').textContent=won?(currentLevel.id<LEVELS.length?'任务完成':'全关卡完成'):'任务失败';
  $('result-detail').textContent='第 '+currentLevel.id+' 关 · '+reason+' · 击杀 '+game.kills+' 人 · '+g.weapon.shots+' 发子弹';
  $('next').textContent=won?(currentLevel.id<LEVELS.length?'进入下一关':'返回菜单'):'重试本关';
  $('result').hidden=false;g.audio.play(won?'complete':'death',{gain:.3});updateHUD();
}
function makeBomb(){
  bombRoot=new T.Group();bombRoot.name='planted-device';scene.add(bombRoot);bombRoot.visible=false;
  const body=new T.Mesh(E.beveledBox(.44,.16,.32,.015),g.mats.get('polymer_tan',{triplanar:true,interior:true}));body.position.y=.13;bombRoot.add(body);
  for(let i=0;i<4;i++){const c=new T.Mesh(new T.CylinderGeometry(.037,.037,.36,10),g.mats.get('paint_grey',{color:0x8b6b3c, triplanar:true,interior:true}));c.rotation.z=Math.PI/2;c.position.set(0,.06,(i-1.5)*.067);bombRoot.add(c);}
  const display=new T.Mesh(new T.PlaneGeometry(.18,.07),new T.MeshBasicMaterial({color:0x98db7a }));display.rotation.x=-Math.PI/2;display.position.set(0,.215,0);bombRoot.add(display);
  bombLed=new T.Mesh(new T.SphereGeometry(.024,8,6),new T.MeshBasicMaterial({color:0xff2b13}));bombLed.position.set(.16,.23,0);bombRoot.add(bombLed);
}
function plantBomb(site){game.bomb.planted=true;game.bomb.pos=site.pos.clone();game.bomb.site=site.id;game.bomb.time=fuseLength;game.hold=0;bombRoot.position.copy(site.pos);bombRoot.visible=true;g.audio.play('objective_all',{gain:.35});}
function updateObjective(dt){
  interactSite=null;
  if(!game.bomb.planted){
    game.time-=dt;
    if(game.time<=0){finishRound('ct','安放时间耗尽');return;}
    if(game.role==='attack')interactSite=g.level.sites.find(s=>Math.hypot(g.player.pos.x-s.pos.x,g.player.pos.z-s.pos.z)<s.radius&&g.player.pos.y<.4);
  }else{
    game.bomb.time-=dt;beep-=dt;bombLed.visible=Math.sin(g.time.t*12)>0;
    if(beep<=0){beep=Math.max(.12,game.bomb.time/42);g.audio.play('ui_hover',{pos:game.bomb.pos,gain:.25,pitch:1.6});}
    if(game.bomb.time<=0){g.fx.explosion(game.bomb.pos,2.2);g.audio.play('explosion',{pos:game.bomb.pos,gain:.7});bombRoot.visible=false;finishRound('t','炸药已起爆');return;}
    if(game.role==='defend'&&g.player.pos.distanceTo(game.bomb.pos)<2.2&&g.physics.lineOfSight(g.player.eye,game.bomb.pos.clone().add(new T.Vector3(0,.25,0))))interactSite={id:game.bomb.site};
  }
  const holding=g.player.alive&&!!interactSite&&g.input.down('interact')&&g.player.onGround;
  if(holding){
    game.hold+=dt;g.player.vel.x=g.player.vel.z=0;
    if(game.hold>=(game.role==='attack'?plantSeconds:defuseSeconds)){
      if(game.role==='attack')plantBomb(interactSite);else finishRound('ct','炸药已安全拆除');
    }
  }else game.hold=0;
  g.player.enabled=!holding; if(holding)g.input.fire=false;
}
function onBotDefuse(dt,botId=null){
  if(game.phase!=='playing'||game.role!=='attack'||!game.bomb.planted)return;
  if(dt===0){game.bomb.defuseProgress=0;game.bomb.defuser=null;return;}
  if(game.bomb.defuser!==botId){game.bomb.defuseProgress=0;game.bomb.defuser=botId;}
  game.bomb.defuseProgress+=dt;
  if(game.bomb.defuseProgress>=10)finishRound('ct','守军拆除了炸药');
}
function onPlayerHit(amount,from){
  if(game.phase!=='playing'||!g.player.alive)return;
  const absorbed=Math.min(game.armor,amount*.45);game.armor-=absorbed;g.player.damage(amount-absorbed,from);
  g.audio.play('hurt',{gain:.35});
  if(!g.player.alive)finishRound(game.role==='attack'?'ct':'t','你被击倒了');
}
function onBotKilled(bot,headshot){
  game.kills++;addFeed(`${headshot?'爆头 · ':''}${g.weapon.name} → ${bot.name||'守军'}`);g.audio.play('impact_enemy',{gain:.4});
  if(g.bots.aliveCount===0&&game.role==='attack')finishRound('t','守军已全部清除');
}
function shoot({damage,spread,range,weapon}){
  if(game.phase!=='playing'||game.hold>0)return;
  const origin=g.player.eye.clone(), direction=g.player.forward.clone();
  direction.x+=(g.rng()-.5)*spread*2;direction.y+=(g.rng()-.5)*spread*2;direction.z+=(g.rng()-.5)*spread*2;direction.normalize();
  const wall=g.physics.raycast(origin,direction,range), hit=g.bots.raycast(origin,direction,wall?wall.dist:range);
  const end=hit?hit.point:wall?wall.point:origin.clone().addScaledVector(direction,range);
  const muzzle=g.weapon.effectPoint('muzzle');
  trace(muzzle,end,0xffdf94);g.bots.alert?.(origin);
  g.fx.shell(g.weapon.effectPoint('eject'),new T.Vector3(1.8,1.2,.4).applyQuaternion(camera.quaternion));
  g.render.lightPool.flash(muzzle,0xffbd70,10,5,.045);
  if(wall&&!hit)g.events.emit('impact',{point:wall.point,normal:wall.normal,surface:wall.surface,dir:direction,from:'player'});
  if(hit)g.fx.dust(hit.point,direction.clone().negate(),.35);
  if(hit){hitTime=.12;g.bots.damage(hit,damage*(hit.headshot?4:1));}
  else if(wall){g.audio.play('impact_'+(wall.surface==='metal'?'metal':'concrete'),{pos:wall.point,gain:.2});}
}
function trace(from,to,color=0xffd28b){g.fx.tracer(from,to,{color,speed:180});}
function clearEffects(){g.fx.clear();}
function setSurfaceDebug(mode='final') {
  surfaceDebug=mode;
  if(mode==='clay'||mode==='normals'){
    debugMaterials[mode] ||= mode==='clay'
      ? new T.MeshStandardMaterial({color:0xb7b7b7,roughness:.85}) : new T.MeshNormalMaterial();
    scene.overrideMaterial=debugMaterials[mode];
    scene.background=new T.Color(0x8d9ca8);g.render.sky.visible=false;g.fx.root.visible=false;
  }else{
    scene.overrideMaterial=null;scene.background=null;g.render.sky.visible=true;g.fx.root.visible=true;
  }
}
function addFeed(text){const item=document.createElement('div');item.textContent=text;$('feed').prepend(item);while($('feed').children.length>4)$('feed').lastChild.remove();}
function step(dt){
  // 引擎在失锁或窗口切换时会把 gameplay 关掉，导致视角能动但 WASD 和开火全失效；
  // 这里每帧按真实 phase 兜回来（同一个值反复设置是空操作）。
  setupAdsButton();
  g.input.setGameplay(game.phase==='playing');
  g.input.update(dt);
  applyTouchStick();
  applyFakeLook();
  if(touchAds&&game.phase==='playing')g.input.ads=true;
  if(game.phase!=='playing')pointerFire=false;
  if(g.input.pressed('pause'))togglePause();
  if(game.phase==='playing'){
    g.time.t+=dt;
    g.player.tuning.walk=(keys.has('ShiftLeft')||keys.has('ShiftRight'))?2.2:4.6;g.input.sprint=false;
    if(adsBlend>.01){g.input.look.dx*=1-.4*adsBlend;g.input.look.dy*=1-.4*adsBlend;}
    g.player.update(dt);updateObjective(dt);
    if(game.phase==='playing'){g.weapon.update(dt);if(pointerFire&&!g.input.fire)g.weapon.trigger();g.bots.update(dt);}
    hitTime=Math.max(0,hitTime-dt);g.level.update?.(dt);
  }else if(game.phase==='result')g.weapon.update(dt);
  if(game.phase==='playing'||game.phase==='result')g.fx.update(dt);
  const adsOn=FORCE_ADS||touchAds;
  const adsWant=adsOn&&game.phase==='playing'?1:0;
  adsBlend+=(adsWant-adsBlend)*Math.min(1,dt*12);
  const adsFov=ADS_BASE_FOV+(ADS_FOV-ADS_BASE_FOV)*adsBlend;
  if(Math.abs(camera.fov-adsFov)>.01){camera.fov=adsFov;camera.updateProjectionMatrix();}
  g.render.post.damage=g.player.hurtPulse;g.render.post.lowHealth=Math.max(0,1-g.player.health/30);
  g.mats.update(dt);g.audio.update?.(dt);g.input.endFrame();uiTimer+=dt;if(uiTimer>.05){updateHUD();uiTimer=0;}
}
function loop(now){
  const delta=Math.min(.1,(now-last)/1000);last=now;
  if(!manualClock){accumulator+=delta;while(accumulator>=1/60){step(1/60);accumulator-=1/60;}}
  render(delta);elapsedFrames++;measuredMs+=delta*1000;
}
function render(dt=1/60){
  g.renderDiagnostics.begin();
  if(surfaceDebug==='clay'||surfaceDebug==='normals'){
    camera.updateMatrixWorld(true);
    viewCamera.matrixAutoUpdate=false;viewCamera.matrixWorldAutoUpdate=false;
    viewCamera.matrixWorld.copy(camera.matrixWorld);viewCamera.matrixWorldInverse.copy(camera.matrixWorldInverse);
    renderer.info.reset();renderer.setRenderTarget(null);
    renderer.toneMapping=surfaceDebug==='normals'?T.NoToneMapping:T.ACESFilmicToneMapping;
    renderer.toneMappingExposure=1;renderer.clear();renderer.shadowMap.needsUpdate=true;
    renderer.render(scene,camera);renderer.clearDepth();renderer.render(scene,viewCamera);
  }else g.render.frame(dt);
  g.renderDiagnostics.draw();
}
function drawRadar(){
  const c=radar;c.clearRect(0,0,220,220);const sc=3.3,xy=p=>[110+p.x*sc,110+p.z*sc];
  c.strokeStyle='#a9b2ad80';c.lineWidth=1;c.strokeRect(110-28*sc,110-28*sc,56*sc,56*sc);
  c.fillStyle='#a3a49a65';for(const r of g.level.radarRects||[])c.fillRect(110+(r.x-r.w/2)*sc,110+(r.z-r.d/2)*sc,r.w*sc,r.d*sc);
  c.font='bold 15px Arial';c.textAlign='center';for(const s of g.level.sites){const[x,z]=xy(s.pos);c.fillStyle='#e1bd75';c.fillText(s.id,x,z+5);}
  if(game.bomb.planted){const[x,z]=xy(game.bomb.pos);c.fillStyle='#ef674b';c.fillRect(x-4,z-4,8,8);}
  const[x,z]=xy(g.player.pos);c.save();c.translate(x,z);c.rotate(-g.player.yaw);c.fillStyle='#edf6f3';c.beginPath();c.moveTo(0,-8);c.lineTo(-5,5);c.lineTo(5,5);c.closePath();c.fill();c.restore();
  for(const b of g.bots.list){if(!b.alive)continue;const pos=b.pos||b.root?.position;if(!pos)continue;
    if(g.player.pos.distanceTo(pos)<25&&g.physics.lineOfSight(g.player.eye,pos.clone().add(new T.Vector3(0,1.5,0)))){const[x,z]=xy(pos);c.fillStyle='#ed7559';c.beginPath();c.arc(x,z,3,0,Math.PI*2);c.fill();}}
}
function updateHUD(){
  if(!g.player)return;
  $('health').textContent=Math.ceil(g.player.health);$('armor').textContent=Math.ceil(game.armor);$('ammo').textContent=g.weapon.ammo;$('reserve').textContent=g.weapon.reserve;$('weapon-name').textContent=g.weapon.name;
  $('reload-state').textContent=g.weapon.reloading?'装填中':g.weapon.ammo===0?'R 键装填':'';
  const remaining=Math.ceil(Math.max(0,game.bomb.planted?game.bomb.time:game.time));$('timer').textContent=Math.floor(remaining/60)+':'+String(remaining%60).padStart(2,'0');
  $('round').textContent='第 '+currentLevel.id+' 关';
  $('ct-score').textContent=progress.cleared.length;$('t-score').textContent=game.kills;
  document.querySelector('.score').classList.toggle('planted',game.bomb.planted);
  $('objective').textContent=game.bomb.planted?(game.role==='attack'?`炸药已安放 · 守住 ${game.bomb.site} 区`:`${game.bomb.site} 区有炸药 · 接近并按 E`):currentLevel.objective;
  if(game.bomb.defuseProgress>0&&game.role==='attack')$('objective').textContent='守军正在拆弹 —— 阻止他们';
  if(game.phase==='playing'&&!document.pointerLockElement&&!g.input.touch)$('objective').textContent='点击画面锁定鼠标 · 锁定后才能转身和开火';
  $('interact').hidden=!interactSite||game.phase!=='playing';$('prompt').textContent='按住 E · '+(game.role==='attack'?'安放炸药':'拆除炸药');
  $('hold-progress').style.width=Math.min(100,game.hold/(game.role==='attack'?plantSeconds:defuseSeconds)*100)+'%';
  $('crosshair').style.setProperty('--gap',(5+g.weapon.spread*380)+'px');$('hitmarker').style.opacity=hitTime>0?'1':'0';
  $('hurt').style.opacity=String(g.player.hurtPulse*.55);
  const zone=g.level.zones?.find(z=>g.player.pos.x>=z.min[0]&&g.player.pos.x<=z.max[0]&&g.player.pos.z>=z.min[1]&&g.player.pos.z<=z.max[1]);
  $('location').textContent=zone?.name||currentLevel.name;if(radar)drawRadar();
}
function snapshot(){return {phase:game.phase,level:currentLevel.id,role:game.role,round:game.round,score:game.score,time:+game.time.toFixed(2),
  coordinates:'metres; x east, y up, z south; north is -z',player:{pos:g.player.pos.toArray().map(n=>+n.toFixed(3)),yaw:g.player.yaw,hp:g.player.health,armor:game.armor,onGround:g.player.onGround},
  weapon:{id:g.weapon.id,ammo:g.weapon.ammo,reserve:g.weapon.reserve,reloading:g.weapon.reloading,shots:g.weapon.shots,spread:g.weapon.spread},
  bomb:{...game.bomb,pos:game.bomb.pos?.toArray()},hold:game.hold,sites:g.level.sites.map(s=>({id:s.id,pos:s.pos.toArray()})),
  bots:g.bots.list.filter(b=>b.alive).map(b=>({name:b.name,alive:b.alive,hp:b.health,pos:(b.pos||b.root.position).toArray()})),
  result:game.result,audio:g.audio.debug(),assets:{quality:g.quality.name,textureSize,materials:g.mats.stats(),map:g.level.root.userData.stats,
    weapon:g.weapon.root.userData.stats,
    bot:{joints:g.bots.list[0].root.userData.asset.joints,meshes:g.bots.list[0].root.userData.asset.meshes,triangles:g.bots.list[0].root.userData.asset.triangles},
    tracerPool:48,activeTracers:g.fx.stats().tracers,fx:g.fx.stats(),ground:g.ground.stats},pipeline:{...g.render.stats(),passes:g.renderDiagnostics.stats().passes},render:{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures},errors:window.__errors};}
boot().catch(error=>{$('fatal').hidden=false;$('fatal').textContent='无法启动：'+error.stack;$('boot').hidden=true;console.error(error);});
/* ==== 手机版：开机就把触屏控件建出来，别等第一次点屏幕 ==== */
/* 只用手势建立控件，不碰摇杆占用状态：模拟触摸必须在 canvas 上发，
   并且收尾要带 changedTouches，否则引擎的摇杆标识位会一直占着、摇杆再也起不来。 */
if (mobileTouch && params.touchui !== '1') {
  setTimeout(() => {
    try {
      const view = (renderer && renderer.domElement) || document.getElementById('view');
      const start = new Event('touchstart', { bubbles: true, cancelable: true });
      start.touches = [{ identifier: 900, clientX: 70, clientY: innerHeight - 140 }];
      start.changedTouches = start.touches;
      view.dispatchEvent(start);
      const lockTriggered = new Event('touchstart', { bubbles: true });
      lockTriggered.touches = [];
      lockTriggered.changedTouches = [];
      window.dispatchEvent(lockTriggered);
      const end = new Event('touchend', { bubbles: true, cancelable: true });
      end.touches = [];
      end.changedTouches = [{ identifier: 900, clientX: 70, clientY: innerHeight - 140 }];
      view.dispatchEvent(end);
    } catch (error) { console.warn('touch ui bootstrap failed', error); }
  }, 2200);
}
/* ==== 手机版：横屏按钮 ====
   先试真全屏 + 锁定横屏（Android / Chrome 能成）；
   放不成就退到"伪横屏"：把整个 #app 转 90°，按横屏比例重排，手机横过来拿就是满屏。
   微信内置浏览器和 iPhone Safari 没有全屏权限、也不能锁方向，走的就是后一条。 */
function setFakeLandscape(on){
  const app = document.getElementById('app');
  if (!app) return;
  fakeLandscape = !!on;
  if (on) {
    document.body.classList.add('fake-landscape');
    app.style.width = innerHeight + 'px';
    app.style.height = innerWidth + 'px';
    app.style.transform = 'translate(' + innerWidth + 'px,0) rotate(90deg)';
  } else {
    document.body.classList.remove('fake-landscape');
    app.style.width = '';
    app.style.height = '';
    app.style.transform = '';
  }
  resize();
}
function toggleLandscape(){
  if (fakeLandscape) { setFakeLandscape(false); return; }
  if (innerWidth > innerHeight) return; // 已经横着拿了，不用动
  const enter = async () => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape');
      }
    } catch (error) {
      console.warn('fullscreen / orientation lock unavailable', error);
      setFakeLandscape(true);
    }
  };
  enter().then(() => {
    // 浏览器答应了不代表真转了（iOS 直接忽略），等一拍看实际方向
    setTimeout(() => { if (innerWidth < innerHeight) setFakeLandscape(true); }, 600);
  });
}
if (mobileTouch) {
  const fsBtn = document.createElement('button');
  fsBtn.id = 'fs-btn';
  fsBtn.type = 'button';
  fsBtn.title = '横屏';
  fsBtn.textContent = '⛶';
  document.getElementById('app').appendChild(fsBtn);
  fsBtn.addEventListener('click', event => { event.stopPropagation(); toggleLandscape(); });
  window.addEventListener('resize', () => {
    if (fakeLandscape) setFakeLandscape(innerWidth < innerHeight);
  });
}
if (params.fake === '1') {
  setTimeout(() => setFakeLandscape(true), 1200);
}
/* ==== 触屏 UI 自检（?touchui=1 时模拟一次触摸，让引擎生成摇杆与按钮） ==== */
if (params.touchui === '1') {
  setTimeout(() => {
    try {
      const touchStart = new Event('touchstart', { bubbles: true });
      touchStart.touches = [{ identifier: 1, clientX: 70, clientY: innerHeight - 140 }];
      touchStart.changedTouches = touchStart.touches;
      window.dispatchEvent(touchStart);
      const touchEnd = new Event('touchend', { bubbles: true });
      touchEnd.touches = [];
      touchEnd.changedTouches = [{ identifier: 1, clientX: 70, clientY: innerHeight - 140 }];
      window.dispatchEvent(touchEnd);
    } catch (error) { console.warn('touch ui simulation failed', error); }
    setTimeout(() => {
      const ads = document.querySelector('.t-ads');
      if (!ads) return;
      const box = ads.getBoundingClientRect();
      const x = box.left + box.width / 2, y = box.top + box.height / 2;
      const ev = new Event('touchstart', { bubbles: true });
      ev.touches = [{ identifier: 2, clientX: x, clientY: y }];
      ev.changedTouches = ev.touches;
      ads.dispatchEvent(ev);
    }, 3300);
  }, 1500);
}
/* ==== 键盘自动测试（?keytest=1：按住 W 两秒，用来区分「gameplay 没开」还是「摇杆没接上」） ==== */
if (params.keytest === '1') {
  setTimeout(() => {
    window.__k0 = { x: g.player.pos.x, z: g.player.pos.z };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
    setTimeout(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
      window.__kmoved = Math.hypot(g.player.pos.x - window.__k0.x, g.player.pos.z - window.__k0.z);
    }, 2000);
  }, 3000);
}
/* ==== 手机版自建摇杆：左半屏按住拖动就走路 ====
   引擎自带的摇杆在真机上不稳定（标识位会被占住），这里自己接管左半屏触摸，
   每帧把方向叠加到引擎的移动量上；右半屏仍然留给引擎做转视角。 */
const touchStick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
let fakeLandscape = false;
// 伪横屏下 #app 整体转了 90°，触摸点要换算回游戏内的横屏坐标
function toGamePoint(clientX, clientY){
  if (!fakeLandscape) return { x: clientX, y: clientY };
  return { x: clientY, y: innerWidth - clientX };
}
function applyTouchStick(){
  if (!mobileTouch || game.phase !== 'playing') return;
  if (!touchStick.x && !touchStick.y) return;
  g.input.move.x += touchStick.x;
  g.input.move.y += touchStick.y;
  const len = Math.hypot(g.input.move.x, g.input.move.y);
  if (len > 1) { g.input.move.x /= len; g.input.move.y /= len; }
}
/* 伪横屏下右半屏的转视角要自己算：画面整体转了 90°，引擎按屏幕坐标收数据会左右上下搞反。
   这里把触摸点换算成游戏内坐标再喂进去，系数 0.0052 与引擎触摸灵敏度保持一致。 */
const fakeLook = { id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
function applyFakeLook(){
  if (!fakeLook.dx && !fakeLook.dy) return;
  g.input.look.dx += fakeLook.dx;
  g.input.look.dy += fakeLook.dy;
  fakeLook.dx = 0;
  fakeLook.dy = 0;
}
function setupTouchStick(){
  if (!mobileTouch || setupTouchStick.done) return;
  setupTouchStick.done = true;
  const stickEl = () => document.querySelector('.t-stick');
  const nubEl = () => document.querySelector('.t-nub');
  const MAX = 58, DEAD = 9;
  const handleStart = event => {
    if (event.__stickSeen) return;
    event.__stickSeen = true;
    window.__stickStarts = (window.__stickStarts || 0) + 1;
    if (game.phase !== 'playing' || touchStick.id !== null) return;
    const point = event.changedTouches && event.changedTouches[0];
    if (!point) return;
    const target = event.target;
    if (target && target.closest && target.closest('.t-btn')) return;
    const local = toGamePoint(point.clientX, point.clientY);
    const width = fakeLandscape ? innerHeight : innerWidth;
    if (fakeLandscape && local.x > width * 0.45) {
      fakeLook.id = point.identifier;
      fakeLook.ox = local.x;
      fakeLook.oy = local.y;
      try { event.stopPropagation(); } catch (error) {}
      return;
    }
    if (local.x > width * 0.45) return;
    touchStick.id = point.identifier;
    touchStick.ox = local.x;
    touchStick.oy = local.y;
    touchStick.x = 0;
    touchStick.y = 0;
    const stick = stickEl();
    if (stick) {
      stick.style.transform = 'translate3d(' + local.x + 'px,' + local.y + 'px,0)';
      stick.classList.add('on');
    }
    // 自建摇杆接管这根手指，别让引擎再把它当转视角用
    try { event.stopPropagation(); } catch (error) {}
  };
  const handleMove = event => {
    const points = event.changedTouches || event.touches || [];
    if (fakeLook.id !== null) {
      for (const point of points) {
        if (point.identifier !== fakeLook.id) continue;
        const local = toGamePoint(point.clientX, point.clientY);
        // 与引擎触摸灵敏度一致（0.0052 弧度/像素）
        fakeLook.dx += (local.x - fakeLook.ox) * 0.0052;
        fakeLook.dy += (local.y - fakeLook.oy) * 0.0052;
        fakeLook.ox = local.x;
        fakeLook.oy = local.y;
      }
      return;
    }
    if (touchStick.id === null) return;
    window.__stickMoves = (window.__stickMoves || 0) + 1;
    for (const point of points) {
      if (point.identifier !== touchStick.id) continue;
      const local = toGamePoint(point.clientX, point.clientY);
      const dx = local.x - touchStick.ox;
      const dy = local.y - touchStick.oy;
      const len = Math.hypot(dx, dy);
      if (len < DEAD) { touchStick.x = 0; touchStick.y = 0; }
      else { touchStick.x = dx / MAX; touchStick.y = -dy / MAX; }
      const k = len > MAX ? MAX / len : 1;
      const nub = nubEl();
      if (nub) nub.style.transform = 'translate3d(' + (dx * k).toFixed(1) + 'px,' + (dy * k).toFixed(1) + 'px,0)';
    }
  };
  const handleEnd = event => {
    if (fakeLook.id !== null) {
      for (const point of event.changedTouches || []) {
        if (point.identifier === fakeLook.id) fakeLook.id = null;
      }
    }
    if (touchStick.id === null) return;
    const points = event.changedTouches || [];
    for (const point of points) {
      if (point.identifier !== touchStick.id) continue;
      touchStick.id = null;
      touchStick.x = 0;
      touchStick.y = 0;
      const stick = stickEl();
      if (stick) stick.classList.remove('on');
      const nub = nubEl();
      if (nub) nub.style.transform = 'translate3d(0,0,0)';
    }
  };
  const targets = [window, document];
  const canvas = renderer && renderer.domElement;
  if (canvas) targets.push(canvas);
  targets.forEach(target => {
    target.addEventListener('touchstart', handleStart, { capture: true, passive: true });
    target.addEventListener('touchmove', handleMove, { capture: true, passive: true });
    target.addEventListener('touchend', handleEnd, { capture: true, passive: true });
    target.addEventListener('touchcancel', handleEnd, { capture: true, passive: true });
  });
}
/* 摇杆监听在 boot 完成后挂（那时才知道引擎用的是哪个画布） */
/* ==== 摇杆注入测试（?stickdrv=1：绕过触摸事件，直接给摇杆一个向前向量） ==== */
if (params.stickdrv === '1') {
  setTimeout(() => {
    window.__t0 = { x: g.player.pos.x, z: g.player.pos.z };
    touchStick.x = 0; touchStick.y = 1;
    setTimeout(() => { touchStick.x = 0; touchStick.y = 0; }, 2500);
  }, 3000);
}
/* ==== 摇杆自动测试（?toucht=1：模拟左半屏按住上推，若角色前进说明摇杆通了） ==== */
if (params.toucht === '1') {
  setTimeout(() => {
    try {
      const view = (renderer && renderer.domElement) || document.getElementById('view');
      const send = (type, id, x, y, empty) => {
        const ev = new Event(type, { bubbles: true, cancelable: true });
        ev.touches = empty ? [] : [{ identifier: id, clientX: x, clientY: y }];
        ev.changedTouches = [{ identifier: id, clientX: x, clientY: y }];
        view.dispatchEvent(ev);
        document.dispatchEvent(ev);
      };
      const x = 70, y = innerHeight - 120;
      window.__hit = 0;
      ['touchstart', 'touchmove'].forEach(type => {
        view.addEventListener(type, () => { window.__hit++; }, true);
      });
      window.__t0 = { x: g.player.pos.x, z: g.player.pos.z };
      window.__mvmax = 0;
      send('touchstart', 7, x, y, false);
      window.__stick = ((document.querySelector('.t-stick') || {}).className || 'none');
      let k = 0;
      const timer = setInterval(() => {
        k++;
        send('touchmove', 7, x, y - Math.min(70, k * 4), false);
        const mv = g.input.move;
        window.__mvmax = Math.max(window.__mvmax, Math.hypot(mv.x, mv.y));
        if (k >= 40) { clearInterval(timer); send('touchend', 7, x, y - 70, true); }
      }, 60);
    } catch (error) { console.warn('joystick test failed', error); }
  }, 3000);
}
/* ==== 手机现场诊断（?diag=1 时在首次真实触摸后显示一行状态） ==== */
if (params.diag === '1') {
  window.addEventListener('touchstart', () => {
    setTimeout(() => {
      const root = document.querySelector('.touch');
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;background:#000d;color:#8f8;font:12px/1.5 Consolas,monospace;padding:6px 9px';
      probe.textContent = 'touch=' + (root ? root.className : 'none') +
        ' btn=' + (root ? root.querySelectorAll('.t-btn').length : 0) +
        ' stick=' + !!(root && root.querySelector('.t-stick')) +
        ' ads=' + adsBlend.toFixed(2) +
        ' fov=' + Math.round(g.camera.fov) +
        ' phase=' + game.phase;
      if (window.__t0) {
        probe.textContent += ' moved=' + Math.hypot(g.player.pos.x - window.__t0.x, g.player.pos.z - window.__t0.z).toFixed(2) +
          ' mvmax=' + (window.__mvmax || 0).toFixed(2) +
          ' nowmv=' + Math.hypot(g.input.move.x, g.input.move.y).toFixed(2);
      }
      try {
        const cs = Array.from(document.querySelectorAll('canvas'));
        probe.textContent += ' | canvases=' + cs.map(c => (c.id || c.className || 'anon') + '@' + (c.parentElement && c.parentElement.id || '?')).join('~') +
          ' dom=' + (renderer && renderer.domElement ? (renderer.domElement.id || renderer.domElement.className || 'anon') + '@' + (renderer.domElement.parentElement && renderer.domElement.parentElement.id || '?') : 'none') +
          ' stickcls=' + (window.__stick || 'n/a') + ' hit=' + (window.__hit || 0) +
          ' st=' + (window.__stickStarts || 0) + ' mv=' + (window.__stickMoves || 0) +
          ' stx=' + touchStick.x.toFixed(2) + ',' + touchStick.y.toFixed(2) + ' sid=' + touchStick.id +
          ' ls=[' + (window.__ls || '') + ']' +
          ' kmoved=' + (window.__kmoved === undefined ? 'n/a' : window.__kmoved.toFixed(2));
      } catch (e) { probe.textContent += ' canvas-probe-failed'; }
      if (root) {
        const box = e => { const r = e.getBoundingClientRect(); return Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height); };
        probe.textContent += ' | view=' + innerWidth + 'x' + innerHeight +
          ' root=' + box(root) +
          ' fire=' + box(root.querySelector('.t-fire') || root) +
          ' ads=' + box(root.querySelector('.t-ads') || root) +
          ' rld=' + box(root.querySelector('.t-reload') || root) +
          ' jump=' + box(root.querySelector('.t-jump') || root) +
          ' use=' + box(root.querySelector('.t-interact') || root);
      }
      document.body.appendChild(probe);
      try {
        const fire = root && root.querySelector('.t-fire');
        if (fire) {
          const cs = getComputedStyle(fire);
          const marker = document.createElement('div');
          const r = fire.getBoundingClientRect();
          marker.style.cssText = 'position:fixed;left:' + (r.left + r.width / 2 - 4) + 'px;top:' + (r.top + r.height / 2 - 4) + 'px;width:8px;height:8px;background:#f0f;z-index:999';
          document.body.appendChild(marker);
          probe.textContent += ' | firecss=' + cs.display + '/' + cs.visibility + '/' + cs.opacity + '/z' + cs.zIndex + '/' + cs.position;
        }
      } catch (e) { probe.textContent += ' css-probe-failed'; }
    }, 5200);
  }, { once: true });
}
/* ==== 近身验证（?botclose=1 时把玩家瞬移到第一个守军前方，用来观察接敌行为） ==== */
if (params.botclose === '1') {
  setTimeout(() => {
    try {
      const bot = g.bots.list.find(item => item.alive);
      if (!bot) return;
      // 放到守军视线的正前方 6 米：用来验证「看见 -> 反应 -> 开火」整条链路。
      const site = g.level.sites && g.level.sites[0];
      const spot = site ? site.pos.clone() : bot.pos.clone();
      spot.x += 1.5;
      g.player.pos.copy(spot);
      g.player.pos.y = spot.y;
      if (params.botfast === '1') g.bots.list.forEach(item => { item.forceReaction = .12; });
    } catch (error) { console.warn('botclose failed', error); }
  }, 6000);
}
/* ==== 自动推进（?botrun=1 时持续按住 W，用来观察守军接敌行为） ==== */
if (params.botrun === '1') {
  setInterval(() => {
    const forward = new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true });
    window.dispatchEvent(forward);
  }, 100);
}
/* ==== 守军 AI 观察（?botdump=1 时在左上角实时打印每个守军的模式/距离/视线） ==== */
if (params.botdump === '1') {
  const line = document.createElement('div');
  line.style.cssText = 'position:fixed;left:8px;top:8px;z-index:99;background:#000d;color:#9fc;font:11px/1.4 Consolas,monospace;padding:6px 8px;white-space:pre';
  document.body.appendChild(line);
  setInterval(() => {
    try {
      line.textContent = g.bots.list.filter(bot => bot.alive).map(bot =>
        (() => {
          const fx = -Math.sin(bot.root.rotation.y), fz = -Math.cos(bot.root.rotation.y);
          const dx = g.player.pos.x - bot.pos.x, dz = g.player.pos.z - bot.pos.z;
          const flat = Math.hypot(dx, dz) || 1e-4;
          const facing = (fx * dx + fz * dz) / flat;
          const eyeBot = bot.pos.clone(); eyeBot.y += 1.58;
          const visible = g.physics.lineOfSight(eyeBot, g.player.eye) ? 1 : 0;
          return bot.name.slice(-2) + ' ' + bot.mode + ' d=' + bot.pos.distanceTo(g.player.pos).toFixed(1) +
            ' los=' + (bot.los ? 1 : 0) + ' f=' + facing.toFixed(2) + ' vis=' + visible + ' see=' + bot.seeT.toFixed(2) +
            ' tok=' + (bot.hasToken ? 1 : 0) + ' nxt=' + bot.nextShot.toFixed(2);
        })()
      ).join('\n');
    } catch (error) { line.textContent = 'botdump: ' + error.message; }
  }, 500);
}
/* ==== SELFTEST ==== */
if (params.selftest === '1') {
  window.__selftest = { done: false, levels: [] };
  (async () => {
    await new Promise(resolve => {
      const timer = setInterval(() => { if (window.__ready) { clearInterval(timer); resolve(); } }, 200);
    });
    for (const level of LEVELS) {
      try {
        await startAt(level.id, false);
        for (let i = 0; i < 12; i++) step(1 / 60);
        const shotsBefore = g.weapon.shots;
        pointerFire = true; step(1 / 60); pointerFire = false; step(1 / 60);
        const walkStart = g.player.pos.clone();
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
        for (let i = 0; i < 40; i++) step(1 / 60);
        window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW' }));
        const walked = +g.player.pos.distanceTo(walkStart).toFixed(2);
        g.player.pos.copy(walkStart);
        const stats = g.level.root.userData.stats;
        window.__selftest.levels.push({
          id: level.id, name: level.name, phase: game.phase,
          fired: g.weapon.shots > shotsBefore,
          walk: walked,
          colliders: stats.colliders,
          triangles: Math.round(stats.triangles),
          parts: stats.emittedParts,
          aliveBots: g.bots.aliveCount,
          totalBots: g.level.botSpawns.length,
          sites: g.level.sites.map(site => site.id),
          playerPos: g.player.pos.toArray().map(n => +n.toFixed(2)),
          stuck: g.player.pos.distanceTo(g.level.playerStart.pos) > 2,
          zones: (g.level.zones || []).length,
        });
      } catch (error) {
        window.__selftest.levels.push({ id: level.id, error: String((error && error.stack) || error) });
      }
    }
    window.__selftest.done = true;
    document.title = 'SELFTEST-DONE';
    const out = document.createElement('div');
    out.id = 'selftest-out';
    out.style.cssText = 'position:fixed;inset:12px;z-index:30;background:#0f1a20f2;color:#dfe7e5;font:11px/1.55 Consolas,monospace;padding:16px;overflow:auto;white-space:pre-wrap';
    out.textContent = window.__selftest.levels.map(entry => entry.error
      ? ('L' + entry.id + '  ERROR  ' + entry.error.slice(0, 160))
      : ('L' + entry.id + '  ' + entry.name + '  cols=' + entry.colliders + '  tri=' + entry.triangles +
         '  bots=' + entry.aliveBots + '/' + entry.totalBots + '  sites=' + entry.sites.join('+') +
         '  pos=' + entry.playerPos.join(',') + '  stuck=' + entry.stuck + '  zones=' + entry.zones + '  fired=' + entry.fired + '  walk=' + entry.walk)
    ).join('\n');
    document.body.appendChild(out);
  })();
}
