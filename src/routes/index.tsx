import { createFileRoute } from "@tanstack/react-router";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sky, Stars, Text, useAnimations, useGLTF } from "@react-three/drei";
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { SkeletonUtils } from "three-stdlib";
import soldierAsset from "@/assets/soldier.glb.asset.json";
import michelleAsset from "@/assets/michelle.glb.asset.json";


import { playSwing, playShoot, playDeath, genderFor } from "@/lib/sfx";
import { useGame, type SaveSlot } from "@/game/store";
import { StatBar, BatteryPill } from "@/components/hud/Bars";
import { Minimap, type MiniBlip } from "@/components/hud/Minimap";
import { QuestCompass, type CompassMark } from "@/components/hud/QuestCompass";
import { PauseMenu } from "@/components/menus/PauseMenu";
import { SettingsPanel } from "@/components/menus/SettingsPanel";
import { CharacterCreator } from "@/components/menus/CharacterCreator";
import { Inventory } from "@/components/menus/Inventory";
import { Journal } from "@/components/menus/Journal";
import { SaveLoadPanel } from "@/components/menus/SaveLoadPanel";
import { PostFX } from "@/game/PostFX";






export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Arcane Realms 3D - Aventura RPG del Mago" },
      {
        name: "description",
        content:
          "Plataformero RPG 3D con cámara en tercera persona. Explora tres reinos oscuros, combate enemigos con espada y sube de nivel.",
      },
      { property: "og:title", content: "Arcane Realms 3D" },
      {
        property: "og:description",
        content: "Aventura fantasy oscura en 3D. Combate mágico, stats RPG y tres mundos con iluminación dramática.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

/* ---------------- TYPES ---------------- */
type Vec3 = [number, number, number];
type Platform = { pos: Vec3; size: Vec3; color?: string };
type Enemy = {
  id: number;
  pos: THREE.Vector3;
  hp: number;
  maxHp: number;
  vel: THREE.Vector3;
  kind: "goblin" | "wraith" | "brute" | "archer" | "hopper" | "sentinel" | "dasher";
  alive: boolean;
  hitFlash: number;
  // AI state
  shootTimer?: number;
  jumpTimer?: number;
  dashTimer?: number;
  dashActive?: number;
  patrolCenter?: THREE.Vector3;
  patrolDir?: number;
};
type Pickup = {
  id: number;
  pos: THREE.Vector3;
  kind: "gem" | "hp" | "mp" | "checkpoint";
  taken: boolean;
};
type FloatText = { id: number; pos: THREE.Vector3; text: string; color: string; life: number };
type Projectile = { id: number; pos: THREE.Vector3; vel: THREE.Vector3; life: number };
type EnemyProjectile = { id: number; pos: THREE.Vector3; vel: THREE.Vector3; life: number; dmg: number };

type WorldDef = {
  name: string;
  theme: "grass" | "cave" | "sky" | "grave" | "crypt" | "void" | "ice" | "abyss";
  fog: string;
  ground: string;
  ambient: number;
  fogNear: number;
  fogFar: number;
  difficulty: number; // 1..N multiplier
  platforms: Platform[];
  enemies: { pos: Vec3; kind: Enemy["kind"] }[];
  pickups: { pos: Vec3; kind: Pickup["kind"] }[];
  lava: { pos: Vec3; size: [number, number] }[];
  goal: Vec3;
  spawn: Vec3;
  scare?: { flicker?: boolean; whispers?: boolean; redLight?: boolean };
};

/* ---------------- WORLD GENERATOR ---------------- */
// Build a procedural platform path with escalating difficulty.
function genPath(count: number, startX: number, startY: number, jumpX: number, jumpY: number, width: number, zSwing: number, color: string): Platform[] {
  const plats: Platform[] = [];
  for (let i = 0; i < count; i++) {
    const x = startX + i * jumpX;
    const y = startY + Math.sin(i * 0.7) * jumpY;
    const z = Math.sin(i * 1.3) * zSwing;
    plats.push({ pos: [x, y, z], size: [width, 1, width], color });
    // Secondary smaller floating platform between main ones for extra jumping
    if (i < count - 1) {
      const midX = x + jumpX * 0.5;
      const midY = y + 1.6 + Math.cos(i * 0.9) * 0.8;
      const midZ = -z * 0.6 + Math.cos(i * 1.7) * (zSwing + 1.5);
      plats.push({ pos: [midX, midY, midZ], size: [width * 0.55, 0.6, width * 0.55], color });
    }
    // Tall pillar side-platform every few steps
    if (i % 2 === 1) {
      const sideZ = z + (i % 4 === 1 ? 1 : -1) * (zSwing + 2.5);
      const sideY = y + 2.4;
      plats.push({ pos: [x, sideY, sideZ], size: [width * 0.6, 0.5, width * 0.6], color });
    }
  }
  return plats;
}

/** Generate multiple parallel branch routes offset in Z with varied Y bias.
 * Produces roughly `count * offsets.length` platforms — many alternative
 * paths from start to goal. */
function branches(
  count: number,
  startX: number,
  startY: number,
  jumpX: number,
  jumpY: number,
  width: number,
  color: string,
  offsets: number[] = [-13, -8, 8, 13],
): Platform[] {
  const out: Platform[] = [];
  offsets.forEach((zBase, bi) => {
    const yBias = (bi % 2 === 0 ? 1 : -1) * 1.4 + (bi - 1.5) * 0.4;
    for (let i = 0; i < count; i++) {
      const x = startX + i * jumpX + ((bi % 2) * 0.4 + 0.15) * jumpX;
      const y = startY + yBias + Math.sin(i * 0.55 + bi * 1.7) * jumpY;
      const z = zBase + Math.sin(i * 0.9 + bi * 0.6) * 1.8;
      out.push({ pos: [x, y, z], size: [width * 0.75, 0.7, width * 0.75], color });
      // Occasional stepping stone between branch platforms
      if (i < count - 1 && (i + bi) % 2 === 0) {
        out.push({
          pos: [x + jumpX * 0.5, y + 1.4, z + (bi % 2 === 0 ? 1.6 : -1.6)],
          size: [width * 0.45, 0.5, width * 0.45],
          color,
        });
      }
    }
  });
  return out;
}


function mkEnemies(defs: [number, Enemy["kind"]][], basePlats: Platform[]): { pos: Vec3; kind: Enemy["kind"] }[] {
  return defs.map(([idx, kind]) => {
    const p = basePlats[idx] ?? basePlats[basePlats.length - 1];
    return { pos: [p.pos[0], p.pos[1] + 2, p.pos[2]] as Vec3, kind };
  });
}
function mkPickups(defs: [number, Pickup["kind"]][], basePlats: Platform[]): { pos: Vec3; kind: Pickup["kind"] }[] {
  return defs.map(([idx, kind]) => {
    const p = basePlats[idx] ?? basePlats[basePlats.length - 1];
    return { pos: [p.pos[0], p.pos[1] + 2, p.pos[2]] as Vec3, kind };
  });
}
function lavaLine(startX: number, count: number, spacing: number, size: [number, number] = [3, 6], y = -1.2): { pos: Vec3; size: [number, number] }[] {
  return Array.from({ length: count }, (_, i) => ({ pos: [startX + i * spacing, y, 0] as Vec3, size }));
}

/** Spawn extra enemies scattered across branch platforms. */
function enemiesOnBranches(brs: Platform[], kinds: Enemy["kind"][]): { pos: Vec3; kind: Enemy["kind"] }[] {
  return kinds.map((k, i) => {
    const p = brs[Math.floor(((i + 1) * brs.length) / (kinds.length + 1))] ?? brs[0];
    return { pos: [p.pos[0], p.pos[1] + 2, p.pos[2]] as Vec3, kind: k };
  });
}


/* ---------------- WORLDS ---------------- */
function buildWorlds(): WorldDef[] {
  const worlds: WorldDef[] = [];

  // I - Bosque Maldito
  {
    const mainPath: Platform[] = [
      { pos: [0, -0.5, 0] as Vec3, size: [20, 1, 8] as Vec3, color: "#2a4a2f" },
      ...genPath(6, 14, 2, 8, 1.5, 4, 2, "#3a5a3a"),
      { pos: [62, 3, 0] as Vec3, size: [8, 1, 6] as Vec3, color: "#2a4a2f" },
    ];
    const br = branches(6, 14, 2, 8, 1.5, 4, "#3a5a3a");
    const path = [...mainPath, ...br];
    worlds.push({
      name: "I · Bosque Maldito", theme: "grass", fog: "#0a1810", ground: "#1a2b1e", ambient: 0.35,
      fogNear: 15, fogFar: 55, difficulty: 1, spawn: [0, 2, 0], goal: [62, 5, 0],
      platforms: path,
      enemies: [
        ...mkEnemies([[1, "goblin"], [3, "hopper"], [5, "wraith"], [6, "brute"]], mainPath),
        ...enemiesOnBranches(br, ["hopper", "goblin", "archer", "sentinel"]),
      ],
      pickups: mkPickups([[1, "gem"], [3, "gem"], [4, "hp"], [5, "gem"], [6, "checkpoint"]], mainPath),
      lava: [{ pos: [26, -1.2, 0], size: [3, 4] }, { pos: [42, -1.2, 0], size: [3, 4] }],
    });
  }

  // II - Cementerio Brumoso
  {
    const mainPath: Platform[] = [
      { pos: [0, -0.5, 0] as Vec3, size: [16, 1, 8] as Vec3, color: "#1a1a20" },
      ...genPath(8, 12, 2, 7, 2, 3.2, 3, "#2a2530"),
      { pos: [70, 4, 0] as Vec3, size: [8, 1, 6] as Vec3, color: "#1a1a20" },
    ];
    const br = branches(8, 12, 2, 7, 2, 3.2, "#2a2530");
    const path = [...mainPath, ...br];
    worlds.push({
      name: "II · Cementerio Brumoso", theme: "grave", fog: "#050508", ground: "#0f0f14", ambient: 0.12,
      fogNear: 8, fogFar: 30, difficulty: 1.3, spawn: [0, 2, 0], goal: [70, 6, 0],
      platforms: path,
      enemies: [
        ...mkEnemies([[1, "wraith"], [3, "wraith"], [4, "goblin"], [6, "archer"], [7, "brute"], [8, "wraith"]], mainPath),
        ...enemiesOnBranches(br, ["archer", "wraith", "hopper", "sentinel", "dasher", "archer"]),
      ],
      pickups: mkPickups([[2, "gem"], [4, "checkpoint"], [5, "hp"], [7, "mp"], [8, "gem"]], mainPath),
      lava: [],
      scare: { flicker: true, whispers: true },
    });
  }

  // III - Cavernas Ardientes
  {
    const mainPath: Platform[] = [
      { pos: [0, -0.5, 0] as Vec3, size: [14, 1, 8] as Vec3, color: "#3a1a15" },
      ...genPath(9, 10, 2.5, 6.5, 2, 2.8, 3, "#4a2015"),
      { pos: [70, 6, 0] as Vec3, size: [8, 1, 6] as Vec3, color: "#3a1a15" },
    ];
    const br = branches(9, 10, 2.5, 6.5, 2, 2.8, "#4a2015");
    const path = [...mainPath, ...br];
    worlds.push({
      name: "III · Cavernas Ardientes", theme: "cave", fog: "#1a0808", ground: "#2a1512", ambient: 0.15,
      fogNear: 12, fogFar: 40, difficulty: 1.6, spawn: [0, 2, 0], goal: [70, 8, 0],
      platforms: path,
      enemies: [
        ...mkEnemies([[1, "wraith"], [2, "hopper"], [4, "brute"], [6, "archer"], [7, "dasher"], [8, "wraith"], [9, "brute"]], mainPath),
        ...enemiesOnBranches(br, ["dasher", "archer", "hopper", "sentinel", "dasher", "archer", "hopper"]),
      ],
      pickups: mkPickups([[2, "gem"], [3, "mp"], [5, "checkpoint"], [7, "hp"], [9, "gem"]], mainPath),
      lava: lavaLine(14, 8, 7, [3, 6]),
      scare: { redLight: true },
    });
  }

  // IV - Cripta de Huesos
  {
    const mainPath: Platform[] = [
      { pos: [0, -0.5, 0] as Vec3, size: [12, 1, 8] as Vec3, color: "#2a2520" },
      ...genPath(10, 9, 3, 6, 2.5, 2.4, 4, "#3a3025"),
      { pos: [72, 8, 0] as Vec3, size: [8, 1, 6] as Vec3, color: "#2a2520" },
    ];
    const br = branches(10, 9, 3, 6, 2.5, 2.4, "#3a3025");
    const path = [...mainPath, ...br];
    worlds.push({
      name: "IV · Cripta de Huesos", theme: "crypt", fog: "#080605", ground: "#1a1510", ambient: 0.1,
      fogNear: 7, fogFar: 26, difficulty: 2.0, spawn: [0, 2, 0], goal: [72, 10, 0],
      platforms: path,
      enemies: [
        ...mkEnemies([[1, "brute"], [3, "archer"], [4, "sentinel"], [5, "wraith"], [7, "dasher"], [8, "wraith"], [9, "brute"], [10, "brute"]], mainPath),
        ...enemiesOnBranches(br, ["archer", "hopper", "dasher", "sentinel", "archer", "wraith", "hopper", "dasher"]),
      ],
      pickups: mkPickups([[2, "gem"], [4, "hp"], [6, "checkpoint"], [8, "mp"], [10, "gem"]], mainPath),
      lava: lavaLine(12, 6, 9, [4, 7]),
      scare: { flicker: true, whispers: true, redLight: true },
    });
  }

  // V - Cielos de Sombra
  {
    const base = 10;
    const mainPath: Platform[] = [
      { pos: [0, base, 0] as Vec3, size: [10, 1, 6] as Vec3, color: "#2a2a4a" },
      ...genPath(11, 10, base + 2, 5.5, 3, 2.2, 4, "#2a2a4a"),
      { pos: [72, base + 8, 0] as Vec3, size: [8, 1, 6] as Vec3, color: "#2a2a4a" },
    ];
    const br = branches(11, 10, base + 2, 5.5, 3, 2.2, "#2a2a4a");
    const path = [...mainPath, ...br];
    worlds.push({
      name: "V · Cielos de Sombra", theme: "sky", fog: "#0a0a1e", ground: "#151530", ambient: 0.2,
      fogNear: 10, fogFar: 35, difficulty: 2.5, spawn: [0, base + 2, 0], goal: [72, base + 10, 0],
      platforms: path,
      enemies: [
        ...mkEnemies([[1, "wraith"], [3, "archer"], [4, "brute"], [5, "wraith"], [7, "archer"], [8, "brute"], [9, "wraith"], [10, "dasher"], [11, "brute"]], mainPath),
        ...enemiesOnBranches(br, ["archer", "wraith", "hopper", "dasher", "archer", "wraith", "sentinel", "hopper"]),
      ],
      pickups: mkPickups([[2, "gem"], [4, "hp"], [6, "checkpoint"], [8, "mp"], [10, "gem"], [11, "gem"]], mainPath),
      lava: [],
    });
  }

  // VI - Torre del Vacío
  {
    const mainPath: Platform[] = [
      { pos: [0, 0, 0] as Vec3, size: [8, 1, 8] as Vec3, color: "#1a0a2a" },
      ...genPath(13, 8, 3, 5, 3.5, 2, 5, "#25153a"),
      { pos: [74, 12, 0] as Vec3, size: [8, 1, 6] as Vec3, color: "#1a0a2a" },
    ];
    const br = branches(13, 8, 3, 5, 3.5, 2, "#25153a");
    const path = [...mainPath, ...br];
    worlds.push({
      name: "VI · Torre del Vacío", theme: "void", fog: "#02020a", ground: "#080810", ambient: 0.08,
      fogNear: 6, fogFar: 22, difficulty: 3.0, spawn: [0, 2, 0], goal: [74, 14, 0],
      platforms: path,
      enemies: [
        ...mkEnemies([[1, "wraith"], [2, "sentinel"], [3, "archer"], [4, "brute"], [6, "dasher"], [7, "brute"], [8, "wraith"], [9, "hopper"], [10, "archer"], [11, "brute"], [13, "sentinel"]], mainPath),
        ...enemiesOnBranches(br, ["dasher", "archer", "hopper", "sentinel", "dasher", "archer", "wraith", "hopper", "brute"]),
      ],
      pickups: mkPickups([[2, "gem"], [5, "checkpoint"], [7, "hp"], [9, "mp"], [11, "gem"], [12, "gem"]], mainPath),
      lava: [],
      scare: { flicker: true, whispers: true },
    });
  }

  // VII - Infierno Congelado
  {
    const mainPath: Platform[] = [
      { pos: [0, -0.5, 0] as Vec3, size: [10, 1, 8] as Vec3, color: "#1a2a3a" },
      ...genPath(14, 9, 2, 5, 3, 1.8, 5, "#2a3a4f" ),
      { pos: [76, 6, 0] as Vec3, size: [8, 1, 6] as Vec3, color: "#1a2a3a" },
    ];
    const br = branches(14, 9, 2, 5, 3, 1.8, "#2a3a4f");
    const path = [...mainPath, ...br];
    worlds.push({
      name: "VII · Infierno Congelado", theme: "ice", fog: "#0a0a15", ground: "#1a1f2a", ambient: 0.12,
      fogNear: 8, fogFar: 28, difficulty: 3.6, spawn: [0, 2, 0], goal: [76, 8, 0],
      platforms: path,
      enemies: [
        ...mkEnemies([[1, "archer"], [2, "brute"], [3, "wraith"], [4, "dasher"], [5, "wraith"], [7, "sentinel"], [8, "brute"], [9, "archer"], [10, "brute"], [11, "hopper"], [12, "dasher"], [13, "brute"], [14, "wraith"]], mainPath),
        ...enemiesOnBranches(br, ["archer", "dasher", "hopper", "sentinel", "archer", "wraith", "dasher", "hopper", "sentinel", "brute"]),
      ],
      pickups: mkPickups([[2, "gem"], [4, "hp"], [6, "checkpoint"], [8, "mp"], [10, "gem"], [12, "hp"], [14, "gem"]], mainPath),
      lava: lavaLine(14, 8, 8, [4, 7]),
      scare: { redLight: true, whispers: true },
    });
  }

  // VIII - Abismo Final
  {
    const mainPath: Platform[] = [
      { pos: [0, -0.5, 0] as Vec3, size: [10, 1, 8] as Vec3, color: "#20050a" },
      ...genPath(16, 9, 3, 4.5, 4, 1.6, 6, "#35060a"),
      { pos: [80, 10, 0] as Vec3, size: [10, 1, 8] as Vec3, color: "#40080a" },
    ];
    const br = branches(16, 9, 3, 4.5, 4, 1.6, "#35060a");
    const path = [...mainPath, ...br];
    worlds.push({
      name: "VIII · Abismo Final", theme: "abyss", fog: "#08000a", ground: "#180008", ambient: 0.05,
      fogNear: 5, fogFar: 18, difficulty: 4.5, spawn: [0, 2, 0], goal: [80, 12, 0],
      platforms: path,
      enemies: [
        ...mkEnemies([
          [1, "brute"], [2, "archer"], [3, "sentinel"], [4, "brute"], [5, "dasher"], [6, "brute"],
          [7, "hopper"], [8, "wraith"], [9, "archer"], [10, "brute"], [11, "wraith"], [12, "sentinel"],
          [13, "dasher"], [14, "wraith"], [15, "brute"], [16, "archer"],
        ], mainPath),
        ...enemiesOnBranches(br, ["archer", "dasher", "hopper", "sentinel", "archer", "wraith", "dasher", "hopper", "sentinel", "brute", "archer", "dasher"]),
      ],
      pickups: mkPickups([[2, "gem"], [4, "hp"], [6, "checkpoint"], [8, "mp"], [10, "hp"], [12, "checkpoint"], [14, "mp"], [16, "gem"]], mainPath),
      lava: lavaLine(12, 10, 8, [5, 8]),
      scare: { flicker: true, whispers: true, redLight: true },
    });
  }

  return worlds;
}
const WORLDS: WorldDef[] = buildWorlds();

const GRAVITY = -30;
const JUMP_V = 17;
const MOVE_SPEED = 10;
const AIR_CONTROL = 1.0;
const COYOTE_TIME = 0.12;
const JUMP_BUFFER = 0.12;
const ATTACK_RANGE = 2.6;
const ATTACK_COOLDOWN = 0.28;
const PROJECTILE_SPEED = 32;
const PROJECTILE_LIFE = 1.2;
const PROJECTILE_RADIUS = 0.35;
const ENEMY_RENDER_DISTANCE_SQ = 32 * 32;

/* ---------------- INPUT ---------------- */
type Keys = {
  fwd: boolean; back: boolean; left: boolean; right: boolean;
  jump: boolean; attack: boolean; pot1: boolean; pot2: boolean;
  camFree: boolean; run: boolean;
};
function useKeys() {
  const keys = useRef<Keys>({
    fwd: false, back: false, left: false, right: false,
    jump: false, attack: false, pot1: false, pot2: false,
    camFree: false, run: false,
  });
  useEffect(() => {
    const map = (e: KeyboardEvent, v: boolean) => {
      // Read bindings from store at event time (updated live via settings)
      const b = useGame.getState().bindings;
      const c = e.code;
      // Movement / actions (rebindable)
      if (c === b.fwd) keys.current.fwd = v;
      else if (c === b.back) keys.current.back = v;
      else if (c === b.left) keys.current.left = v;
      else if (c === b.right) keys.current.right = v;
      else if (c === b.jump) { keys.current.jump = v; e.preventDefault(); }
      else if (c === b.attack) keys.current.attack = v;
      else if (c === b.pot1) keys.current.pot1 = v;
      else if (c === b.pot2) keys.current.pot2 = v;
      else if (c === b.camFree) { keys.current.camFree = v; e.preventDefault(); }
      else if (c === b.run) keys.current.run = v;

      // Single-shot menu / toggle keys (only on keydown)
      if (v) {
        const s = useGame.getState();
        if (c === b.pause) {
          if (s.activeMenu) s.setMenu(null);
          else s.setMenu("pause");
        } else if (c === b.inventory) {
          s.setMenu(s.activeMenu === "inventory" ? null : "inventory");
        } else if (c === b.journal) {
          s.setMenu(s.activeMenu === "journal" ? null : "journal");
        } else if (c === b.flashlight) {
          s.toggleFlashlight();
        } else if (c === "KeyH") {
          s.toggleHud();
        }
      }
    };

    const dn = (e: KeyboardEvent) => map(e, true);
    const up = (e: KeyboardEvent) => map(e, false);
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", dn); window.removeEventListener("keyup", up); };
  }, []);
  return keys;
}


/* ---------------- STATS ---------------- */
type Stats = {
  hp: number; maxHp: number;
  mp: number; maxMp: number;
  xp: number; xpNext: number; level: number;
  str: number; def: number;
  gold: number;
  potHp: number; potMp: number;
  lives: number;
};
const initialStats = (): Stats => ({
  hp: 100, maxHp: 100, mp: 50, maxMp: 50,
  xp: 0, xpNext: 100, level: 1,
  str: 10, def: 3, gold: 0,
  potHp: 2, potMp: 1, lives: 3,
});

/* ---------------- COLLISION ---------------- */
function aabb(px: number, py: number, pz: number, r: number, h: number, plats: Platform[]) {
  // Returns landed platform Y (top) if standing on one, else null
  for (const p of plats) {
    const [x, y, z] = p.pos;
    const [sx, sy, sz] = p.size;
    const minX = x - sx / 2, maxX = x + sx / 2;
    const minZ = z - sz / 2, maxZ = z + sz / 2;
    const topY = y + sy / 2;
    if (px + r > minX && px - r < maxX && pz + r > minZ && pz - r < maxZ) {
      if (py <= topY + 0.05 && py >= topY - 0.5) return topY;
    }
  }
  return null;
}

function blocked(px: number, py: number, pz: number, r: number, h: number, plats: Platform[]) {
  for (const p of plats) {
    const [x, y, z] = p.pos;
    const [sx, sy, sz] = p.size;
    const minX = x - sx / 2, maxX = x + sx / 2;
    const minZ = z - sz / 2, maxZ = z + sz / 2;
    const minY = y - sy / 2, maxY = y + sy / 2;
    if (px + r > minX && px - r < maxX &&
        pz + r > minZ && pz - r < maxZ &&
        py + h > minY + 0.1 && py < maxY - 0.1) return true;
  }
  return false;
}
/* ---------------- HERO (rigged 3D GLB with skeletal animations) ---------------- */

function Mage({ posRef, facingRef, attackingRef, walkPhaseRef }: {
  posRef: React.MutableRefObject<THREE.Vector3>;
  facingRef: React.MutableRefObject<number>;
  attackingRef: React.MutableRefObject<number>;
  walkPhaseRef: React.MutableRefObject<number>;
}) {
  const group = useRef<THREE.Group>(null!);
  const swordRef = useRef<THREE.Group>(null!);
  const bonesRef = useRef<{
    rightArm?: THREE.Object3D;
    rightForeArm?: THREE.Object3D;
    spine?: THREE.Object3D;
    spine1?: THREE.Object3D;
    spine2?: THREE.Object3D;
    neck?: THREE.Object3D;
    rightHand?: THREE.Object3D;
    leftHand?: THREE.Object3D;
    head?: THREE.Object3D;
    hips?: THREE.Object3D;
    leftShoulder?: THREE.Object3D;
    rightShoulder?: THREE.Object3D;
    leftArm?: THREE.Object3D;
    leftForeArm?: THREE.Object3D;
    leftUpLeg?: THREE.Object3D;
    leftLeg?: THREE.Object3D;
    leftFoot?: THREE.Object3D;
    rightUpLeg?: THREE.Object3D;
    rightLeg?: THREE.Object3D;
    rightFoot?: THREE.Object3D;
    base: {
      rightArm?: THREE.Euler;
      rightForeArm?: THREE.Euler;
      spine1?: THREE.Euler;
    };
  }>({ base: {} });


  const appearanceGender = useGame((s) => s.appearance.gender);
  // Male loads only the soldier rig. Female additionally loads Michelle while
  // still reusing the soldier animation clips.
  const soldierGltf = useGLTF(soldierAsset.url) as unknown as {
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
  };
  const modelUrl = appearanceGender === "female" ? michelleAsset.url : soldierAsset.url;
  const modelGltf = useGLTF(modelUrl) as unknown as {
    scene: THREE.Group;
    animations: THREE.AnimationClip[];
  };
  const gltf = appearanceGender === "female" ? modelGltf : soldierGltf;
  const cloned = useMemo(() => {
    const c = SkeletonUtils.clone(gltf.scene) as THREE.Group;
    // Keep both genders controlled only by the outer group rotation so movement
    // and facing stay in sync with the shared facingRef direction.
    return c;
  }, [gltf.scene]);

  // Cache each mesh's original base color so appearance tint can be recomputed
  // live without permanently darkening the material.
  const matCacheRef = useRef<{ mat: THREE.MeshStandardMaterial; base: THREE.Color; role: "cloth" | "skin" | "hair" | "accent" }[]>([]);

  useEffect(() => {
    matCacheRef.current = [];
    cloned.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const raw of mats) {
          const mat = raw as THREE.MeshStandardMaterial | undefined;
          if (!mat || !("color" in mat) || !mat.color) continue;
          const name = (mat.name || m.name || "").toLowerCase();
          let role: "cloth" | "skin" | "hair" | "accent" = "cloth";
          if (name.includes("skin") || name.includes("body") || name.includes("face") || name.includes("head")) role = "skin";
          else if (name.includes("hair") || name.includes("beard")) role = "hair";
          else if (name.includes("metal") || name.includes("gem") || name.includes("trim") || name.includes("accent")) role = "accent";
          matCacheRef.current.push({ mat, base: mat.color.clone(), role });
        }
      }
      const name = (o.name || "").replace(/[:_]/g, "");
      if (name === "mixamorigRightArm") { bonesRef.current.rightArm = o; }
      else if (name === "mixamorigRightForeArm") bonesRef.current.rightForeArm = o;
      else if (name === "mixamorigSpine") bonesRef.current.spine = o;
      else if (name === "mixamorigSpine1") bonesRef.current.spine1 = o;
      else if (name === "mixamorigSpine2") bonesRef.current.spine2 = o;
      else if (name === "mixamorigNeck") bonesRef.current.neck = o;
      else if (name === "mixamorigRightHand") bonesRef.current.rightHand = o;
      else if (name === "mixamorigLeftHand") bonesRef.current.leftHand = o;
      else if (name === "mixamorigHead") bonesRef.current.head = o;
      else if (name === "mixamorigHips") bonesRef.current.hips = o;
      else if (name === "mixamorigLeftShoulder") bonesRef.current.leftShoulder = o;
      else if (name === "mixamorigRightShoulder") bonesRef.current.rightShoulder = o;
      else if (name === "mixamorigLeftArm") bonesRef.current.leftArm = o;
      else if (name === "mixamorigLeftForeArm") bonesRef.current.leftForeArm = o;
      else if (name === "mixamorigLeftUpLeg") bonesRef.current.leftUpLeg = o;
      else if (name === "mixamorigLeftLeg") bonesRef.current.leftLeg = o;
      else if (name === "mixamorigLeftFoot") bonesRef.current.leftFoot = o;
      else if (name === "mixamorigRightUpLeg") bonesRef.current.rightUpLeg = o;
      else if (name === "mixamorigRightLeg") bonesRef.current.rightLeg = o;
      else if (name === "mixamorigRightFoot") bonesRef.current.rightFoot = o;
    });
  }, [cloned]);

  // Live re-tint whenever appearance changes.
  const appearance = useGame((s) => s.appearance);
  useEffect(() => {
    // "Sensual" female override: vino/rojo profundo + acentos dorados y piel cálida.
    const isFemale = appearanceGender === "female";
    const sensualCloth = "#6b1420"; // vino intenso
    const sensualAccent = "#d4a24a"; // dorado
    const sensualSkin = "#d9a48a"; // piel cálida
    const tintFor = (role: "cloth" | "skin" | "hair" | "accent") => {
      if (isFemale) {
        if (role === "cloth") return sensualCloth;
        if (role === "accent") return sensualAccent;
        if (role === "skin") return sensualSkin;
      }
      return role === "skin" ? appearance.skinTint
        : role === "hair" ? appearance.hairTint
        : role === "accent" ? appearance.accentTint
        : appearance.clothTint;
    };
    const tmp = new THREE.Color();
    for (const rec of matCacheRef.current) {
      tmp.set(tintFor(rec.role));
      const blend = isFemale ? 0.85 : 0.7;
      const darken = isFemale ? 0.95 : 0.9;
      rec.mat.color.copy(rec.base).lerp(tmp, blend).multiplyScalar(darken);
    }
  }, [appearance, cloned, appearanceGender]);


  // (Female body pass removed: Michelle GLB is used directly for the female look.)









  // Always drive with the soldier animation clips (Idle, Run, etc). Michelle
  // shares the mixamorig* bone naming so the clips retarget onto her rig
  // through three's AnimationMixer automatically.
  const { actions } = useAnimations(soldierGltf.animations, cloned);
  const actionsRef = useRef(actions);
  actionsRef.current = actions;
  const currentAction = useRef<string>("");
  const prevWalkPhase = useRef(0);

  const switchTo = (name: string, fade = 0.2, timeScale = 1) => {
    const next = actionsRef.current[name];
    if (!next) return;
    if (currentAction.current === name) {
      next.setEffectiveTimeScale(timeScale);
      return;
    }
    const prev = actionsRef.current[currentAction.current];
    next.reset().setEffectiveTimeScale(timeScale).setEffectiveWeight(1).fadeIn(fade).play();
    if (prev) prev.fadeOut(fade);
    currentAction.current = name;
  };

  // Bind Idle when the animation set changes (mount, gender/model swap).
  useEffect(() => {
    currentAction.current = "";
    const idle = actions["Idle"];
    if (idle) {
      idle.reset().setEffectiveWeight(1).play();
      currentAction.current = "Idle";
    }
    return () => { Object.values(actionsRef.current).forEach((a) => a?.stop()); };
  }, [actions]);


  // Priority 1: run AFTER the animation mixer so our bone offsets aren't
  // overwritten by the clip evaluator.
  useFrame(() => {

    if (!group.current) return;

    group.current.position.set(posRef.current.x, posRef.current.y, posRef.current.z);
    group.current.rotation.y = facingRef.current + Math.PI;

    const wp = walkPhaseRef.current;
    const walking = Math.abs(wp - prevWalkPhase.current) > 0.0005;
    prevWalkPhase.current = wp;

    if (walking) {
      switchTo("Run", 0.18, 1.35);
    } else {
      switchTo("Idle", 0.22, 1);
    }
  });

  // Keep the sword visually locked to the right hand without re-parenting it
  // into the animated skeleton (that caused visibility/freeze issues).
  const tmpPos = useRef(new THREE.Vector3()).current;
  const tmpQuat = useRef(new THREE.Quaternion()).current;
  const tmpParentQuat = useRef(new THREE.Quaternion()).current;
  const tmpOffset = useRef(new THREE.Vector3()).current;
  // Palm sits ~15cm past the wrist along the fingers (+Y in Mixamo hand
  // local space). Rotating the sword -90° around Z aligns its +Y (blade) with
  // the hand's +X (grip axis when the fingers curl around the hilt), so the
  // hilt sits inside the palm and the blade extends forward.
  const handOffsetPos = useRef(new THREE.Vector3(0, 0.14, 0)).current;
  const handOffsetQuat = useRef(
    new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -Math.PI / 2)),
  ).current;

  useFrame(() => {
    const b = bonesRef.current;

    if (b.rightArm && !b.base.rightArm) b.base.rightArm = b.rightArm.rotation.clone();
    if (b.rightForeArm && !b.base.rightForeArm) b.base.rightForeArm = b.rightForeArm.rotation.clone();
    if (b.spine1 && !b.base.spine1) b.base.spine1 = b.spine1.rotation.clone();

    const atk = Math.max(0, Math.min(1, attackingRef.current));
    // Two-phase swing: wind-up then chop (smoother, less mechanical).
    const t = 1 - atk;
    const windup = Math.max(0, Math.min(1, (0.35 - Math.abs(t - 0.2)) / 0.35));
    const chop = Math.max(0, Math.min(1, (0.5 - Math.abs(t - 0.65)) / 0.5));
    const s = chop - windup * 0.35;

    if (b.rightArm && b.base.rightArm) {
      const base = b.base.rightArm;
      b.rightArm.rotation.set(base.x - s * 1.5, base.y - s * 0.2, base.z + s * 0.35);
    }
    if (b.rightForeArm && b.base.rightForeArm) {
      const base = b.base.rightForeArm;
      b.rightForeArm.rotation.set(base.x - s * 0.6, base.y - s * 1.0, base.z);
    }
    if (b.spine1 && b.base.spine1) {
      const base = b.base.spine1;
      b.spine1.rotation.set(base.x + s * 0.12, base.y - s * 0.3, base.z);
    }

    // Snap sword to hand each frame using position/quaternion only. This avoids
    // matrix decomposition and per-frame allocations that could hang the game.
    if (b.rightHand && swordRef.current && group.current) {
      b.rightHand.getWorldPosition(tmpPos);
      b.rightHand.getWorldQuaternion(tmpQuat);
      group.current.worldToLocal(tmpPos);
      group.current.getWorldQuaternion(tmpParentQuat).invert();
      tmpQuat.premultiply(tmpParentQuat);
      tmpOffset.copy(handOffsetPos).applyQuaternion(tmpQuat);
      swordRef.current.position.copy(tmpPos).add(tmpOffset);
      swordRef.current.quaternion.copy(tmpQuat).multiply(handOffsetQuat);
    }

    // Flashlight: follow the left hand position, but keep it always aimed to
    // where the character is facing (hero-forward = local -Z), so the beam
    // never swings around with hand animation.
    if (b.leftHand && flashlightRef.current && group.current) {
      b.leftHand.getWorldPosition(tmpPos);
      group.current.worldToLocal(tmpPos);
      tmpOffset.set(0.06, -0.02, -0.08); // slight offset forward of the hand
      flashlightRef.current.position.copy(tmpPos).add(tmpOffset);
      flashlightRef.current.rotation.set(Math.PI / 2, 0, 0);
    }

  });



  const spotRef = useRef<THREE.SpotLight>(null!);
  const spotTargetRef = useRef<THREE.Object3D>(null!);
  const flashlightRef = useRef<THREE.Group>(null!);
  const flashOffsetPos = useRef(new THREE.Vector3(0.04, -0.02, 0.05)).current;
  const flashOffsetQuat = useRef(
    new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, -Math.PI / 2, Math.PI / 2)),
  ).current;
  useEffect(() => {
    if (spotRef.current && spotTargetRef.current) {
      spotRef.current.target = spotTargetRef.current;
    }
  }, []);
  const flashlightOn = useGame((s) => s.flashlightOn);
  const battery = useGame((s) => s.battery);
  const lightActive = flashlightOn && battery > 0;
  const lightIntensity = lightActive ? 16 * Math.min(1, battery / 30) : 0;

  // Michelle.glb is authored facing the opposite way from the soldier rig;
  // rotate only the visible model, not the movement/facing controller.
  const modelYawOffset = appearanceGender === "female" ? Math.PI : 0;

  const scaleX = 1.05 * appearance.build;
  const scaleY = 1.05 * appearance.height;
  const scaleZ = 1.05 * appearance.build;
  const modelYOffset = 0;

  return (
    <group ref={group} scale={[scaleX, scaleY, scaleZ]}>
      <group rotation={[0, modelYawOffset, 0]} position={[0, modelYOffset, 0]}>
        <primitive object={cloned} />
      </group>

      {/* Linterna sujeta por la mano izquierda: cuerpo + haz de luz hacia adelante */}
      <group ref={flashlightRef} visible={lightActive}>

        {/* mango */}
        <mesh castShadow position={[0, 0, 0]}>
          <cylinderGeometry args={[0.035, 0.04, 0.22, 14]} />
          <meshStandardMaterial color="#141416" metalness={0.7} roughness={0.35} />
        </mesh>
        {/* cabezal */}
        <mesh castShadow position={[0, -0.16, 0]}>
          <cylinderGeometry args={[0.06, 0.045, 0.1, 16]} />
          <meshStandardMaterial color="#2a2a2e" metalness={0.85} roughness={0.25} />
        </mesh>
        {/* lente brillante */}
        <mesh position={[0, -0.215, 0]}>
          <cylinderGeometry args={[0.055, 0.055, 0.01, 20]} />
          <meshStandardMaterial color="#fff2c8" emissive="#fff2c8" emissiveIntensity={2.2} roughness={0.15} />
        </mesh>
        {/* haz principal */}
        <spotLight
          ref={spotRef}
          position={[0, -0.22, 0]}
          angle={0.55}
          penumbra={0.7}
          intensity={lightIntensity}
          distance={20}
          decay={1.2}
          color="#fff2c8"
          castShadow={false}
        />


        {/* target lejano en el eje -Y local (dirección del cabezal) */}
        <object3D ref={spotTargetRef} position={[0, -12, 0]} />
        {/* halo cercano para no dejar el cuerpo a oscuras */}
        <pointLight position={[0, -0.24, 0]} color="#ffd89a" intensity={0.9} distance={2.2} decay={2} />
      </group>

      {/* Gun — its transform is driven each frame from the right-hand bone.
          Local +Y in this group points along the hand's grip axis (forward),
          so the barrel extends along +Y and the grip hangs on -Z. */}
      <group ref={swordRef}>
        {/* Grip (held in the palm) */}
        <mesh position={[0, -0.02, -0.08]} rotation={[0.25, 0, 0]} castShadow>
          <boxGeometry args={[0.06, 0.18, 0.09]} />
          <meshStandardMaterial color="#1b1d22" roughness={0.6} metalness={0.4} />
        </mesh>
        {/* Receiver / body */}
        <mesh position={[0, 0.08, 0]} castShadow>
          <boxGeometry args={[0.08, 0.22, 0.12]} />
          <meshStandardMaterial color="#2b2f36" metalness={0.75} roughness={0.35} />
        </mesh>
        {/* Barrel */}
        <mesh position={[0, 0.32, 0.02]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.035, 0.32, 14]} />
          <meshStandardMaterial color="#3a4048" metalness={0.9} roughness={0.25} />
        </mesh>
        {/* Muzzle tip (glow) */}
        <mesh position={[0, 0.5, 0.02]}>
          <sphereGeometry args={[0.045, 12, 10]} />
          <meshStandardMaterial color="#7ad6ff" emissive="#4ac6ff" emissiveIntensity={1.8} roughness={0.2} />
        </mesh>
        {/* Sight rail */}
        <mesh position={[0, 0.14, 0.09]} castShadow>
          <boxGeometry args={[0.04, 0.14, 0.02]} />
          <meshStandardMaterial color="#0f1114" metalness={0.6} roughness={0.5} />
        </mesh>
        {/* Trigger guard */}
        <mesh position={[0, 0.02, -0.02]} castShadow>
          <torusGeometry args={[0.045, 0.008, 8, 16, Math.PI]} />
          <meshStandardMaterial color="#1b1d22" metalness={0.6} roughness={0.5} />
        </mesh>
      </group>

    </group>
  );
}

