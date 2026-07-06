import { useState } from "react";
import { Backdrop } from "./PauseMenu";
import { useGame, DEFAULT_BINDINGS, type KeyBinding } from "@/game/store";

const LABELS: Record<KeyBinding, string> = {
  fwd: "Adelante", back: "Atrás", left: "Izquierda", right: "Derecha",
  jump: "Saltar", attack: "Atacar", pot1: "Poción HP", pot2: "Poción MP",
  camFree: "Cámara libre", run: "Correr", flashlight: "Linterna",
  pause: "Pausa", inventory: "Inventario", journal: "Diario",
};

export function SettingsPanel() {
  const settings = useGame((s) => s.settings);
  const setSettings = useGame((s) => s.setSettings);
  const bindings = useGame((s) => s.bindings);
  const setBinding = useGame((s) => s.setBinding);
  const resetBindings = useGame((s) => s.resetBindings);
  const setMenu = useGame((s) => s.setMenu);
  const [tab, setTab] = useState<"graphics" | "audio" | "controls">("graphics");
  const [capturing, setCapturing] = useState<KeyBinding | null>(null);

  const captureKey = (k: KeyBinding) => {
    setCapturing(k);
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      setBinding(k, e.code);
      setCapturing(null);
      window.removeEventListener("keydown", handler);
    };
    window.addEventListener("keydown", handler);
  };

  const slider = (label: string, val: number, min: number, max: number, step: number, on: (v: number) => void) => (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#ccc", marginBottom: 4, fontFamily: "monospace", letterSpacing: 1 }}>
        <span>{label}</span><span style={{ color: "#7ee6ff" }}>{val.toFixed(2)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={val} onChange={(e) => on(+e.target.value)}
        style={{ width: "100%", accentColor: "#a080ff" }} />
    </label>
  );

  const tabBtn = (id: typeof tab, label: string) => (
    <button onClick={() => setTab(id)} style={{
      flex: 1, padding: "10px 6px",
      background: tab === id ? "linear-gradient(180deg, #3a1a5a, #1a0838)" : "transparent",
      color: tab === id ? "#fff" : "#888",
      border: "none", borderBottom: tab === id ? "2px solid #7ee6ff" : "2px solid transparent",
      cursor: "pointer", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", fontWeight: 600,
    }}>{label}</button>
  );

  return (
    <Backdrop>
      <div style={{
        width: 520, maxHeight: "85vh", overflow: "hidden",
        display: "flex", flexDirection: "column",
        background: "radial-gradient(ellipse at top, #1a0838, #050210)",
        border: "1px solid #7ee6ff44", borderRadius: 10,
        boxShadow: "0 20px 60px #000, 0 0 40px #7ee6ff22",
        color: "#fff",
      }}>
        <div style={{ padding: "20px 24px 0 24px" }}>
          <h2 style={{ margin: 0, color: "#a080ff", letterSpacing: 4, textTransform: "uppercase", fontSize: 20 }}>Ajustes</h2>
        </div>
        <div style={{ display: "flex", borderBottom: "1px solid #7ee6ff22", marginTop: 16 }}>
          {tabBtn("graphics", "Gráficos")}
          {tabBtn("audio", "Audio")}
          {tabBtn("controls", "Controles")}
        </div>

        <div style={{ padding: 24, overflow: "auto", flex: 1 }}>
          {tab === "graphics" && (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "#ccc", marginBottom: 4, fontFamily: "monospace", letterSpacing: 1 }}>Calidad</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {(["low", "medium", "high"] as const).map((q) => (
                    <button key={q} onClick={() => setSettings({ quality: q })} style={{
                      flex: 1, padding: 8, cursor: "pointer",
                      background: settings.quality === q ? "#3a1a5a" : "#0a0418",
                      border: settings.quality === q ? "1px solid #7ee6ff" : "1px solid #444",
                      color: "#fff", textTransform: "uppercase", fontSize: 11, letterSpacing: 1,
                    }}>{q}</button>
                  ))}
                </div>
              </div>
              {slider("FOV", settings.fov, 45, 90, 1, (v) => setSettings({ fov: v }))}
              {slider("Brillo", settings.brightness, 0.6, 1.5, 0.05, (v) => setSettings({ brightness: v }))}
              <Toggle label="Sombras" on={settings.shadows} onChange={(v) => setSettings({ shadows: v })} />
              <Toggle label="Post-processing (bloom, viñeta, grain)" on={settings.postFx} onChange={(v) => setSettings({ postFx: v })} />
              <Toggle label="HUD visible (H)" on={settings.hudVisible} onChange={(v) => setSettings({ hudVisible: v })} />
            </>
          )}
          {tab === "audio" && (
            <>
              {slider("Master", settings.masterVol, 0, 1, 0.01, (v) => setSettings({ masterVol: v }))}
              {slider("Música", settings.musicVol, 0, 1, 0.01, (v) => setSettings({ musicVol: v }))}
              {slider("SFX", settings.sfxVol, 0, 1, 0.01, (v) => setSettings({ sfxVol: v }))}
            </>
          )}
          {tab === "controls" && (
            <div>
              <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#888" }}>Clic en un botón y pulsa la nueva tecla.</span>
                <button onClick={resetBindings} style={{
                  padding: "6px 10px", background: "#0a0418", border: "1px solid #ff4050", color: "#ff8090",
                  cursor: "pointer", fontSize: 10, letterSpacing: 1, textTransform: "uppercase",
                }}>Restablecer</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 6, alignItems: "center" }}>
                {(Object.keys(DEFAULT_BINDINGS) as KeyBinding[]).map((k) => (
                  <div key={k} style={{ display: "contents" }}>
                    <div style={{ fontSize: 13, color: "#ccc" }}>{LABELS[k]}</div>
                    <button onClick={() => captureKey(k)} style={{
                      padding: "6px 12px", minWidth: 100,
                      background: capturing === k ? "#7ee6ff" : "#0a0418",
                      color: capturing === k ? "#000" : "#7ee6ff",
                      border: "1px solid #7ee6ff88", borderRadius: 3, fontFamily: "monospace",
                      fontSize: 11, cursor: "pointer", textAlign: "center",
                    }}>{capturing === k ? "..." : bindings[k].replace(/^Key|^Digit/, "")}</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: 16, borderTop: "1px solid #7ee6ff22", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={() => setMenu("pause")} style={{
            padding: "10px 24px", background: "linear-gradient(180deg, #7ee6ff, #4ea6cf)",
            color: "#000", border: "none", borderRadius: 4, cursor: "pointer",
            fontWeight: 700, letterSpacing: 2, textTransform: "uppercase",
          }}>Aceptar</button>
        </div>
      </div>
    </Backdrop>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", cursor: "pointer", borderBottom: "1px solid #7ee6ff11" }}>
      <span style={{ fontSize: 13, color: "#ccc" }}>{label}</span>
      <div onClick={() => onChange(!on)} style={{
        width: 40, height: 20, borderRadius: 10, position: "relative",
        background: on ? "#7ee6ff" : "#333", transition: "background .2s",
      }}>
        <div style={{
          position: "absolute", top: 2, left: on ? 22 : 2,
          width: 16, height: 16, borderRadius: "50%", background: "#fff",
          transition: "left .2s",
        }} />
      </div>
    </label>
  );
}
