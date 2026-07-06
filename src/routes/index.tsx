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
    timeLimit: 120,
    rows: [
      "................................................................................................",
      "................................................................................................",
      "................................................................................................",
      "................................................................................................",
      "..........CCC...................................................................................",
      "................................................................................................",
      ".......?BB?B.................CCCC..................C.C.C.......................................",
      "................................................................................................",
      ".............................BBBBB..................?B?B?...............CCC....................",
      "................................................................................................",
      "..................C..............................................*****.........................",
      "................................................................................................",
      ".......................Pp......................................................S...............",
      "....G.................PPpp................G............G......................SS......>........",
      "================================================================================================",
      "################################################################################################",
      "################################################################################################",
    ],
  },
  {
    name: "1-2 Cavernas de Cobre",
    theme: "cave",
    timeLimit: 100,
    rows: [
      "################################################################################################",
      "#..............................................................................................#",
      "#..............................................................................................#",
      "#.....CCC......................................................................................#",
      "#..............................................................................................#",
      "#....BBBB..........?B?..............................C.C.C......................................#",
      "#..................................................BBBBB......................................#",
      "#..............................................................................................#",
      "#.........C..............*****................HHH..............................................#",
      "#........................................................*****................C.C.C...........#",
      "#..............*****....G..............G..............................*****...................#",
      "#..............................................................................................#",
      "#............S....S..HHH...........S.......HHH................HHH...........S.....S.......>...#",
      "#..G........SSSS...........G......SSSS..........G............SSSS.........SSSS...SSSS...........#",
      "SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS",
      "################################################################################################",
      "################################################################################################",
    ],
  },
  {
    name: "1-3 Cielo Estrellado",
    theme: "sky",
    timeLimit: 140,
    rows: [
      "................................................................................................",
      "................................................................................................",
      "..........C........K............................................................K...............",
      ".........CCC.....................C.C.C..............K..........................................",
      "..........C.....................*****.........................C.C.C............................",
      "................................................................*****..........................",
      "....*****......................................................................................",
      ".............K...........*****......................*****...........*****......................",
      "................................................................................................",
      "........?BB?...........................C.C.C....K.................................*****........",
      "......===========.............===========......................===========......................",
      "................................................................................................",
      "....K........................*****....................*****....................................",
      "....................===============...........................................===============.>",
      "==============..................................===============................................",
      "................................................................................................",
      "................................................................................................",
    ],
  },
];

const TILE = 32;
type Rect = { x: number; y: number; w: number; h: number };
type Enemy = Rect & {
  vx: number; vy: number; alive: boolean; squashT: number; anim: number;
  kind: "goomba" | "flyer";
  baseY?: number;
};
type Coin = { x: number; y: number; taken: boolean; t: number; pop: number };
type Hazard = Rect & { kind: "spike" | "lava" };
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
        x, y: y + 4, w: 28, h: 28, vx: -0.7, vy: 0, alive: true, squashT: 0, anim: 0, kind: "goomba",
      });
      else if (ch === "K") enemies.push({
        x, y, w: 28, h: 24, vx: 0, vy: 0, alive: true, squashT: 0, anim: 0, kind: "flyer", baseY: y,
      });
      else if (ch === ">" || ch === "F") flag = { x: x + 12, y };
    }
  }
  return { blocks, coins, enemies, hazards, flag, spawn, LEVEL_W, LEVEL_H, stage };
}