const MageMemo = React.memo(Mage);

/* ---------------- PROJECTILE (Fireball) ---------------- */
function ProjectileMesh({ pr }: { pr: Projectile }) {
  const ref = useRef<THREE.Group>(null!);
  const coreRef = useRef<THREE.Mesh>(null!);
  const flameRef = useRef<THREE.Mesh>(null!);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.position.copy(pr.pos);
    ref.current.visible = pr.life > 0;
    const t = performance.now() * 0.01;
    if (coreRef.current) {
      const s = 1 + Math.sin(t) * 0.08;
      coreRef.current.scale.setScalar(s);
    }
    if (flameRef.current) {
      flameRef.current.rotation.x += dt * 6;
      flameRef.current.rotation.y += dt * 5;
      const s = 1 + Math.sin(t * 1.7) * 0.15;
      flameRef.current.scale.setScalar(s);
    }
  });
  return (
    <group ref={ref}>
      {/* Bright hot core */}
      <mesh ref={coreRef} castShadow>
        <sphereGeometry args={[0.16, 14, 12]} />
        <meshStandardMaterial color="#fff2b0" emissive="#ffde66" emissiveIntensity={3.2} roughness={0.3} />
      </mesh>
      {/* Outer flame shell */}
      <mesh ref={flameRef}>
        <sphereGeometry args={[0.28, 14, 12]} />
        <meshStandardMaterial
          color="#ff7a1a"
          emissive="#ff4a08"
          emissiveIntensity={2.4}
          transparent
          opacity={0.75}
          roughness={0.6}
        />
      </mesh>
      {/* Fire glow */}
      <pointLight color="#ff8a3a" intensity={2.6} distance={5} decay={2} />
    </group>
  );
}

