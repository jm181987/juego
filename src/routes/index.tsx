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
    ctx.imageSmoothingEnabled = false;

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
    const stars: { x: number; y: number; s: number; tw: number }[] = [];
    if (stage.theme === "sky") {
      for (let i = 0; i < 120; i++) {
        stars.push({
          x: Math.random() * LEVEL_W,
          y: Math.random() * canvas.height * 0.7,
          s: Math.random() * 2 + 0.5,
          tw: Math.random() * Math.PI * 2,
        });
      }
    }

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

    (function buildTileSprites() {
      // ground
      {
        const { c, cx } = makeCanvas(S, S);
        const g = cx.createLinearGradient(0, 0, 0, S);
        g.addColorStop(0, "#a0522d"); g.addColorStop(1, "#5c2f0d");
        cx.fillStyle = g; cx.fillRect(0, 0, S, S);
        cx.fillStyle = "#6b3410";
        cx.fillRect(4, 6, 4, 4); cx.fillRect(20, 14, 4, 4); cx.fillRect(12, 22, 4, 4);
        cx.fillStyle = "rgba(0,0,0,0.35)"; cx.fillRect(0, S - 3, S, 3);
        cx.fillStyle = "rgba(255,255,255,0.15)"; cx.fillRect(0, 0, S, 2);
        sprites.ground = c;
      }
      // grass
      {
        const { c, cx } = makeCanvas(S, S);
        const g = cx.createLinearGradient(0, 0, 0, S);
        g.addColorStop(0, "#a0522d"); g.addColorStop(1, "#6b3410");
        cx.fillStyle = g; cx.fillRect(0, 0, S, S);
        const gg = cx.createLinearGradient(0, 0, 0, 12);
        gg.addColorStop(0, "#5cd464"); gg.addColorStop(1, "#2ea63a");
        cx.fillStyle = gg; cx.fillRect(0, 0, S, 12);
        cx.fillStyle = "#7ee085";
        cx.fillRect(3, 0, 2, 2); cx.fillRect(11, 0, 2, 2); cx.fillRect(22, 0, 2, 2);
        sprites.grass = c;
      }
      // brick
      {
        const { c, cx } = makeCanvas(S, S);
        const g = cx.createLinearGradient(0, 0, 0, S);
        g.addColorStop(0, "#e05a2a"); g.addColorStop(1, "#8b3110");
        cx.fillStyle = g; cx.fillRect(0, 0, S, S);
        cx.strokeStyle = "#2a0e04"; cx.lineWidth = 2;
        cx.beginPath();
        cx.moveTo(0, 16); cx.lineTo(S, 16);
        cx.moveTo(16, 0); cx.lineTo(16, 16);
        cx.moveTo(8, 16); cx.lineTo(8, S);
        cx.moveTo(24, 16); cx.lineTo(24, S);
        cx.stroke();
        cx.strokeRect(1, 1, S - 2, S - 2);
        cx.fillStyle = "rgba(255,255,255,0.2)"; cx.fillRect(2, 2, S - 4, 1);
        sprites.brick = c;
      }
      // question (unused, static; pulse drawn on top)
      {
        const { c, cx } = makeCanvas(S, S);
        const g = cx.createLinearGradient(0, 0, 0, S);
        g.addColorStop(0, "#ffcf3f"); g.addColorStop(1, "#c86e00");
        cx.fillStyle = g; cx.fillRect(0, 0, S, S);
        cx.fillStyle = "#7a4600";
        cx.fillRect(0, 0, S, 3); cx.fillRect(0, S - 3, S, 3);
        cx.fillRect(0, 0, 3, S); cx.fillRect(S - 3, 0, 3, S);
        cx.fillStyle = "#ffe680";
        cx.fillRect(3, 3, 3, 3); cx.fillRect(S - 6, 3, 3, 3);
        cx.fillRect(3, S - 6, 3, 3); cx.fillRect(S - 6, S - 6, 3, 3);
        cx.fillStyle = "rgba(0,0,0,0.4)"; cx.font = "bold 20px monospace";
        cx.fillText("?", 11, 24);
        cx.fillStyle = "#fff"; cx.fillText("?", 10, 23);
        sprites.question = c;
      }
      // question used
      {
        const { c, cx } = makeCanvas(S, S);
        const g = cx.createLinearGradient(0, 0, 0, S);
        g.addColorStop(0, "#8b5a2b"); g.addColorStop(1, "#4a2f14");
        cx.fillStyle = g; cx.fillRect(0, 0, S, S);
        cx.strokeStyle = "#2a1808"; cx.lineWidth = 2;
        cx.strokeRect(1, 1, S - 2, S - 2);
        sprites.questionUsed = c;
      }
      // pipe body
      {
        const { c, cx } = makeCanvas(S, S);
        const g = cx.createLinearGradient(0, 0, S, 0);
        g.addColorStop(0, "#0f5a19"); g.addColorStop(0.15, "#7ee085");
        g.addColorStop(0.5, "#3ec54a"); g.addColorStop(0.85, "#1a6b22"); g.addColorStop(1, "#0a3d10");
        cx.fillStyle = g; cx.fillRect(0, 0, S, S);
        sprites.pipe = c;
      }
      // pipe top (rim overlay, wider)
      {
        const rimW = S + 4;
        const { c, cx } = makeCanvas(rimW, 8);
        cx.fillStyle = "#1a6b22"; cx.fillRect(0, 0, rimW, 8);
        const rg = cx.createLinearGradient(0, 0, rimW, 0);
        rg.addColorStop(0, "#0f5a19"); rg.addColorStop(0.2, "#8ff090");
        rg.addColorStop(0.5, "#4ad058"); rg.addColorStop(0.8, "#1a6b22"); rg.addColorStop(1, "#0a3d10");
        cx.fillStyle = rg; cx.fillRect(0, 2, rimW, 4);
        cx.fillStyle = "rgba(255,255,255,0.3)"; cx.fillRect(4, 4, 8, 1);
        sprites.pipeTop = c;
      }
      // stone (theme-aware)
      {
        const { c, cx } = makeCanvas(S, S);
        const g = cx.createLinearGradient(0, 0, 0, S);
        if (stage.theme === "cave") {
          g.addColorStop(0, "#b56a3a"); g.addColorStop(1, "#5a2810");
        } else {
          g.addColorStop(0, "#c8ccd4"); g.addColorStop(1, "#5c6270");
        }
        cx.fillStyle = g; cx.fillRect(0, 0, S, S);
        cx.fillStyle = "rgba(0,0,0,0.25)";
        cx.fillRect(6, 8, 4, 2); cx.fillRect(18, 18, 4, 2);
        cx.fillStyle = "rgba(255,255,255,0.2)"; cx.fillRect(0, 0, S, 2);
        sprites.stone = c;
      }
      // platform (14px tall)
      {
        const { c, cx } = makeCanvas(S, 14);
        const g = cx.createLinearGradient(0, 0, 0, 14);
        g.addColorStop(0, "#c07500"); g.addColorStop(1, "#7a4600");
        cx.fillStyle = g; cx.fillRect(0, 0, S, 14);
        cx.fillStyle = "rgba(255,255,255,0.35)"; cx.fillRect(0, 0, S, 2);
        cx.fillStyle = "rgba(0,0,0,0.35)"; cx.fillRect(0, 12, S, 2);
        sprites.platform = c;
      }
      // cloud platform
      {
        const { c, cx } = makeCanvas(S, 14);
        cx.fillStyle = "rgba(255,255,255,0.9)";
        cx.beginPath();
        cx.arc(6, 8, 8, 0, Math.PI * 2);
        cx.arc(16, 5, 10, 0, Math.PI * 2);
        cx.arc(26, 8, 8, 0, Math.PI * 2);
        cx.fill();
        cx.fillStyle = "#ffffff"; cx.fillRect(0, 4, S, 8);
        cx.fillStyle = "rgba(180,200,240,0.5)"; cx.fillRect(0, 10, S, 2);
        sprites.cloud = c;
      }
    })();

    // Pre-render static background (sky gradient + sun/moon + stars + far mountains)
    // Wide strip so parallax can scroll; we tile horizontally.
    const BG_W = canvas.width * 2;
    const bgFar = makeCanvas(BG_W, canvas.height);
    const bgMid = makeCanvas(BG_W, canvas.height);
    (function buildBackgrounds() {
      const { cx } = bgFar;
      if (stage.theme === "grass") {
        const g = cx.createLinearGradient(0, 0, 0, canvas.height);
        g.addColorStop(0, "#4a86f7"); g.addColorStop(0.6, "#7cb4ff"); g.addColorStop(1, "#c5e2ff");
        cx.fillStyle = g; cx.fillRect(0, 0, BG_W, canvas.height);
        // Sun
        const sunX = canvas.width - 90, sunY = 80;
        const sg = cx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 80);
        sg.addColorStop(0, "rgba(255,240,180,1)");
        sg.addColorStop(0.4, "rgba(255,220,140,0.5)");
        sg.addColorStop(1, "rgba(255,220,140,0)");
        cx.fillStyle = sg; cx.fillRect(sunX - 90, sunY - 90, 180, 180);
        cx.fillStyle = "#fff5c8";
        cx.beginPath(); cx.arc(sunX, sunY, 26, 0, Math.PI * 2); cx.fill();
      } else if (stage.theme === "cave") {
        const g = cx.createLinearGradient(0, 0, 0, canvas.height);
        g.addColorStop(0, "#1a0f22"); g.addColorStop(0.6, "#3a1a10"); g.addColorStop(1, "#5a2010");
        cx.fillStyle = g; cx.fillRect(0, 0, BG_W, canvas.height);
        // Stalactites
        cx.fillStyle = "#2a1a12";
        for (let i = 0; i < 40; i++) {
          const sx = i * 90 + ((i * 7) % 30);
          const h = 24 + ((i * 17) % 30);
          cx.beginPath();
          cx.moveTo(sx, 32); cx.lineTo(sx + 12, 32); cx.lineTo(sx + 6, 32 + h);
          cx.closePath(); cx.fill();
        }
      } else {
        const g = cx.createLinearGradient(0, 0, 0, canvas.height);
        g.addColorStop(0, "#0a0a2e"); g.addColorStop(0.5, "#1a1a5a"); g.addColorStop(1, "#3a1a5a");
        cx.fillStyle = g; cx.fillRect(0, 0, BG_W, canvas.height);
        // Stars baked in
        for (const st of stars) {
          cx.fillStyle = "rgba(255,255,255,0.9)";
          cx.fillRect(st.x % BG_W, st.y, st.s, st.s);
        }
        // Moon
        const mx = canvas.width - 100, my = 90;
        cx.fillStyle = "rgba(255,240,200,0.2)";
        cx.beginPath(); cx.arc(mx, my, 60, 0, Math.PI * 2); cx.fill();
        cx.fillStyle = "#f8f4d0";
        cx.beginPath(); cx.arc(mx, my, 32, 0, Math.PI * 2); cx.fill();
        cx.fillStyle = "#d8d0a8";
        cx.beginPath(); cx.arc(mx - 8, my - 4, 4, 0, Math.PI * 2); cx.fill();
        cx.beginPath(); cx.arc(mx + 10, my + 6, 6, 0, Math.PI * 2); cx.fill();
      }

      // Mid layer (mountains / hills / distant rocks / cloud islands)
      const { cx: mx } = bgMid;
      mx.clearRect(0, 0, BG_W, canvas.height);
      if (stage.theme === "grass") {
        mx.fillStyle = "#6b8fbf";
        for (let i = 0; i < 8; i++) {
          const px = i * 320;
          mx.beginPath();
          mx.moveTo(px - 20, canvas.height - 100);
          mx.lineTo(px + 120, canvas.height - 240);
          mx.lineTo(px + 260, canvas.height - 100);
          mx.closePath(); mx.fill();
        }
        for (let i = 0; i < 8; i++) {
          const hx = i * 260;
          const grad = mx.createLinearGradient(0, canvas.height - 160, 0, canvas.height);
          grad.addColorStop(0, "#4aa64a"); grad.addColorStop(1, "#2f7a2f");
          mx.fillStyle = grad;
          mx.beginPath(); mx.arc(hx, canvas.height - 90, 100, Math.PI, 0); mx.fill();
        }
      } else if (stage.theme === "cave") {
        mx.fillStyle = "#2a1810";
        for (let i = 0; i < 6; i++) {
          const rx = i * 260;
          mx.beginPath();
          mx.moveTo(rx, canvas.height - 60);
          mx.lineTo(rx + 80, canvas.height - 180);
          mx.lineTo(rx + 160, canvas.height - 60);
          mx.closePath(); mx.fill();
        }
      } else {
        for (let i = 0; i < 8; i++) {
          const cx2 = i * 260;
          const cy = 260 + ((i * 41) % 80);
          mx.fillStyle = "rgba(120,100,180,0.5)";
          mx.beginPath();
          mx.ellipse(cx2, cy, 90, 20, 0, 0, Math.PI * 2);
          mx.fill();
        }
      }
    })();

    // Vignette cached
    const vignette = makeCanvas(canvas.width, canvas.height);
    {
      const { cx } = vignette;
      const vg = cx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.height * 0.4,
        canvas.width / 2, canvas.height / 2, canvas.height * 0.85
      );
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, stage.theme === "cave" ? "rgba(0,0,0,0.6)" : "rgba(0,0,0,0.35)");
      cx.fillStyle = vg; cx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const player = {
      x: world.spawn.x, y: world.spawn.y, w: 22, h: 30,
      vx: 0, vy: 0, onGround: false, facing: 1, anim: 0, invuln: 0,
      squash: 1, stretch: 1, coyote: 0, jumpBuffer: 0, landPulse: 0,
    };

    const kd = (e: KeyboardEvent) => {
      keys[e.code] = true;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(e.code)) e.preventDefault();
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
      const jump = keys["ArrowUp"] || keys["Space"] || keys["KeyW"];
      const run = keys["ShiftLeft"] || keys["ShiftRight"];

      const maxSpeed = run ? 5.5 : 4;
      const accel = player.onGround ? 0.55 : 0.35;
      const friction = player.onGround ? 0.82 : 0.94;

      if (left) { player.vx = Math.max(player.vx - accel, -maxSpeed); player.facing = -1; }
      else if (right) { player.vx = Math.min(player.vx + accel, maxSpeed); player.facing = 1; }
      else { player.vx *= friction; if (Math.abs(player.vx) < 0.05) player.vx = 0; }

      if (player.onGround) player.coyote = 8; else if (player.coyote > 0) player.coyote--;
      if (jump) player.jumpBuffer = 8; else if (player.jumpBuffer > 0) player.jumpBuffer--;

      if (player.jumpBuffer > 0 && player.coyote > 0) {
        player.vy = -11.5;
        player.coyote = 0; player.jumpBuffer = 0; player.onGround = false;
        player.squash = 0.7; player.stretch = 1.3;
        addParticles(player.x + 11, player.y + player.h, 6, {
          color: "#e0d7c0", size: 3, life: 20, spread: Math.PI, speed: 2, gravity: 0.15,
        });
      }
      if (!jump && player.vy < -4) player.vy = -4;

      // Sky theme = lower gravity, higher jumps feel floaty
      const grav = stage.theme === "sky" ? 0.42 : 0.55;
      player.vy += grav;
      if (player.vy > 13) player.vy = 13;

      // X move
      player.x += player.vx;
      if (player.x < 0) { player.x = 0; player.vx = 0; }
      if (player.x + player.w > LEVEL_W) player.x = LEVEL_W - player.w;
      for (const b of collideBlocks(player)) {
        // Platforms are one-way (no side collision)
        if (b.type === "platform" || b.type === "cloud") continue;
        if (player.vx > 0) player.x = b.x - player.w;
        else if (player.vx < 0) player.x = b.x + b.w;
        player.vx = 0;
      }
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
        // Platform: only land from above
        if (b.type === "platform" || b.type === "cloud") {
          const prevBottom = player.y - player.vy + player.h;
          if (player.vy > 0 && prevBottom <= b.y + 1) {
            player.y = b.y - player.h; player.vy = 0; player.onGround = true;
          }
          continue;
        }
        if (player.vy > 0) { player.y = b.y - player.h; player.vy = 0; player.onGround = true; }
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
        player.squash = 1.3; player.stretch = 0.75; player.landPulse = 8;
        addParticles(player.x + 11, player.y + player.h - 2, 4, {
          color: "#e0d7c0", size: 3, life: 18, spread: Math.PI, speed: 1.5, gravity: 0.15,
        });
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

        if (
          player.x < e.x + e.w && player.x + player.w > e.x &&
          player.y < e.y + e.h && player.y + player.h > e.y
        ) {
          const stompable = e.kind === "goomba" || e.kind === "flyer";
          if (stompable && player.vy > 1 && player.y + player.h - e.y < 20) {
            e.alive = false; e.squashT = 30;
            player.vy = -8.5;
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

      ctx.fillStyle = "rgba(0,0,0,0.28)";
      ctx.beginPath();
      ctx.ellipse(px + player.w / 2, py + player.h + 1, player.w * 0.55, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.translate(px + player.w / 2, py + player.h);
      ctx.scale(f * player.stretch, player.squash);
      ctx.translate(-player.w / 2, -player.h);

      const walking = player.onGround && Math.abs(player.vx) > 0.3;
      const walkFrame = Math.floor(player.anim) % 4;
      const airborne = !player.onGround;

      ctx.fillStyle = "#d32626";
      ctx.fillRect(2, 0, 18, 5);
      ctx.fillRect(10, -3, 12, 5);
      ctx.fillStyle = "#fff"; ctx.fillRect(12, 1, 6, 3);
      ctx.fillStyle = "#a51a1a"; ctx.fillRect(12, 0, 6, 1);

      ctx.fillStyle = "#3a1e0a";
      ctx.fillRect(2, 5, 3, 3); ctx.fillRect(17, 5, 3, 3);
      ctx.fillStyle = "#ffcf9a"; ctx.fillRect(4, 5, 14, 9); ctx.fillRect(1, 8, 3, 4);

      ctx.fillStyle = "#fff"; ctx.fillRect(12, 6, 4, 5);
      ctx.fillStyle = "#1a3a8a"; ctx.fillRect(13, 7, 2, 3);
      ctx.fillStyle = "#000"; ctx.fillRect(13, 8, 2, 2);

      ctx.fillStyle = "#2a1408"; ctx.fillRect(6, 11, 12, 3); ctx.fillRect(4, 12, 2, 2);
      ctx.fillStyle = "#e5a97a"; ctx.fillRect(15, 9, 3, 3);

      ctx.fillStyle = "#1e5fd8"; ctx.fillRect(2, 14, 18, 10);
      ctx.fillRect(5, 13, 3, 3); ctx.fillRect(13, 13, 3, 3);
      ctx.fillStyle = "#d32626";
      ctx.fillRect(0, 14, 3, 7); ctx.fillRect(19, 14, 3, 7); ctx.fillRect(8, 13, 5, 3);
      ctx.fillStyle = "#ffd94a"; ctx.fillRect(6, 17, 2, 2); ctx.fillRect(14, 17, 2, 2);

      ctx.fillStyle = "#d32626";
      if (walking) {
        const armSwing = walkFrame % 2 === 0 ? 0 : 2;
        ctx.fillRect(-1, 15 + armSwing, 4, 7);
        ctx.fillRect(19, 15 - armSwing, 4, 7);
      } else if (airborne) {
        ctx.fillRect(-2, 12, 4, 8); ctx.fillRect(20, 12, 4, 8);
      } else {
        ctx.fillRect(-1, 16, 4, 7); ctx.fillRect(19, 16, 4, 7);
      }
      ctx.fillStyle = "#fff";
      if (airborne) { ctx.fillRect(-3, 19, 5, 4); ctx.fillRect(20, 19, 5, 4); }
      else { ctx.fillRect(-2, 21, 5, 4); ctx.fillRect(19, 21, 5, 4); }

      ctx.fillStyle = "#5a2a08";
      if (airborne) {
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

      if (player.landPulse > 0) {
        ctx.strokeStyle = `rgba(255,255,255,${(player.landPulse / 8) * 0.6})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(px + player.w / 2, py + player.h, (8 - player.landPulse) * 3, 3, 0, 0, Math.PI * 2);
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
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-4 text-white font-mono">
            <h2 className="text-3xl md:text-5xl font-black drop-shadow-[3px_3px_0_#000] animate-scale-in">¡ETAPA COMPLETADA!</h2>
            <p className="text-lg">Puntuación: {score}</p>
            <button onClick={nextStage} className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-md font-bold text-lg shadow-[0_4px_0_#000] active:translate-y-1 active:shadow-[0_0_0_#000] transition">
              SIGUIENTE MUNDO →
            </button>
          </div>
        )}
        {status === "win" && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-4 text-white font-mono">
            <h2 className="text-4xl md:text-6xl font-black drop-shadow-[3px_3px_0_#000] animate-scale-in text-yellow-300">¡AVENTURA COMPLETA!</h2>
            <p className="text-xl">Puntuación final: {score}</p>
            <p className="text-lg text-yellow-300">Monedas: {coinsCount}</p>
            <button onClick={restart} className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-md font-bold text-lg shadow-[0_4px_0_#000] active:translate-y-1 active:shadow-[0_0_0_#000] transition">
              JUGAR DE NUEVO
            </button>
          </div>
        )}
        {status === "dead" && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-4 text-white font-mono">
            <h2 className="text-4xl md:text-6xl font-black drop-shadow-[3px_3px_0_#000] animate-scale-in">GAME OVER</h2>
            <p className="text-xl">Puntuación: {score}</p>
            <button onClick={restart} className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-md font-bold text-lg shadow-[0_4px_0_#000] active:translate-y-1 active:shadow-[0_0_0_#000] transition">
              JUGAR DE NUEVO
            </button>
          </div>
        )}
      </div>

      <div className="flex justify-between w-full max-w-[800px] gap-3 md:hidden">
        <div className="flex gap-2">
          <button {...holdKey("ArrowLeft")} className="w-16 h-16 bg-white/90 rounded-full text-2xl font-black shadow-[0_4px_0_#000] active:translate-y-1">◀</button>
          <button {...holdKey("ArrowRight")} className="w-16 h-16 bg-white/90 rounded-full text-2xl font-black shadow-[0_4px_0_#000] active:translate-y-1">▶</button>
        </div>
        <button {...holdKey("Space")} className="w-20 h-20 bg-red-500 text-white rounded-full text-xl font-black shadow-[0_4px_0_#000] active:translate-y-1">SALTAR</button>
      </div>

      <p className="text-white/90 text-xs md:text-sm font-mono text-center drop-shadow-[1px_1px_0_#000]">
        ← → moverse · SHIFT correr · ESPACIO / ↑ saltar · 20 monedas = 1UP · cuidado con el tiempo
      </p>
    </main>
  );
}