function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"playing" | "win" | "dead" | "stageClear">("playing");
  const [score, setScore] = useState(0);
  const [coinsCount, setCoinsCount] = useState(0);
  const [lives, setLives] = useState(3);
  const [stageIdx, setStageIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(STAGES[0].timeLimit);
  const [resetKey, setResetKey] = useState(0);

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
      x: world.spawn.x, y: world.spawn.y, w: 22, h: 30,
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
      player.x = world.spawn.x; player.y = world.spawn.y;
      player.vx = 0; player.vy = 0;
      player.invuln = 120; cameraX = 0;
    }

    function die() {
      if (player.invuln > 0) return;
      localLives -= 1;
      setLives(localLives);
      cameraShake = 12;
      addParticles(player.x + 11, player.y + 15, 24, { color: "#ff3b3b", speed: 6, size: 4, life: 50 });
      addParticles(player.x + 11, player.y + 15, 12, { color: "#ffd94a", speed: 4, size: 3, life: 40 });
      if (localLives <= 0) { setStatus("dead"); running = false; }
      else respawn();
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
              e.alive = false; e.squashT = 30;
              localScore += 100; setScore(localScore);
              floatText(e.x + e.w/2, e.y - 4, "+100", "#ff7676");
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
      const targetY = Math.max(0, Math.min(LEVEL_H - canvas.height, player.y - canvas.height * 0.6));
      cameraY += (targetY - cameraY) * 0.08;
      if (cameraX < 0) cameraX = 0;
      if (cameraX > LEVEL_W - canvas.width) cameraX = LEVEL_W - canvas.width;
      if (cameraShake > 0) cameraShake *= 0.85;

      // Enemies
      for (const e of world.enemies) {
        if (!e.alive) { if (e.squashT > 0) e.squashT--; continue; }
        e.anim += 0.12 + Math.abs(e.vx) * 0.15;

        if (e.kind === "goomba") {
          e.x += e.vx;
          e.vy += 0.5;
          e.y += e.vy;
          for (const b of collideBlocks(e)) {
            if (b.type === "platform" || b.type === "cloud") {
              if (e.vy > 0 && e.y + e.h - e.vy <= b.y + 1) { e.y = b.y - e.h; e.vy = 0; }
              continue;
            }
            if (e.vy > 0) { e.y = b.y - e.h; e.vy = 0; }
            else if (e.vx !== 0) {
              if (e.vx > 0) e.x = b.x - e.w; else e.x = b.x + b.w;
              e.vx *= -1;
            }
          }
          const foot = { x: e.x + (e.vx > 0 ? e.w + 2 : -2), y: e.y + e.h + 2, w: 2, h: 2 };
          if (collideBlocks(foot).length === 0) e.vx *= -1;
        } else if (e.kind === "flyer") {
          // Hovering sine wave, chases horizontally
          const dx = player.x - e.x;
          e.vx += Math.sign(dx) * 0.04;
          e.vx = Math.max(-1.6, Math.min(1.6, e.vx));
          e.x += e.vx;
          e.y = (e.baseY ?? e.y) + Math.sin(time * 0.05 + e.x * 0.01) * 24;
        }

        // Attack / dive hitbox
        const attacking = player.attack > 0;
        if (attacking) {
          const hx = player.x + (player.facing > 0 ? player.w - 4 : -14);
          const hy = player.y + 8;
          const hw = 18, hh = 18;
          if (hx < e.x + e.w && hx + hw > e.x && hy < e.y + e.h && hy + hh > e.y) {
            e.alive = false; e.squashT = 30;
            const reward = e.kind === "flyer" ? 200 : 100;
            localScore += reward; setScore(localScore);
            floatText(e.x + e.w / 2, e.y - 4, `+${reward}`, "#ff7676");
            addParticles(e.x + e.w / 2, e.y + 8, 12, {
              color: "#fff", size: 3, life: 25, speed: 4, gravity: 0.3,
            });
            cameraShake = 4;
            continue;
          }
        }

        if (
          player.x < e.x + e.w && player.x + player.w > e.x &&
          player.y < e.y + e.h && player.y + player.h > e.y
        ) {
          const stompable = e.kind === "goomba" || e.kind === "flyer";
          if (stompable && player.vy > 1 && player.y + player.h - e.y < 20) {
            e.alive = false; e.squashT = 30;
            player.vy = jump ? -11 : -8.5; // higher bounce with jump held
            player.squash = 0.7; player.stretch = 1.3;
            const reward = e.kind === "flyer" ? 200 : 100;
            localScore += reward; setScore(localScore);
            floatText(e.x + e.w / 2, e.y - 4, `+${reward}`, "#ff7676");
            addParticles(e.x + e.w / 2, e.y + 8, 10, {
              color: e.kind === "flyer" ? "#c8ccd4" : "#8b4513",
              size: 3, life: 25, speed: 3, gravity: 0.3,
            });
            cameraShake = 3;
          } else die();
        }
      }

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

      ctx.save();
      ctx.translate(px + player.w / 2, py + player.h);

      // Ground-pound spin
      let rot = 0;
      if (player.groundPound === 1) rot = (time * 0.6) % (Math.PI * 2);
      if (player.diving) rot = f * 0.9;
      ctx.rotate(rot);

      // Squash/stretch — crouch = flatter
      const sq = player.crouching ? player.squash * 1.4 : player.squash;
      const st = player.crouching ? player.stretch * 1.15 : player.stretch;
      ctx.scale(f * st, sq);
      ctx.translate(-player.w / 2, -player.h);

      const walking = player.onGround && Math.abs(player.vx) > 0.3;
      const walkFrame = Math.floor(player.anim) % 4;
      const airborne = !player.onGround;
      const crouched = player.crouching;
      const attacking = player.attack > 0;
      const wallSliding = player.wallSlide > 0 && !player.onGround;

      // ---- CAP (red with white M badge) ----
      // Brim
      ctx.fillStyle = "#a51818";
      ctx.fillRect(0, 4, 22, 2);
      // Cap body
      ctx.fillStyle = "#e83030";
      ctx.fillRect(2, -1, 18, 5);
      ctx.fillRect(6, -4, 12, 4);
      // Highlight
      ctx.fillStyle = "#ff5c5c";
      ctx.fillRect(6, -3, 2, 2);
      // M badge
      ctx.fillStyle = "#fff";
      ctx.beginPath(); ctx.arc(11, 1, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#e83030";
      ctx.font = "bold 5px monospace";
      ctx.fillText("M", 9, 3);

      // ---- FACE ----
      // Sideburns/hair
      ctx.fillStyle = "#2a1408";
      ctx.fillRect(1, 6, 3, 5); ctx.fillRect(17, 6, 4, 5);
      // Face skin
      ctx.fillStyle = "#ffcf9a";
      ctx.fillRect(4, 6, 14, 9);
      ctx.fillRect(2, 9, 2, 3); // left cheek
      // Ear
      ctx.fillStyle = "#e8a878";
      ctx.fillRect(18, 9, 2, 3);
      // Nose (big!)
      ctx.fillStyle = "#e8a878";
      ctx.fillRect(13, 8, 5, 4);
      ctx.fillStyle = "#c47a4a"; ctx.fillRect(13, 11, 5, 1);
      // Eye
      ctx.fillStyle = "#fff"; ctx.fillRect(10, 7, 3, 4);
      ctx.fillStyle = "#1a3a8a"; ctx.fillRect(11, 8, 2, 3);
      ctx.fillStyle = "#000"; ctx.fillRect(11, 9, 2, 2);
      // Eyebrow
      ctx.fillStyle = "#2a1408"; ctx.fillRect(10, 6, 4, 1);
      // ---- BIG MUSTACHE ----
      ctx.fillStyle = "#2a1408";
      ctx.fillRect(6, 12, 13, 3);
      ctx.fillRect(4, 13, 2, 2);
      ctx.fillRect(18, 13, 2, 2);
      // Mouth
      ctx.fillStyle = "#5a2a1a"; ctx.fillRect(10, 15, 4, 1);

      // ---- BODY / OVERALLS ----
      // Blue overalls
      ctx.fillStyle = "#1e5fd8"; ctx.fillRect(2, 15, 18, 10);
      ctx.fillRect(4, 14, 4, 3); ctx.fillRect(14, 14, 4, 3);
      // Red shirt (sleeves + collar)
      ctx.fillStyle = "#e83030";
      ctx.fillRect(0, 15, 3, 7); ctx.fillRect(19, 15, 3, 7);
      ctx.fillRect(8, 14, 6, 3);
      // Yellow buttons
      ctx.fillStyle = "#ffd94a";
      ctx.beginPath(); ctx.arc(6, 18, 1.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(16, 18, 1.4, 0, Math.PI * 2); ctx.fill();
      // Overall strap highlight
      ctx.fillStyle = "#3a7ef0";
      ctx.fillRect(2, 15, 18, 1);

      // ---- ARMS ----
      ctx.fillStyle = "#e83030";
      if (attacking) {
        // Punch forward
        ctx.fillRect(18, 14, 8, 4);
        ctx.fillStyle = "#fff"; ctx.fillRect(24, 13, 5, 6);
        ctx.fillStyle = "#e83030"; ctx.fillRect(-1, 16, 4, 6);
      } else if (crouched) {
        ctx.fillRect(-1, 17, 4, 5); ctx.fillRect(19, 17, 4, 5);
      } else if (wallSliding) {
        ctx.fillRect(18, 12, 5, 6); ctx.fillRect(-1, 18, 4, 5);
      } else if (walking) {
        const armSwing = walkFrame % 2 === 0 ? 0 : 2;
        ctx.fillRect(-1, 15 + armSwing, 4, 7);
        ctx.fillRect(19, 15 - armSwing, 4, 7);
      } else if (airborne) {
        ctx.fillRect(-2, 11, 4, 7); ctx.fillRect(20, 11, 4, 7);
      } else {
        ctx.fillRect(-1, 16, 4, 7); ctx.fillRect(19, 16, 4, 7);
      }

      // Gloves (white)
      ctx.fillStyle = "#fff";
      if (attacking) {
        // already drew forward glove
        ctx.fillRect(-2, 20, 5, 4);
      } else if (crouched) {
        ctx.fillRect(-2, 20, 5, 4); ctx.fillRect(19, 20, 5, 4);
      } else if (airborne) {
        ctx.fillRect(-3, 17, 5, 4); ctx.fillRect(20, 17, 5, 4);
      } else {
        ctx.fillRect(-2, 21, 5, 4); ctx.fillRect(19, 21, 5, 4);
      }

      // ---- FEET / SHOES ----
      ctx.fillStyle = "#5a2a08";
      if (crouched) {
        ctx.fillRect(2, 26, 18, 4);
        ctx.fillStyle = "#2a1408"; ctx.fillRect(1, 28, 20, 2);
      } else if (airborne) {
        ctx.fillRect(3, 24, 8, 6); ctx.fillRect(11, 24, 8, 6);
        ctx.fillStyle = "#2a1408"; ctx.fillRect(2, 27, 10, 3); ctx.fillRect(10, 27, 10, 3);
      } else if (walking) {
        const back = walkFrame === 0 || walkFrame === 2 ? 0 : 2;
        const front = walkFrame === 0 || walkFrame === 2 ? 2 : 0;
        ctx.fillRect(3, 24 - back, 8, 6); ctx.fillRect(11, 24 - front, 8, 6);
        ctx.fillStyle = "#2a1408";
        ctx.fillRect(2, 27 - back, 10, 3); ctx.fillRect(10, 27 - front, 10, 3);
      } else {
        ctx.fillRect(3, 24, 8, 6); ctx.fillRect(11, 24, 8, 6);
        ctx.fillStyle = "#2a1408"; ctx.fillRect(2, 27, 10, 3); ctx.fillRect(10, 27, 10, 3);
      }

      ctx.restore();

      // Attack sfx swipe
      if (player.attack > 6) {
        ctx.strokeStyle = `rgba(255,255,255,${player.attack / 14})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px + player.w / 2 + f * 14, py + 16, 10, -0.6, 0.6);
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
      const x = Math.round(e.x - cameraX);
      const y = Math.round(e.y - cameraY);
      if (!e.alive) {
        if (e.squashT > 0) {
          ctx.fillStyle = "#5a2f14"; ctx.fillRect(x, y + e.h - 6, e.w, 6);
          ctx.fillStyle = "#8b4513"; ctx.fillRect(x + 4, y + e.h - 12, e.w - 8, 6);
        }
        return;
      }
      const bounce = Math.sin(e.anim) * 1.2;
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(x + e.w / 2, y + e.h + 2, e.w * 0.5, 3, 0, 0, Math.PI * 2);
      ctx.fill();

      const capGrad = ctx.createRadialGradient(x + e.w / 2, y + 6 - bounce, 3, x + e.w / 2, y + 12 - bounce, 18);
      capGrad.addColorStop(0, "#c96a2a"); capGrad.addColorStop(1, "#5a2a08");
      ctx.fillStyle = capGrad;
      ctx.beginPath(); ctx.arc(x + e.w / 2, y + 12 - bounce, 14, Math.PI, 0); ctx.fill();
      ctx.fillRect(x, y + 12 - bounce, e.w, 10);
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

      const step = Math.floor(e.anim) % 2;
      ctx.fillStyle = "#2a1408";
      ctx.fillRect(x + 2, y + 22 + (step ? 0 : 1), 8, 6);
      ctx.fillRect(x + 18, y + 22 + (step ? 1 : 0), 8, 6);
    }

    function drawFlyer(e: Enemy) {
      const x = Math.round(e.x - cameraX);
      const y = Math.round(e.y - cameraY);
      if (!e.alive) {
        if (e.squashT > 0) {
          ctx.fillStyle = "#5c6270"; ctx.fillRect(x + 4, y + e.h - 6, e.w - 8, 6);
        }
        return;
      }
      const flap = Math.sin(e.anim * 2) * 6;
      // Body
      const g = ctx.createRadialGradient(x + e.w / 2, y + 12, 4, x + e.w / 2, y + 12, 14);
      g.addColorStop(0, "#e05c8a"); g.addColorStop(1, "#8b2a4a");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x + e.w / 2, y + 12, 12, 10, 0, 0, Math.PI * 2); ctx.fill();
      // Wings
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.moveTo(x + 4, y + 8);
      ctx.lineTo(x - 6, y + 8 - flap);
      ctx.lineTo(x + 4, y + 14);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + e.w - 4, y + 8);
      ctx.lineTo(x + e.w + 6, y + 8 - flap);
      ctx.lineTo(x + e.w - 4, y + 14);
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
      ctx.moveTo(x + e.w / 2 - 2, y + 16);
      ctx.lineTo(x + e.w / 2 + 2, y + 16);
      ctx.lineTo(x + e.w / 2, y + 20);
      ctx.closePath(); ctx.fill();
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

    function drawFlag() {
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
      drawFlag();
      for (const c of world.coins) drawCoin(c);
      for (const e of world.enemies) {
        if (e.kind === "goomba") drawGoomba(e);
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
    <main className="min-h-screen w-full bg-gradient-to-b from-indigo-900 via-sky-700 to-sky-400 flex flex-col items-center justify-center p-3 gap-3 select-none">
      <h1 className="text-2xl md:text-4xl font-black text-white drop-shadow-[3px_3px_0_#000] tracking-tight font-mono">
        SUPER PLUMBER ADVENTURE
      </h1>

      <div className="flex flex-wrap justify-center gap-3 md:gap-5 text-white font-mono font-bold text-xs md:text-base drop-shadow-[2px_2px_0_#000]">
        <span>SCORE {score.toString().padStart(6, "0")}</span>
        <span className="text-yellow-300">◉ x{coinsCount.toString().padStart(2, "0")}</span>
        <span className="text-red-300">♥ x{lives}</span>
        <span className={timeLeft <= 20 ? "text-red-400 animate-pulse" : ""}>⏱ {timeLeft.toString().padStart(3, "0")}</span>
        <span className="text-cyan-300">WORLD {STAGES[stageIdx].name.split(" ")[0]}</span>
      </div>

      <div className="relative rounded-lg overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.6)] ring-4 ring-yellow-400 bg-sky-400 max-w-full">
        <canvas
          ref={canvasRef}
          width={800}
          height={520}
          className="block w-full h-auto"
          style={{ imageRendering: "pixelated", maxWidth: "min(100vw - 24px, 800px)" }}
        />
        {status === "stageClear" && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 text-white font-mono">
            <h2 className="text-3xl md:text-5xl font-black drop-shadow-[3px_3px_0_#000] animate-scale-in">¡ETAPA COMPLETADA!</h2>
            <p className="text-lg">Puntuación: {score}</p>
            <button onClick={nextStage} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-md font-bold text-lg shadow-[0_4px_0_#000] active:translate-y-1 active:shadow-[0_0_0_#000] transition">
              SIGUIENTE MUNDO →
            </button>
          </div>
        )}
        {status === "win" && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 text-white font-mono">
            <h2 className="text-4xl md:text-6xl font-black drop-shadow-[3px_3px_0_#000] animate-scale-in text-yellow-300">¡AVENTURA COMPLETA!</h2>
            <p className="text-xl">Puntuación final: {score}</p>
            <p className="text-lg text-yellow-300">Monedas: {coinsCount}</p>
            <button onClick={restart} className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-md font-bold text-lg shadow-[0_4px_0_#000] active:translate-y-1 active:shadow-[0_0_0_#000] transition">
              JUGAR DE NUEVO
            </button>
          </div>
        )}
        {status === "dead" && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 text-white font-mono">
            <h2 className="text-4xl md:text-6xl font-black drop-shadow-[3px_3px_0_#000] animate-scale-in">GAME OVER</h2>
            <p className="text-xl">Puntuación: {score}</p>
            <button onClick={restart} className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-md font-bold text-lg shadow-[0_4px_0_#000] active:translate-y-1 active:shadow-[0_0_0_#000] transition">
              JUGAR DE NUEVO
            </button>
          </div>
        )}
      </div>

      <div className="flex justify-between items-end w-full max-w-[800px] gap-2 md:hidden">
        <div className="flex gap-2">
          <button {...holdKey("ArrowLeft")} className="w-14 h-14 bg-white/90 rounded-full text-2xl font-black shadow-[0_4px_0_#000] active:translate-y-1">◀</button>
          <button {...holdKey("ArrowRight")} className="w-14 h-14 bg-white/90 rounded-full text-2xl font-black shadow-[0_4px_0_#000] active:translate-y-1">▶</button>
          <button {...holdKey("ArrowDown")} className="w-14 h-14 bg-white/90 rounded-full text-xl font-black shadow-[0_4px_0_#000] active:translate-y-1">▼</button>
        </div>
        <div className="flex gap-2 items-end">
          <button {...holdKey("KeyZ")} className="w-14 h-14 bg-yellow-400 text-black rounded-full text-sm font-black shadow-[0_4px_0_#000] active:translate-y-1">PUÑO</button>
          <button {...holdKey("KeyX")} className="w-14 h-14 bg-purple-500 text-white rounded-full text-[10px] font-black shadow-[0_4px_0_#000] active:translate-y-1 leading-tight">POUND</button>
          <button {...holdKey("ShiftLeft")} className="w-14 h-14 bg-blue-500 text-white rounded-full text-xs font-black shadow-[0_4px_0_#000] active:translate-y-1">RUN</button>
          <button {...holdKey("Space")} className="w-18 h-18 min-w-[68px] min-h-[68px] bg-red-500 text-white rounded-full text-base font-black shadow-[0_4px_0_#000] active:translate-y-1">SALTAR</button>
        </div>
      </div>

      <p className="text-white/90 text-[11px] md:text-sm font-mono text-center drop-shadow-[1px_1px_0_#000] max-w-[800px]">
        ← → moverse · SHIFT correr · ESPACIO saltar · ↓ agacharse · Z puño/dive · X ground pound<br />
        Combos: doble/triple salto · corriendo+↓+salto = <b>salto largo</b> · quieto+↓+salto = <b>backflip</b> · pared+salto = <b>wall jump</b>
      </p>
    </main>
  );
}