/* Enemy fireball projectile — smaller, redder than the player's shot. */
function EnemyProjectileMesh({ pr }: { pr: EnemyProjectile }) {
  const ref = useRef<THREE.Group>(null!);
  const flameRef = useRef<THREE.Mesh>(null!);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.position.copy(pr.pos);
    ref.current.visible = pr.life > 0;
    if (flameRef.current) {
      flameRef.current.rotation.x += dt * 8;
      flameRef.current.rotation.y += dt * 7;
    }
  });
  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry args={[0.13, 12, 10]} />
        <meshStandardMaterial color="#ffd080" emissive="#ff8020" emissiveIntensity={3} roughness={0.3} />
      </mesh>
      <mesh ref={flameRef}>
        <sphereGeometry args={[0.22, 12, 10]} />
        <meshStandardMaterial color="#ff4020" emissive="#ff2000" emissiveIntensity={2.2} transparent opacity={0.7} roughness={0.6} />
      </mesh>
      <pointLight color="#ff6030" intensity={1.6} distance={3.5} decay={2} />
    </group>
  );
}














/* ---------------- ENEMY ---------------- */
/* ---------------- ENEMY ---------------- */
// Realistic enemies reuse the same rigged human GLB as the hero, with
// per-kind tinting, scale, and a weapon prop. This gives real skeletal
// animation instead of primitive limbs.
function EnemyMesh({ e, playerRef }: { e: Enemy; playerRef: React.MutableRefObject<THREE.Vector3> }) {
  const ref = useRef<THREE.Group>(null!);
  const lastPos = useRef(new THREE.Vector3(e.pos.x, e.pos.y, e.pos.z));
  const leftArm = useRef<THREE.Group>(null!);
  const rightArm = useRef<THREE.Group>(null!);
  const leftLeg = useRef<THREE.Group>(null!);
  const rightLeg = useRef<THREE.Group>(null!);
  const head = useRef<THREE.Group>(null!);
  const phase = useRef(Math.random() * 10);
  const baseScale =
    e.kind === "brute" || e.kind === "sentinel" ? 1.15 :
    e.kind === "wraith" || e.kind === "archer" ? 1.0 :
    e.kind === "hopper" ? 0.85 :
    e.kind === "dasher" ? 0.95 :
    0.95;
  const tint =
    e.kind === "archer" ? "#a060ff" :
    e.kind === "hopper" ? "#40ff80" :
    e.kind === "sentinel" ? "#6080ff" :
    e.kind === "dasher" ? "#ff4060" :
    null;

  useFrame((_state, dt) => {
    if (!ref.current) return;
    ref.current.position.copy(e.pos);
    const visible = e.alive && e.pos.distanceToSquared(playerRef.current) < ENEMY_RENDER_DISTANCE_SQ;
    ref.current.visible = visible;
    if (!visible) return;

    const dx = e.pos.x - lastPos.current.x;
    const dz = e.pos.z - lastPos.current.z;
    const speed = Math.hypot(dx, dz) / Math.max(dt, 0.0001);
    if (Math.abs(dx) + Math.abs(dz) > 0.0005) {
      ref.current.rotation.y = Math.atan2(dx, dz) + Math.PI;
    }
    lastPos.current.set(e.pos.x, e.pos.y, e.pos.z);

    const stride = Math.min(1, speed / 3);
    phase.current += dt * (2 + stride * 5);
    const swing = Math.sin(phase.current) * (0.15 + stride * 0.7);
    if (leftArm.current) leftArm.current.rotation.x = swing;
    if (rightArm.current) rightArm.current.rotation.x = -swing;
    if (leftLeg.current) leftLeg.current.rotation.x = -swing * 0.9;
    if (rightLeg.current) rightLeg.current.rotation.x = swing * 0.9;
    if (head.current) head.current.rotation.z = Math.sin(phase.current * 0.5) * 0.04;

    const flash = Math.max(0, Math.min(1, e.hitFlash / 0.15));
    ref.current.scale.setScalar(baseScale * (1 + flash * 0.08));
  });

  const limbs = { s: 1, leftArm, rightArm, leftLeg, rightLeg, head };
  return (
    <group ref={ref} scale={baseScale}>
      {e.kind === "goblin" && <GoblinBody {...limbs} />}
      {e.kind === "wraith" && <WraithBody {...limbs} id={e.id} />}
      {e.kind === "brute" && <BruteBody {...limbs} />}
      {e.kind === "archer" && <WraithBody {...limbs} id={e.id} />}
      {e.kind === "hopper" && <GoblinBody {...limbs} />}
      {e.kind === "sentinel" && <BruteBody {...limbs} />}
      {e.kind === "dasher" && <GoblinBody {...limbs} />}

      {/* Tint aura for new kinds so they read distinctly at a glance */}
      {tint && (
        <>
          <mesh position={[0, 1.4, 0]}>
            <sphereGeometry args={[0.55, 12, 10]} />
            <meshBasicMaterial color={tint} transparent opacity={0.12} />
          </mesh>
        </>
      )}

      {/* Health bar */}
      {e.alive && e.hp < e.maxHp && (
        <group position={[0, 3, 0]}>
          <mesh>
            <planeGeometry args={[1, 0.12]} />
            <meshBasicMaterial color="#200" />
          </mesh>
          <mesh position={[-(1 - e.hp / e.maxHp) / 2, 0, 0.01]}>
            <planeGeometry args={[e.hp / e.maxHp, 0.1]} />
            <meshBasicMaterial color="#e04040" />
          </mesh>
        </group>
      )}
    </group>
  );
}

/* ---- Enemy body variants: near-human anatomy ---- */
type LimbRefs = {
  s: number;
  leftArm: React.MutableRefObject<THREE.Group>;
  rightArm: React.MutableRefObject<THREE.Group>;
  leftLeg: React.MutableRefObject<THREE.Group>;
  rightLeg: React.MutableRefObject<THREE.Group>;
  head: React.MutableRefObject<THREE.Group>;
};

