import { Backdrop } from "./PauseMenu";
import { useGame, DEFAULT_APPEARANCE } from "@/game/store";

const SKIN = ["#f2d1b3", "#e0b48a", "#c9a48a", "#a67c52", "#7a4a2a", "#4d2f1a"];
const HAIR = ["#0b0705", "#2b1e14", "#5c3b21", "#a86e3f", "#d4b078", "#e8e8e8", "#a83a3a", "#5a3aa8"];
const CLOTH = ["#3a2f5a", "#5a2f2f", "#2f5a3a", "#5a5a2f", "#2f4a5a", "#5a2f5a", "#1a1a1a", "#c9c9d9"];
const ACCENT = ["#7ee6ff", "#ff7ee6", "#ffe07e", "#7eff9c", "#ff8a48", "#a080ff"];

export function CharacterCreator() {
  const a = useGame((s) => s.appearance);
  const set = useGame((s) => s.setAppearance);
  const setMenu = useGame((s) => s.setMenu);

  const swatch = (arr: string[], k: "skinTint" | "hairTint" | "clothTint" | "accentTint", label: string) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: "#aaa", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6, fontFamily: "monospace" }}>{label}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {arr.map((c) => (
          <button key={c} onClick={() => set({ [k]: c })} style={{
            width: 30, height: 30, borderRadius: "50%", background: c,
            border: a[k] === c ? "3px solid #fff" : "2px solid #333",
            cursor: "pointer", padding: 0,
            boxShadow: a[k] === c ? `0 0 12px ${c}` : "none",
          }} title={c} />
        ))}
        <input type="color" value={a[k]} onChange={(e) => set({ [k]: e.target.value })}
          style={{ width: 30, height: 30, background: "transparent", border: "2px dashed #555", borderRadius: "50%", cursor: "pointer" }} />
      </div>
    </div>
  );

  const slider = (label: string, k: "build" | "height", min: number, max: number) => (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#aaa", letterSpacing: 2, marginBottom: 4, fontFamily: "monospace", textTransform: "uppercase" }}>
        <span>{label}</span><span style={{ color: "#7ee6ff" }}>{a[k].toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={0.01} value={a[k]}
        onChange={(e) => set({ [k]: +e.target.value })}
        style={{ width: "100%", accentColor: "#a080ff" }} />
    </label>
  );

  return (
    <Backdrop>
      <div style={{
        width: 520, maxHeight: "88vh", overflow: "auto",
        background: "radial-gradient(ellipse at top, #1a0838, #050210)",
        border: "1px solid #7ee6ff44", borderRadius: 10,
        boxShadow: "0 20px 60px #000, 0 0 40px #a080ff22",
        color: "#fff", padding: 24,
      }}>
        <h2 style={{ margin: 0, marginBottom: 4, color: "#a080ff", letterSpacing: 4, textTransform: "uppercase", fontSize: 22 }}>
          Personaje
        </h2>
        <p style={{ margin: 0, marginBottom: 20, color: "#888", fontSize: 12 }}>
          Los cambios se reflejan al instante en el personaje 3D.
        </p>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "#aaa", letterSpacing: 2, textTransform: "uppercase", marginBottom: 6, fontFamily: "monospace" }}>Género</div>
          <div style={{ display: "flex", gap: 6 }}>
            {(["male", "female", "jorge"] as const).map((g) => (
              <button key={g} onClick={() => set({ gender: g })} style={{
                flex: 1, padding: 10, cursor: "pointer",
                background: a.gender === g ? "linear-gradient(180deg, #3a1a5a, #1a0838)" : "#0a0418",
                border: a.gender === g ? "1px solid #7ee6ff" : "1px solid #444",
                color: "#fff", textTransform: "uppercase", fontSize: 12, letterSpacing: 2, fontWeight: 600,
              }}>{g === "male" ? "Masculino" : g === "female" ? "Femenino" : "Jorge"}</button>
            ))}
          </div>
        </div>

        {swatch(SKIN, "skinTint", "Piel")}
        {swatch(HAIR, "hairTint", "Pelo")}
        {swatch(CLOTH, "clothTint", "Ropa")}
        {swatch(ACCENT, "accentTint", "Acento")}

        {slider("Complexión", "build", 0.85, 1.15)}
        {slider("Altura", "height", 0.9, 1.15)}

        <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "space-between" }}>
          <button onClick={() => Object.entries(DEFAULT_APPEARANCE).forEach(([k, v]) => set({ [k]: v as never }))} style={{
            padding: "10px 16px", background: "#0a0418", border: "1px solid #ff4050", color: "#ff8090",
            cursor: "pointer", letterSpacing: 2, textTransform: "uppercase", fontSize: 11,
          }}>Restablecer</button>
          <button onClick={() => setMenu(null)} style={{
            padding: "10px 24px", background: "linear-gradient(180deg, #a080ff, #6040cc)",
            color: "#fff", border: "none", cursor: "pointer",
            fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", fontSize: 13,
          }}>Aceptar</button>
        </div>
      </div>
    </Backdrop>
  );
}
