import { createFileRoute } from "@tanstack/react-router";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sky, Stars, Text } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

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
  kind: "goblin" | "wraith" | "brute";
  alive: boolean;
  hitFlash: number;
};
type Pickup = {
  id: number;
  pos: THREE.Vector3;
  kind: "gem" | "hp" | "mp" | "checkpoint";
  taken: boolean;
};
type FloatText = { id: number; pos: THREE.Vector3; text: string; color: string; life: number };

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
  }
  return plats;
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

/* ---------------- WORLDS ---------------- */
function buildWorlds(): WorldDef[] {
  const worlds: WorldDef[] = [];

  // I - Bosque Maldito
  {
    const path = [
      { pos: [0, -0.5, 0] as Vec3, size: [20, 1, 8] as Vec3, color: "#2a4a2f" },
      ...genPath(6, 14, 2, 8, 1.5, 4, 2, "#3a5a3a"),
      { pos: [62, 3, 0] as Vec3, size: [8, 1, 6] as Vec3, color: "#2a4a2f" },
    ];
    worlds.push({
      name: "I · Bosque Maldito", theme: "grass", fog: "#0a1810", ground: "#1a2b1e", ambient: 0.35,
      fogNear: 15, fogFar: 55, difficulty: 1, spawn: [0, 2, 0], goal: [62, 5, 0],
      platforms: path,
      enemies: mkEnemies([[1, "goblin"], [3, "goblin"], [5, "wraith"], [6, "brute"]], path),
      pickups: mkPickups([[1, "gem"], [3, "gem"], [4, "hp"], [5, "gem"], [6, "checkpoint"]], path),
      lava: [{ pos: [26, -1.2, 0], size: [3, 4] }, { pos: [42, -1.2, 0], size: [3, 4] }],
    });
  }

  // II - Cementerio Brumoso
  {
    const path = [
      { pos: [0, -0.5, 0] as Vec3, size: [16, 1, 8] as Vec3, color: "#1a1a20" },
      ...genPath(8, 12, 2, 7, 2, 3.2, 3, "#2a2530"),
      { pos: [70, 4, 0] as Vec3, size: [8, 1, 6] as Vec3, color: "#1a1a20" },
    ];
    worlds.push({
      name: "II · Cementerio Brumoso", theme: "grave", fog: "#050508", ground: "#0f0f14", ambient: 0.12,
      fogNear: 8, fogFar: 30, difficulty: 1.3, spawn: [0, 2, 0], goal: [70, 6, 0],
      platforms: path,
      enemies: mkEnemies([[1, "wraith"], [3, "wraith"], [4, "goblin"], [6, "wraith"], [7, "brute"], [8, "wraith"]], path),
      pickups: mkPickups([[2, "gem"], [4, "checkpoint"], [5, "hp"], [7, "mp"], [8, "gem"]], path),
      lava: [],
      scare: { flicker: true, whispers: true },
    });
  }

  // III - Cavernas Ardientes
  {
    const path = [
      { pos: [0, -0.5, 0] as Vec3, size: [14, 1, 8] as Vec3, color: "#3a1a15" },
      ...genPath(9, 10, 2.5, 6.5, 2, 2.8, 3, "#4a2015"),
      { pos: [70, 6, 0] as Vec3, size: [8, 1, 6] as Vec3, color: "#3a1a15" },
    ];
    worlds.push({
      name: "III · Cavernas Ardientes", theme: "cave", fog: "#1a0808", ground: "#2a1512", ambient: 0.15,
      fogNear: 12, fogFar: 40, difficulty: 1.6, spawn: [0, 2, 0], goal: [70, 8, 0],
      platforms: path,
      enemies: mkEnemies([[1, "wraith"], [2, "goblin"], [4, "brute"], [6, "wraith"], [7, "brute"], [8, "wraith"], [9, "brute"]], path),
      pickups: mkPickups([[2, "gem"], [3, "mp"], [5, "checkpoint"], [7, "hp"], [9, "gem"]], path),
      lava: lavaLine(14, 8, 7, [3, 6]),
      scare: { redLight: true },
    });
  }

  // IV - Cripta de Huesos
  {
    const path = [
      { pos: [0, -0.5, 0] as Vec3, size: [12, 1, 8] as Vec3, color: "#2a2520" },
      ...genPath(10, 9, 3, 6, 2.5, 2.4, 4, "#3a3025"),
      { pos: [72, 8, 0] as Vec3, size: [8, 1, 6] as Vec3, color: "#2a2520" },
    ];
    worlds.push({
      name: "IV · Cripta de Huesos", theme: "crypt", fog: "#080605", ground: "#1a1510", ambient: 0.1,
      fogNear: 7, fogFar: 26, difficulty: 2.0, spawn: [0, 2, 0], goal: [72, 10, 0],
      platforms: path,
      enemies: mkEnemies([[1, "brute"], [3, "wraith"], [4, "brute"], [5, "wraith"], [7, "brute"], [8, "wraith"], [9, "brute"], [10, "brute"]], path),
      pickups: mkPickups([[2, "gem"], [4, "hp"], [6, "checkpoint"], [8, "mp"], [10, "gem"]], path),
      lava: lavaLine(12, 6, 9, [4, 7]),
      scare: { flicker: true, whispers: true, redLight: true },
    });
  }

  // V - Cielos de Sombra
  {
    const base = 10;
    const path = [
      { pos: [0, base, 0] as Vec3, size: [10, 1, 6] as Vec3, color: "#2a2a4a" },
      ...genPath(11, 10, base + 2, 5.5, 3, 2.2, 4, "#2a2a4a"),
      { pos: [72, base + 8, 0] as Vec3, size: [8, 1, 6] as Vec3, color: "#2a2a4a" },
    ];
    worlds.push({
      name: "V · Cielos de Sombra", theme: "sky", fog: "#0a0a1e", ground: "#151530", ambient: 0.2,
      fogNear: 10, fogFar: 35, difficulty: 2.5, spawn: [0, base + 2, 0], goal: [72, base + 10, 0],
      platforms: path,
      enemies: mkEnemies([[1, "wraith"], [3, "wraith"], [4, "brute"], [5, "wraith"], [7, "wraith"], [8, "brute"], [9, "wraith"], [10, "wraith"], [11, "brute"]], path),
      pickups: mkPickups([[2, "gem"], [4, "hp"], [6, "checkpoint"], [8, "mp"], [10, "gem"], [11, "gem"]], path),
      lava: [],
    });
  }

  // VI - Torre del Vacío
  {
    const path = [
      { pos: [0, 0, 0] as Vec3, size: [8, 1, 8] as Vec3, color: "#1a0a2a" },
      ...genPath(13, 8, 3, 5, 3.5, 2, 5, "#25153a"),
      { pos: [74, 12, 0] as Vec3, size: [8, 1, 6] as Vec3, color: "#1a0a2a" },
    ];
    worlds.push({
      name: "VI · Torre del Vacío", theme: "void", fog: "#02020a", ground: "#080810", ambient: 0.08,
      fogNear: 6, fogFar: 22, difficulty: 3.0, spawn: [0, 2, 0], goal: [74, 14, 0],
      platforms: path,
      enemies: mkEnemies([[1, "wraith"], [2, "brute"], [3, "wraith"], [4, "brute"], [6, "wraith"], [7, "brute"], [8, "wraith"], [9, "brute"], [10, "wraith"], [11, "brute"], [13, "brute"]], path),
      pickups: mkPickups([[2, "gem"], [5, "checkpoint"], [7, "hp"], [9, "mp"], [11, "gem"], [12, "gem"]], path),
      lava: [],
      scare: { flicker: true, whispers: true },
    });
  }

  // VII - Infierno Congelado
  {
    const path = [
      { pos: [0, -0.5, 0] as Vec3, size: [10, 1, 8] as Vec3, color: "#1a2a3a" },
      ...genPath(14, 9, 2, 5, 3, 1.8, 5, "#2a3a4f" ),
      { pos: [76, 6, 0] as Vec3, size: [8, 1, 6] as Vec3, color: "#1a2a3a" },
    ];
    worlds.push({
      name: "VII · Infierno Congelado", theme: "ice", fog: "#0a0a15", ground: "#1a1f2a", ambient: 0.12,
      fogNear: 8, fogFar: 28, difficulty: 3.6, spawn: [0, 2, 0], goal: [76, 8, 0],
      platforms: path,
      enemies: mkEnemies([[1, "wraith"], [2, "brute"], [3, "wraith"], [4, "brute"], [5, "wraith"], [7, "brute"], [8, "brute"], [9, "wraith"], [10, "brute"], [11, "wraith"], [12, "brute"], [13, "brute"], [14, "wraith"]], path),
      pickups: mkPickups([[2, "gem"], [4, "hp"], [6, "checkpoint"], [8, "mp"], [10, "gem"], [12, "hp"], [14, "gem"]], path),
      lava: lavaLine(14, 8, 8, [4, 7]),
      scare: { redLight: true, whispers: true },
    });
  }

  // VIII - Abismo Final
  {
    const path = [
      { pos: [0, -0.5, 0] as Vec3, size: [10, 1, 8] as Vec3, color: "#20050a" },
      ...genPath(16, 9, 3, 4.5, 4, 1.6, 6, "#35060a"),
      { pos: [80, 10, 0] as Vec3, size: [10, 1, 8] as Vec3, color: "#40080a" },
    ];
    worlds.push({
      name: "VIII · Abismo Final", theme: "abyss", fog: "#08000a", ground: "#180008", ambient: 0.05,
      fogNear: 5, fogFar: 18, difficulty: 4.5, spawn: [0, 2, 0], goal: [80, 12, 0],
      platforms: path,
      enemies: mkEnemies([
        [1, "brute"], [2, "wraith"], [3, "brute"], [4, "brute"], [5, "wraith"], [6, "brute"],
        [7, "brute"], [8, "wraith"], [9, "brute"], [10, "brute"], [11, "wraith"], [12, "brute"],
        [13, "brute"], [14, "wraith"], [15, "brute"], [16, "brute"],
      ], path),
      pickups: mkPickups([[2, "gem"], [4, "hp"], [6, "checkpoint"], [8, "mp"], [10, "hp"], [12, "checkpoint"], [14, "mp"], [16, "gem"]], path),
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
const ATTACK_COOLDOWN = 0.4;

/* ---------------- INPUT ---------------- */
type Keys = {
  fwd: boolean; back: boolean; left: boolean; right: boolean;
  jump: boolean; attack: boolean; pot1: boolean; pot2: boolean;
};
function useKeys() {
  const keys = useRef<Keys>({ fwd: false, back: false, left: false, right: false, jump: false, attack: false, pot1: false, pot2: false });
  useEffect(() => {
    const map = (e: KeyboardEvent, v: boolean) => {
      const k = e.key.toLowerCase();
      if (k === "w" || k === "arrowup") keys.current.fwd = v;
      if (k === "s" || k === "arrowdown") keys.current.back = v;
      if (k === "a" || k === "arrowleft") keys.current.left = v;
      if (k === "d" || k === "arrowright") keys.current.right = v;
      if (k === " ") { keys.current.jump = v; e.preventDefault(); }
      if (k === "z" || k === "j") keys.current.attack = v;
      if (k === "q") keys.current.pot1 = v;
      if (k === "e") keys.current.pot2 = v;
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

/* ---------------- MAGE ---------------- */
function Mage({ posRef, facingRef, attackingRef, walkPhaseRef }: {
  posRef: React.MutableRefObject<THREE.Vector3>;
  facingRef: React.MutableRefObject<number>;
  attackingRef: React.MutableRefObject<number>;
  walkPhaseRef: React.MutableRefObject<number>;
}) {
  const group = useRef<THREE.Group>(null!);
  const staff = useRef<THREE.Group>(null!);
  const capeRef = useRef<THREE.Mesh>(null!);
  useFrame((_, dt) => {
    if (!group.current) return;
    group.current.position.copy(posRef.current);
    group.current.rotation.y = facingRef.current;
    const bob = Math.sin(walkPhaseRef.current * 10) * 0.08;
    group.current.position.y += bob;
    if (staff.current) {
      const atk = attackingRef.current;
      if (atk > 0) {
        staff.current.rotation.x = -Math.sin(atk * Math.PI) * 1.8;
      } else {
        staff.current.rotation.x = Math.sin(walkPhaseRef.current * 10) * 0.2 - 0.2;
      }
    }
    if (capeRef.current) {
      capeRef.current.rotation.x = Math.sin(walkPhaseRef.current * 6) * 0.15 + 0.1;
    }
  });
  return (
    <group ref={group}>
      {/* Robe (body) */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <coneGeometry args={[0.55, 1.6, 12]} />
        <meshStandardMaterial color="#3a1a5a" roughness={0.9} />
      </mesh>
      {/* Cape */}
      <mesh ref={capeRef} position={[0, 0.9, -0.35]} castShadow>
        <planeGeometry args={[1.1, 1.4]} />
        <meshStandardMaterial color="#1a0838" roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {/* Head + hood */}
      <mesh position={[0, 1.55, 0]} castShadow>
        <sphereGeometry args={[0.35, 16, 16]} />
        <meshStandardMaterial color="#1a0838" roughness={0.8} />
      </mesh>
      {/* Glowing eyes */}
      <mesh position={[0.12, 1.5, 0.28]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#7ee6ff" emissive="#7ee6ff" emissiveIntensity={2.5} />
      </mesh>
      <mesh position={[-0.12, 1.5, 0.28]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial color="#7ee6ff" emissive="#7ee6ff" emissiveIntensity={2.5} />
      </mesh>
      {/* Staff/sword */}
      <group ref={staff} position={[0.35, 1.0, 0.2]}>
        <mesh position={[0.4, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 1.6, 8]} />
          <meshStandardMaterial color="#3a2a1a" />
        </mesh>
        <mesh position={[1.2, 0, 0]}>
          <sphereGeometry args={[0.15, 12, 12]} />
          <meshStandardMaterial color="#7ee6ff" emissive="#7ee6ff" emissiveIntensity={3} />
        </mesh>
        <pointLight position={[1.2, 0, 0]} color="#7ee6ff" intensity={1.5} distance={5} />
      </group>
    </group>
  );
}

/* ---------------- ENEMY ---------------- */
function EnemyMesh({ e }: { e: Enemy }) {
  const ref = useRef<THREE.Group>(null!);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.copy(e.pos);
    ref.current.visible = e.alive;
    const flash = e.hitFlash > 0;
    ref.current.traverse((c: any) => {
      if (c.material && c.material.emissive) {
        c.material.emissiveIntensity = flash ? 2 : (c.userData.baseEmissive ?? 0);
      }
    });
  });
  const color = e.kind === "goblin" ? "#5a7a2a" : e.kind === "wraith" ? "#4a2a6a" : "#7a3020";
  const scale = e.kind === "brute" ? 1.4 : e.kind === "wraith" ? 1.1 : 0.9;
  return (
    <group ref={ref}>
      <mesh position={[0, scale * 0.6, 0]} castShadow>
        <capsuleGeometry args={[0.35 * scale, 0.8 * scale, 4, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0} />
      </mesh>
      {/* Eyes */}
      <mesh position={[0.12, scale * 1.1, 0.3]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#ff3020" emissive="#ff3020" emissiveIntensity={2} />
      </mesh>
      <mesh position={[-0.12, scale * 1.1, 0.3]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshStandardMaterial color="#ff3020" emissive="#ff3020" emissiveIntensity={2} />
      </mesh>
      {/* HP bar */}
      {e.alive && e.hp < e.maxHp && (
        <group position={[0, scale * 1.6, 0]}>
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
      <pointLight color={cfg.color} intensity={0.8} distance={3} />
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
      <pointLight color="#a080ff" intensity={3} distance={10} />
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
  onHudUpdate,
  keysRef,
  checkpointRef,
}: {
  world: WorldDef;
  statsRef: React.MutableRefObject<Stats>;
  onDeath: () => void;
  onWin: () => void;
  onHudUpdate: () => void;
  keysRef: React.MutableRefObject<Keys>;
  checkpointRef: React.MutableRefObject<Vec3>;
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

  const [, force] = useState(0);
  const rerender = () => force((v) => v + 1);
  const coyoteTimer = useRef(0);
  const jumpBuffer = useRef(0);

  const diff = world.difficulty;
  const enemies = useRef<Enemy[]>(
    world.enemies.map((e, i) => {
      const baseHp = e.kind === "brute" ? 60 : e.kind === "wraith" ? 30 : 20;
      const hp = Math.round(baseHp * diff);
      return {
        id: i,
        pos: new THREE.Vector3(...e.pos),
        hp, maxHp: hp,
        vel: new THREE.Vector3(),
        kind: e.kind,
        alive: true,
        hitFlash: 0,
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
  const spawnFloat = (p: THREE.Vector3, text: string, color: string) => {
    floats.current.push({ id: nextFtId.current++, pos: p.clone().add(new THREE.Vector3(0, 1.5, 0)), text, color, life: 1 });
  };

  const potPrev = useRef({ q: false, e: false });

  // Mouse look + click to attack. Works with pointer lock; falls back to
  // cursor position relative to canvas center when lock is unavailable (iframes).
  const yawRef = useRef(0);
  useEffect(() => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    let locked = false;
    const onMove = (e: MouseEvent) => {
      if (locked && document.pointerLockElement === canvas) {
        yawRef.current -= e.movementX * 0.0035;
      } else {
        // Fallback: aim by cursor horizontal offset from canvas center
        const rect = canvas.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const dx = e.clientX - cx;
        yawRef.current -= (dx / rect.width) * 0.08;
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
    const onLockChange = () => { locked = document.pointerLockElement === canvas; };
    document.addEventListener("mousemove", onMove);
    canvas.addEventListener("mousedown", onDown as any);
    window.addEventListener("mouseup", onUp);
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      document.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mousedown", onDown as any);
      window.removeEventListener("mouseup", onUp);
      document.removeEventListener("pointerlockchange", onLockChange);
    };
  }, [keysRef]);

  useFrame((state, dt) => {
    dt = Math.min(dt, 0.05);
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
    // Air control: full speed on ground, slightly reduced smoothing in air
    const control = grounded.current ? 1 : AIR_CONTROL;
    if (inputLen > 0) {
      mx /= inputLen; mz /= inputLen;
      const s = Math.sin(camYaw), c = Math.cos(camYaw);
      const wx = mx * c + mz * s;
      const wz = -mx * s + mz * c;
      const targetX = wx * MOVE_SPEED;
      const targetZ = wz * MOVE_SPEED;
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
    }

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

    // Attack
    if (attackCd.current > 0) attackCd.current -= dt;
    if (attackTimer.current > 0) attackTimer.current -= dt * 4;
    if (k.attack && attackCd.current <= 0) {
      attackCd.current = ATTACK_COOLDOWN;
      attackTimer.current = 1;
      const fx = Math.sin(facing.current), fz = Math.cos(facing.current);
      for (const e of enemies.current) {
        if (!e.alive) continue;
        const d = e.pos.clone().sub(pos.current);
        const dist = d.length();
        if (dist < ATTACK_RANGE) {
          // dot with facing
          const dn = d.clone().normalize();
          if (dn.x * fx + dn.z * fz > 0.3) {
            const dmg = 15 + st.str + Math.floor(Math.random() * 8);
            e.hp -= dmg;
            e.hitFlash = 0.15;
            e.vel.x += fx * 6; e.vel.z += fz * 6; e.vel.y = 4;
            spawnFloat(e.pos, `-${dmg}`, "#ffe040");
            if (e.hp <= 0) {
              e.alive = false;
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
          }
        }
      }
    }

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
      // Simple chase
      const toP = pos.current.clone().sub(e.pos);
      const dist = toP.length();
      if (dist < 12) {
        const baseSpeed = e.kind === "wraith" ? 4 : e.kind === "brute" ? 2.5 : 3.5;
        const speed = baseSpeed * (0.9 + diff * 0.15);
        const dir = toP.normalize();
        if (e.kind === "wraith") {
          // Wraiths float toward player
          e.vel.x = dir.x * speed;
          e.vel.z = dir.z * speed;
          e.vel.y = dir.y * speed * 0.5;
        } else {
          e.vel.x = dir.x * speed;
          e.vel.z = dir.z * speed;
          e.vel.y += GRAVITY * dt;
          if (grounded.current && Math.random() < 0.005) e.vel.y = 8;
        }
      } else {
        e.vel.x *= 0.9; e.vel.z *= 0.9;
        if (e.kind !== "wraith") e.vel.y += GRAVITY * dt;
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

    // Camera follow (third person, orbits with mouse yaw)
    const yaw = yawRef.current;
    const desired = pos.current.clone().add(new THREE.Vector3(Math.sin(yaw) * 8, 4, Math.cos(yaw) * 8));
    camera.position.lerp(desired, 1 - Math.pow(0.001, dt));
    camTarget.current.lerp(pos.current.clone().add(new THREE.Vector3(0, 1, 0)), 1 - Math.pow(0.001, dt));
    camera.lookAt(camTarget.current);

    // Only rerender React tree when the floats list actually changes,
    // otherwise mesh refs update the scene each frame without React work.
    if (floats.current.length !== beforeLen) rerender();
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
        castShadow
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
        <EnemyMesh key={e.id} e={e} />
      ))}
      {/* Pickups */}
      {pickups.current.map((p) => (
        <PickupMesh key={p.id} p={p} />
      ))}
      {/* Goal */}
      <Goal pos={world.goal} />
      {/* Mage */}
      <Mage posRef={pos} facingRef={facing} attackingRef={attackTimer} walkPhaseRef={walkPhase} />
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

    // Per-world palette: root freq + chord intervals + tempo + filter
    const palettes: { root: number; intervals: number[]; filter: number; wave: OscillatorType; drumRate: number }[] = [
      { root: 110, intervals: [0, 7, 12], filter: 700, wave: "sawtooth", drumRate: 2.0 },   // Bosque
      { root: 92,  intervals: [0, 3, 10], filter: 500, wave: "triangle", drumRate: 1.5 },   // Cementerio
      { root: 82,  intervals: [0, 6, 10], filter: 900, wave: "sawtooth", drumRate: 2.6 },   // Cavernas
      { root: 73,  intervals: [0, 3, 6],  filter: 600, wave: "square",   drumRate: 2.2 },   // Cripta
      { root: 130, intervals: [0, 4, 11], filter: 800, wave: "triangle", drumRate: 1.8 },   // Cielos
      { root: 65,  intervals: [0, 1, 6],  filter: 450, wave: "sawtooth", drumRate: 2.4 },   // Vacío
      { root: 98,  intervals: [0, 3, 8],  filter: 750, wave: "triangle", drumRate: 2.8 },   // Hielo
      { root: 55,  intervals: [0, 1, 6, 10], filter: 400, wave: "sawtooth", drumRate: 3.4 }, // Abismo
    ];
    const p = palettes[Math.min(worldIdx, palettes.length - 1)];

    const master = ctx.createGain();
    master.gain.value = 0;
    master.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 1.2);

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = p.filter;
    filter.Q.value = 4;
    filter.connect(master);
    master.connect(ctx.destination);

    // Drone chord
    const oscs: OscillatorNode[] = [];
    const gains: GainNode[] = [];
    p.intervals.forEach((semi, i) => {
      const o = ctx.createOscillator();
      o.type = p.wave;
      o.frequency.value = p.root * Math.pow(2, semi / 12);
      const g = ctx.createGain();
      g.gain.value = 0.15 / (i + 1);
      // Slow detune LFO for eeriness
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.frequency.value = 0.1 + i * 0.07;
      lfoGain.gain.value = 4;
      lfo.connect(lfoGain).connect(o.detune);
      lfo.start();
      o.connect(g).connect(filter);
      o.start();
      oscs.push(o); gains.push(g);
    });

    // Heartbeat / drum pulse, faster with difficulty
    const bpm = 40 + difficulty * 8;
    const beatInt = 60 / bpm;
    let beatTimer: ReturnType<typeof setInterval> | null = null;
    const kick = () => {
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(35, t + 0.25);
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + 0.4);
    };
    beatTimer = setInterval(kick, beatInt * 1000);

    // Occasional dissonant stab
    const stabTimer = setInterval(() => {
      if (Math.random() > 0.3) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sawtooth";
      o.frequency.value = p.root * Math.pow(2, (p.intervals[1] + 1) / 12) * 2;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.05);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
      o.connect(g).connect(filter);
      o.start(t); o.stop(t + 1.3);
    }, 3500);

    // Resume on user gesture (autoplay policy)
    const resume = () => { ctx.resume().catch(() => {}); };
    window.addEventListener("pointerdown", resume);
    window.addEventListener("keydown", resume);
    resume();

    return () => {
      if (beatTimer) clearInterval(beatTimer);
      clearInterval(stabTimer);
      window.removeEventListener("pointerdown", resume);
      window.removeEventListener("keydown", resume);
      try {
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
        setTimeout(() => { oscs.forEach((o) => { try { o.stop(); } catch {} }); ctx.close().catch(() => {}); }, 500);
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
  const [, setHudTick] = useState(0);
  const statsRef = useRef<Stats>(initialStats());
  const keysRef = useKeys();
  const world = WORLDS[worldIdx];
  useAmbientMusic(status === "play", worldIdx, world.difficulty);
  const checkpointRef = useRef<Vec3>(world.spawn);

  useEffect(() => { checkpointRef.current = world.spawn; }, [worldIdx, world.spawn]);

  const onDeath = () => {
    const st = statsRef.current;
    st.lives--;
    if (st.lives <= 0) {
      setStatus("dead");
    } else {
      st.hp = st.maxHp;
      setHudTick((v) => v + 1);
      // Force remount by toggling worldIdx via key
      setStatus("play");
      setWorldIdx((i) => i); // re-render Scene by key change below
      // We rely on Scene key = worldIdx + tick
      setHudTick((v) => v + 1);
    }
  };
  const onWin = () => {
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
  useEffect(() => { setSceneKey((k) => k + 1); }, [worldIdx, status]);

  const st = statsRef.current;

  const startGame = () => {
    statsRef.current = initialStats();
    setWorldIdx(0);
    checkpointRef.current = WORLDS[0].spawn;
    setStatus("play");
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

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden", fontFamily: "system-ui" }}>
      {status !== "menu" && (
        <Canvas
          key={sceneKey}
          shadows
          camera={{ position: [0, 6, 10], fov: 60 }}
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
              onHudUpdate={() => setHudTick((v) => v + 1)}
            />
          </Suspense>
        </Canvas>
      )}

      {/* HUD */}
      {status === "play" && (
        <>
          <div style={{
            position: "absolute", top: 12, left: 12, padding: 12,
            background: "linear-gradient(180deg, #1a0838cc, #0a0418cc)",
            border: "1px solid #7ee6ff44", borderRadius: 8, color: "#fff",
            backdropFilter: "blur(4px)",
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#a080ff", marginBottom: 6, letterSpacing: 1 }}>
              {world.name} · Nv.{st.level} · Mundo {worldIdx + 1}/{WORLDS.length} · Dif ×{world.difficulty.toFixed(1)}
            </div>
            <Bar value={st.hp} max={st.maxHp} color="#e04040" label="HP" />
            <Bar value={st.mp} max={st.maxMp} color="#4080ff" label="MP" />
            <Bar value={st.xp} max={st.xpNext} color="#ffe040" label="XP" />
            <div style={{ fontSize: 12, color: "#ccc", marginTop: 6 }}>
              ⚔ {st.str} 🛡 {st.def} · 🪙 {st.gold} · ❤ {st.lives}
            </div>
            <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
              Q Poción HP ({st.potHp}) · E Poción MP ({st.potMp})
            </div>
          </div>
          <div style={{
            position: "absolute", top: 12, right: 12, padding: 10,
            background: "#0a0418cc", border: "1px solid #7ee6ff44", borderRadius: 8,
            color: "#ccc", fontSize: 11, maxWidth: 220,
          }}>
            <div style={{ color: "#7ee6ff", fontWeight: 700, marginBottom: 4 }}>Controles</div>
            WASD moverse · Ratón apuntar · Clic atacar · Espacio saltar · Q/E pociones
            <div style={{ marginTop: 4, color: "#888" }}>(clic en la escena para bloquear el cursor)</div>
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

      {status === "win" && (
        <Overlay title="¡Reino Superado!" subtitle="Preparando el siguiente..." color="#a080ff" />
      )}
      {status === "victory" && (
        <Overlay title="¡Victoria!" subtitle={`Nivel ${st.level} · ${st.gold} oro`} color="#ffe040" onClick={startGame} btn="Jugar de nuevo" />
      )}
      {status === "dead" && (
        <Overlay title="Has caído" subtitle="La oscuridad reclama al mago" color="#e04040" onClick={startGame} btn="Reintentar" />
      )}
      {status === "menu" && (
        <Overlay
          title="ARCANE REALMS"
          subtitle="Aventura RPG 3D · Tres reinos de sombra te esperan"
          color="#a080ff"
          onClick={startGame}
          btn="Comenzar aventura"
        />
      )}
    </div>
  );
}

function Overlay({ title, subtitle, color, onClick, btn }: { title: string; subtitle: string; color: string; onClick?: () => void; btn?: string }) {
  return (
    <div style={{
      position: "absolute", inset: 0, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "radial-gradient(ellipse at center, #1a0838ee, #000f)",
      color: "#fff", textAlign: "center", padding: 20,
    }}>
      <h1 style={{ fontSize: 56, margin: 0, color, textShadow: `0 0 30px ${color}, 0 0 60px ${color}88`, letterSpacing: 4 }}>{title}</h1>
      <p style={{ fontSize: 16, color: "#ccc", marginTop: 12 }}>{subtitle}</p>
      {btn && onClick && (
        <button
          onClick={onClick}
          style={{
            marginTop: 32, padding: "14px 36px", fontSize: 18, fontWeight: 700,
            background: `linear-gradient(180deg, ${color}, ${color}88)`,
            color: "#0a0418", border: "2px solid #fff", borderRadius: 8,
            cursor: "pointer", letterSpacing: 2, textTransform: "uppercase",
            boxShadow: `0 0 30px ${color}`,
          }}
        >{btn}</button>
      )}
      <p style={{ fontSize: 12, color: "#666", marginTop: 24 }}>
        WASD · Espacio · Z ataque · Q/E pociones
      </p>
    </div>
  );
}
