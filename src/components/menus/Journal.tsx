import { useState } from "react";
import { Backdrop } from "./PauseMenu";
import { useGame } from "@/game/store";

export function Journal() {
  const quests = useGame((s) => s.quests);
  const bestiary = useGame((s) => s.bestiary);
  const setMenu = useGame((s) => s.setMenu);
  const [tab, setTab] = useState<"quests" | "bestiary">("quests");

  const tabBtn = (id: typeof tab, label: string, count?: number) => (
    <button onClick={() => setTab(id)} style={{
      flex: 1, padding: "10px 6px",
      background: tab === id ? "linear-gradient(180deg, #3a1a5a, #1a0838)" : "transparent",
      color: tab === id ? "#fff" : "#888",
      border: "none", borderBottom: tab === id ? "2px solid #7ee6ff" : "2px solid transparent",
      cursor: "pointer", fontSize: 12, letterSpacing: 2, textTransform: "uppercase", fontWeight: 600,
    }}>{label}{count != null && <span style={{ color: "#7ee6ff", marginLeft: 6 }}>{count}</span>}</button>
  );

  return (
    <Backdrop>
      <div style={{
        width: 640, maxHeight: "88vh", overflow: "hidden",
        display: "flex", flexDirection: "column",
        background: "radial-gradient(ellipse at top, #1a0838, #050210)",
        border: "1px solid #7ee6ff44", borderRadius: 10,
        boxShadow: "0 20px 60px #000, 0 0 40px #7ee6ff22",
        color: "#fff",
      }}>
        <div style={{ padding: "18px 24px", borderBottom: "1px solid #7ee6ff22", display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, color: "#a080ff", letterSpacing: 4, textTransform: "uppercase", fontSize: 20 }}>Diario</h2>
          <button onClick={() => setMenu("pause")} style={{ background: "transparent", border: "none", color: "#aaa", fontSize: 20, cursor: "pointer" }}>×</button>
        </div>
        <div style={{ display: "flex", borderBottom: "1px solid #7ee6ff22" }}>
          {tabBtn("quests", "Misiones", quests.filter((q) => q.status === "active").length)}
          {tabBtn("bestiary", "Bestiario", Object.values(bestiary).filter((b) => b.kills > 0).length)}
        </div>
        <div style={{ padding: 20, overflow: "auto", flex: 1 }}>
          {tab === "quests" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {quests.map((q) => (
                <div key={q.id} style={{
                  padding: 14, background: q.status === "done" ? "#0f2818aa" : "#1a0838aa",
                  border: `1px solid ${q.status === "done" ? "#40ff8044" : "#7ee6ff44"}`,
                  borderRadius: 6,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                    <h3 style={{ margin: 0, color: q.status === "done" ? "#a0ffb0" : "#ffe07e", fontSize: 15, letterSpacing: 1 }}>
                      {q.title}
                    </h3>
                    <span style={{ fontSize: 10, color: "#888", fontFamily: "monospace", letterSpacing: 2, textTransform: "uppercase" }}>
                      {q.status === "done" ? "Completada" : `${q.progress}/${q.goal}`}
                    </span>
                  </div>
                  <p style={{ margin: 0, color: "#ccc", fontSize: 12, lineHeight: 1.5 }}>{q.desc}</p>
                  {q.reward && <div style={{ marginTop: 6, fontSize: 11, color: "#ffb050" }}>Recompensa: {q.reward}</div>}
                  <div style={{ height: 4, background: "#000", borderRadius: 1, marginTop: 8, overflow: "hidden" }}>
                    <div style={{
                      width: `${(q.progress / q.goal) * 100}%`, height: "100%",
                      background: q.status === "done" ? "#40ff80" : "#a080ff", transition: "width .3s",
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {tab === "bestiary" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {Object.values(bestiary).map((b) => {
                const unknown = b.kills === 0;
                return (
                  <div key={b.kind} style={{
                    padding: 14, background: "#1a0838aa",
                    border: `1px solid ${unknown ? "#33333366" : "#7ee6ff44"}`, borderRadius: 6,
                    opacity: unknown ? 0.55 : 1,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <h3 style={{ margin: 0, color: unknown ? "#666" : "#a080ff", fontSize: 15, letterSpacing: 1 }}>
                        {unknown ? "??? Desconocido" : b.name}
                      </h3>
                      <span style={{ fontSize: 10, color: "#7ee6ff", fontFamily: "monospace" }}>
                        Bajas: {b.kills}
                      </span>
                    </div>
                    <p style={{ margin: 0, color: "#ccc", fontSize: 12, lineHeight: 1.5, fontStyle: "italic" }}>
                      {unknown ? "Derrota una de estas criaturas para revelar información." : b.lore}
                    </p>
                    {!unknown && (
                      <div style={{ marginTop: 6, fontSize: 11, color: "#ff8090" }}>Debilidad: {b.weakness}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Backdrop>
  );
}
