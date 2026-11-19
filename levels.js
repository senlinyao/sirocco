// Sirocco 多关卡配置
// 每个关卡 = 一套几何布局(layout) + 一套大气/光照(palette) + 一套任务与难度(mission)
// 几何语法与材质仍由 map.js / SaltlineEngine 提供，因此细节密度与第 1 关完全同级。

export const LEVELS = [
  // -------------------------------------------------------------------------
  {
    id: 1,
    name: '前哨',
    code: 'DE_SIROCCO',
    subtitle: '31° N / 07° W',
    briefing: '港口安防网络已失控。穿过四条拱门组成的老城街区，在 A 点或 B 点安放炸药，切断上行链路。',
    objective: '在 A 点或 B 点安放炸药',
    time: 105,
    enemies: 5,
    difficulty: { accuracy: 1.00, reaction: 0.65, fireRate: 1.00, damage: 1.00 },
    palette: {
      sunDir: [-.55, .64, .53], sunColor: [1, .84, .62], sunIntensity: 6,
      zenith: [.12, .21, .34], horizon: [.64, .52, .36], horizonAway: [.30, .39, .48],
      fog: [.52, .48, .38],
      tune: { volSigma: .0018, volFarHaze: .22, aoRadius: .65, aoIntensity: 1.25, aoStrength: .7,
        bloom: .045, flare: .05, ca: .0003, vignette: .15, grain: .006, lookPower: 1.04, lookSat: 1.05, dirt: .025 },
    },
    layout: {
      buildings: [
        { id: 'south-west', x: -10.5, z: 9.5, w: 11, d: 15, h: 7.4, color: 'ochre' },
        { id: 'south-east', x: 10.5, z: 10.5, w: 11, d: 13, h: 8.5, color: 'plaster' },
        { id: 'north-west', x: -8, z: -10.5, w: 8, d: 13, h: 8.8, color: 'plaster' },
        { id: 'north-east', x: 8, z: -10.5, w: 8, d: 13, h: 7.2, color: 'rose' },
      ],
      sites: [
        { id: 'A', x: 19, z: -17, radius: 3.2 },
        { id: 'B', x: -19, z: -17, radius: 3.2 },
      ],
      portals: [
        { x: 0, z: 10.4, width: 10, radius: 3, spring: 2.9, height: 6.6, depth: 1, doors: true },
        { x: 0, z: -10.2, width: 8, radius: 2.8, spring: 2.8, height: 6.1, depth: 0.9, doors: true },
        { x: -21.8, z: 0, width: 10.4, radius: 3.1, spring: 2.8, height: 6.5, depth: 1, doors: false },
        { x: 21.8, z: -4, width: 10.4, radius: 3.1, spring: 2.8, height: 6.5, depth: 1, doors: false },
      ],
      crates: [
        [-17.8, 14.8, 2.3, 1.9, 2.2, 0],
        [-2.4, 1.8, 1.9, 1.6, 2.2, 0], [2.35, -18.7, 2, 1.8, 2.2, 0],
        [-14.6, -20.7, 2.8, 2, 2.4, 0], [-14.6, -20.7, 1.7, 1.4, 1.6, 2],
        [23.5, -13.2, 2.4, 2.1, 3.4, 0], [14.5, -22.5, 2.5, 1.6, 2.3, 0],
        [-24, -13.6, 2.1, 1.5, 2.7, 0],
      ],
      tarpCrates: [[18.6, 13.1, 2.2, 2.4, 2.5, 0]],
      sandbags: [[-20.5, -24, 6.5, 1.3], [19.5, -23.8, 5.5, 1.2]],
      skyline: [
        { type: 'dome', x: -8, z: -11, radius: 2.9, baseY: 9.55 },
        { type: 'tower', x: 9.4, z: -13.5, size: 3, h: 5.6 },
        { type: 'balcony', x: 5, z: 8, yaw: -Math.PI / 2 },
        { type: 'balcony', x: -5, z: 10, yaw: Math.PI / 2 },
        { type: 'balcony', x: 8, z: -4, yaw: 0 },
      ],
      decor: [
        { type: 'pipes', zs: [20, -1, -22] },
        { type: 'chipped', count: 45 },
      ],
      zones: [
        { name: '出发区', min: [-27, 18], max: [27, 27] },
        { name: '中央大道', min: [-4, -20], max: [4, 18] },
        { name: 'A 通道', min: [16, -11], max: [27, 18] },
        { name: 'B 通道', min: [-27, -11], max: [-16, 18] },
        { name: 'A 区', min: [12, -27], max: [27, -11] },
        { name: 'B 区', min: [-27, -27], max: [-12, -11] },
        { name: '十字路口', min: [-16, -4], max: [16, 4] },
      ],
      playerStart: { x: 0, z: 23, yaw: 0 },
      defenderStart: { x: 0, z: -23, yaw: Math.PI },
      botSpawns: [[22, -20], [-22, -20], [0, -19], [22, -8], [-21, -8]],
    },
  },

  // -------------------------------------------------------------------------
  {
    id: 2,
    name: '黄昏货站',
    code: 'DE_FREIGHT',
    subtitle: '货物集散区 / 日落',
    briefing: '三座仓库与成排集装箱构成一条狭长通道。中央仓库是唯一制高点，但门洞暴露。炸药点只有一个——拿下它，没有退路。',
    objective: '在 C 点安放炸药',
    time: 95,
    enemies: 5,
    difficulty: { accuracy: 1.06, reaction: 0.60, fireRate: 1.04, damage: 1.02 },
    palette: {
      sunDir: [-.72, .30, .62], sunColor: [1, .58, .30], sunIntensity: 5.2,
      zenith: [.10, .16, .30], horizon: [.92, .50, .28], horizonAway: [.26, .22, .34],
      fog: [.58, .38, .30],
      tune: { volSigma: .0022, volFarHaze: .30, aoRadius: .70, aoIntensity: 1.35, aoStrength: .75,
        bloom: .070, flare: .12, ca: .0004, vignette: .22, grain: .007, lookPower: 1.06, lookSat: 1.12, dirt: .035 },
    },
    layout: {
      buildings: [
        { id: 'central-depot', x: 0, z: 5, w: 16, d: 11, h: 9.2, color: 'plaster' },
        { id: 'west-yard', x: -15.5, z: -12, w: 9, d: 12, h: 7.0, color: 'ochre' },
        { id: 'east-yard', x: 15.5, z: -13, w: 9, d: 11, h: 7.8, color: 'rose' },
      ],
      sites: [{ id: 'C', x: 0, z: -20.5, radius: 3.4 }],
      portals: [
        { x: 0, z: 11.2, width: 9, radius: 2.8, spring: 2.8, height: 6.4, depth: 1, doors: true },
        { x: 0, z: -3.0, width: 7, radius: 2.4, spring: 2.6, height: 5.8, depth: 0.9, doors: true },
        { x: -21.6, z: -2, width: 7.5, radius: 2.6, spring: 2.7, height: 6.0, depth: 1, doors: false },
        { x: 21.6, z: -6, width: 7.5, radius: 2.6, spring: 2.7, height: 6.0, depth: 1, doors: false },
      ],
      crates: [
        [-20.5, 16, 2.4, 2.0, 2.4, 0], [-20.5, 16, 1.7, 1.5, 1.7, 2],
        [19.5, 17, 2.4, 2.1, 2.6, 0],
        [-9.2, -6.5, 2.6, 1.8, 2.2, 0], [-9.2, -6.5, 1.8, 1.4, 1.7, 1.8],
        [9.4, -7.2, 2.5, 2.0, 2.3, 0],
        [-3.5, -16.5, 2.2, 1.7, 2.2, 0], [3.6, -17.4, 2.3, 1.8, 2.1, 0],
        [-24, -6, 2.0, 1.6, 2.8, 0], [24.5, -16.5, 2.2, 2.0, 2.4, 0],
        [-13.5, 19.5, 2.6, 1.9, 2.3, 0], [13.6, 20, 2.5, 1.8, 2.2, 0],
      ],
      tarpCrates: [[-17.8, 19.4, 3.0, 2.2, 2.6, 0]],
      sandbags: [[-6.5, -20.5, 5.0, 1.25], [6.5, -20.5, 5.0, 1.25]],
      skyline: [
        { type: 'watertower', x: -15.5, z: -12, h: 7.0 },
        { type: 'gantry', x: 0, z: 5, h: 9.2 },
        { type: 'balcony', x: 6, z: 3, yaw: 0 },
      ],
      decor: [
        { type: 'pipes', zs: [18, -10] },
        { type: 'chipped', count: 55 },
      ],
      zones: [
        { name: '车站广场', min: [-27, 17], max: [27, 27] },
        { name: '仓库前庭', min: [-8, 11], max: [8, 17] },
        { name: '西侧堆场', min: [-27, -19], max: [-11, 17] },
        { name: '东侧堆场', min: [11, -19], max: [27, 17] },
        { name: 'C 区装卸台', min: [-11, -27], max: [11, -19] },
      ],
      playerStart: { x: 0, z: 23, yaw: 0 },
      defenderStart: { x: 0, z: -24, yaw: Math.PI },
      botSpawns: [[20, -20], [-20, -21], [0, -24], [20, -9], [-19, -8], [0, -2]],
    },
  },

  // -------------------------------------------------------------------------
  {
    id: 3,
    name: '夜袭庭院',
    code: 'DE_COURTYARD',
    subtitle: '中央庭院 / 深夜',
    briefing: '四面高墙围出一片开阔庭院，没有掩体，只有月光下的一条条弹道。两个炸药点分踞南北两端，先把对方从阴影里逼出来。',
    objective: '在 A 点或 B 点安放炸药',
    time: 110,
    enemies: 5,
    difficulty: { accuracy: 1.12, reaction: 0.55, fireRate: 1.08, damage: 1.04 },
    palette: {
      sunDir: [.18, .82, -.45], sunColor: [.62, .74, .98], sunIntensity: 3.4,
      zenith: [.045, .075, .155], horizon: [.135, .185, .275], horizonAway: [.060, .085, .140],
      fog: [.095, .130, .195],
      tune: { volSigma: .0026, volFarHaze: .26, aoRadius: .60, aoIntensity: 1.10, aoStrength: .55,
        bloom: .085, flare: .10, ca: .0006, vignette: .24, grain: .009, lookPower: 1.04, lookSat: .98, dirt: .020 },
    },
    layout: {
      buildings: [
        { id: 'corner-nw', x: -17, z: 14.5, w: 10, d: 10, h: 8.6, color: 'plaster' },
        { id: 'corner-ne', x: 17, z: 14.5, w: 10, d: 10, h: 7.4, color: 'rose' },
        { id: 'corner-sw', x: -17, z: -14.5, w: 10, d: 10, h: 7.8, color: 'ochre' },
        { id: 'corner-se', x: 17, z: -14.5, w: 10, d: 10, h: 8.2, color: 'plaster' },
      ],
      sites: [
        { id: 'A', x: 0, z: -18, radius: 3.2 },
        { id: 'B', x: 0, z: 18, radius: 3.2 },
      ],
      portals: [
        { x: -21.8, z: 0, width: 9.5, radius: 2.9, spring: 2.8, height: 6.4, depth: 1, doors: false },
        { x: 21.8, z: 0, width: 9.5, radius: 2.9, spring: 2.8, height: 6.4, depth: 1, doors: false },
        { x: 0, z: -9.4, width: 8, radius: 2.6, spring: 2.7, height: 6.0, depth: 0.9, doors: true },
      ],
      crates: [
        [-7.5, -5.5, 2.2, 1.8, 2.2, 0], [7.5, 5.5, 2.2, 1.8, 2.2, 0],
        [-7.5, 5.5, 2.0, 1.6, 2.0, 0], [7.5, -5.5, 2.0, 1.6, 2.0, 0],
        [-24.5, 20, 2.2, 1.8, 2.2, 0], [24.5, -20, 2.2, 1.8, 2.2, 0],
      ],
      tarpCrates: [],
      sandbags: [[-11, 0, 4.0, 1.2], [11, 0, 4.0, 1.2]],
      skyline: [
        { type: 'tower', x: -17, z: -14.5, size: 3, h: 7.8 },
        { type: 'dome', x: 17, z: 14.5, radius: 2.7, baseY: 7.4 },
        { type: 'balcony', x: -9, z: 14.5, yaw: 0 },
        { type: 'balcony', x: 9, z: -14.5, yaw: Math.PI },
      ],
      decor: [
        { type: 'lanterns', points: [[-6, 0], [6, 0], [0, -14], [0, 14]] },
        { type: 'chipped', count: 40 },
      ],
      zones: [
        { name: '北庭院', min: [-11, 9], max: [11, 27] },
        { name: '南庭院', min: [-11, -27], max: [11, -9] },
        { name: '中央廊道', min: [-11, -9], max: [11, 9] },
        { name: '西回廊', min: [-27, -9], max: [-11, 9] },
        { name: '东回廊', min: [11, -9], max: [27, 9] },
      ],
      playerStart: { x: 0, z: 25, yaw: 0 },
      defenderStart: { x: 0, z: -25, yaw: Math.PI },
      botSpawns: [[-6, -20], [6, -20], [0, -12], [-6, 12], [6, 12], [0, 12]],
    },
  },

  // -------------------------------------------------------------------------
  {
    id: 4,
    name: '沙暴哨所',
    code: 'DE_OUTPOST',
    subtitle: '边境哨所 / 沙暴',
    briefing: '沙暴压低了能见度，远处只剩模糊的轮廓。两座矮堡夹着一条沙袋迷宫，只有一个安放点，而且时间很短。靠近了再打。',
    objective: '在 D 点安放炸药',
    time: 85,
    enemies: 5,
    difficulty: { accuracy: 1.20, reaction: 0.50, fireRate: 1.12, damage: 1.06 },
    palette: {
      sunDir: [-.35, .78, -.28], sunColor: [1, .86, .58], sunIntensity: 4.4,
      zenith: [.36, .30, .18], horizon: [.82, .68, .42], horizonAway: [.60, .52, .34],
      fog: [.86, .72, .48],
      tune: { volSigma: .0034, volFarHaze: .58, aoRadius: .55, aoIntensity: .95, aoStrength: .50,
        bloom: .030, flare: .16, ca: .0003, vignette: .18, grain: .008, lookPower: .96, lookSat: .86, dirt: .060 },
    },
    layout: {
      buildings: [
        { id: 'north-bunker', x: 0, z: 11, w: 15, d: 8, h: 6.4, color: 'ochre' },
        { id: 'south-bunker', x: 0, z: -11, w: 15, d: 8, h: 6.0, color: 'plaster' },
      ],
      sites: [{ id: 'D', x: 0, z: -20.5, radius: 3.4 }],
      portals: [
        { x: -21.6, z: 3, width: 7, radius: 2.5, spring: 2.7, height: 5.8, depth: 1, doors: false },
        { x: 21.6, z: -2, width: 7, radius: 2.5, spring: 2.7, height: 5.8, depth: 1, doors: false },
      ],
      crates: [
        [-9.5, 2.5, 2.3, 1.8, 2.3, 0], [9.5, 2.5, 2.3, 1.8, 2.3, 0],
        [-9.5, -2.5, 2.1, 1.6, 2.1, 0], [9.5, -2.5, 2.1, 1.6, 2.1, 0],
        [-23.5, 17, 2.2, 1.8, 2.3, 0], [23.5, 17, 2.2, 1.8, 2.3, 0],
      ],
      tarpCrates: [],
      sandbags: [
        [-6.5, 6.5, 4.2, 1.25], [6.5, 6.5, 4.2, 1.25],
        [-6.5, 0, 4.2, 1.25], [6.5, 0, 4.2, 1.25],
        [-6.5, -6.5, 4.2, 1.25], [6.5, -6.5, 4.2, 1.25],
        [0, -16, 5.0, 1.25],
      ],
      skyline: [
        { type: 'antenna', x: 0, z: 11, h: 6.4 },
        { type: 'tower', x: 0, z: -11, size: 2.6, h: 6.0 },
      ],
      decor: [
        { type: 'pipes', zs: [-20] },
        { type: 'chipped', count: 60 },
      ],
      zones: [
        { name: '哨所前庭', min: [-27, 17], max: [27, 27] },
        { name: '北堡墙根', min: [-12, 7], max: [12, 15] },
        { name: '沙袋走廊', min: [-4, -7], max: [4, 7] },
        { name: '南堡墙根', min: [-12, -15], max: [12, -7] },
        { name: 'D 区洼地', min: [-12, -27], max: [12, -15] },
      ],
      playerStart: { x: 0, z: 23, yaw: 0 },
      defenderStart: { x: 0, z: -24, yaw: Math.PI },
      botSpawns: [[-18, 16], [18, 16], [0, -24], [-18, -18], [18, -18], [0, 4]],
    },
  },

  // -------------------------------------------------------------------------
  {
    id: 5,
    name: '黎明总攻',
    code: 'DE_DAYBREAK',
    subtitle: '核心区 / 拂晓',
    briefing: '最后一座上行链路节点。四座塔楼夹着中央平台，守军六人，全部满编。把所有火力压上去，然后把这里夷为平地。',
    objective: '在 A 点或 B 点安放炸药',
    time: 130,
    enemies: 6,
    difficulty: { accuracy: 1.26, reaction: 0.46, fireRate: 1.16, damage: 1.10 },
    palette: {
      sunDir: [.62, .42, -.52], sunColor: [1, .64, .52], sunIntensity: 4.8,
      zenith: [.20, .16, .34], horizon: [.94, .56, .42], horizonAway: [.34, .30, .48],
      fog: [.46, .37, .46],
      tune: { volSigma: .0024, volFarHaze: .30, aoRadius: .62, aoIntensity: 1.20, aoStrength: .65,
        bloom: .075, flare: .09, ca: .0005, vignette: .20, grain: .008, lookPower: 1.08, lookSat: 1.12, dirt: .028 },
    },
    layout: {
      buildings: [
        { id: 'tower-nw', x: -10.5, z: 10.5, w: 9, d: 12, h: 8.8, color: 'plaster' },
        { id: 'tower-ne', x: 10.5, z: 10.5, w: 9, d: 12, h: 8.0, color: 'rose' },
        { id: 'tower-sw', x: -10.5, z: -10.5, w: 9, d: 10, h: 7.4, color: 'ochre' },
        { id: 'tower-se', x: 10.5, z: -10.5, w: 9, d: 10, h: 9.0, color: 'plaster' },
      ],
      sites: [
        { id: 'A', x: -20, z: -21, radius: 3.2 },
        { id: 'B', x: 20, z: -21, radius: 3.2 },
      ],
      portals: [
        { x: 0, z: 11.5, width: 9, radius: 2.8, spring: 2.8, height: 6.4, depth: 1, doors: true },
        { x: 0, z: -11.2, width: 9, radius: 2.8, spring: 2.8, height: 6.4, depth: 0.9, doors: true },
        { x: -21.8, z: 6, width: 8, radius: 2.7, spring: 2.8, height: 6.2, depth: 1, doors: false },
        { x: 21.8, z: 6, width: 8, radius: 2.7, spring: 2.8, height: 6.2, depth: 1, doors: false },
      ],
      crates: [
        [-4.2, 3.5, 2.2, 1.8, 2.2, 0], [4.2, 3.5, 2.2, 1.8, 2.2, 0],
        [-4.2, -3.5, 2.2, 1.8, 2.2, 0], [4.2, -3.5, 2.2, 1.8, 2.2, 0],
        [-24.5, 18, 2.2, 1.8, 2.3, 0], [24.5, 18, 2.2, 1.8, 2.3, 0],
        [-24.5, -18, 2.4, 2.0, 2.4, 0], [24.5, -18, 2.4, 2.0, 2.4, 0],
      ],
      tarpCrates: [],
      sandbags: [[-14, -18, 4.5, 1.25], [14, -18, 4.5, 1.25], [0, 0, 5.0, 1.25]],
      skyline: [
        { type: 'dome', x: -10.5, z: -10.5, radius: 2.8, baseY: 7.4 },
        { type: 'tower', x: 10.5, z: -10.5, size: 2.8, h: 9.0 },
        { type: 'balcony', x: 0, z: 10.5, yaw: 0 },
        { type: 'balcony', x: 0, z: -10.5, yaw: Math.PI },
      ],
      decor: [
        { type: 'pipes', zs: [18, -18] },
        { type: 'chipped', count: 50 },
      ],
      zones: [
        { name: '进攻出发点', min: [-27, 17], max: [27, 27] },
        { name: '中庭', min: [-8, -8], max: [8, 8] },
        { name: 'A 塔基', min: [-27, -19], max: [-12, 8] },
        { name: 'B 塔基', min: [12, -19], max: [27, 8] },
        { name: 'A 区', min: [-27, -27], max: [-12, -19] },
        { name: 'B 区', min: [12, -27], max: [27, -19] },
        { name: '后撤通道', min: [-12, -27], max: [12, -19] },
      ],
      playerStart: { x: 0, z: 23, yaw: 0 },
      defenderStart: { x: 0, z: -24, yaw: Math.PI },
      botSpawns: [[-25, -24], [25, -24], [0, -18], [-20, -8], [20, -8], [0, 6]],
    },
  },
];

export function levelById(id) {
  return LEVELS.find(level => level.id === id) || LEVELS[0];
}
