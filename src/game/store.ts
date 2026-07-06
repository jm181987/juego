import { create } from "zustand";
import { persist } from "zustand/middleware";

/* ============ TYPES ============ */

export type Appearance = {
  gender: "male" | "female";
  skinTint: string;      // hex — recolor tint applied to body materials
  hairTint: string;
  clothTint: string;
  accentTint: string;
  build: number;         // 0.85..1.15 — overall scale
  height: number;        // 0.9..1.15 — Y scale multiplier
};

export const DEFAULT_APPEARANCE: Appearance = {
  gender: "male",
  skinTint: "#c9a48a",
  hairTint: "#2b1e14",
  clothTint: "#3a2f5a",
  accentTint: "#7ee6ff",
  build: 1.0,
  height: 1.0,
};

export type KeyBinding =
  | "fwd" | "back" | "left" | "right"
  | "jump" | "attack" | "pot1" | "pot2"
  | "camFree" | "run" | "flashlight" | "pause" | "inventory" | "journal";

export const DEFAULT_BINDINGS: Record<KeyBinding, string> = {
  fwd: "KeyW",
  back: "KeyS",
  left: "KeyA",
  right: "KeyD",
  jump: "Space",
  attack: "KeyZ",
  pot1: "KeyQ",
  pot2: "KeyE",
  camFree: "AltLeft",
  run: "ShiftLeft",
  flashlight: "KeyF",
  pause: "Escape",
  inventory: "KeyI",
  journal: "KeyJ",
};

export type Settings = {
  masterVol: number;   // 0..1
  musicVol: number;
  sfxVol: number;
  brightness: number;  // 0.6..1.5
  fov: number;         // 45..90
  quality: "low" | "medium" | "high";
  shadows: boolean;
  postFx: boolean;
  hudVisible: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  masterVol: 0.9,
  musicVol: 0.7,
  sfxVol: 0.85,
  brightness: 1.0,
  fov: 60,
  quality: "medium",
  shadows: false,
  postFx: false,
  hudVisible: true,
};

export type QuestStatus = "active" | "done";
export type Quest = {
  id: string;
  title: string;
  desc: string;
  status: QuestStatus;
  progress: number;
  goal: number;
  target?: [number, number, number]; // world position for compass
  reward?: string;
};

export type BestiaryEntry = {
  kind: string;
  name: string;
  kills: number;
  lore: string;
  weakness: string;
};

export type InventoryItem = {
  id: string;
  name: string;
  kind: "consumable" | "gear" | "material" | "quest";
  slot?: "head" | "chest" | "hands" | "weapon" | "offhand";
  rarity: "common" | "rare" | "epic" | "legendary";
  qty: number;
  icon: string; // emoji
  desc: string;
};

export type SaveSlot = {
  id: number;
  name: string;
  timestamp: number;
  world: string;
  level: number;
  playtime: number;
  screenshot?: string;
  data: unknown;
};

/* ============ STORE ============ */

type Store = {
  // meta
  paused: boolean;
  activeMenu: null | "pause" | "settings" | "inventory" | "journal" | "character" | "saves";
  playtime: number;

  // dynamic runtime (not persisted)
  stamina: number;
  maxStamina: number;
  battery: number;
  maxBattery: number;
  flashlightOn: boolean;

  // persisted
  appearance: Appearance;
  settings: Settings;
  bindings: Record<KeyBinding, string>;
  quests: Quest[];
  bestiary: Record<string, BestiaryEntry>;
  inventory: InventoryItem[];
  saves: SaveSlot[];

  // actions
  setPaused: (v: boolean) => void;
  setMenu: (m: Store["activeMenu"]) => void;
  toggleHud: () => void;
  addPlaytime: (dt: number) => void;

  setStamina: (v: number) => void;
  setBattery: (v: number) => void;
  toggleFlashlight: () => void;
  setFlashlight: (on: boolean) => void;

  setAppearance: (a: Partial<Appearance>) => void;
  setSettings: (s: Partial<Settings>) => void;
  setBinding: (k: KeyBinding, code: string) => void;
  resetBindings: () => void;

  recordKill: (kind: string) => void;
  updateQuest: (id: string, delta: number) => void;
  setQuestTarget: (id: string, t: [number, number, number] | undefined) => void;

  addItem: (item: InventoryItem) => void;
  removeItem: (id: string, qty?: number) => void;

  saveToSlot: (slotId: number, data: unknown, meta: { world: string; level: number; screenshot?: string }) => void;
  deleteSlot: (slotId: number) => void;
};

const seedBestiary = (): Record<string, BestiaryEntry> => ({
  goblin: {
    kind: "goblin",
    name: "Goblin de las sombras",
    kills: 0,
    lore: "Pequeños carroñeros que emergen de las grietas al caer la noche.",
    weakness: "Vulnerable a la luz directa. Golpes rápidos.",
  },
  wraith: {
    kind: "wraith",
    name: "Espectro errante",
    kills: 0,
    lore: "Almas que no pudieron cruzar. Flotan y persiguen la calidez de los vivos.",
    weakness: "Sensible a hierro bendito y al haz de la linterna.",
  },
  brute: {
    kind: "brute",
    name: "Bruto abisal",
    kills: 0,
    lore: "Colosos deformes forjados en la carne del abismo.",
    weakness: "Lento al girar. Ataca por la espalda.",
  },
});

const seedQuests = (): Quest[] => [
  {
    id: "prologue",
    title: "El despertar",
    desc: "Alcanza el portal del primer reino.",
    status: "active",
    progress: 0,
    goal: 1,
    reward: "50 oro",
  },
  {
    id: "hunt-goblins",
    title: "Purga menor",
    desc: "Elimina 10 goblins de las sombras.",
    status: "active",
    progress: 0,
    goal: 10,
    reward: "Poción HP ×2",
  },
];