/** Bandit (male): hooded human warrior with leather armor and a curved blade. */
function GoblinBody({ s, leftArm, rightArm, leftLeg, rightLeg, head }: LimbRefs) {
  const skin = "#c9a181";
  const skinShade = "#a07a5a";
  const leather = "#3a2618";
  const leatherHi = "#5a3a24";
  const cloth = "#4a3020";
  const pants = "#2a1e14";
  const metal = "#7a7a80";
  const beard = "#1a1208";
  const hipY = s * 1.2;
  const shoulderY = s * 2.0;
  const headY = s * 2.35;
  const legY = s * 0.95;
  return (
    <group>
      {/* Legs — cloth pants + leather boots */}
      <group ref={leftLeg} position={[-0.18 * s, hipY, 0]}>
        <mesh castShadow position={[0, -legY * 0.4, 0]}>
          <capsuleGeometry args={[0.12 * s, legY * 0.55, 4, 8]} />
          <meshStandardMaterial color={pants} roughness={0.95} />
        </mesh>
        <mesh castShadow position={[0, -legY * 0.9, 0.03 * s]}>
          <boxGeometry args={[0.22 * s, 0.2 * s, 0.3 * s]} />
          <meshStandardMaterial color={leather} roughness={0.8} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.18 * s, hipY, 0]}>
        <mesh castShadow position={[0, -legY * 0.4, 0]}>
          <capsuleGeometry args={[0.12 * s, legY * 0.55, 4, 8]} />
          <meshStandardMaterial color={pants} roughness={0.95} />
        </mesh>
        <mesh castShadow position={[0, -legY * 0.9, 0.03 * s]}>
          <boxGeometry args={[0.22 * s, 0.2 * s, 0.3 * s]} />
          <meshStandardMaterial color={leather} roughness={0.8} />
        </mesh>
      </group>
      {/* Belt */}
      <mesh position={[0, hipY + 0.02 * s, 0]} castShadow>
        <cylinderGeometry args={[0.3 * s, 0.32 * s, 0.12 * s, 12]} />
        <meshStandardMaterial color={leather} roughness={0.9} />
      </mesh>
      <mesh position={[0, hipY + 0.02 * s, 0.32 * s]}>
        <boxGeometry args={[0.09 * s, 0.09 * s, 0.02 * s]} />
        <meshStandardMaterial color="#b8942a" metalness={0.7} roughness={0.4} />
      </mesh>
      {/* Torso — leather cuirass over tunic */}
      <mesh position={[0, (hipY + shoulderY) / 2 + 0.05, 0]} castShadow>
        <capsuleGeometry args={[0.32 * s, 0.5 * s, 4, 10]} />
        <meshStandardMaterial color={cloth} roughness={0.95} />
      </mesh>
      <mesh position={[0, (hipY + shoulderY) / 2 + 0.05, 0]} castShadow>
        <boxGeometry args={[0.62 * s, 0.7 * s, 0.42 * s]} />
        <meshStandardMaterial color={leatherHi} roughness={0.85} />
      </mesh>
      {/* Straps */}
      <mesh position={[-0.15 * s, (hipY + shoulderY) / 2 + 0.05, 0.22 * s]} rotation={[0, 0, 0.2]}>
        <boxGeometry args={[0.06 * s, 0.75 * s, 0.02 * s]} />
        <meshStandardMaterial color={leather} />
      </mesh>
      {/* Arms — human, sleeved tunic then bare forearms with wraps */}
      <group ref={leftArm} position={[-0.36 * s, shoulderY, 0]}>
        <mesh castShadow position={[0, -0.28 * s, 0]}>
          <capsuleGeometry args={[0.11 * s, 0.42 * s, 4, 8]} />
          <meshStandardMaterial color={cloth} roughness={0.95} />
        </mesh>
        <mesh castShadow position={[0, -0.68 * s, 0]}>
          <capsuleGeometry args={[0.09 * s, 0.36 * s, 4, 8]} />
          <meshStandardMaterial color={skin} roughness={0.85} />
        </mesh>
        {/* Wrist wrap */}
        <mesh position={[0, -0.85 * s, 0]}>
          <cylinderGeometry args={[0.1 * s, 0.1 * s, 0.08 * s, 8]} />
          <meshStandardMaterial color={leather} />
        </mesh>
        {/* Hand */}
        <mesh castShadow position={[0, -0.95 * s, 0]}>
          <sphereGeometry args={[0.08 * s, 8, 8]} />
          <meshStandardMaterial color={skin} roughness={0.85} />
        </mesh>
      </group>
      <group ref={rightArm} position={[0.36 * s, shoulderY, 0]}>
        <mesh castShadow position={[0, -0.28 * s, 0]}>
          <capsuleGeometry args={[0.11 * s, 0.42 * s, 4, 8]} />
          <meshStandardMaterial color={cloth} roughness={0.95} />
        </mesh>
        <mesh castShadow position={[0, -0.68 * s, 0]}>
          <capsuleGeometry args={[0.09 * s, 0.36 * s, 4, 8]} />
          <meshStandardMaterial color={skin} roughness={0.85} />
        </mesh>
        <mesh position={[0, -0.85 * s, 0]}>
          <cylinderGeometry args={[0.1 * s, 0.1 * s, 0.08 * s, 8]} />
          <meshStandardMaterial color={leather} />
        </mesh>
        <mesh castShadow position={[0, -0.95 * s, 0]}>
          <sphereGeometry args={[0.08 * s, 8, 8]} />
          <meshStandardMaterial color={skin} roughness={0.85} />
        </mesh>
        {/* Curved short blade in hand */}
        <group position={[0.02 * s, -0.98 * s, 0.05 * s]} rotation={[0.2, 0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.04 * s, 0.55 * s, 0.02 * s]} />
            <meshStandardMaterial color={metal} metalness={0.85} roughness={0.25} />
          </mesh>
          <mesh position={[0, -0.32 * s, 0]}>
            <boxGeometry args={[0.09 * s, 0.05 * s, 0.05 * s]} />
            <meshStandardMaterial color={leather} />
          </mesh>
        </group>
      </group>
      {/* Head — human male with hood, beard */}
      <group ref={head} position={[0, headY, 0]}>
        {/* Neck */}
        <mesh position={[0, -0.16 * s, 0]}>
          <cylinderGeometry args={[0.08 * s, 0.1 * s, 0.12 * s, 8]} />
          <meshStandardMaterial color={skinShade} roughness={0.9} />
        </mesh>
        {/* Skin head base */}
        <mesh castShadow>
          <sphereGeometry args={[0.19 * s, 16, 14]} />
          <meshStandardMaterial color={skin} roughness={0.85} />
        </mesh>
        {/* Nose */}
        <mesh position={[0, 0, 0.19 * s]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.025 * s, 0.08 * s, 4]} />
          <meshStandardMaterial color={skinShade} roughness={0.9} />
        </mesh>
        {/* Eyes (whites + pupils) */}
        <mesh position={[-0.07 * s, 0.03 * s, 0.17 * s]}>
          <sphereGeometry args={[0.028 * s, 8, 8]} />
          <meshStandardMaterial color="#f4ede0" roughness={0.4} />
        </mesh>
        <mesh position={[0.07 * s, 0.03 * s, 0.17 * s]}>
          <sphereGeometry args={[0.028 * s, 8, 8]} />
          <meshStandardMaterial color="#f4ede0" roughness={0.4} />
        </mesh>
        <mesh position={[-0.07 * s, 0.03 * s, 0.19 * s]}>
          <sphereGeometry args={[0.012 * s, 6, 6]} />
          <meshStandardMaterial color="#1a1208" />
        </mesh>
        <mesh position={[0.07 * s, 0.03 * s, 0.19 * s]}>
          <sphereGeometry args={[0.012 * s, 6, 6]} />
          <meshStandardMaterial color="#1a1208" />
        </mesh>
        {/* Eyebrows */}
        <mesh position={[-0.07 * s, 0.08 * s, 0.18 * s]} rotation={[0, 0, -0.15]}>
          <boxGeometry args={[0.06 * s, 0.012 * s, 0.01 * s]} />
          <meshStandardMaterial color={beard} />
        </mesh>
        <mesh position={[0.07 * s, 0.08 * s, 0.18 * s]} rotation={[0, 0, 0.15]}>
          <boxGeometry args={[0.06 * s, 0.012 * s, 0.01 * s]} />
          <meshStandardMaterial color={beard} />
        </mesh>
        {/* Beard */}
        <mesh position={[0, -0.11 * s, 0.12 * s]}>
          <sphereGeometry args={[0.14 * s, 12, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5]} />
          <meshStandardMaterial color={beard} roughness={1} />
        </mesh>
        {/* Mouth line */}
        <mesh position={[0, -0.06 * s, 0.19 * s]}>
          <boxGeometry args={[0.06 * s, 0.008 * s, 0.005]} />
          <meshStandardMaterial color="#2a1408" />
        </mesh>
        {/* Hood */}
        <mesh castShadow position={[0, 0.03 * s, -0.02 * s]}>
          <sphereGeometry args={[0.24 * s, 14, 12, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
          <meshStandardMaterial color={leather} roughness={1} side={THREE.DoubleSide} />
        </mesh>
        {/* Hood collar */}
        <mesh position={[0, -0.14 * s, -0.05 * s]}>
          <torusGeometry args={[0.16 * s, 0.05 * s, 6, 14, Math.PI]} />
          <meshStandardMaterial color={leatherHi} roughness={1} />
        </mesh>
      </group>
    </group>
  );
}

/** Sorceress (female): human woman in dark robes, long hair, wielding a staff. */
function WraithBody({ s, leftArm, rightArm, leftLeg, rightLeg, head, id }: LimbRefs & { id: number }) {
  const skin = "#e6c4a0";
  const skinShade = "#b8926a";
  const robe = "#2a1a3a";
  const robeHi = "#463060";
  const trim = "#a88030";
  const hair = "#1a0a08";
  const staff = "#3a2410";
  const gem = "#a060ff";
  const legY = s * 0.95;
  const hipY = s * 1.25;
  const shoulderY = s * 2.05;
  const headY = s * 2.35;
  return (
    <group>
      {/* Legs under long robe (subtle) */}
      <group ref={leftLeg} position={[-0.13 * s, hipY, 0]}>
        <mesh castShadow position={[0, -legY * 0.5, 0]}>
          <capsuleGeometry args={[0.09 * s, legY * 0.7, 4, 8]} />
          <meshStandardMaterial color={robe} roughness={1} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.13 * s, hipY, 0]}>
        <mesh castShadow position={[0, -legY * 0.5, 0]}>
          <capsuleGeometry args={[0.09 * s, legY * 0.7, 4, 8]} />
          <meshStandardMaterial color={robe} roughness={1} />
        </mesh>
      </group>
      {/* Long flowing robe skirt */}
      <mesh position={[0, hipY - 0.4 * s, 0]} castShadow>
        <cylinderGeometry args={[0.32 * s, 0.7 * s, 1.4 * s, 14]} />
        <meshStandardMaterial color={robe} roughness={1} />
      </mesh>
      {/* Robe trim */}
      <mesh position={[0, hipY - 1.08 * s, 0]}>
        <cylinderGeometry args={[0.7 * s, 0.72 * s, 0.06 * s, 14]} />
        <meshStandardMaterial color={trim} metalness={0.6} roughness={0.4} />
      </mesh>
      {/* Torso — corseted bodice, feminine silhouette */}
      <mesh position={[0, (hipY + shoulderY) / 2, 0]} castShadow>
        <capsuleGeometry args={[0.25 * s, 0.55 * s, 4, 10]} />
        <meshStandardMaterial color={robeHi} roughness={0.9} />
      </mesh>
      {/* Bust suggestion */}
      <mesh position={[-0.11 * s, (hipY + shoulderY) / 2 + 0.12 * s, 0.16 * s]}>
        <sphereGeometry args={[0.1 * s, 10, 8]} />
        <meshStandardMaterial color={robeHi} roughness={0.9} />
      </mesh>
      <mesh position={[0.11 * s, (hipY + shoulderY) / 2 + 0.12 * s, 0.16 * s]}>
        <sphereGeometry args={[0.1 * s, 10, 8]} />
        <meshStandardMaterial color={robeHi} roughness={0.9} />
      </mesh>
      {/* Corset lacing */}
      <mesh position={[0, (hipY + shoulderY) / 2, 0.24 * s]}>
        <boxGeometry args={[0.04 * s, 0.5 * s, 0.005]} />
        <meshStandardMaterial color={trim} />
      </mesh>
      {/* Arms — slender, sleeved */}
      <group ref={leftArm} position={[-0.3 * s, shoulderY, 0]}>
        <mesh castShadow position={[0, -0.3 * s, 0]}>
          <capsuleGeometry args={[0.08 * s, 0.5 * s, 4, 8]} />
          <meshStandardMaterial color={robe} roughness={1} />
        </mesh>
        <mesh castShadow position={[0, -0.72 * s, 0]}>
          <capsuleGeometry args={[0.07 * s, 0.38 * s, 4, 8]} />
          <meshStandardMaterial color={skin} roughness={0.75} />
        </mesh>
        <mesh castShadow position={[0, -0.95 * s, 0]}>
          <sphereGeometry args={[0.07 * s, 8, 8]} />
          <meshStandardMaterial color={skin} roughness={0.75} />
        </mesh>
      </group>
      <group ref={rightArm} position={[0.3 * s, shoulderY, 0]}>
        <mesh castShadow position={[0, -0.3 * s, 0]}>
          <capsuleGeometry args={[0.08 * s, 0.5 * s, 4, 8]} />
          <meshStandardMaterial color={robe} roughness={1} />
        </mesh>
        <mesh castShadow position={[0, -0.72 * s, 0]}>
          <capsuleGeometry args={[0.07 * s, 0.38 * s, 4, 8]} />
          <meshStandardMaterial color={skin} roughness={0.75} />
        </mesh>
        <mesh castShadow position={[0, -0.95 * s, 0]}>
          <sphereGeometry args={[0.07 * s, 8, 8]} />
          <meshStandardMaterial color={skin} roughness={0.75} />
        </mesh>
        {/* Staff */}
        <group position={[0.04 * s, -0.95 * s, 0.02]} rotation={[0.1, 0, 0.08]}>
          <mesh castShadow>
            <cylinderGeometry args={[0.025 * s, 0.03 * s, 1.9 * s, 8]} />
            <meshStandardMaterial color={staff} roughness={0.85} />
          </mesh>
          {/* Twisted top */}
          <mesh position={[0, 0.95 * s, 0]}>
            <torusGeometry args={[0.08 * s, 0.02 * s, 6, 14]} />
            <meshStandardMaterial color={staff} roughness={0.85} />
          </mesh>
          {/* Gem */}
          <mesh position={[0, 1.03 * s, 0]}>
            <sphereGeometry args={[0.07 * s, 10, 10]} />
            <meshStandardMaterial color={gem} emissive={gem} emissiveIntensity={0.9} roughness={0.2} />
          </mesh>
        </group>
      </group>
      {/* Head — human female with long hair */}
      <group ref={head} position={[0, headY, 0]}>
        {/* Neck */}
        <mesh position={[0, -0.17 * s, 0]}>
          <cylinderGeometry args={[0.07 * s, 0.09 * s, 0.14 * s, 8]} />
          <meshStandardMaterial color={skinShade} roughness={0.8} />
        </mesh>
        {/* Face */}
        <mesh castShadow>
          <sphereGeometry args={[0.18 * s, 16, 14]} />
          <meshStandardMaterial color={skin} roughness={0.75} />
        </mesh>
        {/* Long hair mass behind and to shoulders */}
        <mesh castShadow position={[0, -0.05 * s, -0.06 * s]}>
          <sphereGeometry args={[0.22 * s, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.75]} />
          <meshStandardMaterial color={hair} roughness={1} />
        </mesh>
        <mesh castShadow position={[-0.16 * s, -0.35 * s, -0.02 * s]}>
          <boxGeometry args={[0.1 * s, 0.55 * s, 0.12 * s]} />
          <meshStandardMaterial color={hair} roughness={1} />
        </mesh>
        <mesh castShadow position={[0.16 * s, -0.35 * s, -0.02 * s]}>
          <boxGeometry args={[0.1 * s, 0.55 * s, 0.12 * s]} />
          <meshStandardMaterial color={hair} roughness={1} />
        </mesh>
        {/* Bangs */}
        <mesh position={[0, 0.12 * s, 0.13 * s]}>
          <boxGeometry args={[0.28 * s, 0.08 * s, 0.06 * s]} />
          <meshStandardMaterial color={hair} roughness={1} />
        </mesh>
        {/* Eyes */}
        <mesh position={[-0.065 * s, 0.02 * s, 0.16 * s]}>
          <sphereGeometry args={[0.025 * s, 8, 8]} />
          <meshStandardMaterial color="#f4ede0" />
        </mesh>
        <mesh position={[0.065 * s, 0.02 * s, 0.16 * s]}>
          <sphereGeometry args={[0.025 * s, 8, 8]} />
          <meshStandardMaterial color="#f4ede0" />
        </mesh>
        <mesh position={[-0.065 * s, 0.02 * s, 0.18 * s]}>
          <sphereGeometry args={[0.012 * s, 6, 6]} />
          <meshStandardMaterial color="#3a2050" emissive="#6030a0" emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[0.065 * s, 0.02 * s, 0.18 * s]}>
          <sphereGeometry args={[0.012 * s, 6, 6]} />
          <meshStandardMaterial color="#3a2050" emissive="#6030a0" emissiveIntensity={0.4} />
        </mesh>
        {/* Nose */}
        <mesh position={[0, -0.02 * s, 0.18 * s]}>
          <coneGeometry args={[0.018 * s, 0.06 * s, 4]} />
          <meshStandardMaterial color={skinShade} />
        </mesh>
        {/* Lips */}
        <mesh position={[0, -0.09 * s, 0.17 * s]}>
          <boxGeometry args={[0.06 * s, 0.018 * s, 0.02 * s]} />
          <meshStandardMaterial color="#8a2030" roughness={0.4} />
        </mesh>
      </group>
    </group>
  );
}

