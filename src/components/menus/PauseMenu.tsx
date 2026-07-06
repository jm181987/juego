import { useEffect } from "react";
import { useGame } from "@/game/store";

export function PauseMenu({ onQuit, onSave, onLoad }: {
  onQuit: () => void;
  onSave: () => void;
  onLoad: () => void;
}) {
  const setMenu = useGame((s) => s.setMenu);
  const setPaused = useGame((s) => s.setPaused);

  useEffect(() => {
    document.body.style.cursor = "auto";
    try { document.exitPointerLock?.(); } catch { /* noop */ }
  }, []);

  const resume = () => { setMenu(null); setPaused(false); };

  const item = (label: string, onClick: () => void, tone?: "danger") => (
    <button onClick={onClick} style={{
      width: "100%", padding: "14px 20px",
      background: "linear-gradient(90deg, #1a0838cc, #0a0418cc)",
      border: `1px solid ${tone === "danger" ? "#ff405088" : "#7ee6ff44"}`,
      color: "#fff", fontSize: 16, fontWeight: 600,
      letterSpacing: 2, textTransform: "uppercase", textAlign: "left",
      cursor: "pointer", borderRadius: 4,
      transition: "all .15s",
    }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "linear-gradient(90deg, #2a1058, #1a0838)"; e.currentTarget.style.transform = "translateX(4px)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "linear-gradient(90deg, #1a0838cc, #0a0418cc)"; e.currentTarget.style.transform = "translateX(0)"; }}
    >{label}</button>
  );

  return (
    <Backdrop>
      <div style={{
        width: 380, padding: 28,
        background: "radial-gradient(ellipse at top, #1a0838, #050210)",
        border: "1px solid #7ee6ff44", borderRadius: 10,
        boxShadow: "0 20px 60px #000, 0 0 40px #7ee6ff22",
      }}>
        <h2 style={{
          margin: 0, marginBottom: 24, color: "#a080ff", textAlign: "center",
          fontSize: 26, letterSpacing: 6, textTransform: "uppercase",
          textShadow: "0 0 20px #a080ffaa",
        }}>Pausa</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {item("Continuar", resume)}
          {item("Inventario", () => setMenu("inventory"))}
          {item("Diario · Bestiario", () => setMenu("journal"))}
          {item("Personaje", () => setMenu("character"))}
          {item("Ajustes", () => setMenu("settings"))}
          {item("Guardar / Cargar", () => setMenu("saves"))}
          {item("Guardado rápido", onSave)}
          {item("Cargar último", onLoad)}
          {item("Salir al menú", onQuit, "danger")}
        </div>
      </div>
    </Backdrop>
  );
}

export function Backdrop({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "radial-gradient(ellipse at center, #00000099, #000000ee)",
      backdropFilter: "blur(6px)",
    }}>{children}</div>
  );
}