const MAX_SAVE_SCREENSHOT_CHARS = 180_000;

const sanitizePersistedState = (persisted: unknown) => {
  if (!persisted || typeof persisted !== "object") return persisted;
  const state = persisted as Partial<Store>;
  const settings = { ...DEFAULT_SETTINGS, ...(state.settings ?? {}) };
  const safeSettings: Settings = {
    ...settings,
    // Heavy effects were causing startup hangs on weaker/mobile previews.
    quality: settings.quality === "low" ? "low" : "medium",
    shadows: false,
    postFx: false,
  };
  const saves = Array.isArray(state.saves)
    ? state.saves.slice(0, 6).map((slot) => ({
        ...slot,
        screenshot:
          typeof slot.screenshot === "string" && slot.screenshot.length <= MAX_SAVE_SCREENSHOT_CHARS
            ? slot.screenshot
            : undefined,
      }))
    : [];

  return { ...state, settings: safeSettings, saves };
};

export const useGame = create<Store>()(
  persist(
    (set, get) => ({
      paused: false,
      activeMenu: null,
      playtime: 0,

      stamina: 100,
      maxStamina: 100,
      battery: 100,
      maxBattery: 100,
      flashlightOn: true,

      appearance: DEFAULT_APPEARANCE,
      settings: DEFAULT_SETTINGS,
      bindings: DEFAULT_BINDINGS,
      quests: seedQuests(),
      bestiary: seedBestiary(),
      inventory: [
        { id: "torch-battery", name: "Batería de linterna", kind: "consumable", rarity: "common", qty: 3, icon: "🔋", desc: "Recarga 50% de la batería." },
        { id: "amulet", name: "Amuleto agrietado", kind: "gear", slot: "offhand", rarity: "rare", qty: 1, icon: "📿", desc: "+5 al valor. Emite un tenue susurro." },
      ],
      saves: [],

      setPaused: (v) => set({ paused: v }),
      setMenu: (m) => set({ activeMenu: m, paused: m !== null }),
      toggleHud: () => set((s) => ({ settings: { ...s.settings, hudVisible: !s.settings.hudVisible } })),
      addPlaytime: (dt) => set((s) => ({ playtime: s.playtime + dt })),

      setStamina: (v) => set((s) => ({ stamina: Math.max(0, Math.min(s.maxStamina, v)) })),
      setBattery: (v) => set((s) => ({ battery: Math.max(0, Math.min(s.maxBattery, v)) })),
      toggleFlashlight: () => set((s) => ({ flashlightOn: !s.flashlightOn })),
      setFlashlight: (on) => set({ flashlightOn: on }),

      setAppearance: (a) => set((s) => ({ appearance: { ...s.appearance, ...a } })),
      setSettings: (n) => set((s) => ({ settings: { ...s.settings, ...n } })),
      setBinding: (k, code) => set((s) => ({ bindings: { ...s.bindings, [k]: code } })),
      resetBindings: () => set({ bindings: { ...DEFAULT_BINDINGS } }),

      recordKill: (kind) =>
        set((s) => {
          const cur = s.bestiary[kind];
          if (!cur) return s;
          const bestiary = { ...s.bestiary, [kind]: { ...cur, kills: cur.kills + 1 } };
          // Auto-advance kill quests
          const quests = s.quests.map((q) => {
            if (q.id === "hunt-goblins" && kind === "goblin" && q.status === "active") {
              const progress = Math.min(q.goal, q.progress + 1);
              return { ...q, progress, status: progress >= q.goal ? "done" as const : q.status };
            }
            return q;
          });
          return { bestiary, quests };
        }),
      updateQuest: (id, delta) =>
        set((s) => ({
          quests: s.quests.map((q) => {
            if (q.id !== id) return q;
            const progress = Math.max(0, Math.min(q.goal, q.progress + delta));
            return { ...q, progress, status: progress >= q.goal ? "done" as const : q.status };
          }),
        })),
      setQuestTarget: (id, t) =>
        set((s) => ({ quests: s.quests.map((q) => (q.id === id ? { ...q, target: t } : q)) })),

      addItem: (item) =>
        set((s) => {
          const existing = s.inventory.find((i) => i.id === item.id);
          if (existing) {
            return { inventory: s.inventory.map((i) => (i.id === item.id ? { ...i, qty: i.qty + item.qty } : i)) };
          }
          return { inventory: [...s.inventory, item] };
        }),
      removeItem: (id, qty = 1) =>
        set((s) => {
          const next: InventoryItem[] = [];
          for (const i of s.inventory) {
            if (i.id !== id) { next.push(i); continue; }
            const q = i.qty - qty;
            if (q > 0) next.push({ ...i, qty: q });
          }
          return { inventory: next };
        }),

      saveToSlot: (slotId, data, meta) =>
        set((s) => {
          const slot: SaveSlot = {
            id: slotId,
            name: `Slot ${slotId}`,
            timestamp: Date.now(),
            world: meta.world,
            level: meta.level,
            playtime: s.playtime,
            screenshot: meta.screenshot,
            data,
          };
          const others = s.saves.filter((x) => x.id !== slotId);
          return { saves: [...others, slot].sort((a, b) => a.id - b.id) };
        }),
      deleteSlot: (slotId) => set((s) => ({ saves: s.saves.filter((x) => x.id !== slotId) })),
    }),
    {
      name: "arcane-realms-store",
      version: 2,
      migrate: sanitizePersistedState,
      partialize: (s) => ({
        appearance: s.appearance,
        settings: s.settings,
        bindings: s.bindings,
        quests: s.quests,
        bestiary: s.bestiary,
        inventory: s.inventory,
        saves: s.saves,
      }),
    },
  ),
);