/** Knight (male): heavy human warrior in plate armor with greatsword. */
function BruteBody({ s, leftArm, rightArm, leftLeg, rightLeg, head }: LimbRefs) {
  const skin = "#c9a181";
  const plate = "#6a707a";
  const plateHi = "#8a8f98";
  const plateDark = "#3a3e46";
  const leather = "#2a1a10";
  const trim = "#b8942a";
  const cloth = "#5a2020";
  const legY = s * 1.0;
  const hipY = s * 1.3;
  const shoulderY = s * 2.2;
  const headY = s * 2.6;
  return (
    <group>
      {/* Legs — plated */}
      <group ref={leftLeg} position={[-0.24 * s, hipY, 0]}>
        <mesh castShadow position={[0, -legY / 2, 0]}>
          <capsuleGeometry args={[0.17 * s, legY * 0.65, 4, 8]} />
          <meshStandardMaterial color={plate} metalness={0.7} roughness={0.4} />
        </mesh>
        {/* Knee cop */}
        <mesh position={[0, -legY * 0.5, 0.14 * s]}>
          <sphereGeometry args={[0.13 * s, 10, 8]} />
          <meshStandardMaterial color={plateHi} metalness={0.75} roughness={0.35} />
        </mesh>
        <mesh castShadow position={[0, -legY + 0.05, 0.09 * s]}>
          <boxGeometry args={[0.32 * s, 0.16 * s, 0.42 * s]} />
          <meshStandardMaterial color={plateDark} metalness={0.6} roughness={0.5} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[0.24 * s, hipY, 0]}>
        <mesh castShadow position={[0, -legY / 2, 0]}>
          <capsuleGeometry args={[0.17 * s, legY * 0.65, 4, 8]} />
          <meshStandardMaterial color={plate} metalness={0.7} roughness={0.4} />
        </mesh>
        <mesh position={[0, -legY * 0.5, 0.14 * s]}>
          <sphereGeometry args={[0.13 * s, 10, 8]} />
          <meshStandardMaterial color={plateHi} metalness={0.75} roughness={0.35} />
        </mesh>
        <mesh castShadow position={[0, -legY + 0.05, 0.09 * s]}>
          <boxGeometry args={[0.32 * s, 0.16 * s, 0.42 * s]} />
          <meshStandardMaterial color={plateDark} metalness={0.6} roughness={0.5} />
        </mesh>
      </group>
      {/* Belt with buckle */}
      <mesh position={[0, hipY, 0]} castShadow>
        <cylinderGeometry args={[0.42 * s, 0.42 * s, 0.18 * s, 12]} />
        <meshStandardMaterial color={leather} roughness={0.9} />
      </mesh>
      <mesh position={[0, hipY, 0.42 * s]}>
        <boxGeometry args={[0.12 * s, 0.1 * s, 0.02 * s]} />
        <meshStandardMaterial color={trim} metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Tabard (cloth over armor) */}
      <mesh position={[0, hipY - 0.3 * s, 0.32 * s]}>
        <boxGeometry args={[0.4 * s, 0.7 * s, 0.02 * s]} />
        <meshStandardMaterial color={cloth} roughness={1} />
      </mesh>
      {/* Breastplate */}
      <mesh position={[0, (hipY + shoulderY) / 2 + 0.05, 0]} castShadow>
        <boxGeometry args={[0.85 * s, 0.9 * s, 0.55 * s]} />
        <meshStandardMaterial color={plate} metalness={0.75} roughness={0.35} />
      </mesh>
      {/* Chest ridge */}
      <mesh position={[0, (hipY + shoulderY) / 2 + 0.05, 0.28 * s]}>
        <boxGeometry args={[0.05 * s, 0.85 * s, 0.03 * s]} />
        <meshStandardMaterial color={plateHi} metalness={0.85} roughness={0.25} />
      </mesh>
      {/* Pauldrons — rounded, no spikes */}
      <mesh position={[-0.5 * s, shoulderY + 0.05, 0]} castShadow>
        <sphereGeometry args={[0.28 * s, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={plateHi} metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0.5 * s, shoulderY + 0.05, 0]} castShadow>
        <sphereGeometry args={[0.28 * s, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color={plateHi} metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Arms — plated with mail underneath at joints */}
      <group ref={leftArm} position={[-0.5 * s, shoulderY - 0.05, 0]}>
        <mesh castShadow position={[0, -0.32 * s, 0]}>
          <capsuleGeometry args={[0.15 * s, 0.5 * s, 4, 8]} />
          <meshStandardMaterial color={plate} metalness={0.7} roughness={0.4} />
        </mesh>
        <mesh castShadow position={[0, -0.7 * s, 0]}>
          <capsuleGeometry args={[0.14 * s, 0.35 * s, 4, 8]} />
          <meshStandardMaterial color={plateDark} metalness={0.6} roughness={0.5} />
        </mesh>
        <mesh castShadow position={[0, -0.98 * s, 0]}>
          <boxGeometry args={[0.17 * s, 0.12 * s, 0.2 * s]} />
          <meshStandardMaterial color={plateDark} metalness={0.65} />
        </mesh>
      </group>
      <group ref={rightArm} position={[0.5 * s, shoulderY - 0.05, 0]}>
        <mesh castShadow position={[0, -0.32 * s, 0]}>
          <capsuleGeometry args={[0.15 * s, 0.5 * s, 4, 8]} />
          <meshStandardMaterial color={plate} metalness={0.7} roughness={0.4} />
        </mesh>
        <mesh castShadow position={[0, -0.7 * s, 0]}>
          <capsuleGeometry args={[0.14 * s, 0.35 * s, 4, 8]} />
          <meshStandardMaterial color={plateDark} metalness={0.6} roughness={0.5} />
        </mesh>
        {/* Greatsword */}
        <group position={[0, -0.98 * s, 0.05]} rotation={[0.3, 0, 0]}>
          {/* Grip */}
          <mesh castShadow>
            <cylinderGeometry args={[0.04 * s, 0.04 * s, 0.28 * s, 8]} />
            <meshStandardMaterial color={leather} />
          </mesh>
          {/* Pommel */}
          <mesh position={[0, -0.18 * s, 0]}>
            <sphereGeometry args={[0.06 * s, 10, 8]} />
            <meshStandardMaterial color={trim} metalness={0.8} roughness={0.3} />
          </mesh>
          {/* Crossguard */}
          <mesh position={[0, 0.16 * s, 0]}>
            <boxGeometry args={[0.36 * s, 0.05 * s, 0.05 * s]} />
            <meshStandardMaterial color={trim} metalness={0.8} roughness={0.3} />
          </mesh>
          {/* Blade */}
          <mesh castShadow position={[0, 0.85 * s, 0]}>
            <boxGeometry args={[0.09 * s, 1.35 * s, 0.02 * s]} />
            <meshStandardMaterial color="#d0d4dc" metalness={0.9} roughness={0.15} />
          </mesh>
          {/* Blade point */}
          <mesh castShadow position={[0, 1.6 * s, 0]}>
            <coneGeometry args={[0.045 * s, 0.18 * s, 4]} />
            <meshStandardMaterial color="#d0d4dc" metalness={0.9} roughness={0.15} />
          </mesh>
        </group>
      </group>
      {/* Head — human male in open barbute helm with visible face */}
      <group ref={head} position={[0, headY, 0]}>
        {/* Neck */}
        <mesh position={[0, -0.22 * s, 0]}>
          <cylinderGeometry args={[0.11 * s, 0.14 * s, 0.2 * s, 8]} />
          <meshStandardMaterial color={skin} roughness={0.85} />
        </mesh>
        {/* Face */}
        <mesh castShadow>
          <sphereGeometry args={[0.22 * s, 16, 14]} />
          <meshStandardMaterial color={skin} roughness={0.85} />
        </mesh>
        {/* Helm — covers top, back, sides; T-opening for face */}
        <mesh castShadow position={[0, 0.06 * s, 0]}>
          <sphereGeometry args={[0.26 * s, 16, 14, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
          <meshStandardMaterial color={plate} metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Cheek guards */}
        <mesh position={[-0.2 * s, -0.05 * s, 0.02 * s]}>
          <boxGeometry args={[0.05 * s, 0.2 * s, 0.28 * s]} />
          <meshStandardMaterial color={plate} metalness={0.8} roughness={0.3} />
        </mesh>
        <mesh position={[0.2 * s, -0.05 * s, 0.02 * s]}>
          <boxGeometry args={[0.05 * s, 0.2 * s, 0.28 * s]} />
          <meshStandardMaterial color={plate} metalness={0.8} roughness={0.3} />
        </mesh>
        {/* Nasal bar */}
        <mesh position={[0, 0.02 * s, 0.24 * s]}>
          <boxGeometry args={[0.03 * s, 0.18 * s, 0.03 * s]} />
          <meshStandardMaterial color={plate} metalness={0.85} roughness={0.25} />
        </mesh>
        {/* Crest */}
        <mesh position={[0, 0.32 * s, 0]}>
          <boxGeometry args={[0.04 * s, 0.1 * s, 0.45 * s]} />
          <meshStandardMaterial color={cloth} roughness={0.9} />
        </mesh>
        {/* Eyes visible in T-slot */}
        <mesh position={[-0.09 * s, 0.03 * s, 0.2 * s]}>
          <sphereGeometry args={[0.022 * s, 8, 8]} />
          <meshStandardMaterial color="#f4ede0" />
        </mesh>
        <mesh position={[0.09 * s, 0.03 * s, 0.2 * s]}>
          <sphereGeometry args={[0.022 * s, 8, 8]} />
          <meshStandardMaterial color="#f4ede0" />
        </mesh>
        <mesh position={[-0.09 * s, 0.03 * s, 0.22 * s]}>
          <sphereGeometry args={[0.01 * s, 6, 6]} />
          <meshStandardMaterial color="#1a1208" />
        </mesh>
        <mesh position={[0.09 * s, 0.03 * s, 0.22 * s]}>
          <sphereGeometry args={[0.01 * s, 6, 6]} />
          <meshStandardMaterial color="#1a1208" />
        </mesh>
        {/* Beard/stubble around jaw */}
        <mesh position={[0, -0.14 * s, 0.12 * s]}>
          <sphereGeometry args={[0.15 * s, 12, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5]} />
          <meshStandardMaterial color="#2a1a10" roughness={1} />
        </mesh>
      </group>
    </group>
  );
}


/* ---------------- LAVA ---------------- */

function LavaPool({ pos, size }: { pos: Vec3; size: [number, number] }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((state) => {
    if (!ref.current) return;
    const m = ref.current.material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = 1.2 + Math.sin(state.clock.elapsedTime * 3) * 0.3;
  });
  return (
    <>
      <mesh ref={ref} position={pos} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={size} />
        <meshStandardMaterial color="#ff5010" emissive="#ff2000" emissiveIntensity={1.5} />
      </mesh>
      <pointLight position={[pos[0], pos[1] + 1, pos[2]]} color="#ff5010" intensity={2} distance={8} />
    </>
  );
}

/* ---------------- PICKUP MESH ---------------- */
function PickupMesh({ p }: { p: Pickup }) {
  const ref = useRef<THREE.Group>(null!);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.visible = !p.taken;
    ref.current.position.copy(p.pos);
    ref.current.position.y += Math.sin(state.clock.elapsedTime * 2 + p.id) * 0.15;
    ref.current.rotation.y = state.clock.elapsedTime * 1.5;
  });
  const cfg = {
    gem: { color: "#ffe040", geo: <octahedronGeometry args={[0.25]} /> },
    hp: { color: "#ff4040", geo: <sphereGeometry args={[0.22, 12, 12]} /> },
    mp: { color: "#4080ff", geo: <sphereGeometry args={[0.22, 12, 12]} /> },
    checkpoint: { color: "#40ff80", geo: <torusGeometry args={[0.35, 0.08, 8, 16]} /> },
  }[p.kind];
  return (
    <group ref={ref}>
      <mesh castShadow>
        {cfg.geo}
        <meshStandardMaterial color={cfg.color} emissive={cfg.color} emissiveIntensity={1.5} />
      </mesh>
    </group>
  );
}

/* ---------------- GOAL ---------------- */
function Goal({ pos }: { pos: Vec3 }) {
  const ref = useRef<THREE.Mesh>(null!);
  useFrame((s) => {
    if (ref.current) ref.current.rotation.y = s.clock.elapsedTime;
  });
  return (
    <group position={pos}>
      <mesh ref={ref} castShadow>
        <torusKnotGeometry args={[0.5, 0.15, 64, 8]} />
        <meshStandardMaterial color="#a080ff" emissive="#a080ff" emissiveIntensity={2} />
      </mesh>
    </group>
  );
}

/* ---------------- FLOATING TEXT ---------------- */
function FloatingText({ ft }: { ft: FloatText }) {
  const ref = useRef<THREE.Group>(null!);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.copy(ft.pos);
  });
  return (
    <group ref={ref}>
      <Text fontSize={0.4} color={ft.color} outlineWidth={0.03} outlineColor="#000" anchorX="center">
        {ft.text}
      </Text>
    </group>
  );
}

/* ---------------- SCARE FX ---------------- */
function ScareFX({ scare, playerRef }: { scare?: WorldDef["scare"]; playerRef: React.MutableRefObject<THREE.Vector3> }) {
  const flickerRef = useRef<THREE.PointLight>(null!);
  const redRef = useRef<THREE.PointLight>(null!);
  const whisperRef = useRef<THREE.Group>(null!);
  const nextFlickerAt = useRef(0);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (scare?.flicker && flickerRef.current) {
      if (t > nextFlickerAt.current) {
        flickerRef.current.intensity = Math.random() < 0.5 ? 0 : 3 + Math.random() * 4;
        nextFlickerAt.current = t + 0.05 + Math.random() * 0.35;
      }
      flickerRef.current.position.set(playerRef.current.x + Math.sin(t * 0.7) * 6, playerRef.current.y + 4, playerRef.current.z + Math.cos(t * 0.5) * 6);
    }
    if (scare?.redLight && redRef.current) {
      redRef.current.intensity = 1.5 + Math.sin(t * 4) * 1 + Math.random() * 0.5;
      redRef.current.position.set(playerRef.current.x, playerRef.current.y + 3, playerRef.current.z);
    }
    if (scare?.whispers && whisperRef.current) {
      whisperRef.current.position.set(playerRef.current.x + Math.sin(t * 0.3) * 8, playerRef.current.y + 2 + Math.sin(t * 0.9) * 1.5, playerRef.current.z + Math.cos(t * 0.4) * 8);
      whisperRef.current.rotation.y = -Math.atan2(whisperRef.current.position.x - playerRef.current.x, whisperRef.current.position.z - playerRef.current.z);
      const mat = (whisperRef.current.children[0] as THREE.Mesh)?.material as THREE.MeshBasicMaterial;
      if (mat) mat.opacity = 0.15 + Math.abs(Math.sin(t * 0.8)) * 0.35;
    }
  });
  return (
    <>
      {scare?.flicker && <pointLight ref={flickerRef} color="#e0d0ff" intensity={0} distance={20} />}
      {scare?.redLight && <pointLight ref={redRef} color="#ff1010" intensity={1.5} distance={18} />}
      {scare?.whispers && (
        <group ref={whisperRef}>
          <mesh>
            <planeGeometry args={[1.6, 2.4]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.2} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
          <mesh position={[0.25, 0.6, 0.02]}>
            <sphereGeometry args={[0.09, 8, 8]} />
            <meshBasicMaterial color="#ff2020" />
          </mesh>
          <mesh position={[-0.25, 0.6, 0.02]}>
            <sphereGeometry args={[0.09, 8, 8]} />
            <meshBasicMaterial color="#ff2020" />
          </mesh>
        </group>
      )}
    </>
  );
}


