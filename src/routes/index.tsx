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
          "Juego de plataformas 2D estilo Mario Bros con gráficos pixel art. Salta, esquiva enemigos y recolecta monedas.",
      },
      { property: "og:title", content: "Super Plumber Adventure" },
      {
        property: "og:description",
        content: "Plataformas pixel art clásicas en tu navegador.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const LEVEL = [
  "................................................................................................",
  "................................................................................................",
  "................................................................................................",
  "................................................................................................",
  "..........CCC...................................................................................",
  "................................................................................................",
  ".......?BB?B.................CCCC...............................................................",
  "................................................................................................",
  ".............................BBBBB..................?B?B?......................................",
  "................................................................................................",
  ".................................................C..C..C.......................................",
  "................................................................................................",
  ".......................Pp......................................................S...............",
  "....G.................PPpp................G............G......................SS......F.........",
  "================================================================================================",
  "################################################################################################",
  "################################################################################################",
];

const TILE = 32;
const LEVEL_W = LEVEL[0].length * TILE;
const LEVEL_H = LEVEL.length * TILE;

type Rect = { x: number; y: number; w: number; h: number };
type Enemy = Rect & { vx: number; vy: number; alive: boolean; squashT: number; anim: number };
type Coin = { x: number; y: number; taken: boolean; t: number; pop: number };
type Block = Rect & {
  type: "ground" | "grass" | "brick" | "question" | "pipe" | "stone";
  used?: boolean;
  bump?: number;
  pipeTop?: boolean;
  pipeLeft?: boolean;
};
type Particle = {
  x: number; y: number; vx: number; vy: number; life: number; maxLife: number;
  color: string; size: number; gravity: number; shape?: "square" | "circle" | "star";
};

function buildWorld() {
  const blocks: Block[] = [];
  const coins: Coin[] = [];
  const enemies: Enemy[] = [];
  let flag = { x: 0, y: 0 };
  for (let r = 0; r < LEVEL.length; r++) {
    for (let c = 0; c < LEVEL[r].length; c++) {
      const ch = LEVEL[r][c];
      const x = c * TILE;
      const y = r * TILE;
      if (ch === "#") blocks.push({ x, y, w: TILE, h: TILE, type: "ground" });
      else if (ch === "=") blocks.push({ x, y, w: TILE, h: TILE, type: "grass" });
      else if (ch === "B") blocks.push({ x, y, w: TILE, h: TILE, type: "brick" });
      else if (ch === "?") blocks.push({ x, y, w: TILE, h: TILE, type: "question" });
      else if (ch === "P" || ch === "p") {
        const above = LEVEL[r - 1]?.[c];
        const pipeTop = above !== "P" && above !== "p";
        blocks.push({ x, y, w: TILE, h: TILE, type: "pipe", pipeTop, pipeLeft: ch === "P" });
      }
      else if (ch === "S") blocks.push({ x, y, w: TILE, h: TILE, type: "stone" });
      else if (ch === "C") coins.push({ x: x + 8, y: y + 8, taken: false, t: Math.random() * 6, pop: 0 });
      else if (ch === "G") enemies.push({ x, y: y + 4, w: 28, h: 28, vx: -0.6, vy: 0, alive: true, squashT: 0, anim: 0 });
      else if (ch === "F") flag = { x: x + 12, y };
    }
  }
  return { blocks, coins, enemies, flag };
}

