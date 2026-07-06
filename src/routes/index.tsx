import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Super Plumber Adventure - Juego estilo Mario Bros" },
      {
        name: "description",
        content:
          "Juego de plataformas 2D con 3 mundos distintos: pradera, caverna y cielo nocturno.",
      },
      { property: "og:title", content: "Super Plumber Adventure" },
      {
        property: "og:description",
        content: "Aventura pixel art con 3 mundos únicos: cada uno con su ambiente, enemigos y desafíos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

// ---------- STAGES ----------
// Legend:
//  # ground   = grass-top   B brick   ? question   P/p pipe   S stone
//  C coin     G goomba      F fish/spike enemy    K flyer (only sky)
//  L lava/water (deadly)   H spike (deadly static)
//  * platform (floating)   > flag
// Sky level uses "cloud" for = tiles visually.

const STAGES: {
  name: string;
  theme: "grass" | "cave" | "sky";
  timeLimit: number;
  rows: string[];
}[] = [
  {
    name: "1-1 Pradera Verde",
    theme: "grass",
    timeLimit: 160,
    rows: [
      "................................................................................................................................................................",
      "................................................................................................................................................................",
      "................................................................................................................................................................",
      "..........CCC.......................................................C.C.C..........................................................CCC.....................",
      "................................................................................................................................................................",
      ".......?BB?B................CCCC................*****...........BBBBB.................?B?B?..............C.C.C................?BB?...............CCCC..........",
      "................................................................................................................................................................",
      ".............................BBBBB.............................................................................*****.........BBBBB.............................",
      "................................................................................................................................................................",
      "..................C..............................C..........................*****.....................................C....................C.................",
      "..............................................................J...................................J...................................J......................",
      ".......................Pp.....................................................................Pp.....................................S...S..................",
      "....G........G.......PPpp.....HHH....G............G......LLLL........G.......M...G........G..PPpp......G.....HHHH........G........G.SSSSSSS.....G...G......>..",
      "================================================================================................================================================================",
      "################################################################################################################################################################",
      "################################################################################################################################################################",
      "################################################################################################################################################################",
    ],
  },
  {
    name: "1-2 Cavernas de Cobre",
    theme: "cave",
    timeLimit: 140,
    rows: [
      "################################################################################################################################################################",
      "#..............................................................................................................................................................#",
      "#.....CCC..........................C.C.C........................................CCC.................................C.C.C.................................#",
      "#..............................................................................................................................................................#",
      "#....BBBB..........?B?..........BBBBB......................*****.........BBBB..............?B?B?..............*****............BBBB..........?B?..............#",
      "#..............................................................................................................................................................#",
      "#..............*****......................HHH.....................J..........................HHH...............................J..........................#",
      "#..........................C.....................*****........................................................*****.........C.C.C..........................#",
      "#.....J..............HHH..........................................J....................HHH...........................................M................J...#",
      "#..............*****....G..............G..............*****........G..........G........................*****.......G........G............G........G.......#",
      "#..............................................................................................................................................................#",
      "#............S....S..HHH...........S.......LLLL...............HHH...........S.....S.......HHH.......LLLL........S....S....HHH..........SSSSS........>....#",
      "#..G........SSSS...........G......SSSS..........G............SSSS.........SSSS...SSSS......G.....SSSSSSSS.......SSSS..........G.......SSSSSSS...............#",
      "SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",
      "################################################################################################################################################################",
      "################################################################################################################################################################",
    ],
  },
  {
    name: "1-3 Cielo Estrellado",
    theme: "sky",
    timeLimit: 180,
    rows: [
      "................................................................................................................................................................",
      "................................................................................................................................................................",
      "..........C........K.......................K...............................K...........................K...................K............................K....",
      ".........CCC.....................C.C.C..............K..........................................C.C.C....................C.C.C...........................C.C.C.",
      "..........C.....................*****.........................C.C.C............................*****...................................*****..................",
      "................................................................*****...................................*****......................M...........................",
      "....*****......................................................................*****...........................................*****.......................",
      ".............K...........*****......................*****...........*****.................K...........*****........*****.................K...........*****....",
      "................................................................................................................................................................",
      "........?BB?...........................C.C.C....K.................................*****.................?BB?...............C.C.C....K............*****........",
      "......===========.............===========......................===========..................===========.............===========......................===========",
      "................................................................................................................................................................",
      "....K........................*****....................*****....................K.......*****....................*****....K.................................",
      "....................===============...........................................===============........................===============..........................>",
      "==============..................................===============............................................===============...............===============......",
      "................................................................................................................................................................",
      "................................................................................................................................................................",
    ],
  },
];

const TILE = 32;
type Rect = { x: number; y: number; w: number; h: number };
type Enemy = Rect & {
  vx: number; vy: number; alive: boolean; squashT: number; anim: number;
  kind: "goomba" | "flyer" | "jumper";
  baseY?: number; jumpCd?: number;
  hp: number; maxHp: number; hitFlash: number;
  xp: number; gold: number; power: number;
};
type Coin = { x: number; y: number; taken: boolean; t: number; pop: number };
type Hazard = Rect & { kind: "spike" | "lava" };
type Loot = {
  x: number; y: number; vx: number; vy: number; t: number;
  kind: "gold" | "hpPotion" | "mpPotion" | "gem";
  taken: boolean; life: number;
};
type Damage = { x: number; y: number; text: string; life: number; color: string; vy: number };
type Block = Rect & {
  type: "ground" | "grass" | "brick" | "question" | "pipe" | "stone" | "platform" | "cloud";
  used?: boolean; bump?: number; pipeTop?: boolean; pipeLeft?: boolean;
};
type Particle = {
  x: number; y: number; vx: number; vy: number; life: number; maxLife: number;
  color: string; size: number; gravity: number; shape?: "square" | "circle" | "star";
};

function buildWorld(stageIdx: number) {
  const stage = STAGES[stageIdx];
  const LEVEL = stage.rows;
  const LEVEL_W = LEVEL[0].length * TILE;
  const LEVEL_H = LEVEL.length * TILE;

  const blocks: Block[] = [];
  const coins: Coin[] = [];
  const enemies: Enemy[] = [];
  const hazards: Hazard[] = [];
  const checkpoints: { x: number; y: number; reached: boolean }[] = [];
  let flag = { x: 0, y: 0 };
  let spawn = { x: 60, y: 100 };

  const isCloud = stage.theme === "sky";

  for (let r = 0; r < LEVEL.length; r++) {
    for (let c = 0; c < LEVEL[r].length; c++) {
      const ch = LEVEL[r][c];
      const x = c * TILE;
      const y = r * TILE;
      if (ch === "#") blocks.push({ x, y, w: TILE, h: TILE, type: stage.theme === "cave" ? "stone" : "ground" });
      else if (ch === "=") blocks.push({ x, y, w: TILE, h: TILE, type: isCloud ? "cloud" : "grass" });
      else if (ch === "*") blocks.push({ x, y, w: TILE, h: 14, type: isCloud ? "cloud" : "platform" });
      else if (ch === "B") blocks.push({ x, y, w: TILE, h: TILE, type: "brick" });
      else if (ch === "?") blocks.push({ x, y, w: TILE, h: TILE, type: "question" });
      else if (ch === "P" || ch === "p") {
        const above = LEVEL[r - 1]?.[c];
        const pipeTop = above !== "P" && above !== "p";
        blocks.push({ x, y, w: TILE, h: TILE, type: "pipe", pipeTop, pipeLeft: ch === "P" });
      } else if (ch === "S") blocks.push({ x, y, w: TILE, h: TILE, type: "stone" });
      else if (ch === "H") hazards.push({ x: x + 4, y: y + 16, w: TILE - 8, h: TILE - 16, kind: "spike" });
      else if (ch === "L") hazards.push({ x, y: y + 8, w: TILE, h: TILE - 8, kind: "lava" });
      else if (ch === "C") coins.push({ x: x + 8, y: y + 8, taken: false, t: Math.random() * 6, pop: 0 });
      else if (ch === "G") enemies.push({
        x, y: y - 34, w: 62, h: 62, vx: -0.7, vy: 0, alive: true, squashT: 0, anim: 0, kind: "goomba",
        hp: 2, maxHp: 2, hitFlash: 0, xp: 10, gold: 3, power: 1,
      });
      else if (ch === "J") enemies.push({
        x, y: y - 34, w: 62, h: 62, vx: -0.5, vy: 0, alive: true, squashT: 0, anim: 0, kind: "jumper", jumpCd: 60 + Math.floor(Math.random() * 60),
        hp: 3, maxHp: 3, hitFlash: 0, xp: 18, gold: 5, power: 2,
      });
      else if (ch === "K") enemies.push({
        x, y, w: 62, h: 52, vx: 0, vy: 0, alive: true, squashT: 0, anim: 0, kind: "flyer", baseY: y,
        hp: 2, maxHp: 2, hitFlash: 0, xp: 15, gold: 4, power: 2,
      });
      else if (ch === "M") checkpoints.push({ x: x + TILE / 2, y, reached: false });
      else if (ch === ">" || ch === "F") flag = { x: x + 12, y };
    }
  }
  return { blocks, coins, enemies, hazards, checkpoints, flag, spawn, LEVEL_W, LEVEL_H, stage };
}

function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"playing" | "win" | "dead" | "stageClear" | "levelUp">("playing");
  const [score, setScore] = useState(0);
  const [coinsCount, setCoinsCount] = useState(0);
  const [lives, setLives] = useState(3);
  const [stageIdx, setStageIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(STAGES[0].timeLimit);
  const [resetKey, setResetKey] = useState(0);
  // RPG stats — persist across stage transitions via refs
  const statsRef = useRef({
    level: 1, xp: 0, xpNext: 30,
    hp: 20, maxHp: 20, mp: 10, maxMp: 10,
    str: 3, def: 1, gold: 0,
    hpPotions: 2, mpPotions: 1,
  });
  const [, forceHudTick] = useState(0);
  const hudTick = () => forceHudTick((n) => n + 1);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = "high";

    // Fullscreen sizing
    const setCanvasSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      ctx.imageSmoothingEnabled = true;
      (ctx as any).imageSmoothingQuality = "high";
    };
    setCanvasSize();

    const world = buildWorld(stageIdx);
    const { LEVEL_W, LEVEL_H, stage } = world;

    const keys: Record<string, boolean> = {};
    let cameraX = 0;
    let cameraY = 0;
    let cameraShake = 0;
    let running = true;
    let localScore = score;
    let localCoins = coinsCount;
    let localLives = lives;
    let localTime = stage.timeLimit;
    let particles: Particle[] = [];
    let floatTexts: { x: number; y: number; text: string; life: number; color: string }[] = [];
    let time = 0;
    let timerAccum = 0;
    let stageCompleted = false;
    let loot: Loot[] = [];
    const stats = statsRef.current;
    // Full heal on stage start
    stats.hp = stats.maxHp;
    stats.mp = stats.maxMp;
    hudTick();

    // Stars for sky theme
    let stars: { x: number; y: number; s: number; tw: number }[] = [];
    const rebuildStars = () => {
      stars = [];
      if (stage.theme === "sky") {
        for (let i = 0; i < 180; i++) {
          stars.push({
            x: Math.random() * LEVEL_W,
            y: Math.random() * canvas.height * 0.7,
            s: Math.random() * 2 + 0.5,
            tw: Math.random() * Math.PI * 2,
          });
        }
      }
    };
    rebuildStars();


    // ---------- Sprite / background caches ----------
    function makeCanvas(w: number, h: number) {
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const cx = c.getContext("2d")!;
      cx.imageSmoothingEnabled = false;
      return { c, cx };
    }

    // Pre-render every tile type ONCE into an offscreen canvas.
    const S = TILE;
    const sprites: Record<string, HTMLCanvasElement> = {};

    // helper: beveled cube-face — bright top, dark bottom, side highlights
    function bevelFace(cx: CanvasRenderingContext2D, w: number, h: number, base: string, top: string, bot: string) {
      const g = cx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, top); g.addColorStop(0.5, base); g.addColorStop(1, bot);
      cx.fillStyle = g; cx.fillRect(0, 0, w, h);
      // top highlight
      cx.fillStyle = "rgba(255,255,255,0.55)"; cx.fillRect(0, 0, w, 2);
      cx.fillStyle = "rgba(255,255,255,0.25)"; cx.fillRect(0, 2, w, 1);
      // bottom shadow
      cx.fillStyle = "rgba(0,0,0,0.5)"; cx.fillRect(0, h - 2, w, 2);
      cx.fillStyle = "rgba(0,0,0,0.25)"; cx.fillRect(0, h - 3, w, 1);
      // side highlights (isometric feel)
      cx.fillStyle = "rgba(255,255,255,0.2)"; cx.fillRect(0, 0, 2, h);
      cx.fillStyle = "rgba(0,0,0,0.25)"; cx.fillRect(w - 2, 0, 2, h);
    }

    (function buildTileSprites() {
      // ground / dirt
      {
        const { c, cx } = makeCanvas(S, S);
        bevelFace(cx, S, S, "#c9722e", "#f0a04a", "#5c2a08");
        cx.fillStyle = "rgba(0,0,0,0.3)";
        cx.beginPath(); cx.arc(8, 12, 2, 0, Math.PI * 2); cx.fill();
        cx.beginPath(); cx.arc(22, 20, 1.6, 0, Math.PI * 2); cx.fill();
        cx.beginPath(); cx.arc(14, 24, 1.4, 0, Math.PI * 2); cx.fill();
        sprites.ground = c;
      }
      // grass block (dirt + grass top with rounded blades)
      {
        const { c, cx } = makeCanvas(S, S);
        bevelFace(cx, S, S, "#c9722e", "#e8944a", "#5c2a08");
        // grass top
        const gg = cx.createLinearGradient(0, 0, 0, 14);
        gg.addColorStop(0, "#7be86a"); gg.addColorStop(0.5, "#4bc74a"); gg.addColorStop(1, "#2a8a2a");
        cx.fillStyle = gg; cx.fillRect(0, 0, S, 14);
        // grass highlight
        cx.fillStyle = "#b6f299"; cx.fillRect(0, 0, S, 2);
        // grass blades hanging into dirt
        cx.fillStyle = "#2a8a2a";
        cx.beginPath();
        cx.moveTo(0, 14); cx.lineTo(4, 18); cx.lineTo(8, 14); cx.lineTo(12, 19); cx.lineTo(16, 14);
        cx.lineTo(20, 18); cx.lineTo(24, 14); cx.lineTo(28, 20); cx.lineTo(S, 14); cx.lineTo(S, 15); cx.lineTo(0, 15);
        cx.closePath(); cx.fill();
        // sparkles
        cx.fillStyle = "#e8ffcf"; cx.fillRect(5, 2, 2, 2); cx.fillRect(18, 3, 2, 2); cx.fillRect(26, 2, 2, 2);
        sprites.grass = c;
      }
      // brick
      {
        const { c, cx } = makeCanvas(S, S);
        bevelFace(cx, S, S, "#d94a1a", "#ff7a3a", "#5a1a08");
        // mortar
        cx.fillStyle = "#2a0e04";
        cx.fillRect(0, 15, S, 2); cx.fillRect(0, S - 1, S, 1);
        cx.fillRect(15, 0, 2, 15); cx.fillRect(7, 17, 2, S - 17); cx.fillRect(23, 17, 2, S - 17);
        // brick highlights
        cx.fillStyle = "rgba(255,255,255,0.25)";
        cx.fillRect(2, 3, 11, 1); cx.fillRect(18, 3, 11, 1);
        cx.fillRect(2, 18, 4, 1); cx.fillRect(10, 18, 12, 1); cx.fillRect(26, 18, 4, 1);
        sprites.brick = c;
      }
      // question block — bright gold, riveted corners, glossy
      {
        const { c, cx } = makeCanvas(S, S);
        bevelFace(cx, S, S, "#f2a412", "#ffd94a", "#6b3a00");
        // dark border frame
        cx.strokeStyle = "#5a2e00"; cx.lineWidth = 2;
        cx.strokeRect(2, 2, S - 4, S - 4);
        // corner rivets
        cx.fillStyle = "#fff2a8";
        cx.fillRect(4, 4, 3, 3); cx.fillRect(S - 7, 4, 3, 3);
        cx.fillRect(4, S - 7, 3, 3); cx.fillRect(S - 7, S - 7, 3, 3);
        cx.fillStyle = "#6b3a00";
        cx.fillRect(5, 5, 1, 1); cx.fillRect(S - 6, 5, 1, 1);
        cx.fillRect(5, S - 6, 1, 1); cx.fillRect(S - 6, S - 6, 1, 1);
        // "?"
        cx.fillStyle = "rgba(0,0,0,0.55)"; cx.font = "bold 20px system-ui, sans-serif"; cx.fillText("?", 11, 25);
        cx.fillStyle = "#fff"; cx.fillText("?", 10, 24);
        // gloss
        cx.fillStyle = "rgba(255,255,255,0.35)"; cx.fillRect(3, 3, S - 6, 2);
        sprites.question = c;
      }
      // question used
      {
        const { c, cx } = makeCanvas(S, S);
        bevelFace(cx, S, S, "#8b5a2b", "#a5763a", "#3a2010");
        cx.strokeStyle = "#2a1808"; cx.lineWidth = 2;
        cx.strokeRect(2, 2, S - 4, S - 4);
        sprites.questionUsed = c;
      }
      // pipe body (cylindrical shading)
      {
        const { c, cx } = makeCanvas(S, S);
        const g = cx.createLinearGradient(0, 0, S, 0);
        g.addColorStop(0, "#0a3d10"); g.addColorStop(0.1, "#1a6b22");
        g.addColorStop(0.35, "#7ee085"); g.addColorStop(0.5, "#3ec54a");
        g.addColorStop(0.75, "#1a6b22"); g.addColorStop(1, "#08300b");
        cx.fillStyle = g; cx.fillRect(0, 0, S, S);
        cx.fillStyle = "rgba(255,255,255,0.5)"; cx.fillRect(6, 0, 3, S);
        cx.fillStyle = "rgba(0,0,0,0.35)"; cx.fillRect(S - 5, 0, 3, S);
        sprites.pipe = c;
      }
      // pipe top (rim overlay, wider)
      {
        const rimW = S + 6;
        const { c, cx } = makeCanvas(rimW, 12);
        const rg = cx.createLinearGradient(0, 0, rimW, 0);
        rg.addColorStop(0, "#08300b"); rg.addColorStop(0.15, "#1a6b22");
        rg.addColorStop(0.35, "#8ff090"); rg.addColorStop(0.55, "#4ad058");
        rg.addColorStop(0.8, "#1a6b22"); rg.addColorStop(1, "#08300b");
        cx.fillStyle = rg; cx.fillRect(0, 0, rimW, 12);
        cx.fillStyle = "rgba(255,255,255,0.55)"; cx.fillRect(2, 2, rimW - 4, 2);
        cx.fillStyle = "rgba(0,0,0,0.45)"; cx.fillRect(0, 10, rimW, 2);
        sprites.pipeTop = c;
      }
      // stone (theme-aware)
      {
        const { c, cx } = makeCanvas(S, S);
        if (stage.theme === "cave") {
          bevelFace(cx, S, S, "#a86040", "#d68a5a", "#3a1808");
          cx.fillStyle = "rgba(255,200,150,0.35)";
          cx.fillRect(6, 8, 2, 2); cx.fillRect(20, 18, 2, 2); cx.fillRect(14, 12, 2, 2);
        } else {
          bevelFace(cx, S, S, "#98a0b0", "#d0d6e0", "#3a4050");
          cx.fillStyle = "rgba(0,0,0,0.35)";
          cx.fillRect(6, 10, 3, 2); cx.fillRect(18, 20, 3, 2);
        }
        sprites.stone = c;
      }
      // platform (14px tall) — wood plank
      {
        const { c, cx } = makeCanvas(S, 14);
        bevelFace(cx, S, 14, "#c07500", "#ffab3a", "#4a2600");
        cx.fillStyle = "rgba(0,0,0,0.35)"; cx.fillRect(10, 3, 1, 8); cx.fillRect(22, 3, 1, 8);
        sprites.platform = c;
      }
      // cloud platform — fluffy
      {
        const { c, cx } = makeCanvas(S, 14);
        cx.fillStyle = "rgba(255,255,255,0.95)";
        cx.beginPath();
        cx.arc(5, 8, 7, 0, Math.PI * 2);
        cx.arc(14, 4, 8, 0, Math.PI * 2);
        cx.arc(24, 5, 7, 0, Math.PI * 2);
        cx.arc(28, 8, 6, 0, Math.PI * 2);
        cx.fill();
        cx.fillStyle = "#ffffff"; cx.fillRect(0, 4, S, 8);
        cx.fillStyle = "rgba(180,200,240,0.5)"; cx.fillRect(0, 10, S, 2);
        cx.fillStyle = "rgba(255,255,255,0.9)"; cx.fillRect(0, 4, S, 2);
        sprites.cloud = c;
      }
    })();

    // Backgrounds: rebuilt on init and resize
    let BG_W = Math.max(canvas.width * 2, 1600);
    let bgFar = makeCanvas(BG_W, canvas.height);
    let bgMid = makeCanvas(BG_W, canvas.height);
    let vignette = makeCanvas(canvas.width, canvas.height);

    function buildBackgrounds() {
      BG_W = Math.max(canvas.width * 2, 1600);
      bgFar = makeCanvas(BG_W, canvas.height);
      bgMid = makeCanvas(BG_W, canvas.height);
      vignette = makeCanvas(canvas.width, canvas.height);

      const { cx } = bgFar;
      if (stage.theme === "grass") {
        // Bright N64-blue sky
        const g = cx.createLinearGradient(0, 0, 0, canvas.height);
        g.addColorStop(0, "#2f6ef0"); g.addColorStop(0.5, "#6aa7ff"); g.addColorStop(1, "#c5e8ff");
        cx.fillStyle = g; cx.fillRect(0, 0, BG_W, canvas.height);
        // Sun with rays
        const sunX = canvas.width - 120, sunY = 100;
        const sg = cx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 140);
        sg.addColorStop(0, "rgba(255,240,180,1)");
        sg.addColorStop(0.35, "rgba(255,220,140,0.4)");
        sg.addColorStop(1, "rgba(255,220,140,0)");
        cx.fillStyle = sg; cx.fillRect(sunX - 160, sunY - 160, 320, 320);
        cx.fillStyle = "#fff8d0";
        cx.beginPath(); cx.arc(sunX, sunY, 34, 0, Math.PI * 2); cx.fill();
      } else if (stage.theme === "cave") {
        const g = cx.createLinearGradient(0, 0, 0, canvas.height);
        g.addColorStop(0, "#160a20"); g.addColorStop(0.5, "#3a1a12"); g.addColorStop(1, "#6a2810");
        cx.fillStyle = g; cx.fillRect(0, 0, BG_W, canvas.height);
        // Warm glow
        for (let i = 0; i < 6; i++) {
          const gx = i * 400 + 150, gy = canvas.height * 0.7;
          const rg = cx.createRadialGradient(gx, gy, 20, gx, gy, 260);
          rg.addColorStop(0, "rgba(255,140,40,0.35)"); rg.addColorStop(1, "rgba(255,140,40,0)");
          cx.fillStyle = rg; cx.fillRect(gx - 260, gy - 260, 520, 520);
        }
        cx.fillStyle = "#241610";
        for (let i = 0; i < 60; i++) {
          const sx = i * 90 + ((i * 7) % 30);
          const h = 30 + ((i * 17) % 40);
          cx.beginPath();
          cx.moveTo(sx, 0); cx.lineTo(sx + 16, 0); cx.lineTo(sx + 8, h);
          cx.closePath(); cx.fill();
        }
      } else {
        const g = cx.createLinearGradient(0, 0, 0, canvas.height);
        g.addColorStop(0, "#08082e"); g.addColorStop(0.5, "#241a6a"); g.addColorStop(1, "#5a2a7a");
        cx.fillStyle = g; cx.fillRect(0, 0, BG_W, canvas.height);
        for (const st of stars) {
          cx.fillStyle = "rgba(255,255,255,0.9)";
          cx.fillRect(st.x % BG_W, st.y, st.s, st.s);
        }
        const mx2 = canvas.width - 140, my2 = 110;
        cx.fillStyle = "rgba(255,240,200,0.2)";
        cx.beginPath(); cx.arc(mx2, my2, 80, 0, Math.PI * 2); cx.fill();
        cx.fillStyle = "#f8f4d0";
        cx.beginPath(); cx.arc(mx2, my2, 40, 0, Math.PI * 2); cx.fill();
        cx.fillStyle = "#d8d0a8";
        cx.beginPath(); cx.arc(mx2 - 10, my2 - 6, 5, 0, Math.PI * 2); cx.fill();
        cx.beginPath(); cx.arc(mx2 + 14, my2 + 8, 7, 0, Math.PI * 2); cx.fill();
      }

      // Mid layer
      const { cx: mx } = bgMid;
      mx.clearRect(0, 0, BG_W, canvas.height);
      if (stage.theme === "grass") {
        // Far mountain range with snow caps
        for (let i = 0; i < 12; i++) {
          const px = i * 320 - 100;
          const py = canvas.height - 120;
          const grad = mx.createLinearGradient(0, py - 260, 0, py);
          grad.addColorStop(0, "#8fa8d8"); grad.addColorStop(1, "#4a6ba4");
          mx.fillStyle = grad;
          mx.beginPath();
          mx.moveTo(px - 40, py); mx.lineTo(px + 140, py - 260); mx.lineTo(px + 320, py);
          mx.closePath(); mx.fill();
          // snow cap
          mx.fillStyle = "#f0f4ff";
          mx.beginPath();
          mx.moveTo(px + 110, py - 190); mx.lineTo(px + 140, py - 260); mx.lineTo(px + 170, py - 190);
          mx.lineTo(px + 155, py - 200); mx.lineTo(px + 140, py - 220); mx.lineTo(px + 125, py - 200);
          mx.closePath(); mx.fill();
        }
        // rolling hills
        for (let i = 0; i < 12; i++) {
          const hx = i * 280;
          const grad = mx.createLinearGradient(0, canvas.height - 200, 0, canvas.height);
          grad.addColorStop(0, "#5ec95a"); grad.addColorStop(1, "#2a7a2a");
          mx.fillStyle = grad;
          mx.beginPath(); mx.arc(hx, canvas.height - 100, 130, Math.PI, 0); mx.fill();
        }
      } else if (stage.theme === "cave") {
        mx.fillStyle = "#3a2010";
        for (let i = 0; i < 8; i++) {
          const rx = i * 320;
          mx.beginPath();
          mx.moveTo(rx - 40, canvas.height - 80);
          mx.lineTo(rx + 100, canvas.height - 240);
          mx.lineTo(rx + 200, canvas.height - 80);
          mx.closePath(); mx.fill();
        }
        // crystals
        for (let i = 0; i < 10; i++) {
          const cx3 = i * 220 + 80;
          const cy3 = canvas.height - 120 + ((i * 19) % 40);
          mx.fillStyle = "rgba(180,120,80,0.6)";
          mx.beginPath();
          mx.moveTo(cx3, cy3); mx.lineTo(cx3 + 8, cy3 - 30); mx.lineTo(cx3 + 16, cy3);
          mx.closePath(); mx.fill();
        }
      } else {
        // floating islands
        for (let i = 0; i < 10; i++) {
          const cx2 = i * 280 + 100;
          const cy = 200 + ((i * 41) % 120);
          mx.fillStyle = "rgba(140,110,200,0.6)";
          mx.beginPath();
          mx.ellipse(cx2, cy, 110, 26, 0, 0, Math.PI * 2);
          mx.fill();
          mx.fillStyle = "rgba(200,170,255,0.45)";
          mx.beginPath();
          mx.ellipse(cx2, cy - 4, 100, 8, 0, 0, Math.PI * 2);
          mx.fill();
        }
      }

      // Vignette
      const { cx: vcx } = vignette;
      const vg = vcx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.35,
        canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.75
      );
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, stage.theme === "cave" ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.4)");
      vcx.fillStyle = vg; vcx.fillRect(0, 0, canvas.width, canvas.height);
    }
    buildBackgrounds();

    const onResize = () => {
      setCanvasSize();
      rebuildStars();
      buildBackgrounds();
    };
    window.addEventListener("resize", onResize);


    const player = {
      x: world.spawn.x, y: world.spawn.y, w: 99, h: 134,
      vx: 0, vy: 0, onGround: false, facing: 1, anim: 0, invuln: 0,
      squash: 1, stretch: 1, coyote: 0, jumpBuffer: 0, landPulse: 0,
      crouching: false, groundPound: 0, gpCharge: 0,
      wallSlide: 0, wallDir: 0, wallJumpLock: 0,
      attack: 0, diving: false,
      jumpCombo: 0, comboTimer: 0,
      prevJump: false, prevAttack: false, prevGP: false,
      hOffset: 0, // for crouch draw
    };

    const kd = (e: KeyboardEvent) => {
      keys[e.code] = true;
      if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Space","KeyZ","KeyX","KeyC"].includes(e.code)) e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => (keys[e.code] = false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    (window as any).__gameKey = (k: string, v: boolean) => (keys[k] = v);

    function addParticles(
      x: number, y: number, count: number,
      opts: Partial<Particle> & { spread?: number; speed?: number } = {}
    ) {
      const spread = opts.spread ?? Math.PI * 2;
      const speed = opts.speed ?? 3;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * spread - spread / 2 - Math.PI / 2;
        const s = Math.random() * speed + 0.5;
        particles.push({
          x, y,
          vx: opts.vx !== undefined ? opts.vx * (Math.random() * 0.6 + 0.7) : Math.cos(a) * s,
          vy: opts.vy !== undefined ? opts.vy * (Math.random() * 0.6 + 0.7) : Math.sin(a) * s,
          life: opts.life ?? 30,
          maxLife: opts.life ?? 30,
          color: opts.color ?? "#fff",
          size: opts.size ?? 3,
          gravity: opts.gravity ?? 0.2,
          shape: opts.shape ?? "square",
        });
      }
    }

    function collideBlocks(rect: Rect) {
      const hits: Block[] = [];
      for (const b of world.blocks) {
        if (
          rect.x < b.x + b.w && rect.x + rect.w > b.x &&
          rect.y < b.y + b.h && rect.y + rect.h > b.y
        ) hits.push(b);
      }
      return hits;
    }

    function respawn() {
      // Respawn at last reached checkpoint if any
      const last = [...world.checkpoints].reverse().find((c) => c.reached);
      if (last) { player.x = last.x - player.w / 2; player.y = last.y - player.h; }
      else { player.x = world.spawn.x; player.y = world.spawn.y; cameraX = 0; }
      player.vx = 0; player.vy = 0;
      player.invuln = 120;
    }

    function die() {
      // Full death (fall, lava, spikes, or hp<=0)
      localLives -= 1;
      setLives(localLives);
      cameraShake = 12;
      addParticles(player.x + 11, player.y + 15, 24, { color: "#ff3b3b", speed: 6, size: 4, life: 50 });
      addParticles(player.x + 11, player.y + 15, 12, { color: "#ffd94a", speed: 4, size: 3, life: 40 });
      if (localLives <= 0) { setStatus("dead"); running = false; }
      else { stats.hp = stats.maxHp; stats.mp = stats.maxMp; hudTick(); respawn(); }
    }

    function takeDamage(amount: number, knockDir: number) {
      if (player.invuln > 0) return;
      const dmg = Math.max(1, amount - stats.def);
      stats.hp -= dmg;
      hudTick();
      player.invuln = 90;
      player.vy = -6; player.vx = knockDir * 5;
      cameraShake = 6;
      floatText(player.x + player.w / 2, player.y - 4, `-${dmg}`, "#ff5c5c");
      addParticles(player.x + player.w / 2, player.y + 20, 10, { color: "#ff5c5c", size: 3, life: 24, speed: 3 });
      if (stats.hp <= 0) { stats.hp = 0; die(); }
    }

    function gainXp(amount: number) {
      stats.xp += amount;
      floatText(player.x + player.w / 2, player.y - 10, `+${amount} XP`, "#a78bfa");
      while (stats.xp >= stats.xpNext) {
        stats.xp -= stats.xpNext;
        stats.level += 1;
        stats.xpNext = Math.floor(stats.xpNext * 1.6);
        stats.maxHp += 6; stats.hp = stats.maxHp;
        stats.maxMp += 3; stats.mp = stats.maxMp;
        stats.str += 1; stats.def += 1;
        floatText(player.x + player.w / 2, player.y - 30, `LEVEL ${stats.level}!`, "#ffd94a");
        addParticles(player.x + player.w / 2, player.y + player.h / 2, 40, {
          color: "#ffd94a", size: 4, life: 50, speed: 5, gravity: -0.05, shape: "star",
        });
        cameraShake = 8;
      }
      hudTick();
    }

    function spawnLoot(x: number, y: number, e: Enemy) {
      // Gold coins
      const gc = e.gold;
      for (let i = 0; i < gc; i++) {
        loot.push({
          x, y, vx: (Math.random() - 0.5) * 4, vy: -3 - Math.random() * 2,
          t: Math.random() * 6, kind: "gold", taken: false, life: 600,
        });
      }
      // 25% chance of HP potion, 15% MP, 8% gem
      const r = Math.random();
      if (r < 0.08) loot.push({ x, y, vx: 0, vy: -4, t: 0, kind: "gem", taken: false, life: 900 });
      else if (r < 0.23) loot.push({ x, y, vx: 0, vy: -3.5, t: 0, kind: "hpPotion", taken: false, life: 900 });
      else if (r < 0.38) loot.push({ x, y, vx: 0, vy: -3.5, t: 0, kind: "mpPotion", taken: false, life: 900 });
    }

    function floatText(x: number, y: number, text: string, color = "#fff") {
      floatTexts.push({ x, y, text, life: 45, color });
    }


    function completeStage() {
      if (stageCompleted) return;
      stageCompleted = true;
      const timeBonus = Math.max(0, Math.floor(localTime)) * 10;
      localScore += timeBonus;
      setScore(localScore);
      floatText(world.flag.x, world.flag.y - 40, `TIME +${timeBonus}`, "#7ee085");
      for (let i = 0; i < 80; i++) {
        addParticles(world.flag.x, world.flag.y - 200 + i * 4, 1, {
          color: ["#ffd94a", "#ff5c8a", "#4ac1ff", "#7ee085"][i % 4],
          size: 4, life: 70, speed: 5, gravity: 0.15, shape: "star",
        });
      }
      setTimeout(() => {
        if (stageIdx + 1 >= STAGES.length) {
          setStatus("win");
          running = false;
        } else {
          setStatus("stageClear");
          running = false;
        }
      }, 900);
    }

    function update() {
      time++;
      timerAccum++;
      if (timerAccum >= 60) {
        timerAccum = 0;
        localTime -= 1;
        setTimeLeft(localTime);
        if (localTime <= 0) die();
      }

      const left = keys["ArrowLeft"] || keys["KeyA"];
      const right = keys["ArrowRight"] || keys["KeyD"];
      const jump = !!(keys["ArrowUp"] || keys["Space"] || keys["KeyW"]);
      const run = keys["ShiftLeft"] || keys["ShiftRight"];
      const down = !!(keys["ArrowDown"] || keys["KeyS"]);
      const attackBtn = !!(keys["KeyZ"] || keys["KeyJ"]);
      const gpBtn = !!(keys["KeyX"] || keys["KeyK"]);

      const jumpPressed = jump && !player.prevJump;
      const attackPressed = attackBtn && !player.prevAttack;
      const gpPressed = gpBtn && !player.prevGP;
      player.prevJump = jump; player.prevAttack = attackBtn; player.prevGP = gpBtn;

      // Potion use — Q = HP potion, E = MP potion
      const qPressed = !!keys["KeyQ"] && !(player as any).prevQ;
      const ePressed = !!keys["KeyE"] && !(player as any).prevE;
      (player as any).prevQ = !!keys["KeyQ"];
      (player as any).prevE = !!keys["KeyE"];
      if (qPressed && stats.hpPotions > 0 && stats.hp < stats.maxHp) {
        stats.hpPotions--; stats.hp = Math.min(stats.maxHp, stats.hp + Math.floor(stats.maxHp * 0.5));
        floatText(player.x + player.w/2, player.y - 4, "+HP", "#7ee085");
        addParticles(player.x + player.w/2, player.y + player.h/2, 14, {
          color: "#7ee085", size: 3, life: 30, speed: 3, gravity: -0.05, shape: "star",
        });
        hudTick();
      }
      if (ePressed && stats.mpPotions > 0 && stats.mp < stats.maxMp) {
        stats.mpPotions--; stats.mp = Math.min(stats.maxMp, stats.mp + Math.floor(stats.maxMp * 0.6));
        floatText(player.x + player.w/2, player.y - 4, "+MP", "#4ac1ff");
        addParticles(player.x + player.w/2, player.y + player.h/2, 14, {
          color: "#4ac1ff", size: 3, life: 30, speed: 3, gravity: -0.05, shape: "star",
        });
        hudTick();
      }


      // Crouch
      player.crouching = player.onGround && down && player.groundPound === 0 && !player.diving;

      // Attack (punch/kick) — brief hitbox
      if (attackPressed && player.attack <= 0 && player.groundPound === 0) {
        player.attack = 14;
        if (!player.onGround && (Math.abs(player.vx) > 2 || run)) {
          // Dive: lunge forward
          player.diving = true;
          player.vx = player.facing * 7.5;
          player.vy = Math.max(player.vy, -2);
        }
      }
      if (player.attack > 0) player.attack--;
      if (player.onGround) player.diving = false;

      // Ground pound
      if (gpPressed && !player.onGround && player.groundPound === 0) {
        player.groundPound = 1; // charging
        player.gpCharge = 14;
        player.vx = 0; player.vy = 0;
      }
      if (player.groundPound === 1) {
        player.gpCharge--;
        if (player.gpCharge <= 0) player.groundPound = 2; // slamming
      }

      // Movement: locked during GP/dive/wallJumpLock
      const inputLocked = player.groundPound > 0 || player.wallJumpLock > 0;
      const crouchSlow = player.crouching ? 0.4 : 1;
      const maxSpeed = (run ? 5.8 : 4) * crouchSlow;
      const accel = (player.onGround ? 0.55 : 0.32) * crouchSlow;
      const friction = player.onGround ? (player.crouching ? 0.7 : 0.82) : 0.96;

      if (!inputLocked) {
        if (left) { player.vx = Math.max(player.vx - accel, -maxSpeed); player.facing = -1; }
        else if (right) { player.vx = Math.min(player.vx + accel, maxSpeed); player.facing = 1; }
        else if (!player.diving) { player.vx *= friction; if (Math.abs(player.vx) < 0.05) player.vx = 0; }
      }
      if (player.wallJumpLock > 0) player.wallJumpLock--;

      if (player.onGround) player.coyote = 8; else if (player.coyote > 0) player.coyote--;
      if (jumpPressed) player.jumpBuffer = 8; else if (player.jumpBuffer > 0) player.jumpBuffer--;

      // Combo timer for triple jump
      if (player.comboTimer > 0) player.comboTimer--;
      else if (player.onGround) player.jumpCombo = 0;

      // Ground / coyote jump
      if (player.jumpBuffer > 0 && player.coyote > 0 && player.groundPound === 0) {
        const running = Math.abs(player.vx) > 3.5;
        let jv = -11.5;
        let sfxColor = "#e0d7c0";
        // Backflip: crouch + jump while stationary/slow
        if (player.crouching && !running) {
          jv = -15;
          player.vx = -player.facing * 3;
          player.jumpCombo = 0;
          sfxColor = "#7ee085";
          floatText(player.x + 11, player.y - 4, "BACKFLIP!", "#7ee085");
        }
        // Long jump: crouch + jump while running
        else if (player.crouching && running) {
          jv = -8;
          player.vx = player.facing * 9;
          player.jumpCombo = 0;
          sfxColor = "#ffd94a";
          floatText(player.x + 11, player.y - 4, "LONG JUMP!", "#ffd94a");
        }
        // Triple jump
        else if (player.jumpCombo === 2 && running) {
          jv = -14.5;
          player.jumpCombo = 0;
          sfxColor = "#ff7676";
          floatText(player.x + 11, player.y - 4, "TRIPLE!", "#ff7676");
          addParticles(player.x + 11, player.y + 8, 16, { color: "#ffd94a", speed: 4, size: 3, life: 30, shape: "star" });
        }
        // Double jump
        else if (player.jumpCombo === 1) {
          jv = -12.5;
          player.jumpCombo = 2;
          player.comboTimer = 20;
          sfxColor = "#4ac1ff";
        }
        else {
          player.jumpCombo = 1;
          player.comboTimer = 20;
        }
        player.vy = jv;
        player.coyote = 0; player.jumpBuffer = 0; player.onGround = false;
        player.squash = 0.7; player.stretch = 1.3;
        addParticles(player.x + 11, player.y + player.h, 6, {
          color: sfxColor, size: 3, life: 20, spread: Math.PI, speed: 2, gravity: 0.15,
        });
      }
      // Wall jump
      else if (player.jumpBuffer > 0 && !player.onGround && player.wallSlide > 0 && player.groundPound === 0) {
        player.vy = -11.5;
        player.vx = -player.wallDir * 6.5;
        player.facing = -player.wallDir;
        player.wallJumpLock = 8;
        player.jumpBuffer = 0; player.wallSlide = 0;
        player.jumpCombo = 1; player.comboTimer = 20;
        floatText(player.x + 11, player.y - 4, "WALL JUMP!", "#4ac1ff");
        addParticles(player.x + 11 + player.wallDir * 6, player.y + 12, 8, {
          color: "#c8ccd4", size: 3, life: 22, speed: 2.5, gravity: 0.2,
        });
      }
      if (!jump && player.vy < -4 && player.groundPound === 0) player.vy = -4;

      // Sky theme = lower gravity, higher jumps feel floaty
      const gravBase = stage.theme === "sky" ? 0.42 : 0.55;
      let grav = gravBase;
      if (player.groundPound === 1) grav = 0; // freeze in air while charging
      if (player.groundPound === 2) grav = 1.4; // slam
      if (player.wallSlide > 0) grav = 0.18; // slide slowly
      player.vy += grav;
      const maxFall = player.groundPound === 2 ? 18 : 13;
      if (player.vy > maxFall) player.vy = maxFall;

      // X move
      player.x += player.vx;
      if (player.x < 0) { player.x = 0; player.vx = 0; }
      if (player.x + player.w > LEVEL_W) player.x = LEVEL_W - player.w;
      let hitWallDir = 0;
      for (const b of collideBlocks(player)) {
        if (b.type === "platform" || b.type === "cloud") continue;
        if (player.vx > 0) { player.x = b.x - player.w; hitWallDir = 1; }
        else if (player.vx < 0) { player.x = b.x + b.w; hitWallDir = -1; }
        player.vx = 0;
      }
      // Wall slide: pressing into wall while airborne + falling
      if (!player.onGround && player.vy > 0 && hitWallDir !== 0 &&
          ((hitWallDir === 1 && right) || (hitWallDir === -1 && left)) &&
          player.groundPound === 0) {
        player.wallSlide = 6;
        player.wallDir = hitWallDir;
        if (time % 4 === 0) {
          addParticles(player.x + (hitWallDir > 0 ? player.w : 0), player.y + 20, 1, {
            color: "#e0d7c0", size: 2, life: 20, vx: -hitWallDir * 0.6, vy: -0.4, gravity: 0.15,
          });
        }
      } else if (player.wallSlide > 0) player.wallSlide--;

      if (player.onGround && Math.abs(player.vx) > 2 && time % 5 === 0) {
        addParticles(player.x + 11 - player.facing * 6, player.y + player.h - 2, 1, {
          color: stage.theme === "cave" ? "#6b6b6b" : "#d9cfb5",
          size: 3, life: 18, vy: -0.5, vx: -player.facing * 0.6, gravity: 0.05,
        });
      }

      // Y move
      const wasOnGround = player.onGround;
      player.y += player.vy;
      player.onGround = false;
      for (const b of collideBlocks(player)) {
        if (b.type === "platform" || b.type === "cloud") {
          const prevBottom = player.y - player.vy + player.h;
          if (player.vy > 0 && prevBottom <= b.y + 1) {
            player.y = b.y - player.h; player.vy = 0; player.onGround = true;
          }
          continue;
        }
        if (player.vy > 0) {
          player.y = b.y - player.h;
          // Ground pound break brick
          if (player.groundPound === 2 && b.type === "brick") {
            b.bump = 12;
            // Remove brick
            const idx = world.blocks.indexOf(b);
            if (idx >= 0) world.blocks.splice(idx, 1);
            localScore += 50; setScore(localScore);
            addParticles(b.x + 16, b.y + 8, 14, { color: "#c94a1a", size: 3, life: 30, speed: 4, gravity: 0.3 });
          }
          player.vy = 0; player.onGround = true;
        }
        else if (player.vy < 0) {
          player.y = b.y + b.h; player.vy = 0;
          if (b.type === "question" && !b.used) {
            b.used = true; b.bump = 10;
            localCoins += 1; localScore += 200;
            setCoinsCount(localCoins); setScore(localScore);
            floatText(b.x + 16, b.y - 6, "+200", "#ffd94a");
            addParticles(b.x + 16, b.y - 4, 10, { color: "#ffd94a", size: 3, life: 30, speed: 3, gravity: 0.3 });
          } else if (b.type === "brick") {
            b.bump = 8;
            addParticles(b.x + 16, b.y, 6, { color: "#c94a1a", size: 3, life: 24, speed: 2.5, gravity: 0.3 });
          }
        }
      }
      if (!wasOnGround && player.onGround) {
        const hard = player.groundPound === 2;
        player.squash = hard ? 1.6 : 1.3; player.stretch = hard ? 0.5 : 0.75;
        player.landPulse = hard ? 14 : 8;
        addParticles(player.x + 11, player.y + player.h - 2, hard ? 18 : 4, {
          color: "#e0d7c0", size: 3, life: 22, spread: Math.PI, speed: hard ? 4 : 1.5, gravity: 0.15,
        });
        if (hard) {
          cameraShake = 8;
          // Damage enemies in radius
          for (const e of world.enemies) {
            if (!e.alive) continue;
            const dx = (e.x + e.w/2) - (player.x + player.w/2);
            const dy = (e.y + e.h/2) - (player.y + player.h/2);
            if (Math.abs(dx) < 60 && Math.abs(dy) < 40) {
              const dmg = stats.str * 2;
              e.hp -= dmg; e.hitFlash = 10;
              floatText(e.x + e.w/2, e.y - 4, `${dmg}`, "#ffd94a");
              if (e.hp <= 0) {
                e.alive = false; e.squashT = 30;
                localScore += 100; setScore(localScore);
                gainXp(e.xp);
                spawnLoot(e.x + e.w / 2, e.y + e.h / 2, e);
              }
            }
          }
          player.comboTimer = 20; // reset combo
        }
        player.groundPound = 0;
      }
      player.squash += (1 - player.squash) * 0.25;
      player.stretch += (1 - player.stretch) * 0.25;
      if (player.landPulse > 0) player.landPulse--;

      if (player.y > LEVEL_H + 200) die();
      if (player.invuln > 0) player.invuln--;
      if (Math.abs(player.vx) > 0.2 && player.onGround) player.anim += Math.abs(player.vx) * 0.25;

      // Hazards
      for (const h of world.hazards) {
        if (
          player.x < h.x + h.w && player.x + player.w > h.x &&
          player.y < h.y + h.h && player.y + player.h > h.y
        ) die();
      }


      // Camera
      const target = player.x - 260;
      cameraX += (target - cameraX) * 0.12;
      // If the level is shorter than the screen, pin the ground to the bottom (negative cameraY).
      // Otherwise, follow the player vertically.
      const groundPinY = LEVEL_H - canvas.height; // negative when level shorter than screen
      const followY = Math.max(groundPinY, Math.min(LEVEL_H - canvas.height, player.y - canvas.height * 0.65));
      const targetY = LEVEL_H < canvas.height ? groundPinY : followY;
      cameraY += (targetY - cameraY) * 0.08;
      if (cameraX < 0) cameraX = 0;
      if (cameraX > LEVEL_W - canvas.width) cameraX = LEVEL_W - canvas.width;
      if (cameraShake > 0) cameraShake *= 0.85;

      // Enemies
      for (const e of world.enemies) {
        if (!e.alive) { if (e.squashT > 0) e.squashT--; continue; }
        e.anim += 0.12 + Math.abs(e.vx) * 0.15;

        if (e.kind === "goomba" || e.kind === "jumper") {
          e.x += e.vx;
          e.vy += 0.5;
          e.y += e.vy;
          let onGroundE = false;
          for (const b of collideBlocks(e)) {
            if (b.type === "platform" || b.type === "cloud") {
              if (e.vy > 0 && e.y + e.h - e.vy <= b.y + 1) { e.y = b.y - e.h; e.vy = 0; onGroundE = true; }
              continue;
            }
            if (e.vy > 0) { e.y = b.y - e.h; e.vy = 0; onGroundE = true; }
            else if (e.vx !== 0) {
              if (e.vx > 0) e.x = b.x - e.w; else e.x = b.x + b.w;
              e.vx *= -1;
            }
          }
          const foot = { x: e.x + (e.vx > 0 ? e.w + 2 : -2), y: e.y + e.h + 2, w: 2, h: 2 };
          if (collideBlocks(foot).length === 0) e.vx *= -1;
          // Jumper: chase and hop toward the player when close
          if (e.kind === "jumper") {
            const dx = player.x - e.x;
            if (Math.abs(dx) < 220) e.vx = Math.sign(dx) * 1.1;
            e.jumpCd = (e.jumpCd ?? 60) - 1;
            if (onGroundE && (e.jumpCd ?? 0) <= 0) {
              e.vy = -8.5; e.jumpCd = 70 + Math.floor(Math.random() * 40);
            }
          }
        } else if (e.kind === "flyer") {
          // Hovering sine wave, chases horizontally
          const dx = player.x - e.x;
          e.vx += Math.sign(dx) * 0.04;
          e.vx = Math.max(-1.6, Math.min(1.6, e.vx));
          e.x += e.vx;
          e.y = (e.baseY ?? e.y) + Math.sin(time * 0.05 + e.x * 0.01) * 24;
        }

        if (e.hitFlash > 0) e.hitFlash--;

        // Sword attack hitbox (extended reach thanks to weapon)
        const attacking = player.attack > 0;
        if (attacking && e.hitFlash === 0) {
          const hx = player.x + (player.facing > 0 ? player.w - 8 : -30);
          const hy = player.y + 8;
          const hw = 42, hh = 40;
          if (hx < e.x + e.w && hx + hw > e.x && hy < e.y + e.h && hy + hh > e.y) {
            const dmg = stats.str + Math.floor(Math.random() * 2);
            e.hp -= dmg; e.hitFlash = 10;
            floatText(e.x + e.w / 2, e.y - 4, `${dmg}`, "#ffd94a");
            addParticles(e.x + e.w / 2, e.y + 8, 8, { color: "#fff", size: 3, life: 20, speed: 4, gravity: 0.2 });
            cameraShake = 3;
            if (e.hp <= 0) {
              e.alive = false; e.squashT = 30;
              const reward = e.kind === "flyer" ? 200 : 100;
              localScore += reward; setScore(localScore);
              gainXp(e.xp);
              spawnLoot(e.x + e.w / 2, e.y + e.h / 2, e);
              cameraShake = 5;
              continue;
            }
          }
        }

        if (
          player.x < e.x + e.w && player.x + player.w > e.x &&
          player.y < e.y + e.h && player.y + player.h > e.y
        ) {
          const stompable = e.kind === "goomba" || e.kind === "flyer" || e.kind === "jumper";
          if (stompable && player.vy > 1 && player.y + player.h - e.y < 20) {
            const stompDmg = 2 + Math.floor(stats.str / 2);
            e.hp -= stompDmg; e.hitFlash = 10;
            player.vy = jump ? -11 : -8.5;
            player.squash = 0.7; player.stretch = 1.3;
            floatText(e.x + e.w / 2, e.y - 4, `${stompDmg}`, "#ffd94a");
            addParticles(e.x + e.w / 2, e.y + 8, 6, { color: "#fff", size: 3, life: 20, speed: 2.5, gravity: 0.3 });
            if (e.hp <= 0) {
              e.alive = false; e.squashT = 30;
              const reward = e.kind === "flyer" ? 200 : 100;
              localScore += reward; setScore(localScore);
              gainXp(e.xp);
              spawnLoot(e.x + e.w / 2, e.y + e.h / 2, e);
              cameraShake = 4;
            }
          } else if (player.invuln <= 0) {
            const knock = player.x < e.x ? -1 : 1;
            takeDamage(2 + e.power, knock);
          }
        }
      }


      // Loot drops physics + pickup
      for (const l of loot) {
        if (l.taken) continue;
        l.life--;
        if (l.life <= 0) { l.taken = true; continue; }
        l.vy += 0.5;
        if (l.vy > 10) l.vy = 10;
        l.x += l.vx;
        l.y += l.vy;
        l.t += 0.15;
        // Simple ground collision
        const foot = { x: l.x - 4, y: l.y - 4, w: 8, h: 8 };
        for (const b of collideBlocks(foot)) {
          if (b.type === "platform" || b.type === "cloud") {
            if (l.vy > 0 && foot.y + foot.h - l.vy <= b.y + 1) { l.y = b.y - 4; l.vy = 0; l.vx *= 0.8; }
            continue;
          }
          if (l.vy > 0 && foot.y + foot.h - l.vy <= b.y + 2) { l.y = b.y - 4; l.vy = 0; l.vx *= 0.7; }
          else { l.vx *= -0.5; l.x += l.vx; }
        }
        // Pickup
        if (
          player.x < l.x + 8 && player.x + player.w > l.x - 8 &&
          player.y < l.y + 8 && player.y + player.h > l.y - 8
        ) {
          l.taken = true;
          if (l.kind === "gold") {
            stats.gold += 1; localScore += 25; setScore(localScore);
            floatText(l.x, l.y - 4, "+1G", "#ffd94a");
          } else if (l.kind === "gem") {
            stats.gold += 10; localScore += 250; setScore(localScore);
            floatText(l.x, l.y - 4, "+10G", "#c05af0");
            addParticles(l.x, l.y, 12, { color: "#c05af0", size: 3, life: 30, speed: 3, gravity: 0.1, shape: "star" });
          } else if (l.kind === "hpPotion") {
            stats.hpPotions += 1;
            floatText(l.x, l.y - 4, "+POCIÓN", "#7ee085");
          } else if (l.kind === "mpPotion") {
            stats.mpPotions += 1;
            floatText(l.x, l.y - 4, "+MANÁ", "#4ac1ff");
          }
          hudTick();
        }
      }
      loot = loot.filter((l) => !l.taken);

      // Coins
      for (const c of world.coins) {

        if (c.taken) { if (c.pop > 0) c.pop--; continue; }
        c.t += 0.18;
        if (
          player.x < c.x + 16 && player.x + player.w > c.x &&
          player.y < c.y + 16 && player.y + player.h > c.y
        ) {
          c.taken = true; c.pop = 20;
          localCoins += 1; localScore += 100;
          setCoinsCount(localCoins); setScore(localScore);
          if (localCoins > 0 && localCoins % 20 === 0) {
            localLives += 1; setLives(localLives);
            floatText(c.x, c.y - 18, "1UP!", "#7ee085");
          }
          floatText(c.x + 8, c.y - 4, "+100", "#ffd94a");
          addParticles(c.x + 8, c.y + 8, 8, { color: "#ffe680", size: 2, life: 24, speed: 2.5, gravity: 0.15, shape: "star" });
        }
      }

      // Checkpoints
      for (const cp of world.checkpoints) {
        if (cp.reached) continue;
        if (
          player.x + player.w > cp.x - 20 && player.x < cp.x + 20 &&
          player.y + player.h > cp.y && player.y < cp.y + TILE * 4
        ) {
          cp.reached = true;
          localScore += 250; setScore(localScore);
          floatText(cp.x, cp.y - 20, "CHECKPOINT!", "#7ee085");
          addParticles(cp.x, cp.y, 20, { color: "#7ee085", size: 3, life: 40, speed: 4, gravity: 0.15, shape: "star" });
          cameraShake = 3;
        }
      }

      // Flag
      if (
        !stageCompleted && world.flag.x &&
        player.x + player.w > world.flag.x &&
        player.x < world.flag.x + 8 &&
        player.y + player.h > world.flag.y
      ) {
        completeStage();
      }

      particles = particles.filter((p) => p.life > 0);
      for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += p.gravity; p.life--; }
      floatTexts = floatTexts.filter((f) => f.life > 0);
      for (const f of floatTexts) { f.y -= 1.2; f.life--; }
      for (const b of world.blocks) if (b.bump && b.bump > 0) b.bump = Math.max(0, b.bump - 0.8);
    }

    // ------- Drawing -------
    function cloud(x: number, y: number, s = 1) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y - 1, 14 * s, 0, Math.PI * 2);
      ctx.arc(x + 18 * s, y - 7, 20 * s, 0, Math.PI * 2);
      ctx.arc(x + 40 * s, y - 1, 14 * s, 0, Math.PI * 2);
      ctx.arc(x + 22 * s, y + 7, 16 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawSky() {
      // Base sky + baked sun/moon/stars/stalactites — tiled parallax
      const offFar = -((cameraX * 0.15) % BG_W);
      ctx.drawImage(bgFar.c, offFar, 0);
      ctx.drawImage(bgFar.c, offFar + BG_W, 0);
      const offMid = -((cameraX * 0.3) % BG_W);
      ctx.drawImage(bgMid.c, offMid, 0);
      ctx.drawImage(bgMid.c, offMid + BG_W, 0);

      // A few animated clouds for grass/sky themes (cheap)
      if (stage.theme !== "cave") {
        for (let i = 0; i < 5; i++) {
          const cx2 = i * 260 - (cameraX * 0.4) % 260;
          const cy = 50 + ((i * 53) % 60);
          cloud(cx2, cy, 0.9 + (i % 3) * 0.15);
        }
      }
    }

    function drawBlock(b: Block) {
      const x = Math.round(b.x - cameraX);
      const y = Math.round(b.y - (b.bump || 0) - cameraY);
      if (x + b.w < -20 || x > canvas.width + 20) return;
      switch (b.type) {
        case "ground": ctx.drawImage(sprites.ground, x, y); break;
        case "grass": ctx.drawImage(sprites.grass, x, y); break;
        case "brick": ctx.drawImage(sprites.brick, x, y); break;
        case "question":
          ctx.drawImage(b.used ? sprites.questionUsed : sprites.question, x, y);
          break;
        case "pipe":
          ctx.drawImage(sprites.pipe, x, y);
          if (b.pipeTop) {
            const rimX = b.pipeLeft ? x - 4 : x;
            ctx.drawImage(sprites.pipeTop, rimX, y - 6);
          }
          break;
        case "stone": ctx.drawImage(sprites.stone, x, y); break;
        case "platform": ctx.drawImage(sprites.platform, x, y); break;
        case "cloud": ctx.drawImage(sprites.cloud, x, y); break;
      }
    }



    function drawHazard(h: Hazard) {
      const x = Math.round(h.x - cameraX);
      const y = Math.round(h.y - cameraY);
      if (h.kind === "spike") {
        ctx.fillStyle = "#8090a0";
        const step = 6;
        for (let i = 0; i < h.w; i += step) {
          ctx.beginPath();
          ctx.moveTo(x + i, y + h.h);
          ctx.lineTo(x + i + step / 2, y);
          ctx.lineTo(x + i + step, y + h.h);
          ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        for (let i = 0; i < h.w; i += step) {
          ctx.fillRect(x + i + step / 2 - 1, y + 2, 1, h.h - 4);
        }
      } else if (h.kind === "lava") {
        // Molten lava with animated surface + glow
        const g = ctx.createLinearGradient(0, y, 0, y + h.h);
        g.addColorStop(0, "#ffe680");
        g.addColorStop(0.15, "#ff8a1a");
        g.addColorStop(0.6, "#c8280a");
        g.addColorStop(1, "#5a0a04");
        ctx.fillStyle = g;
        ctx.fillRect(x, y + 2, h.w, h.h - 2);
        // wavy surface
        ctx.fillStyle = "#ffd94a";
        ctx.beginPath();
        ctx.moveTo(x, y + 4);
        for (let i = 0; i <= h.w; i += 4) {
          const wy = y + 3 + Math.sin((time * 0.15 + (h.x + i) * 0.08)) * 1.8;
          ctx.lineTo(x + i, wy);
        }
        ctx.lineTo(x + h.w, y + 6); ctx.lineTo(x, y + 6);
        ctx.closePath(); ctx.fill();
        // glow
        const glow = ctx.createRadialGradient(x + h.w / 2, y, 2, x + h.w / 2, y, h.w * 0.7);
        glow.addColorStop(0, "rgba(255,180,60,0.35)");
        glow.addColorStop(1, "rgba(255,120,0,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(x - 8, y - 12, h.w + 16, 20);
        // occasional embers
        if (Math.random() < 0.15) {
          addParticles(h.x + Math.random() * h.w, h.y + 2, 1, {
            color: "#ffb04a", size: 2, life: 30, vy: -1.2 - Math.random(), vx: (Math.random() - 0.5) * 0.6, gravity: -0.02,
          });
        }
      }
    }

    function drawCheckpoints() {
      for (const cp of world.checkpoints) {
        const x = Math.round(cp.x - cameraX);
        const y = Math.round(cp.y - cameraY);
        // pole
        ctx.fillStyle = "#c0c8d4";
        ctx.fillRect(x - 1, y - 4, 3, TILE * 4 + 4);
        // top ball
        ctx.fillStyle = cp.reached ? "#7ee085" : "#8090a0";
        ctx.beginPath(); ctx.arc(x, y - 6, 5, 0, Math.PI * 2); ctx.fill();
        // flag
        const wave = Math.sin(time * 0.12 + cp.x * 0.01) * 3;
        ctx.fillStyle = cp.reached ? "#22c55e" : "#94a3b8";
        ctx.beginPath();
        ctx.moveTo(x + 1, y);
        ctx.lineTo(x + 26 + wave, y + 10);
        ctx.lineTo(x + 1, y + 22);
        ctx.closePath(); ctx.fill();
        if (cp.reached) {
          ctx.fillStyle = "#fff"; ctx.font = "bold 11px monospace";
          ctx.fillText("✓", x + 8, y + 15);
        }
      }
    }

    function drawPlayer() {
      if (player.invuln > 0 && Math.floor(player.invuln / 4) % 2 === 0) return;
      const px = player.x - cameraX;
      const py = player.y - cameraY;
      const f = player.facing;

      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.ellipse(px + player.w / 2, py + player.h + 1, player.w * 0.55, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Ground-pound charge aura
      if (player.groundPound === 1) {
        ctx.strokeStyle = `rgba(255,220,80,${0.4 + Math.sin(time * 0.6) * 0.3})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px + player.w / 2, py + player.h / 2, 22 + Math.sin(time * 0.6) * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Ground-pound slam trail
      if (player.groundPound === 2) {
        ctx.fillStyle = "rgba(140,180,255,0.35)";
        ctx.fillRect(px, py - 30, player.w, 30);
      }

      // Sprite is drawn in a 44x60 virtual space with smooth shapes and gradients.
      const BW = 44, BH = 60;
      const CHAR_SCALE = 2.24;

      ctx.save();
      ctx.translate(px + player.w / 2, py + player.h);

      // Rotation: ground-pound spin, dive tilt, subtle air sway
      let rot = 0;
      if (player.groundPound === 1) rot = (time * 0.6) % (Math.PI * 2);
      if (player.diving) rot = f * 0.9;
      if (!player.onGround && player.groundPound === 0 && !player.diving) {
        rot += Math.max(-0.35, Math.min(0.35, player.vx * 0.04));
      }
      ctx.rotate(rot);

      // Squash/stretch + idle breathing
      const idleBob = player.onGround && Math.abs(player.vx) < 0.3 ? Math.sin(time * 0.08) * 0.03 : 0;
      const sq = (player.crouching ? player.squash * 0.6 : player.squash) + idleBob;
      const st = (player.crouching ? player.stretch * 1.2 : player.stretch) - idleBob;
      ctx.scale(f * st * CHAR_SCALE, sq * CHAR_SCALE);
      ctx.translate(-BW / 2, -BH);

      const speed = Math.abs(player.vx);
      const walking = player.onGround && speed > 0.3;
      const walkPhase = player.anim * 0.55;
      const airborne = !player.onGround;
      const crouched = player.crouching;
      const attacking = player.attack > 0;
      const wallSliding = player.wallSlide > 0 && !player.onGround;

      // Palette
      const SKIN = "#f4c9a0", SKIN_SHADE = "#c99268", SKIN_DARK = "#a06a45";
      const HAIR = "#2a140a";
      const CAP_HI = "#ff5d5d", CAP = "#dc2020", CAP_LO = "#8b1010";
      const OVR_HI = "#3d84f0", OVR = "#1e58cc", OVR_LO = "#123578";
      const SHIRT_HI = "#ff5d5d", SHIRT = "#dc2020", SHIRT_LO = "#8b1010";
      const SHOE_HI = "#6a3410", SHOE = "#3a1608", SHOE_SOLE = "#1a0804";
      const GLOVE_HI = "#ffffff", GLOVE_SH = "#c8c8d0";

      const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      };
      const linGrad = (x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) => {
        const g = ctx.createLinearGradient(x0, y0, x1, y1);
        for (const s of stops) g.addColorStop(s[0], s[1]);
        return g;
      };

      // ---- Head (drawn later on top of shoulders slightly) ----
      // ---- BODY / TORSO ----
      // Torso overalls (rounded)
      ctx.fillStyle = linGrad(0, 28, 0, 50, [[0, OVR_HI], [0.35, OVR], [1, OVR_LO]]);
      roundRect(6, 28, 32, 22, 6); ctx.fill();

      // Red shirt visible at neckline and sleeves
      ctx.fillStyle = linGrad(0, 26, 0, 38, [[0, SHIRT_HI], [1, SHIRT]]);
      roundRect(14, 26, 16, 8, 4); ctx.fill();

      // Overall straps
      ctx.fillStyle = OVR;
      roundRect(11, 26, 5, 10, 2); ctx.fill();
      roundRect(28, 26, 5, 10, 2); ctx.fill();
      // Strap highlight
      ctx.fillStyle = OVR_HI;
      ctx.fillRect(12, 27, 1, 8); ctx.fillRect(29, 27, 1, 8);

      // Overall bib seam
      ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(22, 32); ctx.lineTo(22, 46); ctx.stroke();

      // Yellow buttons (with shine)
      const button = (bx: number, by: number) => {
        ctx.fillStyle = "#ffcc22";
        ctx.beginPath(); ctx.arc(bx, by, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#7a4400";
        ctx.beginPath(); ctx.arc(bx, by, 2.2, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.beginPath(); ctx.arc(bx - 0.7, by - 0.7, 0.7, 0, Math.PI * 2); ctx.fill();
      };
      button(14, 36); button(30, 36);

      // Torso shadow under head
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      roundRect(10, 27, 24, 4, 2); ctx.fill();

      // ---- ARMS + GLOVES ----
      const drawArm = (side: -1 | 1, shoulderY: number, elbowOffX: number, elbowOffY: number, gloveX: number, gloveY: number) => {
        const sx = side === 1 ? 34 : 10;
        // Sleeve (red)
        ctx.strokeStyle = SHIRT; ctx.lineWidth = 6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(sx, shoulderY);
        ctx.quadraticCurveTo(sx + elbowOffX * side, shoulderY + elbowOffY, gloveX, gloveY);
        ctx.stroke();
        // Sleeve highlight
        ctx.strokeStyle = SHIRT_HI; ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(sx - side, shoulderY + 1);
        ctx.quadraticCurveTo(sx + elbowOffX * side - side, shoulderY + elbowOffY, gloveX - side, gloveY - 1);
        ctx.stroke();
        // Glove
        ctx.fillStyle = linGrad(gloveX - 4, gloveY - 4, gloveX + 4, gloveY + 4, [[0, GLOVE_HI], [1, GLOVE_SH]]);
        ctx.beginPath(); ctx.arc(gloveX, gloveY, 4.2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 0.6; ctx.stroke();
        // Thumb hint
        ctx.fillStyle = GLOVE_SH;
        ctx.beginPath(); ctx.arc(gloveX + side * 2.5, gloveY + 1.5, 1.6, 0, Math.PI * 2); ctx.fill();
      };

      if (attacking) {
        drawArm(1, 32, 8, 2, 48, 32);   // forward punch
        drawArm(-1, 34, 4, 6, 2, 40);
      } else if (crouched) {
        drawArm(1, 34, 3, 6, 36, 44);
        drawArm(-1, 34, 3, 6, 8, 44);
      } else if (wallSliding) {
        drawArm(1, 30, 6, 4, 40, 34);
        drawArm(-1, 34, 3, 6, 6, 44);
      } else if (walking) {
        const s = Math.sin(walkPhase) * 4;
        drawArm(1, 32, 4, 8 - s, 36, 44 - s);
        drawArm(-1, 32, 4, 8 + s, 8, 44 + s);
      } else if (airborne) {
        const t = Math.min(1, Math.abs(player.vy) / 10);
        const up = player.vy < 0 ? 4 * t : 0;
        drawArm(1, 30, 6, -2 - up, 40, 26 - up);
        drawArm(-1, 30, 6, -2 - up, 4, 26 - up);
      } else {
        const b = Math.sin(time * 0.08) * 0.6;
        drawArm(1, 32, 4, 8, 36, 44 + b);
        drawArm(-1, 32, 4, 8, 8, 44 + b);
      }

      // ---- LEGS + SHOES ----
      const drawLeg = (side: -1 | 1, thighDrop: number) => {
        const hx = side === 1 ? 27 : 17;
        const kx = hx;
        const ky = 50;
        const fx = hx + side * 1;
        const fy = 58 - thighDrop;
        // Pant (overall)
        ctx.strokeStyle = OVR; ctx.lineWidth = 7; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(hx, 46); ctx.quadraticCurveTo(kx, ky, fx, fy); ctx.stroke();
        // Highlight
        ctx.strokeStyle = OVR_HI; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(hx - side, 47); ctx.quadraticCurveTo(kx - side, ky, fx - side, fy - 1); ctx.stroke();
        // Shoe (rounded, with sole)
        ctx.fillStyle = linGrad(fx - 6, fy - 3, fx - 6, fy + 4, [[0, SHOE_HI], [1, SHOE]]);
        roundRect(fx - 6, fy - 3, 12, 6, 3); ctx.fill();
        ctx.fillStyle = SHOE_SOLE;
        roundRect(fx - 7, fy + 2, 14, 2, 1); ctx.fill();
      };

      if (crouched) {
        drawLeg(1, -2); drawLeg(-1, -2);
      } else if (airborne) {
        drawLeg(1, 0); drawLeg(-1, 0);
      } else if (walking) {
        const s = Math.sin(walkPhase);
        drawLeg(1, Math.max(0, s) * 3);
        drawLeg(-1, Math.max(0, -s) * 3);
      } else {
        drawLeg(1, 0); drawLeg(-1, 0);
      }

      // ---- HEAD ----
      // Neck shadow
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      roundRect(17, 24, 10, 4, 2); ctx.fill();

      // Head base (skin)
      ctx.fillStyle = linGrad(0, 6, 0, 26, [[0, SKIN], [1, SKIN_SHADE]]);
      roundRect(9, 6, 26, 20, 9); ctx.fill();

      // Ear
      ctx.fillStyle = SKIN_SHADE;
      ctx.beginPath(); ctx.ellipse(9, 17, 2, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = SKIN_DARK;
      ctx.beginPath(); ctx.ellipse(9, 17, 0.9, 1.6, 0, 0, Math.PI * 2); ctx.fill();

      // Sideburn / hair
      ctx.fillStyle = HAIR;
      ctx.beginPath(); ctx.ellipse(11, 14, 3, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(33, 14, 3, 5, 0, 0, Math.PI * 2); ctx.fill();

      // Cap brim (front curve)
      ctx.fillStyle = CAP_LO;
      ctx.beginPath();
      ctx.moveTo(6, 10);
      ctx.quadraticCurveTo(22, 14, 38, 10);
      ctx.quadraticCurveTo(38, 12, 34, 13);
      ctx.quadraticCurveTo(22, 15.5, 10, 13);
      ctx.quadraticCurveTo(6, 12, 6, 10);
      ctx.closePath(); ctx.fill();

      // Cap dome (rounded top)
      ctx.fillStyle = linGrad(0, -6, 0, 12, [[0, CAP_HI], [0.4, CAP], [1, CAP_LO]]);
      ctx.beginPath();
      ctx.moveTo(9, 10);
      ctx.quadraticCurveTo(9, -6, 22, -6);
      ctx.quadraticCurveTo(35, -6, 35, 10);
      ctx.quadraticCurveTo(22, 6, 9, 10);
      ctx.closePath(); ctx.fill();

      // Cap gloss highlight
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.beginPath(); ctx.ellipse(15, 0, 4, 2, -0.5, 0, Math.PI * 2); ctx.fill();

      // M emblem circle
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(22, 3, 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 0.5; ctx.stroke();
      ctx.fillStyle = CAP;
      ctx.font = "bold 6px 'Arial Black', sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("M", 22, 3.6);
      ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";

      // Nose (big round)
      ctx.fillStyle = linGrad(0, 14, 0, 22, [[0, SKIN], [1, SKIN_DARK]]);
      ctx.beginPath(); ctx.ellipse(26, 19, 5, 4.2, 0, 0, Math.PI * 2); ctx.fill();
      // Nose highlight
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath(); ctx.ellipse(24, 17.5, 1.6, 1, -0.4, 0, Math.PI * 2); ctx.fill();

      // Eye white
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.ellipse(20, 15, 2.4, 3, 0, 0, Math.PI * 2); ctx.fill();
      // Iris
      ctx.fillStyle = "#2a4fb5";
      ctx.beginPath(); ctx.ellipse(20.5, 15.5, 1.5, 2, 0, 0, Math.PI * 2); ctx.fill();
      // Pupil
      ctx.fillStyle = "#000";
      ctx.beginPath(); ctx.ellipse(20.5, 15.8, 0.8, 1.3, 0, 0, Math.PI * 2); ctx.fill();
      // Eye shine
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(20.2, 14.7, 0.5, 0, Math.PI * 2); ctx.fill();

      // Eyebrow (thick, angled)
      ctx.strokeStyle = HAIR; ctx.lineWidth = 2.2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(17, 11.5); ctx.quadraticCurveTo(20, 10, 23, 11); ctx.stroke();

      // Mustache — thick curly bushy under nose
      ctx.fillStyle = HAIR;
      ctx.beginPath();
      ctx.moveTo(13, 22);
      ctx.quadraticCurveTo(14, 19, 20, 20);
      ctx.quadraticCurveTo(24, 20.5, 30, 20);
      ctx.quadraticCurveTo(34, 20, 34, 22);
      ctx.quadraticCurveTo(33, 24.5, 30, 24);
      ctx.quadraticCurveTo(24, 23, 20, 24);
      ctx.quadraticCurveTo(14, 25, 13, 22);
      ctx.closePath(); ctx.fill();
      // Mustache highlight
      ctx.fillStyle = "#4a2410";
      ctx.beginPath(); ctx.ellipse(22, 21, 5, 0.7, 0, 0, Math.PI * 2); ctx.fill();

      // Cheek blush
      ctx.fillStyle = "rgba(220,80,80,0.28)";
      ctx.beginPath(); ctx.ellipse(15, 20, 2.2, 1.4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(33, 20, 2.2, 1.4, 0, 0, Math.PI * 2); ctx.fill();
      // Lower lip hint
      ctx.strokeStyle = "rgba(90,30,20,0.55)"; ctx.lineWidth = 0.6;
      ctx.beginPath(); ctx.moveTo(20, 25.5); ctx.quadraticCurveTo(22, 26.6, 24, 25.5); ctx.stroke();
      // Chin shadow
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.beginPath(); ctx.ellipse(22, 27, 6, 1.5, 0, 0, Math.PI * 2); ctx.fill();

      ctx.restore();

      // Attack sfx swipe
      if (player.attack > 6) {
        ctx.strokeStyle = `rgba(255,255,255,${player.attack / 14})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px + player.w / 2 + f * 22, py + 30, 14, -0.6, 0.6);
        ctx.stroke();
      }



      if (player.landPulse > 0) {
        ctx.strokeStyle = `rgba(255,255,255,${(player.landPulse / 14) * 0.7})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(px + player.w / 2, py + player.h, (14 - player.landPulse) * 3, 3, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    function drawGoomba(e: Enemy) {
      const s = e.w / 28;
      const scrX = Math.round(e.x - cameraX);
      const scrY = Math.round(e.y - cameraY);
      if (!e.alive) {
        if (e.squashT > 0) {
          ctx.fillStyle = "#5a2f14"; ctx.fillRect(scrX, scrY + e.h - 6, e.w, 6);
          ctx.fillStyle = "#8b4513"; ctx.fillRect(scrX + 4, scrY + e.h - 12, e.w - 8, 6);
        }
        return;
      }
      ctx.save();
      ctx.translate(scrX, scrY);
      ctx.scale(s, s);
      const x = 0, y = 0;
      const EW = 28;
      const bounce = Math.sin(e.anim * 0.6) * 1.4;
      const EH = 28;
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(x + EW / 2, y + EH + 2, EW * 0.5, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      const capGrad = ctx.createRadialGradient(x + EW / 2, y + 6 - bounce, 3, x + EW / 2, y + 12 - bounce, 18);
      if (e.kind === "jumper") {
        capGrad.addColorStop(0, "#e64a4a"); capGrad.addColorStop(1, "#5a0a0a");
      } else {
        capGrad.addColorStop(0, "#c96a2a"); capGrad.addColorStop(1, "#5a2a08");
      }
      ctx.fillStyle = capGrad;
      ctx.beginPath(); ctx.arc(x + EW / 2, y + 12 - bounce, 14, Math.PI, 0); ctx.fill();
      ctx.fillRect(x, y + 12 - bounce, EW, 10);
      // jumper: little spikes on top to signal "danger, jumps"
      if (e.kind === "jumper") {
        ctx.fillStyle = "#ffd94a";
        ctx.beginPath();
        ctx.moveTo(x + 8, y + 2 - bounce); ctx.lineTo(x + 11, y - 4 - bounce); ctx.lineTo(x + 14, y + 2 - bounce);
        ctx.moveTo(x + 14, y + 2 - bounce); ctx.lineTo(x + 17, y - 5 - bounce); ctx.lineTo(x + 20, y + 2 - bounce);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = "rgba(255,220,180,0.35)";
      ctx.beginPath(); ctx.arc(x + 10, y + 8 - bounce, 4, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = "#f4c88a"; ctx.fillRect(x + 5, y + 14 - bounce, 18, 8);
      ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(x + 5, y + 14 - bounce, 18, 1);
      ctx.fillStyle = "#fff";
      ctx.fillRect(x + 6, y + 15 - bounce, 6, 6);
      ctx.fillRect(x + 16, y + 15 - bounce, 6, 6);
      ctx.fillStyle = "#000";
      const eyeDir = e.vx > 0 ? 2 : 0;
      ctx.fillRect(x + 6 + eyeDir, y + 17 - bounce, 3, 3);
      ctx.fillRect(x + 16 + eyeDir, y + 17 - bounce, 3, 3);
      ctx.fillStyle = "#3a1408";
      ctx.fillRect(x + 5, y + 14 - bounce, 8, 2); ctx.fillRect(x + 15, y + 14 - bounce, 8, 2);

      const legPhase = Math.sin(e.anim * 0.9);
      ctx.fillStyle = "#2a1408";
      ctx.fillRect(x + 2, y + 22 + Math.max(0, legPhase) * 1.5, 8, 6);
      ctx.fillRect(x + 18, y + 22 + Math.max(0, -legPhase) * 1.5, 8, 6);
      ctx.restore();
    }

    function drawFlyer(e: Enemy) {
      const s = e.w / 28;
      const scrX = Math.round(e.x - cameraX);
      const scrY = Math.round(e.y - cameraY);
      if (!e.alive) {
        if (e.squashT > 0) {
          ctx.fillStyle = "#5c6270"; ctx.fillRect(scrX + 4, scrY + e.h - 6, e.w - 8, 6);
        }
        return;
      }
      ctx.save();
      ctx.translate(scrX, scrY);
      ctx.scale(s, s);
      const x = 0, y = 0, EW = 28;
      const flap = Math.sin(e.anim * 2) * 6;
      // Body
      const g = ctx.createRadialGradient(x + EW / 2, y + 12, 4, x + EW / 2, y + 12, 14);
      g.addColorStop(0, "#e05c8a"); g.addColorStop(1, "#8b2a4a");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x + EW / 2, y + 12, 12, 10, 0, 0, Math.PI * 2); ctx.fill();
      // Wings
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 8);
      ctx.lineTo(x - 6, y + 8 - flap);
      ctx.lineTo(x + 4, y + 14);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + EW - 4, y + 8);
      ctx.lineTo(x + EW + 6, y + 8 - flap);
      ctx.lineTo(x + EW - 4, y + 14);
      ctx.closePath(); ctx.fill();
      // Eyes
      ctx.fillStyle = "#fff";
      ctx.fillRect(x + 8, y + 9, 5, 5); ctx.fillRect(x + 15, y + 9, 5, 5);
      ctx.fillStyle = "#000";
      const eyeDir = e.vx > 0 ? 2 : 0;
      ctx.fillRect(x + 9 + eyeDir, y + 10, 2, 3); ctx.fillRect(x + 16 + eyeDir, y + 10, 2, 3);
      // Beak
      ctx.fillStyle = "#ffd94a";
      ctx.beginPath();
      ctx.moveTo(x + EW / 2 - 2, y + 16);
      ctx.lineTo(x + EW / 2 + 2, y + 16);
      ctx.lineTo(x + EW / 2, y + 20);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    function drawCoin(c: Coin) {
      if (c.taken) return;
      const bob = Math.sin(time * 0.08 + c.x * 0.01) * 3;
      const x = Math.round(c.x - cameraX);
      const y = Math.round(c.y + bob - cameraY);
      const gr = ctx.createRadialGradient(x + 8, y + 8, 2, x + 8, y + 8, 14);
      gr.addColorStop(0, "rgba(255,220,80,0.4)"); gr.addColorStop(1, "rgba(255,220,80,0)");
      ctx.fillStyle = gr; ctx.fillRect(x - 6, y - 6, 28, 28);
      const scale = Math.abs(Math.cos(c.t));
      const w = Math.max(2, 14 * scale);
      const grad = ctx.createLinearGradient(x, 0, x + 16, 0);
      grad.addColorStop(0, "#c07500"); grad.addColorStop(0.5, "#ffd94a"); grad.addColorStop(1, "#c07500");
      ctx.fillStyle = grad; ctx.fillRect(x + 8 - w / 2, y, w, 14);
      if (w > 4) {
        ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.fillRect(x + 8 - w / 2 + 1, y + 2, 2, 10);
        ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(x + 8 + w / 2 - 2, y + 2, 1, 10);
      }
    }

    function drawLoot() {
      for (const l of loot) {
        if (l.taken) continue;
        const x = Math.round(l.x - cameraX);
        const y = Math.round(l.y - cameraY);
        const bob = Math.sin(l.t) * 2;
        const fade = l.life < 90 ? (l.life % 10 < 5 ? 0.35 : 1) : 1;
        ctx.globalAlpha = fade;
        if (l.kind === "gold") {
          const g = ctx.createRadialGradient(x, y + bob, 1, x, y + bob, 8);
          g.addColorStop(0, "#fff2a8"); g.addColorStop(0.5, "#ffd94a"); g.addColorStop(1, "#c07500");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(x, y + bob, 6, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#7a4400"; ctx.lineWidth = 1; ctx.stroke();
        } else if (l.kind === "gem") {
          ctx.save(); ctx.translate(x, y + bob); ctx.rotate(l.t * 0.4);
          const g = ctx.createLinearGradient(-6, -6, 6, 6);
          g.addColorStop(0, "#e0a8ff"); g.addColorStop(1, "#7a2acc");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(7, 0); ctx.lineTo(0, 8); ctx.lineTo(-7, 0); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = "#fff"; ctx.lineWidth = 0.8; ctx.stroke();
          ctx.restore();
        } else if (l.kind === "hpPotion" || l.kind === "mpPotion") {
          const col = l.kind === "hpPotion" ? "#e63946" : "#4ac1ff";
          const glow = l.kind === "hpPotion" ? "#ff8888" : "#8fe3ff";
          // Bottle
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.fillRect(x - 3, y - 8 + bob, 6, 3);
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.ellipse(x, y + 2 + bob, 5, 7, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.ellipse(x - 1.5, y + bob, 1.2, 3, 0, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "rgba(0,0,0,0.5)"; ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.ellipse(x, y + 2 + bob, 5, 7, 0, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }

    function drawEnemyHpBar(e: Enemy) {
      if (!e.alive || e.hp >= e.maxHp) return;
      const x = Math.round(e.x - cameraX);
      const y = Math.round(e.y - cameraY) - 8;
      const w = e.w;
      ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(x, y, w, 4);
      const pct = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = pct > 0.5 ? "#7ee085" : pct > 0.25 ? "#ffd94a" : "#ff5c5c";
      ctx.fillRect(x + 1, y + 1, (w - 2) * pct, 2);
    }


      if (!world.flag.x) return;
      const x = Math.round(world.flag.x - cameraX);
      const y = world.flag.y - cameraY;
      const pg = ctx.createLinearGradient(x, 0, x + 4, 0);
      pg.addColorStop(0, "#7a8090"); pg.addColorStop(0.5, "#e0e5ec"); pg.addColorStop(1, "#5c6270");
      ctx.fillStyle = pg; ctx.fillRect(x, y - 220, 4, 280);
      ctx.fillStyle = "#ffd94a";
      ctx.beginPath(); ctx.arc(x + 2, y - 220, 7, 0, Math.PI * 2); ctx.fill();
      const wave = Math.sin(time * 0.1) * 4;
      const flagColors = ["#00c853", "#ff9500", "#c05af0"];
      ctx.fillStyle = flagColors[stageIdx] || "#00c853";
      ctx.beginPath();
      ctx.moveTo(x + 4, y - 210); ctx.lineTo(x + 40 + wave, y - 200); ctx.lineTo(x + 4, y - 190);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = "bold 12px monospace";
      ctx.fillText("★", x + 14, y - 197);
    }

    function drawParticles() {
      for (const p of particles) {
        const alpha = Math.min(1, p.life / p.maxLife);
        ctx.fillStyle = p.color; ctx.globalAlpha = alpha;
        const px = Math.round(p.x - cameraX);
        const py = Math.round(p.y - cameraY);
        if (p.shape === "star") {
          ctx.fillRect(px - p.size, py, p.size * 2, 1);
          ctx.fillRect(px, py - p.size, 1, p.size * 2);
        } else if (p.shape === "circle") {
          ctx.beginPath(); ctx.arc(px, py, p.size, 0, Math.PI * 2); ctx.fill();
        } else ctx.fillRect(px - p.size / 2, py - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }

    function drawFloatTexts() {
      ctx.font = "bold 14px monospace";
      for (const f of floatTexts) {
        const alpha = Math.min(1, f.life / 45);
        ctx.globalAlpha = alpha;
        const x = Math.round(f.x - cameraX);
        const y = Math.round(f.y - cameraY);
        ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillText(f.text, x - 12, y + 1);
        ctx.fillStyle = f.color; ctx.fillText(f.text, x - 13, y);
      }
      ctx.globalAlpha = 1;
    }

    function draw() {
      const shakeX = (Math.random() - 0.5) * cameraShake;
      const shakeY = (Math.random() - 0.5) * cameraShake;
      ctx.save();
      ctx.translate(shakeX, shakeY);

      drawSky();
      for (const b of world.blocks) drawBlock(b);
      for (const h of world.hazards) drawHazard(h);
      drawCheckpoints();
      drawFlag();
      for (const c of world.coins) drawCoin(c);
      for (const e of world.enemies) {
        if (e.kind === "goomba" || e.kind === "jumper") drawGoomba(e);
        else drawFlyer(e);
      }
      drawPlayer();
      drawParticles();
      drawFloatTexts();

      ctx.drawImage(vignette.c, 0, 0);

      ctx.restore();

      // Stage banner (first 90 frames)
      if (time < 90) {
        const alpha = time < 60 ? 1 : (90 - time) / 30;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, canvas.height / 2 - 30, canvas.width, 60);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 26px monospace";
        ctx.textAlign = "center";
        ctx.fillText(stage.name.toUpperCase(), canvas.width / 2, canvas.height / 2 + 10);
        ctx.textAlign = "left";
        ctx.globalAlpha = 1;
      }
    }

    let raf = 0;
    function loop() {
      if (running) update();
      draw();
      raf = requestAnimationFrame(loop);
    }
    loop();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("resize", onResize);
      running = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, stageIdx]);

  const restart = () => {
    setScore(0); setCoinsCount(0); setLives(3); setStageIdx(0);
    setTimeLeft(STAGES[0].timeLimit);
    setStatus("playing"); setResetKey((k) => k + 1);
  };

  const nextStage = () => {
    const nxt = stageIdx + 1;
    setStageIdx(nxt);
    setTimeLeft(STAGES[nxt].timeLimit);
    setStatus("playing");
    setResetKey((k) => k + 1);
  };

  const holdKey = (code: string) => ({
    onTouchStart: (e: React.TouchEvent) => { e.preventDefault(); (window as any).__gameKey?.(code, true); },
    onTouchEnd: (e: React.TouchEvent) => { e.preventDefault(); (window as any).__gameKey?.(code, false); },
    onMouseDown: () => (window as any).__gameKey?.(code, true),
    onMouseUp: () => (window as any).__gameKey?.(code, false),
    onMouseLeave: () => (window as any).__gameKey?.(code, false),
  });

  return (
    <main className="fixed inset-0 w-screen h-screen overflow-hidden bg-black select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full block"
      />

      {/* HUD overlay */}
      <div className="pointer-events-none absolute top-0 left-0 right-0 p-3 md:p-5 flex justify-between items-start z-10">
        <div className="flex flex-col gap-1 text-white font-black text-sm md:text-xl drop-shadow-[2px_2px_0_#000]" style={{ fontFamily: "system-ui, sans-serif" }}>
          <div className="bg-black/40 backdrop-blur-sm rounded-xl px-3 md:px-4 py-1.5 md:py-2 border border-white/20">
            <span className="text-yellow-300">★ {score.toString().padStart(6, "0")}</span>
          </div>
          <div className="flex gap-2 text-xs md:text-base">
            <span className="bg-black/40 backdrop-blur-sm rounded-lg px-2 py-1 border border-white/20 text-yellow-300">◉ ×{coinsCount.toString().padStart(2, "0")}</span>
            <span className="bg-black/40 backdrop-blur-sm rounded-lg px-2 py-1 border border-white/20 text-red-300">♥ ×{lives}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-white font-black text-sm md:text-xl drop-shadow-[2px_2px_0_#000]" style={{ fontFamily: "system-ui, sans-serif" }}>
          <div className={`bg-black/40 backdrop-blur-sm rounded-xl px-3 md:px-4 py-1.5 md:py-2 border border-white/20 ${timeLeft <= 20 ? "text-red-400 animate-pulse" : ""}`}>
            ⏱ {timeLeft.toString().padStart(3, "0")}
          </div>
          <div className="bg-black/40 backdrop-blur-sm rounded-lg px-2 py-1 border border-white/20 text-xs md:text-base text-cyan-300">
            {STAGES[stageIdx].name}
          </div>
        </div>
      </div>

      {/* Desktop hint */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 z-10 hidden md:block text-white/80 font-mono text-xs text-center drop-shadow-[1px_1px_0_#000]">
        ← → mover · SHIFT correr · ESPACIO saltar · ↓ agacharse · Z puño/dive · X ground pound<br />
        doble/triple salto · corriendo+↓+salto = <b>salto largo</b> · quieto+↓+salto = <b>backflip</b> · pared+salto = <b>wall jump</b>
      </div>

      {/* Mobile controls */}
      <div className="absolute bottom-0 left-0 right-0 p-3 flex justify-between items-end z-20 md:hidden pointer-events-none">
        <div className="flex gap-2 pointer-events-auto">
          <button {...holdKey("ArrowLeft")} className="w-14 h-14 bg-white/80 backdrop-blur rounded-full text-2xl font-black shadow-[0_4px_0_rgba(0,0,0,0.5)] active:translate-y-1 active:shadow-none">◀</button>
          <button {...holdKey("ArrowRight")} className="w-14 h-14 bg-white/80 backdrop-blur rounded-full text-2xl font-black shadow-[0_4px_0_rgba(0,0,0,0.5)] active:translate-y-1 active:shadow-none">▶</button>
          <button {...holdKey("ArrowDown")} className="w-14 h-14 bg-white/80 backdrop-blur rounded-full text-xl font-black shadow-[0_4px_0_rgba(0,0,0,0.5)] active:translate-y-1 active:shadow-none">▼</button>
        </div>
        <div className="flex gap-2 items-end pointer-events-auto">
          <button {...holdKey("KeyZ")} className="w-13 h-13 min-w-[52px] min-h-[52px] bg-yellow-400 text-black rounded-full text-xs font-black shadow-[0_4px_0_rgba(0,0,0,0.5)] active:translate-y-1 active:shadow-none">PUÑO</button>
          <button {...holdKey("KeyX")} className="w-13 h-13 min-w-[52px] min-h-[52px] bg-purple-500 text-white rounded-full text-[10px] font-black shadow-[0_4px_0_rgba(0,0,0,0.5)] active:translate-y-1 active:shadow-none leading-tight">POUND</button>
          <button {...holdKey("ShiftLeft")} className="w-13 h-13 min-w-[52px] min-h-[52px] bg-blue-500 text-white rounded-full text-xs font-black shadow-[0_4px_0_rgba(0,0,0,0.5)] active:translate-y-1 active:shadow-none">RUN</button>
          <button {...holdKey("Space")} className="w-18 h-18 min-w-[72px] min-h-[72px] bg-red-500 text-white rounded-full text-base font-black shadow-[0_4px_0_rgba(0,0,0,0.5)] active:translate-y-1 active:shadow-none">JUMP</button>
        </div>
      </div>

      {/* Modals */}
      {status === "stageClear" && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 text-white z-30" style={{ fontFamily: "system-ui, sans-serif" }}>
          <h2 className="text-3xl md:text-5xl font-black drop-shadow-[3px_3px_0_#000] animate-scale-in">¡ETAPA COMPLETADA!</h2>
          <p className="text-lg">Puntuación: {score}</p>
          <button onClick={nextStage} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-md font-bold text-lg shadow-[0_4px_0_#000] active:translate-y-1 active:shadow-[0_0_0_#000] transition">
            SIGUIENTE MUNDO →
          </button>
        </div>
      )}
      {status === "win" && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 text-white z-30" style={{ fontFamily: "system-ui, sans-serif" }}>
          <h2 className="text-4xl md:text-6xl font-black drop-shadow-[3px_3px_0_#000] animate-scale-in text-yellow-300">¡AVENTURA COMPLETA!</h2>
          <p className="text-xl">Puntuación final: {score}</p>
          <p className="text-lg text-yellow-300">Monedas: {coinsCount}</p>
          <button onClick={restart} className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-md font-bold text-lg shadow-[0_4px_0_#000] active:translate-y-1 active:shadow-[0_0_0_#000] transition">
            JUGAR DE NUEVO
          </button>
        </div>
      )}
      {status === "dead" && (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 text-white z-30" style={{ fontFamily: "system-ui, sans-serif" }}>
          <h2 className="text-4xl md:text-6xl font-black drop-shadow-[3px_3px_0_#000] animate-scale-in">GAME OVER</h2>
          <p className="text-xl">Puntuación: {score}</p>
          <button onClick={restart} className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-md font-bold text-lg shadow-[0_4px_0_#000] active:translate-y-1 active:shadow-[0_0_0_#000] transition">
            JUGAR DE NUEVO
          </button>
        </div>
      )}
    </main>
  );
}