/* ---------------- MAIN SCENE ---------------- */
function Scene({
  world,
  statsRef,
  onDeath,
  onWin,
  onReady,
  onHudUpdate,
  keysRef,
  checkpointRef,
  sharedPosRef,
  sharedFacingRef,
  sharedEnemiesRef,
}: {
  world: WorldDef;
  statsRef: React.MutableRefObject<Stats>;
  onDeath: () => void;
  onWin: () => void;
  onReady: () => void;
  onHudUpdate: () => void;
  keysRef: React.MutableRefObject<Keys>;
  checkpointRef: React.MutableRefObject<Vec3>;
  sharedPosRef: React.MutableRefObject<{ x: number; y: number; z: number }>;
  sharedFacingRef: React.MutableRefObject<number>;
  sharedEnemiesRef: React.MutableRefObject<Enemy[]>;
}) {

  const pos = useRef(new THREE.Vector3(...checkpointRef.current));
  const vel = useRef(new THREE.Vector3());
  const facing = useRef(0);
  const grounded = useRef(false);
  const walkPhase = useRef(0);
  const attackTimer = useRef(0);
  const attackCd = useRef(0);
  const invuln = useRef(0);
  const { camera } = useThree();
  const camTarget = useRef(new THREE.Vector3());

  useEffect(() => { onReady(); }, [onReady]);

  const [, force] = useState(0);
  const rerender = () => force((v) => v + 1);
  const coyoteTimer = useRef(0);
  const jumpBuffer = useRef(0);
  const jumpHeld = useRef(false);

  const diff = world.difficulty;
  const enemies = useRef<Enemy[]>(
    world.enemies.map((e, i) => {
      const baseHp =
        e.kind === "brute" ? 60 :
        e.kind === "sentinel" ? 55 :
        e.kind === "wraith" ? 30 :
        e.kind === "archer" ? 24 :
        e.kind === "hopper" ? 22 :
        e.kind === "dasher" ? 28 :
        20;
      const hp = Math.round(baseHp * diff);
      const startPos = new THREE.Vector3(...e.pos);
      return {
        id: i,
        pos: startPos,
        hp, maxHp: hp,
        vel: new THREE.Vector3(),
        kind: e.kind,
        alive: true,
        hitFlash: 0,
        shootTimer: e.kind === "archer" ? 0.8 + Math.random() * 0.8 : 0,
        jumpTimer: e.kind === "hopper" ? Math.random() * 0.6 : 0,
        dashTimer: e.kind === "dasher" ? 1 + Math.random() : 0,
        dashActive: 0,
        patrolCenter: e.kind === "sentinel" ? startPos.clone() : undefined,
        patrolDir: e.kind === "sentinel" ? (Math.random() < 0.5 ? 1 : -1) : 0,
      };
    })
  );
  const pickups = useRef<Pickup[]>(
    world.pickups.map((p, i) => ({
      id: i,
      pos: new THREE.Vector3(...p.pos),
      kind: p.kind,
      taken: false,
    }))
  );
  const floats = useRef<FloatText[]>([]);
  const nextFtId = useRef(0);
  const projectiles = useRef<Projectile[]>([]);
  const nextProjId = useRef(0);
  const enemyProjectiles = useRef<EnemyProjectile[]>([]);
  const nextEnemyProjId = useRef(0);
  const spawnFloat = (p: THREE.Vector3, text: string, color: string) => {
    floats.current.push({ id: nextFtId.current++, pos: p.clone().add(new THREE.Vector3(0, 1.5, 0)), text, color, life: 1 });
  };

  const potPrev = useRef({ q: false, e: false });

  // Mouse look + click to attack. Works with pointer lock; falls back to
  // cursor position relative to canvas center when lock is unavailable (iframes).
  const yawRef = useRef(0);
  const pitchRef = useRef(0.35); // radians, positive = looking down more
  const camDistRef = useRef(9);
  const camYawOffsetRef = useRef(0); // extra yaw added only while Alt held
  useEffect(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    let locked = false;
    const onMove = (e: MouseEvent) => {
      const free = keysRef.current.camFree;
      if (locked && document.pointerLockElement === canvas) {
        if (free) {
          camYawOffsetRef.current -= e.movementX * 0.0035;
          pitchRef.current = Math.max(-0.4, Math.min(1.2, pitchRef.current + e.movementY * 0.0025));
        } else {
          yawRef.current -= e.movementX * 0.0035;
        }
      } else {
        const rect = canvas.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        if (free) {
          camYawOffsetRef.current -= (dx / rect.width) * 0.08;
          pitchRef.current = Math.max(-0.4, Math.min(1.2, 0.35 + (dy / rect.height) * 1.2));
        } else {
          yawRef.current -= (dx / rect.width) * 0.08;
        }
      }
    };
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (!locked) {
        try { canvas.requestPointerLock?.(); } catch { /* iframe may block */ }
      }
      keysRef.current.attack = true;
    };
    const onUp = (e: MouseEvent) => {
      if (e.button === 0) keysRef.current.attack = false;
    };
    const onWheel = (e: WheelEvent) => {
      if (!keysRef.current.camFree) return;
      camDistRef.current = Math.max(4, Math.min(18, camDistRef.current + e.deltaY * 0.01));
      e.preventDefault();
    };
    const onLockChange = () => { locked = document.pointerLockElement === canvas; };
    document.addEventListener("mousemove", onMove);
    canvas.addEventListener("mousedown", onDown as any);
    canvas.addEventListener("wheel", onWheel as any, { passive: false });
    window.addEventListener("mouseup", onUp);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      document.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mousedown", onDown as any);
      canvas.removeEventListener("wheel", onWheel as any);
      window.removeEventListener("mouseup", onUp);
      document.removeEventListener("pointerlockchange", onLockChange);
    };
  }, [keysRef]);


  const tickAccumRef = useRef({ dt: 0, staminaDelta: 0, batteryDelta: 0, playtime: 0 });
  useFrame((state, dt) => {
    dt = Math.min(dt, 0.05);
    // Pause: skip all game logic while a menu is open.
    const gs = useGame.getState();
    if (gs.paused) return;

    // Accumulate stamina/battery/playtime and flush at ~6Hz to avoid
    // hundreds of zustand set() (and HUD re-renders) per second.
    const running = keysRef.current.run && !!(keysRef.current.fwd || keysRef.current.back || keysRef.current.left || keysRef.current.right);
    const canRun = running && gs.stamina > 5;
    const acc = tickAccumRef.current;
    acc.playtime += dt;
    if (canRun) acc.staminaDelta -= dt * 22;
    else if (!keysRef.current.attack) acc.staminaDelta += dt * 14;
    if (gs.flashlightOn) acc.batteryDelta -= dt * 1.6;
    acc.dt += dt;
    if (acc.dt >= 0.16) {
      gs.addPlaytime(acc.playtime);
      if (acc.staminaDelta !== 0) gs.setStamina(gs.stamina + acc.staminaDelta);
      if (acc.batteryDelta !== 0) {
        const nb = gs.battery + acc.batteryDelta;
        gs.setBattery(nb);
        if (nb <= 0 && gs.flashlightOn) gs.setFlashlight(false);
      }
      acc.dt = 0; acc.staminaDelta = 0; acc.batteryDelta = 0; acc.playtime = 0;
    }


    const k = keysRef.current;
    const st = statsRef.current;

    // Movement direction relative to mouse yaw
    const camYaw = yawRef.current;
    let mx = 0, mz = 0;
    if (k.fwd) mz -= 1;
    if (k.back) mz += 1;
    if (k.left) mx -= 1;
    if (k.right) mx += 1;
    const inputLen = Math.hypot(mx, mz);
    // Player always faces the camera-forward direction (where the mouse is aiming)
    facing.current = camYaw + Math.PI;
    // Expose to HUD (parent-owned refs)
    sharedPosRef.current.x = pos.current.x;
    sharedPosRef.current.y = pos.current.y;
    sharedPosRef.current.z = pos.current.z;
    sharedFacingRef.current = facing.current;
    sharedEnemiesRef.current = enemies.current;
    // Air control: full speed on ground, slightly reduced smoothing in air
    const control = grounded.current ? 1 : AIR_CONTROL;
    const speed = MOVE_SPEED * (canRun ? 1.55 : 1);
    if (inputLen > 0) {
      mx /= inputLen; mz /= inputLen;
      const s = Math.sin(camYaw), c = Math.cos(camYaw);
      const wx = mx * c + mz * s;
      const wz = -mx * s + mz * c;
      const targetX = wx * speed;
      const targetZ = wz * speed;
      // Lerp toward target for snappy but not jittery movement
      const alpha = grounded.current ? 1 : 0.25 * control;
      vel.current.x = vel.current.x + (targetX - vel.current.x) * alpha;
      vel.current.z = vel.current.z + (targetZ - vel.current.z) * alpha;
      walkPhase.current += dt;
    } else if (grounded.current) {
      vel.current.x *= 0.6;
      vel.current.z *= 0.6;
    }


    // Coyote time + jump buffer
    coyoteTimer.current = grounded.current ? COYOTE_TIME : Math.max(0, coyoteTimer.current - dt);
    if (k.jump) jumpBuffer.current = JUMP_BUFFER;
    else jumpBuffer.current = Math.max(0, jumpBuffer.current - dt);
    if (jumpBuffer.current > 0 && coyoteTimer.current > 0) {
      vel.current.y = JUMP_V;
      grounded.current = false;
      coyoteTimer.current = 0;
      jumpBuffer.current = 0;
      jumpHeld.current = true;
    }
    // Variable jump height: releasing space while ascending cuts upward velocity
    if (jumpHeld.current && !k.jump) {
      if (vel.current.y > 0) vel.current.y *= 0.35;
      jumpHeld.current = false;
    }
    if (vel.current.y <= 0) jumpHeld.current = false;

    // Gravity (slightly stronger when falling for tighter platforming feel)
    vel.current.y += (vel.current.y < 0 ? GRAVITY * 1.4 : GRAVITY) * dt;

    // Integrate X
    const nx = pos.current.x + vel.current.x * dt;
    if (!blocked(nx, pos.current.y, pos.current.z, 0.4, 1.6, world.platforms)) pos.current.x = nx;
    else vel.current.x = 0;
    const nz = pos.current.z + vel.current.z * dt;
    if (!blocked(pos.current.x, pos.current.y, nz, 0.4, 1.6, world.platforms)) pos.current.z = nz;
    else vel.current.z = 0;
    // Integrate Y
    const ny = pos.current.y + vel.current.y * dt;
    if (vel.current.y <= 0) {
      const landed = aabb(pos.current.x, ny, pos.current.z, 0.4, 1.6, world.platforms);
      if (landed !== null) {
        pos.current.y = landed;
        vel.current.y = 0;
        grounded.current = true;
      } else {
        pos.current.y = ny;
        grounded.current = false;
      }
    } else {
      if (!blocked(pos.current.x, ny + 1.6, pos.current.z, 0.4, 0.1, world.platforms)) {
        pos.current.y = ny;
      } else {
        vel.current.y = 0;
      }
      grounded.current = false;
    }

    // Fall off world
    if (pos.current.y < -10) {
      onDeath();
      return;
    }

    // Lava damage
    for (const l of world.lava) {
      const dx = pos.current.x - l.pos[0];
      const dz = pos.current.z - l.pos[2];
      if (Math.abs(dx) < l.size[0] / 2 && Math.abs(dz) < l.size[1] / 2 && pos.current.y < l.pos[1] + 0.5) {
        onDeath();
        return;
      }
    }

    // Attack — fire a projectile in the facing direction.
    if (attackCd.current > 0) attackCd.current -= dt;
    if (attackTimer.current > 0) attackTimer.current -= dt * 4;
    if (k.attack && attackCd.current <= 0 && gs.stamina >= 6) {
      attackCd.current = ATTACK_COOLDOWN;
      attackTimer.current = 1;
      gs.setStamina(gs.stamina - 6);
      playShoot();
      const fx = Math.sin(facing.current), fz = Math.cos(facing.current);
      // Spawn slightly in front of the mage and roughly at hand height.
      const spawn = pos.current.clone().add(new THREE.Vector3(fx * 0.6, 1.1, fz * 0.6));
      projectiles.current.push({
        id: nextProjId.current++,
        pos: spawn,
        vel: new THREE.Vector3(fx * PROJECTILE_SPEED, 0, fz * PROJECTILE_SPEED),
        life: PROJECTILE_LIFE,
      });
    }

    // Projectiles: move, expire, and damage enemies on hit.
    for (const pr of projectiles.current) {
      if (pr.life <= 0) continue;
      pr.life -= dt;
      pr.pos.x += pr.vel.x * dt;
      pr.pos.y += pr.vel.y * dt;
      pr.pos.z += pr.vel.z * dt;
      // Block on world geometry.
      if (blocked(pr.pos.x, pr.pos.y, pr.pos.z, 0.1, 0.1, world.platforms)) {
        pr.life = 0;
        continue;
      }
      for (const e of enemies.current) {
        if (!e.alive) continue;
        const dx = e.pos.x - pr.pos.x;
        const dy = (e.pos.y + 0.9) - pr.pos.y;
        const dz = e.pos.z - pr.pos.z;
        if (dx * dx + dy * dy + dz * dz < (PROJECTILE_RADIUS + 0.5) * (PROJECTILE_RADIUS + 0.5)) {
          const dmg = 18 + st.str + Math.floor(Math.random() * 8);
          e.hp -= dmg;
          e.hitFlash = 0.15;
          const kbx = pr.vel.x, kbz = pr.vel.z;
          const len = Math.hypot(kbx, kbz) || 1;
          e.vel.x += (kbx / len) * 5; e.vel.z += (kbz / len) * 5; e.vel.y = 3;
          spawnFloat(e.pos, `-${dmg}`, "#80d8ff");
          pr.life = 0;
          if (e.hp <= 0) {
            e.alive = false;
            playDeath(genderFor(e.kind));
            gs.recordKill(e.kind);

            const xp = e.kind === "brute" ? 60 : e.kind === "wraith" ? 40 : 25;
            const gold = e.kind === "brute" ? 20 : e.kind === "wraith" ? 12 : 6;
            st.xp += xp; st.gold += gold;
            spawnFloat(e.pos, `+${xp} XP  +${gold}g`, "#a0ff40");
            while (st.xp >= st.xpNext) {
              st.xp -= st.xpNext;
              st.level++;
              st.xpNext = Math.floor(st.xpNext * 1.4);
              st.maxHp += 20; st.hp = st.maxHp;
              st.maxMp += 10; st.mp = st.maxMp;
              st.str += 3; st.def += 1;
              spawnFloat(pos.current, `LEVEL ${st.level}!`, "#ff80ff");
            }
            // Random drop
            if (Math.random() < 0.4) {
              pickups.current.push({
                id: 9000 + pickups.current.length,
                pos: e.pos.clone(),
                kind: Math.random() < 0.5 ? "hp" : "mp",
                taken: false,
              });
            }
            onHudUpdate();
          }
          break;
        }
      }
    }
    const beforeProj = projectiles.current.length;
    projectiles.current = projectiles.current.filter((p) => p.life > 0);
    const projChanged = projectiles.current.length !== beforeProj;


    // Potions
    if (k.pot1 && !potPrev.current.q && st.potHp > 0 && st.hp < st.maxHp) {
      st.potHp--; st.hp = Math.min(st.maxHp, st.hp + 50);
      spawnFloat(pos.current, "+50 HP", "#ff8080");
      onHudUpdate();
    }
    if (k.pot2 && !potPrev.current.e && st.potMp > 0 && st.mp < st.maxMp) {
      st.potMp--; st.mp = Math.min(st.maxMp, st.mp + 30);
      spawnFloat(pos.current, "+30 MP", "#80a0ff");
      onHudUpdate();
    }
    potPrev.current.q = k.pot1;
    potPrev.current.e = k.pot2;

    // Enemies AI
    if (invuln.current > 0) invuln.current -= dt;
    for (const e of enemies.current) {
      if (!e.alive) continue;
      if (e.hitFlash > 0) e.hitFlash -= dt;

      const toP = pos.current.clone().sub(e.pos);
      const dist = toP.length();
      const dir = dist > 0.001 ? toP.clone().normalize() : new THREE.Vector3(1, 0, 0);
      const diffMul = 0.9 + diff * 0.15;

      if (e.kind === "wraith") {
        if (dist < 14) {
          const speed = 4 * diffMul;
          e.vel.x = dir.x * speed;
          e.vel.z = dir.z * speed;
          e.vel.y = dir.y * speed * 0.5;
        } else {
          e.vel.multiplyScalar(0.9);
        }
      } else if (e.kind === "archer") {
        // Kite: keep 6-9 units away, orbit, shoot fireballs.
        const desiredDist = 7.5;
        const speed = 3.4 * diffMul;
        if (dist < 14) {
          const radial = (dist - desiredDist);
          const strafe = new THREE.Vector3(-dir.z, 0, dir.x);
          const move = dir.clone().multiplyScalar(radial * 0.6).add(strafe.multiplyScalar(1.2));
          if (move.length() > 0) move.normalize();
          e.vel.x = move.x * speed;
          e.vel.z = move.z * speed;
        } else {
          e.vel.x *= 0.9; e.vel.z *= 0.9;
        }
        e.vel.y += GRAVITY * dt;
        e.shootTimer = (e.shootTimer ?? 1) - dt;
        if (dist > 3 && dist < 16 && (e.shootTimer ?? 0) <= 0) {
          e.shootTimer = 1.4 + Math.random() * 0.6;
          const from = e.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
          const target = pos.current.clone().add(new THREE.Vector3(0, 0.8, 0));
          const shootDir = target.sub(from).normalize();
          enemyProjectiles.current.push({
            id: nextEnemyProjId.current++,
            pos: from,
            vel: shootDir.multiplyScalar(16),
            life: 1.6,
            dmg: Math.max(2, Math.round(8 * diff - st.def * 0.4)),
          });
        }
      } else if (e.kind === "hopper") {
        const speed = 4.5 * diffMul;
        if (dist < 16) {
          e.vel.x = dir.x * speed;
          e.vel.z = dir.z * speed;
        } else { e.vel.x *= 0.9; e.vel.z *= 0.9; }
        e.vel.y += GRAVITY * dt;
        e.jumpTimer = (e.jumpTimer ?? 0) - dt;
        // Simple ground check for the enemy
        const gy = aabb(e.pos.x, e.pos.y - 0.05, e.pos.z, 0.35, 1.4, world.platforms);
        if (gy !== null && (e.jumpTimer ?? 0) <= 0 && dist < 18) {
          e.vel.y = 13;
          e.jumpTimer = 0.5 + Math.random() * 0.4;
        }
      } else if (e.kind === "sentinel") {
        // Patrol left/right around patrolCenter; if player close, charge.
        const center = e.patrolCenter ?? e.pos;
        const speed = 2.4 * diffMul;
        if (dist < 5) {
          e.vel.x = dir.x * speed * 1.6;
          e.vel.z = dir.z * speed * 1.6;
        } else {
          const offset = e.pos.x - center.x;
          if (offset > 5) e.patrolDir = -1;
          else if (offset < -5) e.patrolDir = 1;
          e.vel.x = (e.patrolDir ?? 1) * speed;
          e.vel.z = 0;
        }
        e.vel.y += GRAVITY * dt;
      } else if (e.kind === "dasher") {
        const speed = 3 * diffMul;
        if (dist < 16) {
          e.vel.x = dir.x * speed;
          e.vel.z = dir.z * speed;
        } else { e.vel.x *= 0.9; e.vel.z *= 0.9; }
        e.dashTimer = (e.dashTimer ?? 2) - dt;
        e.dashActive = (e.dashActive ?? 0) - dt;
        if ((e.dashTimer ?? 0) <= 0 && dist < 14) {
          e.dashActive = 0.28;
          e.dashTimer = 1.8 + Math.random() * 0.8;
        }
        if ((e.dashActive ?? 0) > 0) {
          e.vel.x = dir.x * 16;
          e.vel.z = dir.z * 16;
        }
        e.vel.y += GRAVITY * dt;
      } else {
        // brute / goblin default chase
        if (dist < 12) {
          const baseSpeed = e.kind === "brute" ? 2.5 : 3.5;
          const speed = baseSpeed * diffMul;
          e.vel.x = dir.x * speed;
          e.vel.z = dir.z * speed;
          e.vel.y += GRAVITY * dt;
          if (grounded.current && Math.random() < 0.005) e.vel.y = 8;
        } else {
          e.vel.x *= 0.9; e.vel.z *= 0.9;
          e.vel.y += GRAVITY * dt;
        }
      }

      // Integrate
      const enx = e.pos.x + e.vel.x * dt;
      if (!blocked(enx, e.pos.y, e.pos.z, 0.35, 1.4, world.platforms)) e.pos.x = enx;
      const enz = e.pos.z + e.vel.z * dt;
      if (!blocked(e.pos.x, e.pos.y, enz, 0.35, 1.4, world.platforms)) e.pos.z = enz;
      const eny = e.pos.y + e.vel.y * dt;
      if (e.kind !== "wraith" && e.vel.y <= 0) {
        const land = aabb(e.pos.x, eny, e.pos.z, 0.35, 1.4, world.platforms);
        if (land !== null) { e.pos.y = land; e.vel.y = 0; }
        else e.pos.y = eny;
      } else {
        e.pos.y = eny;
      }
      if (e.pos.y < -15) e.alive = false;

      // Contact damage
      if (dist < 1.1 && invuln.current <= 0) {
        const dmg = Math.max(1, Math.round(((e.kind === "brute" ? 20 : 12) * diff) - st.def));
        st.hp -= dmg;
        invuln.current = 0.8;
        spawnFloat(pos.current, `-${dmg}`, "#ff4040");
        // Knockback
        const kb = pos.current.clone().sub(e.pos).normalize();
        vel.current.x += kb.x * 8;
        vel.current.z += kb.z * 8;
        vel.current.y = 6;
        onHudUpdate();
        if (st.hp <= 0) { onDeath(); return; }
      }
    }

    // Enemy projectiles (fireballs from archers)
    {
      const before = enemyProjectiles.current.length;
      for (const ep of enemyProjectiles.current) {
        if (ep.life <= 0) continue;
        ep.pos.x += ep.vel.x * dt;
        ep.pos.y += ep.vel.y * dt;
        ep.pos.z += ep.vel.z * dt;
        ep.life -= dt;
        if (blocked(ep.pos.x, ep.pos.y, ep.pos.z, 0.1, 0.1, world.platforms)) { ep.life = 0; continue; }
        const d2 = ep.pos.distanceTo(pos.current.clone().add(new THREE.Vector3(0, 0.8, 0)));
        if (d2 < 0.7 && invuln.current <= 0) {
          st.hp -= ep.dmg;
          invuln.current = 0.6;
          spawnFloat(pos.current, `-${ep.dmg}`, "#ff8040");
          onHudUpdate();
          ep.life = 0;
          if (st.hp <= 0) { onDeath(); return; }
        }
      }
      enemyProjectiles.current = enemyProjectiles.current.filter((p) => p.life > 0);
      if (enemyProjectiles.current.length !== before) rerender();
    }

    // Pickups
    for (const p of pickups.current) {
      if (p.taken) continue;
      if (p.pos.distanceTo(pos.current) < 1.2) {
        p.taken = true;
        if (p.kind === "gem") { st.gold += 10; st.xp += 15; spawnFloat(p.pos, "+15 XP +10g", "#ffe040"); }
        else if (p.kind === "hp") { st.potHp++; spawnFloat(p.pos, "+Poción HP", "#ff4040"); }
        else if (p.kind === "mp") { st.potMp++; spawnFloat(p.pos, "+Poción MP", "#4080ff"); }
        else if (p.kind === "checkpoint") {
          checkpointRef.current = [p.pos.x, p.pos.y + 1, p.pos.z];
          st.hp = st.maxHp;
          spawnFloat(p.pos, "CHECKPOINT", "#40ff80");
        }
        onHudUpdate();
      }
    }

    // Goal
    const gd = pos.current.distanceTo(new THREE.Vector3(...world.goal));
    if (gd < 1.5) { onWin(); return; }

    // Floating texts life
    const beforeLen = floats.current.length;
    floats.current.forEach((f) => {
      f.life -= dt;
      f.pos.y += dt * 1.5;
    });
    floats.current = floats.current.filter((f) => f.life > 0);

    // Camera follow (third person). Hold Alt to orbit freely (yaw offset + pitch + wheel zoom).
    if (!keysRef.current.camFree) {
      // Ease the free-look offset back to zero so aim re-syncs with view
      camYawOffsetRef.current *= Math.pow(0.001, dt);
      pitchRef.current += (0.35 - pitchRef.current) * (1 - Math.pow(0.01, dt));
    }
    const yaw = yawRef.current + camYawOffsetRef.current;
    const pitch = pitchRef.current;
    const dist = camDistRef.current;
    const horiz = Math.cos(pitch) * dist;
    const vert = Math.sin(pitch) * dist + 2.5;
    const desired = pos.current.clone().add(new THREE.Vector3(Math.sin(yaw) * horiz, vert, Math.cos(yaw) * horiz));
    camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
    camTarget.current.lerp(pos.current.clone().add(new THREE.Vector3(0, 1, 0)), 1 - Math.pow(0.001, dt));
    camera.lookAt(camTarget.current);


    // Only rerender React tree when the floats list actually changes,
    // otherwise mesh refs update the scene each frame without React work.
    if (floats.current.length !== beforeLen || projChanged) rerender();
  });

  return (
    <>
      <fog attach="fog" args={[world.fog, world.fogNear, world.fogFar]} />
      <color attach="background" args={[world.fog]} />
      <ambientLight intensity={world.ambient} />
      <directionalLight
        position={[10, 20, 5]}
        intensity={0.6}
        color={world.theme === "cave" ? "#ff8060" : world.theme === "sky" ? "#a090ff" : world.theme === "ice" ? "#a0d0ff" : world.theme === "abyss" ? "#ff2020" : "#e0e0ff"}
      />
      {world.theme === "sky" && <Stars radius={80} depth={40} count={2000} factor={4} fade />}
      {world.theme === "void" && <Stars radius={60} depth={60} count={3000} factor={2} fade speed={0.3} />}
      <ScareFX scare={world.scare} playerRef={pos} />
      {/* Platforms */}
      {world.platforms.map((p, i) => (
        <mesh key={i} position={p.pos} castShadow receiveShadow>
          <boxGeometry args={p.size} />
          <meshStandardMaterial color={p.color ?? "#444"} roughness={0.85} />
        </mesh>
      ))}
      {/* Lava */}
      {world.lava.map((l, i) => (
        <LavaPool key={i} pos={l.pos} size={l.size} />
      ))}
      {/* Enemies */}
      {enemies.current.map((e) => (
        <EnemyMesh key={e.id} e={e} playerRef={pos} />
      ))}
      {/* Pickups */}
      {pickups.current.map((p) => (
        <PickupMesh key={p.id} p={p} />
      ))}
      {/* Goal */}
      <Goal pos={world.goal} />
      {/* Mage */}
      <MageMemo posRef={pos} facingRef={facing} attackingRef={attackTimer} walkPhaseRef={walkPhase} />
      {/* Projectiles */}
      {projectiles.current.map((pr) => (
        <ProjectileMesh key={pr.id} pr={pr} />
      ))}
      {/* Enemy projectiles */}
      {enemyProjectiles.current.map((pr) => (
        <EnemyProjectileMesh key={pr.id} pr={pr} />
      ))}
      {/* Floating texts */}
      {floats.current.map((f) => (
        <FloatingText key={f.id} ft={f} />
      ))}
    </>
  );
}