function Index() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"playing" | "win" | "dead">("playing");
  const [score, setScore] = useState(0);
  const [coinsCount, setCoinsCount] = useState(0);
  const [lives, setLives] = useState(3);
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    const world = buildWorld();
    const keys: Record<string, boolean> = {};
    let cameraX = 0;
    let cameraY = 0;
    let cameraShake = 0;
    let running = true;
    let localScore = 0;
    let localCoins = 0;
    let localLives = lives;
    let particles: Particle[] = [];
    let floatTexts: { x: number; y: number; text: string; life: number; color: string }[] = [];
    let time = 0;

    const player = {
      x: 60, y: 100, w: 22, h: 30,
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
      player.x = 60; player.y = 100; player.vx = 0; player.vy = 0;
      player.invuln = 120; cameraX = 0;
    }

    function die() {
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

    function update() {
      time++;
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

      player.vy += 0.55;
      if (player.vy > 13) player.vy = 13;

      player.x += player.vx;
      if (player.x < 0) { player.x = 0; player.vx = 0; }
      if (player.x + player.w > LEVEL_W) player.x = LEVEL_W - player.w;
      for (const b of collideBlocks(player)) {
        if (player.vx > 0) player.x = b.x - player.w;
        else if (player.vx < 0) player.x = b.x + b.w;
        player.vx = 0;
      }
      if (player.onGround && Math.abs(player.vx) > 2 && time % 5 === 0) {
        addParticles(player.x + 11 - player.facing * 6, player.y + player.h - 2, 1, {
          color: "#d9cfb5", size: 3, life: 18, vy: -0.5, vx: -player.facing * 0.6, gravity: 0.05,
        });
      }

      const wasOnGround = player.onGround;
      player.y += player.vy;
      player.onGround = false;
      for (const b of collideBlocks(player)) {
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

      const target = player.x - 260;
      cameraX += (target - cameraX) * 0.12;
      const targetY = Math.max(0, Math.min(LEVEL_H - canvas.height, player.y - canvas.height * 0.6));
      cameraY += (targetY - cameraY) * 0.08;
      if (cameraX < 0) cameraX = 0;
      if (cameraX > LEVEL_W - canvas.width) cameraX = LEVEL_W - canvas.width;
      if (cameraShake > 0) cameraShake *= 0.85;

      for (const e of world.enemies) {
        if (!e.alive) { if (e.squashT > 0) e.squashT--; continue; }
        e.anim += Math.abs(e.vx) * 0.15;
        e.x += e.vx;
        e.vy += 0.5;
        e.y += e.vy;
        for (const b of collideBlocks(e)) {
          if (e.vy > 0) { e.y = b.y - e.h; e.vy = 0; }
          else if (e.vx !== 0) {
            if (e.vx > 0) e.x = b.x - e.w; else e.x = b.x + b.w;
            e.vx *= -1;
          }
        }
        const foot = { x: e.x + (e.vx > 0 ? e.w + 2 : -2), y: e.y + e.h + 2, w: 2, h: 2 };
        if (collideBlocks(foot).length === 0) e.vx *= -1;

        if (
          player.x < e.x + e.w && player.x + player.w > e.x &&
          player.y < e.y + e.h && player.y + player.h > e.y
        ) {
          if (player.vy > 1 && player.y + player.h - e.y < 18) {
            e.alive = false; e.squashT = 30;
            player.vy = -8.5;
            player.squash = 0.7; player.stretch = 1.3;
            localScore += 100; setScore(localScore);
            floatText(e.x + e.w / 2, e.y - 4, "+100", "#ff7676");
            addParticles(e.x + e.w / 2, e.y + 8, 10, { color: "#8b4513", size: 3, life: 25, speed: 3, gravity: 0.3 });
            cameraShake = 3;
          } else if (player.invuln === 0) die();
        }
      }

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
          floatText(c.x + 8, c.y - 4, "+100", "#ffd94a");
          addParticles(c.x + 8, c.y + 8, 8, { color: "#ffe680", size: 2, life: 24, speed: 2.5, gravity: 0.15, shape: "star" });
        }
      }

      if (
        world.flag.x &&
        player.x + player.w > world.flag.x &&
        player.x < world.flag.x + 8 &&
        player.y + player.h > world.flag.y
      ) {
        setStatus("win"); running = false;
        for (let i = 0; i < 60; i++) {
          addParticles(world.flag.x, world.flag.y - 200 + i * 5, 1, {
            color: ["#ffd94a", "#ff5c8a", "#4ac1ff", "#7ee085"][i % 4],
            size: 4, life: 60, speed: 4, gravity: 0.2, shape: "star",
          });
        }
      }

      particles = particles.filter((p) => p.life > 0);
      for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += p.gravity; p.life--; }
      floatTexts = floatTexts.filter((f) => f.life > 0);
      for (const f of floatTexts) { f.y -= 1.2; f.life--; }
      for (const b of world.blocks) if (b.bump && b.bump > 0) b.bump = Math.max(0, b.bump - 0.8);
    }

    // ------- Drawing -------
    function drawSky() {
      const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, "#4a86f7");
      g.addColorStop(0.6, "#7cb4ff");
      g.addColorStop(1, "#c5e2ff");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const sunX = canvas.width - 90 - cameraX * 0.02;
      const sunY = 80;
      const sunGrad = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 80);
      sunGrad.addColorStop(0, "rgba(255,240,180,1)");
      sunGrad.addColorStop(0.4, "rgba(255,220,140,0.5)");
      sunGrad.addColorStop(1, "rgba(255,220,140,0)");
      ctx.fillStyle = sunGrad;
      ctx.fillRect(sunX - 90, sunY - 90, 180, 180);
      ctx.fillStyle = "#fff5c8";
      ctx.beginPath(); ctx.arc(sunX, sunY, 26, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = "#6b8fbf";
      for (let i = 0; i < 8; i++) {
        const mx = i * 320 - (cameraX * 0.15) % 320;
        ctx.beginPath();
        ctx.moveTo(mx - 20, canvas.height - 100);
        ctx.lineTo(mx + 120, canvas.height - 240);
        ctx.lineTo(mx + 260, canvas.height - 100);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#eaf1ff";
        ctx.beginPath();
        ctx.moveTo(mx + 90, canvas.height - 200);
        ctx.lineTo(mx + 120, canvas.height - 240);
        ctx.lineTo(mx + 150, canvas.height - 200);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#6b8fbf";
      }

      for (let i = 0; i < 8; i++) {
        const hx = i * 260 - (cameraX * 0.3) % 260;
        const grad = ctx.createLinearGradient(0, canvas.height - 160, 0, canvas.height);
        grad.addColorStop(0, "#4aa64a");
        grad.addColorStop(1, "#2f7a2f");
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(hx, canvas.height - 90, 100, Math.PI, 0); ctx.fill();
        ctx.beginPath(); ctx.arc(hx + 140, canvas.height - 70, 70, Math.PI, 0); ctx.fill();
      }

      for (let i = 0; i < 10; i++) {
        const cx = i * 220 - (cameraX * 0.25) % 220;
        const cy = 50 + ((i * 53) % 60);
        cloud(cx, cy, 0.9 + (i % 3) * 0.15);
      }

      ctx.fillStyle = "#1c5e1c";
      for (let i = 0; i < 20; i++) {
        const bx = i * 160 - (cameraX * 0.7) % 160;
        const by = canvas.height - 100;
        ctx.beginPath();
        ctx.arc(bx, by, 14, Math.PI, 0);
        ctx.arc(bx + 14, by - 4, 16, Math.PI, 0);
        ctx.arc(bx + 30, by, 14, Math.PI, 0);
        ctx.fill();
      }
    }

    function cloud(x: number, y: number, s = 1) {
      ctx.fillStyle = "rgba(230,240,255,0.9)";
      ctx.beginPath();
      ctx.arc(x, y + 2, 16 * s, 0, Math.PI * 2);
      ctx.arc(x + 18 * s, y - 4, 22 * s, 0, Math.PI * 2);
      ctx.arc(x + 40 * s, y + 2, 16 * s, 0, Math.PI * 2);
      ctx.arc(x + 22 * s, y + 10, 18 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x, y - 1, 14 * s, 0, Math.PI * 2);
      ctx.arc(x + 18 * s, y - 7, 20 * s, 0, Math.PI * 2);
      ctx.arc(x + 40 * s, y - 1, 14 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawBlock(b: Block) {
      const x = Math.round(b.x - cameraX);
      const y = Math.round(b.y - (b.bump || 0) - cameraY);
      if (x + b.w < -20 || x > canvas.width + 20) return;
      switch (b.type) {
        case "ground": {
          const g = ctx.createLinearGradient(0, y, 0, y + b.h);
          g.addColorStop(0, "#a0522d"); g.addColorStop(1, "#5c2f0d");
          ctx.fillStyle = g; ctx.fillRect(x, y, b.w, b.h);
          ctx.fillStyle = "#6b3410";
          ctx.fillRect(x + 4, y + 6, 4, 4);
          ctx.fillRect(x + 20, y + 14, 4, 4);
          ctx.fillRect(x + 12, y + 22, 4, 4);
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.fillRect(x, y + b.h - 3, b.w, 3);
          ctx.fillStyle = "rgba(255,255,255,0.15)";
          ctx.fillRect(x, y, b.w, 2);
          break;
        }
        case "grass": {
          const g = ctx.createLinearGradient(0, y, 0, y + b.h);
          g.addColorStop(0, "#a0522d"); g.addColorStop(1, "#6b3410");
          ctx.fillStyle = g; ctx.fillRect(x, y, b.w, b.h);
          const gg = ctx.createLinearGradient(0, y, 0, y + 12);
          gg.addColorStop(0, "#5cd464"); gg.addColorStop(1, "#2ea63a");
          ctx.fillStyle = gg; ctx.fillRect(x, y, b.w, 12);
          ctx.fillStyle = "#7ee085";
          ctx.fillRect(x + 3, y - 2, 2, 4);
          ctx.fillRect(x + 11, y - 3, 2, 5);
          ctx.fillRect(x + 22, y - 2, 2, 4);
          ctx.fillStyle = "rgba(0,0,0,0.15)";
          ctx.fillRect(x, y + 10, b.w, 2);
          break;
        }
        case "brick": {
          const g = ctx.createLinearGradient(0, y, 0, y + b.h);
          g.addColorStop(0, "#e05a2a"); g.addColorStop(1, "#8b3110");
          ctx.fillStyle = g; ctx.fillRect(x, y, b.w, b.h);
          ctx.strokeStyle = "#2a0e04"; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, y + 16); ctx.lineTo(x + b.w, y + 16);
          ctx.moveTo(x + 16, y); ctx.lineTo(x + 16, y + 16);
          ctx.moveTo(x + 8, y + 16); ctx.lineTo(x + 8, y + b.h);
          ctx.moveTo(x + 24, y + 16); ctx.lineTo(x + 24, y + b.h);
          ctx.stroke();
          ctx.strokeRect(x + 1, y + 1, b.w - 2, b.h - 2);
          ctx.fillStyle = "rgba(255,255,255,0.2)";
          ctx.fillRect(x + 2, y + 2, b.w - 4, 1);
          break;
        }
        case "question": {
          if (b.used) {
            const g = ctx.createLinearGradient(0, y, 0, y + b.h);
            g.addColorStop(0, "#8b5a2b"); g.addColorStop(1, "#4a2f14");
            ctx.fillStyle = g; ctx.fillRect(x, y, b.w, b.h);
            ctx.strokeStyle = "#2a1808"; ctx.lineWidth = 2;
            ctx.strokeRect(x + 1, y + 1, b.w - 2, b.h - 2);
          } else {
            const pulse = Math.sin(time * 0.08) * 0.15 + 0.85;
            const g = ctx.createLinearGradient(0, y, 0, y + b.h);
            g.addColorStop(0, "#ffcf3f"); g.addColorStop(1, "rgba(200,110,0,1)");
            ctx.fillStyle = g; ctx.fillRect(x, y, b.w, b.h);
            ctx.fillStyle = "#7a4600";
            ctx.fillRect(x, y, b.w, 3);
            ctx.fillRect(x, y + b.h - 3, b.w, 3);
            ctx.fillRect(x, y, 3, b.h);
            ctx.fillRect(x + b.w - 3, y, 3, b.h);
            ctx.fillStyle = "#ffe680";
            ctx.fillRect(x + 3, y + 3, 3, 3);
            ctx.fillRect(x + b.w - 6, y + 3, 3, 3);
            ctx.fillRect(x + 3, y + b.h - 6, 3, 3);
            ctx.fillRect(x + b.w - 6, y + b.h - 6, 3, 3);
            ctx.fillStyle = "rgba(0,0,0,0.4)";
            ctx.font = "bold 20px monospace";
            ctx.fillText("?", x + 11, y + 24);
            ctx.fillStyle = `rgba(255,255,255,${pulse})`;
            ctx.fillText("?", x + 10, y + 23);
          }
          break;
        }
        case "pipe": {
          const g = ctx.createLinearGradient(x, 0, x + b.w, 0);
          g.addColorStop(0, "#0f5a19");
          g.addColorStop(0.15, "#7ee085");
          g.addColorStop(0.5, "#3ec54a");
          g.addColorStop(0.85, "#1a6b22");
          g.addColorStop(1, "#0a3d10");
          ctx.fillStyle = g; ctx.fillRect(x, y, b.w, b.h);
          if (b.pipeTop) {
            const rimX = b.pipeLeft ? x - 4 : x;
            const rimW = b.w + 4;
            ctx.fillStyle = "#1a6b22"; ctx.fillRect(rimX, y - 6, rimW, 8);
            const rg = ctx.createLinearGradient(rimX, 0, rimX + rimW, 0);
            rg.addColorStop(0, "#0f5a19");
            rg.addColorStop(0.2, "#8ff090");
            rg.addColorStop(0.5, "#4ad058");
            rg.addColorStop(0.8, "#1a6b22");
            rg.addColorStop(1, "#0a3d10");
            ctx.fillStyle = rg; ctx.fillRect(rimX, y - 4, rimW, 4);
            ctx.fillStyle = "rgba(255,255,255,0.3)";
            ctx.fillRect(rimX + 4, y - 2, 8, 1);
          }
          break;
        }
        case "stone": {
          const g = ctx.createLinearGradient(0, y, 0, y + b.h);
          g.addColorStop(0, "#c8ccd4"); g.addColorStop(1, "#5c6270");
          ctx.fillStyle = g; ctx.fillRect(x, y, b.w, b.h);
          ctx.fillStyle = "rgba(0,0,0,0.2)";
          ctx.fillRect(x + 6, y + 8, 4, 2);
          ctx.fillRect(x + 18, y + 18, 4, 2);
          ctx.fillStyle = "rgba(255,255,255,0.25)";
          ctx.fillRect(x, y, b.w, 2);
          break;
        }
      }
    }

    function drawPlayer() {
      if (player.invuln > 0 && Math.floor(player.invuln / 4) % 2 === 0) return;
      const px = player.x - cameraX;
      const py = player.y - cameraY;
      const f = player.facing;

      // Shadow (unaffected by squash)
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

      // Hat
      ctx.fillStyle = "#d32626";
      ctx.fillRect(2, 0, 18, 5);
      ctx.fillRect(10, -3, 12, 5);
      ctx.fillStyle = "#fff";
      ctx.fillRect(12, 1, 6, 3);
      ctx.fillStyle = "#a51a1a";
      ctx.fillRect(12, 0, 6, 1);

      // Hair sides
      ctx.fillStyle = "#3a1e0a";
      ctx.fillRect(2, 5, 3, 3);
      ctx.fillRect(17, 5, 3, 3);

      // Face
      ctx.fillStyle = "#ffcf9a";
      ctx.fillRect(4, 5, 14, 9);
      ctx.fillRect(1, 8, 3, 4);

      // Eye
      ctx.fillStyle = "#fff";
      ctx.fillRect(12, 6, 4, 5);
      ctx.fillStyle = "#1a3a8a";
      ctx.fillRect(13, 7, 2, 3);
      ctx.fillStyle = "#000";
      ctx.fillRect(13, 8, 2, 2);

      // Mustache
      ctx.fillStyle = "#2a1408";
      ctx.fillRect(6, 11, 12, 3);
      ctx.fillRect(4, 12, 2, 2);

      // Nose
      ctx.fillStyle = "#e5a97a";
      ctx.fillRect(15, 9, 3, 3);

      // Body / overalls
      ctx.fillStyle = "#1e5fd8";
      ctx.fillRect(2, 14, 18, 10);
      ctx.fillRect(5, 13, 3, 3);
      ctx.fillRect(13, 13, 3, 3);
      // Shirt
      ctx.fillStyle = "#d32626";
      ctx.fillRect(0, 14, 3, 7);
      ctx.fillRect(19, 14, 3, 7);
      ctx.fillRect(8, 13, 5, 3);
      // Buttons
      ctx.fillStyle = "#ffd94a";
      ctx.fillRect(6, 17, 2, 2);
      ctx.fillRect(14, 17, 2, 2);

      // Arms
      ctx.fillStyle = "#d32626";
      if (walking) {
        const armSwing = walkFrame % 2 === 0 ? 0 : 2;
        ctx.fillRect(-1, 15 + armSwing, 4, 7);
        ctx.fillRect(19, 15 - armSwing, 4, 7);
      } else if (airborne) {
        ctx.fillRect(-2, 12, 4, 8);
        ctx.fillRect(20, 12, 4, 8);
      } else {
        ctx.fillRect(-1, 16, 4, 7);
        ctx.fillRect(19, 16, 4, 7);
      }
      // Gloves
      ctx.fillStyle = "#fff";
      if (airborne) {
        ctx.fillRect(-3, 19, 5, 4);
        ctx.fillRect(20, 19, 5, 4);
      } else {
        ctx.fillRect(-2, 21, 5, 4);
        ctx.fillRect(19, 21, 5, 4);
      }

      // Legs / shoes
      ctx.fillStyle = "#5a2a08";
      if (airborne) {
        ctx.fillRect(3, 24, 8, 6);
        ctx.fillRect(11, 24, 8, 6);
        ctx.fillStyle = "#2a1408";
        ctx.fillRect(2, 27, 10, 3);
        ctx.fillRect(10, 27, 10, 3);
      } else if (walking) {
        const back = walkFrame === 0 || walkFrame === 2 ? 0 : 2;
        const front = walkFrame === 0 || walkFrame === 2 ? 2 : 0;
        ctx.fillRect(3, 24 - back, 8, 6);
        ctx.fillRect(11, 24 - front, 8, 6);
        ctx.fillStyle = "#2a1408";
        ctx.fillRect(2, 27 - back, 10, 3);
        ctx.fillRect(10, 27 - front, 10, 3);
      } else {
        ctx.fillRect(3, 24, 8, 6);
        ctx.fillRect(11, 24, 8, 6);
        ctx.fillStyle = "#2a1408";
        ctx.fillRect(2, 27, 10, 3);
        ctx.fillRect(10, 27, 10, 3);
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

    function drawEnemy(e: Enemy) {
      const x = Math.round(e.x - cameraX);
      const y = Math.round(e.y - cameraY);
      if (!e.alive) {
        if (e.squashT > 0) {
          ctx.fillStyle = "#5a2f14";
          ctx.fillRect(x, y + e.h - 6, e.w, 6);
          ctx.fillStyle = "#8b4513";
          ctx.fillRect(x + 4, y + e.h - 12, e.w - 8, 6);
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
      ctx.beginPath();
      ctx.arc(x + e.w / 2, y + 12 - bounce, 14, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(x, y + 12 - bounce, e.w, 10);
      ctx.fillStyle = "rgba(255,220,180,0.35)";
      ctx.beginPath();
      ctx.arc(x + 10, y + 8 - bounce, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#f4c88a";
      ctx.fillRect(x + 5, y + 14 - bounce, 18, 8);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(x + 5, y + 14 - bounce, 18, 1);

      ctx.fillStyle = "#fff";
      ctx.fillRect(x + 6, y + 15 - bounce, 6, 6);
      ctx.fillRect(x + 16, y + 15 - bounce, 6, 6);
      ctx.fillStyle = "#000";
      const eyeDir = e.vx > 0 ? 2 : 0;
      ctx.fillRect(x + 6 + eyeDir, y + 17 - bounce, 3, 3);
      ctx.fillRect(x + 16 + eyeDir, y + 17 - bounce, 3, 3);
      ctx.fillStyle = "#3a1408";
      ctx.fillRect(x + 5, y + 14 - bounce, 8, 2);
      ctx.fillRect(x + 15, y + 14 - bounce, 8, 2);

      const step = Math.floor(e.anim) % 2;
      ctx.fillStyle = "#2a1408";
      ctx.fillRect(x + 2, y + 22 + (step ? 0 : 1), 8, 6);
      ctx.fillRect(x + 18, y + 22 + (step ? 1 : 0), 8, 6);
      ctx.fillStyle = "#5a2a08";
      ctx.fillRect(x + 2, y + 22 + (step ? 0 : 1), 8, 2);
      ctx.fillRect(x + 18, y + 22 + (step ? 1 : 0), 8, 2);
    }

    function drawCoin(c: Coin) {
      if (c.taken) return;
      const bob = Math.sin(time * 0.08 + c.x * 0.01) * 3;
      const x = Math.round(c.x - cameraX);
      const y = Math.round(c.y + bob - cameraY);
      const gr = ctx.createRadialGradient(x + 8, y + 8, 2, x + 8, y + 8, 14);
      gr.addColorStop(0, "rgba(255,220,80,0.4)");
      gr.addColorStop(1, "rgba(255,220,80,0)");
      ctx.fillStyle = gr;
      ctx.fillRect(x - 6, y - 6, 28, 28);

      const scale = Math.abs(Math.cos(c.t));
      const w = Math.max(2, 14 * scale);
      const grad = ctx.createLinearGradient(x, 0, x + 16, 0);
      grad.addColorStop(0, "#c07500");
      grad.addColorStop(0.5, "#ffd94a");
      grad.addColorStop(1, "#c07500");
      ctx.fillStyle = grad;
      ctx.fillRect(x + 8 - w / 2, y, w, 14);
      if (w > 4) {
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.fillRect(x + 8 - w / 2 + 1, y + 2, 2, 10);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(x + 8 + w / 2 - 2, y + 2, 1, 10);
      }
    }

    function drawFlag() {
      if (!world.flag.x) return;
      const x = Math.round(world.flag.x - cameraX);
      const y = world.flag.y - cameraY;
      const pg = ctx.createLinearGradient(x, 0, x + 4, 0);
      pg.addColorStop(0, "#7a8090"); pg.addColorStop(0.5, "#e0e5ec"); pg.addColorStop(1, "#5c6270");
      ctx.fillStyle = pg;
      ctx.fillRect(x, y - 220, 4, 280);
      ctx.fillStyle = "#ffd94a";
      ctx.beginPath(); ctx.arc(x + 2, y - 220, 7, 0, Math.PI * 2); ctx.fill();
      const wave = Math.sin(time * 0.1) * 4;
      ctx.fillStyle = "#00c853";
      ctx.beginPath();
      ctx.moveTo(x + 4, y - 210);
      ctx.lineTo(x + 40 + wave, y - 200);
      ctx.lineTo(x + 4, y - 190);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 12px monospace";
      ctx.fillText("★", x + 14, y - 197);
    }

    function drawParticles() {
      for (const p of particles) {
        const alpha = Math.min(1, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        const px = Math.round(p.x - cameraX);
        const py = Math.round(p.y - cameraY);
        if (p.shape === "star") {
          ctx.fillRect(px - p.size, py, p.size * 2, 1);
          ctx.fillRect(px, py - p.size, 1, p.size * 2);
        } else if (p.shape === "circle") {
          ctx.beginPath(); ctx.arc(px, py, p.size, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillRect(px - p.size / 2, py - p.size / 2, p.size, p.size);
        }
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
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillText(f.text, x - 12, y + 1);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, x - 13, y);
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
      drawFlag();
      for (const c of world.coins) drawCoin(c);
      for (const e of world.enemies) drawEnemy(e);
      drawPlayer();
      drawParticles();
      drawFloatTexts();

      const vg = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.height * 0.4,
        canvas.width / 2, canvas.height / 2, canvas.height * 0.85
      );
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.restore();
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
  }, [resetKey]);

  const restart = () => {
    setScore(0); setCoinsCount(0); setLives(3);
    setStatus("playing"); setResetKey((k) => k + 1);
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

      <div className="flex gap-4 text-white font-mono font-bold text-sm md:text-base drop-shadow-[2px_2px_0_#000]">
        <span>SCORE {score.toString().padStart(6, "0")}</span>
        <span className="text-yellow-300">◉ x{coinsCount.toString().padStart(2, "0")}</span>
        <span className="text-red-300">♥ x{lives}</span>
      </div>

      <div className="relative rounded-lg overflow-hidden shadow-[0_20px_60px_rgba(0,0,0,0.6)] ring-4 ring-yellow-400 bg-sky-400 max-w-full">
        <canvas
          ref={canvasRef}
          width={800}
          height={520}
          className="block w-full h-auto"
          style={{ imageRendering: "pixelated", maxWidth: "min(100vw - 24px, 800px)" }}
        />
        {status !== "playing" && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-4 text-white font-mono">
            <h2 className="text-4xl md:text-6xl font-black drop-shadow-[3px_3px_0_#000] animate-scale-in">
              {status === "win" ? "¡NIVEL COMPLETO!" : "GAME OVER"}
            </h2>
            <p className="text-xl">Puntuación: {score}</p>
            <button
              onClick={restart}
              className="px-6 py-3 bg-red-600 hover:bg-red-500 rounded-md font-bold text-lg shadow-[0_4px_0_#000] active:translate-y-1 active:shadow-[0_0_0_#000] transition"
            >
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
        ← → moverse · SHIFT correr · ESPACIO / ↑ saltar · salta sobre enemigos · llega a la bandera
      </p>
    </main>
  );
}
