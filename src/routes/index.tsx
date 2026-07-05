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

// ---- Level design ----
// . = empty, # = ground brick, = = grass top, B = brick, ? = question, P = pipe left, p = pipe right
// C = coin, G = goomba spawn, F = flag, S = stone
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
type Enemy = Rect & { vx: number; alive: boolean; squashT: number };
type Coin = { x: number; y: number; taken: boolean; t: number };
type Block = Rect & { type: "ground" | "grass" | "brick" | "question" | "pipe" | "stone"; used?: boolean; bump?: number };

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
      else if (ch === "P" || ch === "p") blocks.push({ x, y, w: TILE, h: TILE, type: "pipe" });
      else if (ch === "S") blocks.push({ x, y, w: TILE, h: TILE, type: "stone" });
      else if (ch === "C") coins.push({ x: x + 8, y: y + 8, taken: false, t: 0 });
      else if (ch === "G") enemies.push({ x, y: y + 4, w: 28, h: 28, vx: -0.6, alive: true, squashT: 0 });
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
    let running = true;
    let localScore = 0;
    let localCoins = 0;
    let localLives = lives;
    let particles: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = [];

    const player = {
      x: 60,
      y: 100,
      w: 24,
      h: 30,
      vx: 0,
      vy: 0,
      onGround: false,
      facing: 1,
      anim: 0,
      invuln: 0,
    };

    const kd = (e: KeyboardEvent) => {
      keys[e.code] = true;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(e.code)) e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => (keys[e.code] = false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);

    // Touch controls
    const setKey = (k: string, v: boolean) => (keys[k] = v);
    (window as any).__gameKey = setKey;

    function collideBlocks(rect: Rect) {
      const hits: Block[] = [];
      for (const b of world.blocks) {
        if (
          rect.x < b.x + b.w &&
          rect.x + rect.w > b.x &&
          rect.y < b.y + b.h &&
          rect.y + rect.h > b.y
        )
          hits.push(b);
      }
      return hits;
    }

    function respawn() {
      player.x = 60;
      player.y = 100;
      player.vx = 0;
      player.vy = 0;
      player.invuln = 90;
      cameraX = 0;
    }

    function die() {
      localLives -= 1;
      setLives(localLives);
      for (let i = 0; i < 20; i++)
        particles.push({
          x: player.x + 12,
          y: player.y + 15,
          vx: (Math.random() - 0.5) * 5,
          vy: -Math.random() * 5 - 2,
          life: 60,
          color: "#ff3b3b",
        });
      if (localLives <= 0) {
        setStatus("dead");
        running = false;
      } else {
        respawn();
      }
    }

    function update() {
      // Input
      const left = keys["ArrowLeft"] || keys["KeyA"];
      const right = keys["ArrowRight"] || keys["KeyD"];
      const jump = keys["ArrowUp"] || keys["Space"] || keys["KeyW"];

      const accel = 0.5;
      const maxSpeed = 4;
      if (left) {
        player.vx = Math.max(player.vx - accel, -maxSpeed);
        player.facing = -1;
      } else if (right) {
        player.vx = Math.min(player.vx + accel, maxSpeed);
        player.facing = 1;
      } else {
        player.vx *= 0.8;
        if (Math.abs(player.vx) < 0.05) player.vx = 0;
      }

      if (jump && player.onGround) {
        player.vy = -11;
        player.onGround = false;
      }
      if (!jump && player.vy < -4) player.vy = -4; // variable jump

      player.vy += 0.5;
      if (player.vy > 12) player.vy = 12;

      // X move
      player.x += player.vx;
      if (player.x < 0) player.x = 0;
      if (player.x + player.w > LEVEL_W) player.x = LEVEL_W - player.w;
      for (const b of collideBlocks(player)) {
        if (player.vx > 0) player.x = b.x - player.w;
        else if (player.vx < 0) player.x = b.x + b.w;
        player.vx = 0;
      }

      // Y move
      player.y += player.vy;
      player.onGround = false;
      for (const b of collideBlocks(player)) {
        if (player.vy > 0) {
          player.y = b.y - player.h;
          player.vy = 0;
          player.onGround = true;
        } else if (player.vy < 0) {
          player.y = b.y + b.h;
          player.vy = 0;
          if (b.type === "question" && !b.used) {
            b.used = true;
            b.bump = 8;
            localCoins += 1;
            localScore += 200;
            setCoinsCount(localCoins);
            setScore(localScore);
            particles.push({
              x: b.x + 16,
              y: b.y - 8,
              vx: 0,
              vy: -4,
              life: 30,
              color: "#ffd94a",
            });
          } else if (b.type === "brick") {
            b.bump = 6;
          }
        }
      }

      if (player.y > LEVEL_H + 200) die();
      if (player.invuln > 0) player.invuln--;

      // Anim
      if (Math.abs(player.vx) > 0.2) player.anim += Math.abs(player.vx) * 0.2;

      // Camera
      const target = player.x - 240;
      cameraX += (target - cameraX) * 0.1;
      if (cameraX < 0) cameraX = 0;
      if (cameraX > LEVEL_W - canvas.width) cameraX = LEVEL_W - canvas.width;

      // Enemies
      for (const e of world.enemies) {
        if (!e.alive) {
          if (e.squashT > 0) e.squashT--;
          continue;
        }
        e.x += e.vx;
        // gravity
        (e as any).vy = ((e as any).vy || 0) + 0.5;
        e.y += (e as any).vy;
        for (const b of collideBlocks(e)) {
          if ((e as any).vy > 0) {
            e.y = b.y - e.h;
            (e as any).vy = 0;
          } else if (e.vx !== 0) {
            if (e.vx > 0) e.x = b.x - e.w;
            else e.x = b.x + b.w;
            e.vx *= -1;
          }
        }
        // edge detect: turn if no ground ahead
        const foot = {
          x: e.x + (e.vx > 0 ? e.w + 2 : -2),
          y: e.y + e.h + 2,
          w: 2,
          h: 2,
        };
        if (collideBlocks(foot).length === 0) e.vx *= -1;

        // collide player
        if (
          player.x < e.x + e.w &&
          player.x + player.w > e.x &&
          player.y < e.y + e.h &&
          player.y + player.h > e.y
        ) {
          if (player.vy > 1 && player.y + player.h - e.y < 16) {
            e.alive = false;
            e.squashT = 30;
            player.vy = -7;
            localScore += 100;
            setScore(localScore);
          } else if (player.invuln === 0) {
            die();
          }
        }
      }

      // Coins
      for (const c of world.coins) {
        if (c.taken) continue;
        c.t += 0.15;
        if (
          player.x < c.x + 16 &&
          player.x + player.w > c.x &&
          player.y < c.y + 16 &&
          player.y + player.h > c.y
        ) {
          c.taken = true;
          localCoins += 1;
          localScore += 100;
          setCoinsCount(localCoins);
          setScore(localScore);
        }
      }

      // Flag
      if (
        world.flag.x &&
        player.x + player.w > world.flag.x &&
        player.x < world.flag.x + 8 &&
        player.y + player.h > world.flag.y
      ) {
        setStatus("win");
        running = false;
      }

      // Particles
      particles = particles.filter((p) => p.life > 0);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.3;
        p.life--;
      }

      // Bumps
      for (const b of world.blocks) {
        if (b.bump && b.bump > 0) b.bump = Math.max(0, b.bump - 1);
      }
    }

    function drawSky() {
      const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, "#5c94fc");
      g.addColorStop(1, "#9bd0ff");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Parallax hills
      ctx.fillStyle = "#3a9a3a";
      for (let i = 0; i < 6; i++) {
        const hx = i * 260 - (cameraX * 0.3) % 260;
        ctx.beginPath();
        ctx.arc(hx, canvas.height - 90, 90, Math.PI, 0);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(hx + 120, canvas.height - 70, 60, Math.PI, 0);
        ctx.fill();
      }

      // Clouds
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < 8; i++) {
        const cx = i * 220 - (cameraX * 0.2) % 220;
        const cy = 60 + ((i * 37) % 40);
        cloud(cx, cy);
      }
    }

    function cloud(x: number, y: number) {
      ctx.beginPath();
      ctx.arc(x, y, 16, 0, Math.PI * 2);
      ctx.arc(x + 18, y - 6, 20, 0, Math.PI * 2);
      ctx.arc(x + 38, y, 16, 0, Math.PI * 2);
      ctx.arc(x + 20, y + 8, 18, 0, Math.PI * 2);
      ctx.fill();
    }

    function drawBlock(b: Block) {
      const x = Math.round(b.x - cameraX);
      const y = Math.round(b.y - (b.bump || 0));
      if (x + b.w < 0 || x > canvas.width) return;
      switch (b.type) {
        case "ground": {
          ctx.fillStyle = "#8b4513";
          ctx.fillRect(x, y, b.w, b.h);
          ctx.fillStyle = "#a0522d";
          ctx.fillRect(x + 2, y + 2, b.w - 4, 4);
          ctx.fillStyle = "#5c2f0d";
          ctx.fillRect(x, y + b.h - 3, b.w, 3);
          // pixel dots
          ctx.fillStyle = "#6b3410";
          ctx.fillRect(x + 6, y + 12, 4, 4);
          ctx.fillRect(x + 20, y + 20, 4, 4);
          break;
        }
        case "grass": {
          ctx.fillStyle = "#8b4513";
          ctx.fillRect(x, y, b.w, b.h);
          ctx.fillStyle = "#3ec54a";
          ctx.fillRect(x, y, b.w, 10);
          ctx.fillStyle = "#2ea63a";
          ctx.fillRect(x, y + 8, b.w, 2);
          break;
        }
        case "brick": {
          ctx.fillStyle = "#c94a1a";
          ctx.fillRect(x, y, b.w, b.h);
          ctx.strokeStyle = "#3a1508";
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, b.w - 2, b.h - 2);
          ctx.beginPath();
          ctx.moveTo(x, y + 16); ctx.lineTo(x + b.w, y + 16);
          ctx.moveTo(x + 16, y); ctx.lineTo(x + 16, y + 16);
          ctx.moveTo(x + 8, y + 16); ctx.lineTo(x + 8, y + b.h);
          ctx.moveTo(x + 24, y + 16); ctx.lineTo(x + 24, y + b.h);
          ctx.stroke();
          break;
        }
        case "question": {
          if (b.used) {
            ctx.fillStyle = "#8b5a2b";
            ctx.fillRect(x, y, b.w, b.h);
            ctx.fillStyle = "#5c3a1a";
            ctx.fillRect(x + 2, y + 2, b.w - 4, b.h - 4);
          } else {
            ctx.fillStyle = "#f4a71a";
            ctx.fillRect(x, y, b.w, b.h);
            ctx.fillStyle = "#c07500";
            ctx.fillRect(x, y + b.h - 4, b.w, 4);
            ctx.fillRect(x, y, 4, b.h);
            ctx.fillRect(x + b.w - 4, y, 4, b.h);
            ctx.fillStyle = "#fff";
            ctx.font = "bold 22px monospace";
            ctx.fillText("?", x + 9, y + 24);
          }
          break;
        }
        case "pipe": {
          ctx.fillStyle = "#2ea63a";
          ctx.fillRect(x, y, b.w, b.h);
          ctx.fillStyle = "#7ee085";
          ctx.fillRect(x + 3, y, 6, b.h);
          ctx.fillStyle = "#1a6b22";
          ctx.fillRect(x + b.w - 6, y, 3, b.h);
          break;
        }
        case "stone": {
          ctx.fillStyle = "#9aa0aa";
          ctx.fillRect(x, y, b.w, b.h);
          ctx.fillStyle = "#c8ccd4";
          ctx.fillRect(x + 2, y + 2, b.w - 4, 4);
          ctx.fillStyle = "#5c6270";
          ctx.fillRect(x, y + b.h - 3, b.w, 3);
          break;
        }
      }
    }

    function drawPlayer() {
      const x = Math.round(player.x - cameraX);
      const y = Math.round(player.y);
      if (player.invuln > 0 && Math.floor(player.invuln / 4) % 2 === 0) return;

      const f = player.facing;
      const walk = player.onGround ? Math.floor(player.anim) % 2 : 0;
      const legOffset = walk === 0 ? 0 : 2;

      // Hat
      ctx.fillStyle = "#e53935";
      ctx.fillRect(x + 2, y, 20, 6);
      ctx.fillRect(x + (f > 0 ? 12 : 2), y - 2, 10, 4);
      // Face
      ctx.fillStyle = "#f8c19a";
      ctx.fillRect(x + 4, y + 6, 16, 8);
      // Mustache
      ctx.fillStyle = "#3a1e0a";
      ctx.fillRect(x + 4, y + 11, 16, 3);
      // Eyes
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(x + (f > 0 ? 14 : 6), y + 8, 2, 3);
      // Body / overalls
      ctx.fillStyle = "#1e5fd8";
      ctx.fillRect(x + 2, y + 14, 20, 10);
      // Shirt sleeves
      ctx.fillStyle = "#e53935";
      ctx.fillRect(x, y + 14, 4, 8);
      ctx.fillRect(x + 20, y + 14, 4, 8);
      // Buttons
      ctx.fillStyle = "#ffd94a";
      ctx.fillRect(x + 7, y + 17, 2, 2);
      ctx.fillRect(x + 15, y + 17, 2, 2);
      // Hands
      ctx.fillStyle = "#f8c19a";
      ctx.fillRect(x - 1, y + 20, 4, 4);
      ctx.fillRect(x + 21, y + 20, 4, 4);
      // Shoes
      ctx.fillStyle = "#3a1e0a";
      ctx.fillRect(x + 2, y + 24 + (walk ? 0 : legOffset), 8, 6);
      ctx.fillRect(x + 14, y + 24 + (walk ? legOffset : 0), 8, 6);
    }

    function drawEnemy(e: Enemy) {
      const x = Math.round(e.x - cameraX);
      const y = Math.round(e.y);
      if (!e.alive) {
        if (e.squashT > 0) {
          ctx.fillStyle = "#6b3410";
          ctx.fillRect(x, y + e.h - 6, e.w, 6);
          ctx.fillStyle = "#8b4513";
          ctx.fillRect(x + 4, y + e.h - 12, e.w - 8, 6);
        }
        return;
      }
      // Body (mushroom-like)
      ctx.fillStyle = "#8b4513";
      ctx.beginPath();
      ctx.arc(x + e.w / 2, y + 12, 14, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(x, y + 12, e.w, 10);
      // Face patch
      ctx.fillStyle = "#f4c88a";
      ctx.fillRect(x + 6, y + 12, 16, 8);
      // Angry eyes
      ctx.fillStyle = "#fff";
      ctx.fillRect(x + 6, y + 12, 6, 6);
      ctx.fillRect(x + 16, y + 12, 6, 6);
      ctx.fillStyle = "#000";
      ctx.fillRect(x + 8, y + 14, 3, 4);
      ctx.fillRect(x + 18, y + 14, 3, 4);
      // Feet
      ctx.fillStyle = "#3a1e0a";
      ctx.fillRect(x + 2, y + 22, 8, 6);
      ctx.fillRect(x + 18, y + 22, 8, 6);
    }

    function drawCoin(c: Coin) {
      if (c.taken) return;
      const x = Math.round(c.x - cameraX);
      const y = Math.round(c.y);
      const scale = Math.abs(Math.cos(c.t));
      const w = Math.max(2, 14 * scale);
      ctx.fillStyle = "#ffd94a";
      ctx.fillRect(x + 8 - w / 2, y, w, 14);
      ctx.fillStyle = "#c07500";
      ctx.fillRect(x + 8 - w / 2, y + 4, w, 2);
      ctx.fillRect(x + 8 - w / 2, y + 10, w, 2);
    }

    function drawFlag() {
      if (!world.flag.x) return;
      const x = Math.round(world.flag.x - cameraX);
      const y = world.flag.y;
      ctx.fillStyle = "#c8ccd4";
      ctx.fillRect(x, y - 200, 4, 260);
      ctx.fillStyle = "#ffd94a";
      ctx.beginPath();
      ctx.arc(x + 2, y - 200, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#00c853";
      ctx.beginPath();
      ctx.moveTo(x + 4, y - 190);
      ctx.lineTo(x + 34, y - 178);
      ctx.lineTo(x + 4, y - 166);
      ctx.fill();
    }

    function draw() {
      drawSky();
      for (const b of world.blocks) drawBlock(b);
      drawFlag();
      for (const c of world.coins) drawCoin(c);
      for (const e of world.enemies) drawEnemy(e);
      drawPlayer();

      for (const p of particles) {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x - cameraX), Math.round(p.y), 4, 4);
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
  }, [resetKey]);

  const restart = () => {
    setScore(0);
    setCoinsCount(0);
    setLives(3);
    setStatus("playing");
    setResetKey((k) => k + 1);
  };

  const holdKey = (code: string) => ({
    onTouchStart: (e: React.TouchEvent) => {
      e.preventDefault();
      (window as any).__gameKey?.(code, true);
    },
    onTouchEnd: (e: React.TouchEvent) => {
      e.preventDefault();
      (window as any).__gameKey?.(code, false);
    },
    onMouseDown: () => (window as any).__gameKey?.(code, true),
    onMouseUp: () => (window as any).__gameKey?.(code, false),
    onMouseLeave: () => (window as any).__gameKey?.(code, false),
  });

  return (
    <main className="min-h-screen w-full bg-gradient-to-b from-sky-500 to-sky-300 flex flex-col items-center justify-center p-3 gap-3 select-none">
      <h1 className="text-2xl md:text-4xl font-black text-white drop-shadow-[3px_3px_0_#000] tracking-tight font-mono">
        SUPER PLUMBER ADVENTURE
      </h1>

      <div className="flex gap-4 text-white font-mono font-bold text-sm md:text-base drop-shadow-[2px_2px_0_#000]">
        <span>SCORE {score.toString().padStart(6, "0")}</span>
        <span className="text-yellow-300">◉ x{coinsCount.toString().padStart(2, "0")}</span>
        <span className="text-red-300">♥ x{lives}</span>
      </div>

      <div className="relative rounded-lg overflow-hidden shadow-2xl ring-4 ring-yellow-400 bg-sky-400 max-w-full">
        <canvas
          ref={canvasRef}
          width={800}
          height={520}
          className="block w-full h-auto"
          style={{ imageRendering: "pixelated", maxWidth: "min(100vw - 24px, 800px)" }}
        />
        {status !== "playing" && (
          <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-4 text-white font-mono">
            <h2 className="text-4xl md:text-6xl font-black drop-shadow-[3px_3px_0_#000]">
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

      {/* Touch controls */}
      <div className="flex justify-between w-full max-w-[800px] gap-3 md:hidden">
        <div className="flex gap-2">
          <button
            {...holdKey("ArrowLeft")}
            className="w-16 h-16 bg-white/90 rounded-full text-2xl font-black shadow-[0_4px_0_#000] active:translate-y-1"
          >
            ◀
          </button>
          <button
            {...holdKey("ArrowRight")}
            className="w-16 h-16 bg-white/90 rounded-full text-2xl font-black shadow-[0_4px_0_#000] active:translate-y-1"
          >
            ▶
          </button>
        </div>
        <button
          {...holdKey("Space")}
          className="w-20 h-20 bg-red-500 text-white rounded-full text-xl font-black shadow-[0_4px_0_#000] active:translate-y-1"
        >
          SALTAR
        </button>
      </div>

      <p className="text-white/90 text-xs md:text-sm font-mono text-center drop-shadow-[1px_1px_0_#000]">
        ← → moverse · ESPACIO / ↑ saltar · salta sobre enemigos · llega a la bandera
      </p>
    </main>
  );
}