/* ---------------- MUSIC (procedural dark ambient per world) ---------------- */
function useAmbientMusic(active: boolean, worldIdx: number, difficulty: number) {
  useEffect(() => {
    if (!active) return;
    const AC = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
    if (!AC) return;
    let ctx: AudioContext;
    try { ctx = new AC(); } catch { return; }

    // Per-world palette: dark/dissonant intervals (tritones, minor 2nds, minor 9ths)
    const palettes: { root: number; intervals: number[]; filter: number; wave: OscillatorType }[] = [
      { root: 82,  intervals: [0, 1, 6, 13],     filter: 620, wave: "sawtooth" }, // Bosque
      { root: 69,  intervals: [0, 1, 6, 11],     filter: 480, wave: "sawtooth" }, // Cementerio
      { root: 62,  intervals: [0, 6, 11, 13],    filter: 720, wave: "sawtooth" }, // Cavernas
      { root: 58,  intervals: [0, 1, 6, 10, 13], filter: 520, wave: "square"   }, // Cripta
      { root: 92,  intervals: [0, 1, 6, 8],      filter: 660, wave: "sawtooth" }, // Cielos
      { root: 49,  intervals: [0, 1, 6, 13],     filter: 380, wave: "sawtooth" }, // Vacío
      { root: 78,  intervals: [0, 1, 6, 11],     filter: 600, wave: "sawtooth" }, // Hielo
      { root: 41,  intervals: [0, 1, 6, 7, 13],  filter: 300, wave: "sawtooth" }, // Abismo
    ];
    const p = palettes[Math.min(worldIdx, palettes.length - 1)];

    const master = ctx.createGain();
    master.gain.value = 0;
    master.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 1.5);
    master.connect(ctx.destination);

    // Slight distortion for grit
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = Math.tanh(x * 2);
    }
    shaper.curve = curve;
    shaper.connect(master);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = p.filter;
    filter.Q.value = 8;
    filter.connect(shaper);

    // Slow filter wobble
    const filterLfo = ctx.createOscillator();
    const filterLfoGain = ctx.createGain();
    filterLfo.frequency.value = 0.08;
    filterLfoGain.gain.value = p.filter * 0.4;
    filterLfo.connect(filterLfoGain).connect(filter.frequency);
    filterLfo.start();

    const oscs: OscillatorNode[] = [filterLfo];

    // Dissonant drone chord (heavily detuned pairs)
    p.intervals.forEach((semi, i) => {
      const freq = p.root * Math.pow(2, semi / 12);
      [-8, 0, 9].forEach((det, j) => {
        const o = ctx.createOscillator();
        o.type = p.wave;
        o.frequency.value = freq;
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.value = 0.09 / (i + 1);
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 0.07 + i * 0.05 + j * 0.03;
        lfoGain.gain.value = 8;
        lfo.connect(lfoGain).connect(o.detune);
        lfo.start();
        o.connect(g).connect(filter);
        o.start();
        oscs.push(o, lfo);
      });
    });

    // Sub-bass rumble (very low, slow amplitude tremor)
    {
      const sub = ctx.createOscillator();
      sub.type = "sine";
      sub.frequency.value = p.root / 2;
      const sg = ctx.createGain();
      sg.gain.value = 0.25;
      const trem = ctx.createOscillator();
      const tremGain = ctx.createGain();
      trem.frequency.value = 0.3 + Math.random() * 0.4;
      tremGain.gain.value = 0.18;
      trem.connect(tremGain).connect(sg.gain);
      trem.start();
      sub.connect(sg).connect(master);
      sub.start();
      oscs.push(sub, trem);
    }

    // Noise buffer (pink-ish) for wind and whispers
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    let lastN = 0;
    for (let i = 0; i < nd.length; i++) {
      const white = Math.random() * 2 - 1;
      lastN = (lastN + 0.02 * white) / 1.02;
      nd[i] = lastN * 3;
    }

    // Continuous wind
    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuf; wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = "bandpass";
    windFilter.frequency.value = 500;
    windFilter.Q.value = 1.2;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.06;
    const windLfo = ctx.createOscillator();
    const windLfoGain = ctx.createGain();
    windLfo.frequency.value = 0.15;
    windLfoGain.gain.value = 0.05;
    windLfo.connect(windLfoGain).connect(windGain.gain);
    windLfo.start();
    wind.connect(windFilter).connect(windGain).connect(master);
    wind.start();
    oscs.push(windLfo);

    // Heartbeat (double thump, accelerates with difficulty)
    const bpm = 42 + difficulty * 10;
    const beatInt = 60 / bpm;
    const kick = (offset = 0, vol = 0.4) => {
      const t = ctx.currentTime + offset;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(80, t);
      o.frequency.exponentialRampToValueAtTime(30, t + 0.22);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + 0.35);
    };
    const beatTimer = setInterval(() => { kick(0, 0.45); kick(0.12, 0.28); }, beatInt * 1000);

    // Dissonant metallic stab (random)
    const stabTimer = setInterval(() => {
      if (Math.random() > 0.45) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "square";
      const stabSemi = p.intervals[1 + Math.floor(Math.random() * (p.intervals.length - 1))];
      o.frequency.value = p.root * Math.pow(2, (stabSemi + 12) / 12) * 2;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
      const sFilter = ctx.createBiquadFilter();
      sFilter.type = "bandpass";
      sFilter.frequency.value = 1500 + Math.random() * 2000;
      sFilter.Q.value = 12;
      o.connect(g).connect(sFilter).connect(master);
      o.start(t); o.stop(t + 1.7);
    }, 2800);

    // Whisper bursts (short bandpassed noise)
    const whisperTimer = setInterval(() => {
      if (Math.random() > 0.35) return;
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 900 + Math.random() * 1800;
      bp.Q.value = 20;
      const g = ctx.createGain();
      const dur = 0.4 + Math.random() * 0.6;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.12, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      // Panning
      const pan = ctx.createStereoPanner();
      pan.pan.value = (Math.random() * 2 - 1) * 0.9;
      src.connect(bp).connect(g).connect(pan).connect(master);
      src.start(t); src.stop(t + dur + 0.1);
    }, 4200);

    // Rare screams (rising pitch)
    const screamTimer = setInterval(() => {
      if (Math.random() > 0.18) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(180 + Math.random() * 120, t);
      o.frequency.exponentialRampToValueAtTime(900 + Math.random() * 400, t + 1.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.09, t + 0.3);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 700;
      bp.Q.value = 4;
      const pan = ctx.createStereoPanner();
      pan.pan.value = (Math.random() * 2 - 1) * 0.8;
      o.connect(g).connect(bp).connect(pan).connect(master);
      o.start(t); o.stop(t + 1.5);
    }, 9000);

    const resume = () => { ctx.resume().catch(() => {}); };
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
    resume();

    return () => {
      clearInterval(beatTimer);
      clearInterval(stabTimer);
      clearInterval(whisperTimer);
      clearInterval(screamTimer);
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
        setTimeout(() => {
          oscs.forEach((o) => { try { (o as any).stop?.(); } catch {} });
          try { wind.stop(); } catch {}
          ctx.close().catch(() => {});
        }, 500);
      } catch { /* noop */ }
    };
  }, [active, worldIdx, difficulty]);
}



/* ---------------- HUD ---------------- */
function Bar({ value, max, color, label }: { value: number; max: number; color: string; label: string }) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 11, color: "#ccc", marginBottom: 2, letterSpacing: 1 }}>
        {label} <span style={{ color: "#888" }}>{Math.ceil(value)}/{max}</span>
      </div>
      <div style={{ width: 200, height: 10, background: "#000a", border: "1px solid #333", borderRadius: 3 }}>
        <div style={{ width: `${pct * 100}%`, height: "100%", background: color, transition: "width .15s" }} />
      </div>
    </div>
  );
}

/* ---------------- ROOT ---------------- */
function Index() {
  const [worldIdx, setWorldIdx] = useState(0);
  const [status, setStatus] = useState<"play" | "dead" | "win" | "victory" | "menu">("menu");
  const [mounted, setMounted] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [, setHudTick] = useState(0);
  const statsRef = useRef<Stats>(initialStats());
  const keysRef = useKeys();
  const world = WORLDS[worldIdx];
  useAmbientMusic(status === "play", worldIdx, world.difficulty);
  const checkpointRef = useRef<Vec3>(world.spawn);

  // Store subscriptions
  const settings = useGame((s) => s.settings);
  const activeMenu = useGame((s) => s.activeMenu);
  const stamina = useGame((s) => s.stamina);
  const maxStamina = useGame((s) => s.maxStamina);
  const quests = useGame((s) => s.quests);
  const setMenu = useGame((s) => s.setMenu);
  const saveToSlot = useGame((s) => s.saveToSlot);

  // Shared refs for HUD (populated by Scene each frame).
  const sharedPos = useRef({ x: 0, y: 0, z: 0 });
  const sharedFacing = useRef(0);
  const sharedEnemies = useRef<Enemy[]>([]);
  const blipsRef = useRef<MiniBlip[]>([]);
  const marksRef = useRef<CompassMark[]>([]);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { useGame.getState().optimizeForStartup(); }, []);
  useEffect(() => { checkpointRef.current = world.spawn; }, [worldIdx, world.spawn]);

  // Rebuild minimap blips + compass marks each ~150ms (cheap, no per-frame React work)
  useEffect(() => {
    const id = setInterval(() => {
      const alive = sharedEnemies.current.filter((e) => e.alive);
      const blips: MiniBlip[] = alive.map((e) => ({
        x: e.pos.x, z: e.pos.z,
        color: e.kind === "brute" ? "#ff2020" : e.kind === "wraith" ? "#c080ff" : "#ff8848",
        size: e.kind === "brute" ? 4 : 3,
      }));
      // Goal
      blips.push({ x: world.goal[0], z: world.goal[2], color: "#ffe040", size: 5 });
      blipsRef.current = blips;

      const marks: CompassMark[] = [];
      // Current active quest with target OR the world goal as fallback
      const active = quests.find((q) => q.status === "active" && q.target) ?? null;
      if (active?.target) marks.push({ x: active.target[0], z: active.target[2], color: "#ffe040", icon: "◈", label: active.title });
      marks.push({ x: world.goal[0], z: world.goal[2], color: "#a080ff", icon: "★", label: "Portal" });
      marksRef.current = marks;
    }, 150);
    return () => clearInterval(id);
  }, [world.goal, quests]);

  // Auto-save every 2 minutes while playing.
  useEffect(() => {
    if (status !== "play") return;
    const id = setInterval(() => {
      const st = statsRef.current;
      saveToSlot(0, {
        worldIdx, stats: st, checkpoint: checkpointRef.current,
      }, { world: world.name, level: st.level });
    }, 120_000);
    return () => clearInterval(id);
  }, [status, worldIdx, world.name, saveToSlot]);

  const onDeath = () => {
    const st = statsRef.current;
    // Always restore hp so useFrame doesn't retrigger onDeath every frame.
    st.hp = st.maxHp;
    st.lives--;
    if (st.lives <= 0) {
      st.lives = 0;
      setStatus("dead");
    } else {
      setStatus("play");
      setHudTick((v) => v + 1);
    }
  };
  const onWin = () => {
    // Advance prologue quest on first win
    const gs = useGame.getState();
    gs.updateQuest("prologue", 1);
    if (worldIdx + 1 >= WORLDS.length) setStatus("victory");
    else {
      setStatus("win");
      setTimeout(() => {
        setWorldIdx((i) => i + 1);
        setStatus("play");
      }, 1500);
    }
  };

  const [sceneKey, setSceneKey] = useState(0);
  // Only remount the Canvas when the world actually changes. Remounting on every
  // status change (menu→play→win→play) tore down WebGL + reloaded GLBs multiple
  // times per realm transition, freezing the browser.
  useEffect(() => {
    setSceneReady(false);
    setSceneKey((k) => k + 1);
  }, [worldIdx]);

  const handleSceneReady = useCallback(() => { setSceneReady(true); }, []);

  const st = statsRef.current;

  const startGame = () => {
    setMenu(null);
    setSceneReady(false);
    statsRef.current = initialStats();
    setWorldIdx(0);
    checkpointRef.current = WORLDS[0].spawn;
    setStatus("play");
  };

  // Save / load helpers
  const captureShot = () => {
    const cv = document.querySelector("canvas") as HTMLCanvasElement | null;
    if (!cv) return undefined;
    try {
      const shot = document.createElement("canvas");
      shot.width = 320;
      shot.height = 180;
      const ctx = shot.getContext("2d");
      if (!ctx) return undefined;
      ctx.drawImage(cv, 0, 0, shot.width, shot.height);
      return shot.toDataURL("image/jpeg", 0.35);
    } catch { return undefined; }
  };
  const doSave = (slotId: number) => {
    saveToSlot(slotId, {
      worldIdx, stats: statsRef.current, checkpoint: checkpointRef.current,
    }, { world: world.name, level: statsRef.current.level, screenshot: captureShot() });
  };
  const doLoad = (slot: SaveSlot) => {
    try {
      const d = slot.data as { worldIdx: number; stats: Stats; checkpoint: Vec3 };
      statsRef.current = d.stats;
      checkpointRef.current = d.checkpoint;
      setWorldIdx(d.worldIdx);
      setStatus("play");
      setMenu(null);
      setSceneKey((k) => k + 1);
    } catch { /* ignore */ }
  };

  // Mobile controls
  const setKey = (name: keyof Keys, v: boolean) => { keysRef.current[name] = v; };
  const btn = (label: string, name: keyof Keys) => (
    <button
      onTouchStart={(e) => { e.preventDefault(); setKey(name, true); }}
      onTouchEnd={(e) => { e.preventDefault(); setKey(name, false); }}
      onMouseDown={() => setKey(name, true)}
      onMouseUp={() => setKey(name, false)}
      onMouseLeave={() => setKey(name, false)}
      style={{
        width: 52, height: 52, borderRadius: "50%",
        background: "#3a1a5aee", color: "#fff", border: "2px solid #7ee6ff",
        fontWeight: 700, fontSize: 14, touchAction: "none",
      }}
    >{label}</button>
  );

  const hudVisible = settings.hudVisible;
  const activeQuest = quests.find((q) => q.status === "active");

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden", fontFamily: "system-ui" }}>
      {mounted && status !== "menu" && status !== "dead" && status !== "victory" && (
        <Canvas
          key={sceneKey}
          shadows={settings.shadows && settings.quality === "high"}
          camera={{ position: [0, 6, 10], fov: settings.fov }}
          dpr={settings.quality === "low" ? [0.6, 0.85] : [0.75, 1]}
          gl={{
            toneMappingExposure: settings.brightness,
            antialias: settings.quality === "high",
            powerPreference: "high-performance",
            stencil: false,
          }}
          style={{ width: "100vw", height: "100vh" }}
        >
          <Suspense fallback={null}>
            <Scene
              world={world}
              statsRef={statsRef}
              keysRef={keysRef}
              checkpointRef={checkpointRef}
              onDeath={onDeath}
              onWin={onWin}
              onReady={handleSceneReady}
              onHudUpdate={() => setHudTick((v) => v + 1)}
              sharedPosRef={sharedPos}
              sharedFacingRef={sharedFacing}
              sharedEnemiesRef={sharedEnemies}
            />
            <PostFX />
          </Suspense>
        </Canvas>
      )}

      {/* HUD */}
      {status === "play" && hudVisible && (
        <>
          {/* Top-left: stats panel */}
          <div style={{
            position: "absolute", top: 12, left: 12, padding: 12,
            background: "linear-gradient(180deg, #1a0838cc, #0a0418cc)",
            border: "1px solid #7ee6ff44", borderRadius: 8, color: "#fff",
            backdropFilter: "blur(4px)", minWidth: 240,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#a080ff", marginBottom: 8, letterSpacing: 1 }}>
              {world.name} · Nv.{st.level} · {worldIdx + 1}/{WORLDS.length}
            </div>
            <StatBar value={st.hp} max={st.maxHp} color="#e04040" glow="#ff4040" label="Vida" />
            <StatBar value={stamina} max={maxStamina} color="#5aff8a" glow="#5aff8a" label="Stamina" />
            <StatBar value={st.mp} max={st.maxMp} color="#4080ff" label="Maná" />
            <StatBar value={st.xp} max={st.xpNext} color="#ffe040" label="XP" />
            <div style={{ fontSize: 11, color: "#ccc", marginTop: 8, fontFamily: "monospace", letterSpacing: 1 }}>
              ⚔ {st.str} · 🛡 {st.def} · 🪙 {st.gold} · ❤ {st.lives}
            </div>
            <div style={{ fontSize: 10, color: "#888", marginTop: 4 }}>
              Q Poc.HP ({st.potHp}) · E Poc.MP ({st.potMp})
            </div>
          </div>

          {/* Top-right: minimap + battery */}
          <div style={{ position: "absolute", top: 12, right: 12, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <Minimap playerRef={sharedPos} facingRef={sharedFacing} blipsRef={blipsRef} />
            <BatteryPill />
            {activeQuest && (
              <div style={{
                maxWidth: 200, padding: "6px 10px", background: "#0a0418dd",
                border: "1px solid #ffe04044", borderRadius: 4,
                color: "#eee", fontSize: 11, fontFamily: "monospace", textAlign: "right",
              }}>
                <div style={{ color: "#ffe040", letterSpacing: 1, textTransform: "uppercase", fontSize: 9 }}>Objetivo</div>
                <div>{activeQuest.title}</div>
                <div style={{ color: "#888", fontSize: 10 }}>{activeQuest.progress}/{activeQuest.goal}</div>
              </div>
            )}
          </div>

          {/* Top-center: quest compass */}
          <div style={{ position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", pointerEvents: "none" }}>
            <QuestCompass playerRef={sharedPos} facingRef={sharedFacing} marksRef={marksRef} />
          </div>

          {/* Bottom hint bar */}
          <div style={{
            position: "absolute", bottom: 12, left: "50%", transform: "translateX(-50%)",
            padding: "6px 14px", background: "#0a0418cc",
            border: "1px solid #7ee6ff22", borderRadius: 20,
            color: "#aaa", fontSize: 10, fontFamily: "monospace", letterSpacing: 2, textTransform: "uppercase",
          }}>
            Esc pausa · I inventario · J diario · F linterna · H ocultar HUD · Shift correr
          </div>

          {/* Mobile controls */}
          <div style={{ position: "absolute", bottom: 20, left: 20, display: "grid", gridTemplateColumns: "repeat(3, 52px)", gap: 6 }}>
            <div />{btn("↑", "fwd")}<div />
            {btn("←", "left")}{btn("↓", "back")}{btn("→", "right")}
          </div>
          <div style={{ position: "absolute", bottom: 20, right: 20, display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", width: 180 }}>
            {btn("Z", "attack")}{btn("⤒", "jump")}
            {btn("Q", "pot1")}{btn("E", "pot2")}
          </div>
        </>
      )}

      {/* Menu overlays */}
      {activeMenu === "pause" && status !== "menu" && (
        <PauseMenu
          onQuit={() => { setMenu(null); setStatus("menu"); }}
          onSave={() => { doSave(0); setMenu(null); }}
          onLoad={() => {
            const slot = useGame.getState().saves.find((s) => s.id === 0);
            if (slot) doLoad(slot);
          }}
        />
      )}
      {activeMenu === "settings" && <SettingsPanel />}
      {activeMenu === "character" && <CharacterCreator />}
      {activeMenu === "inventory" && <Inventory />}
      {activeMenu === "journal" && <Journal />}
      {activeMenu === "saves" && <SaveLoadPanel onSave={doSave} onLoad={doLoad} />}

      {status === "win" && (
        <Overlay title="¡Reino Superado!" subtitle="Preparando el siguiente..." color="#a080ff" />
      )}
      {status === "victory" && (
        <Overlay title="¡Victoria!" subtitle={`Nivel ${st.level} · ${st.gold} oro`} color="#ffe040" onClick={startGame} btn="Jugar de nuevo" />
      )}
      {status === "dead" && (
        <Overlay title="Has caído" subtitle="La oscuridad reclama al mago" color="#e04040" onClick={startGame} btn="Reintentar" />
      )}
      {status === "play" && !sceneReady && (
        <Overlay title="Cargando" subtitle="Preparando el reino..." color="#7ee6ff" />
      )}
      {status === "menu" && (
        <Overlay
          title="ARCANE REALMS"
          subtitle="Aventura RPG 3D · Tres reinos de sombra te esperan"
          color="#a080ff"
          onClick={mounted ? startGame : undefined}
          btn={mounted ? "Comenzar aventura" : undefined}
          onCustomize={mounted ? () => setMenu("character") : undefined}
        />
      )}
    </div>
  );
}


function Overlay({ title, subtitle, color, onClick, btn, onCustomize }: {
  title: string; subtitle: string; color: string;
  onClick?: () => void; btn?: string; onCustomize?: () => void;
}) {
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "radial-gradient(ellipse at center, #1a0838ee, #000f)",
      color: "#fff", textAlign: "center", padding: 20, zIndex: 50,
    }}>
      <h1 style={{ fontSize: 56, margin: 0, color, textShadow: `0 0 30px ${color}, 0 0 60px ${color}88`, letterSpacing: 4 }}>{title}</h1>
      <p style={{ fontSize: 16, color: "#ccc", marginTop: 12 }}>{subtitle}</p>
      <div style={{ display: "flex", gap: 12, marginTop: 32, flexWrap: "wrap", justifyContent: "center" }}>
        {btn && onClick && (
          <button
            onClick={onClick}
            style={{
              padding: "14px 36px", fontSize: 18, fontWeight: 700,
              background: `linear-gradient(180deg, ${color}, ${color}88)`,
              color: "#0a0418", border: "2px solid #fff", borderRadius: 8,
              cursor: "pointer", letterSpacing: 2, textTransform: "uppercase",
              boxShadow: `0 0 30px ${color}`,
            }}
          >{btn}</button>
        )}
        {onCustomize && (
          <button
            onClick={onCustomize}
            style={{
              padding: "14px 28px", fontSize: 14, fontWeight: 700,
              background: "transparent",
              color: "#fff", border: "2px solid #7ee6ff", borderRadius: 8,
              cursor: "pointer", letterSpacing: 2, textTransform: "uppercase",
            }}
          >Personalizar personaje</button>
        )}
      </div>
      <p style={{ fontSize: 12, color: "#666", marginTop: 24 }}>
        WASD · Espacio · Z ataque · Q/E pociones · Shift correr · F linterna · Esc pausa
      </p>
    </div>
  );
}

