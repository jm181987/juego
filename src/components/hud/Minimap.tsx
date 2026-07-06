import { useEffect, useRef } from "react";

export type MiniBlip = { x: number; z: number; color: string; size?: number };

export function Minimap({
  playerRef, facingRef, blipsRef, radius = 22, size = 150,
}: {
  playerRef: React.MutableRefObject<{ x: number; z: number }>;
  facingRef: React.MutableRefObject<number>;
  blipsRef: React.MutableRefObject<MiniBlip[]>;
  radius?: number;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    const draw = () => {
      const w = cv.width, h = cv.height;
      const cx = w / 2, cy = h / 2;

      // clip to circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, w / 2 - 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      // background gradient
      const grad = ctx.createRadialGradient(cx, cy, 6, cx, cy, w / 2);
      grad.addColorStop(0, "#1a0838");
      grad.addColorStop(1, "#000000");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // grid rings
      ctx.strokeStyle = "#7ee6ff22";
      ctx.lineWidth = 1;
      for (let r = w / 6; r < w / 2; r += w / 6) {
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      // cardinal cross
      ctx.strokeStyle = "#7ee6ff11";
      ctx.beginPath();
      ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
      ctx.moveTo(0, cy); ctx.lineTo(w, cy);
      ctx.stroke();

      const p = playerRef.current;
      const facing = facingRef.current;
      // Rotate the map so "up" = player forward. In this game facing = camYaw + PI.
      const rot = -facing;
      const scale = (w / 2 - 4) / radius;

      for (const b of blipsRef.current) {
        const dx = b.x - p.x;
        const dz = b.z - p.z;
        // rotate
        const rx = dx * Math.cos(rot) - dz * Math.sin(rot);
        const rz = dx * Math.sin(rot) + dz * Math.cos(rot);
        const px = cx + rx * scale;
        const py = cy + rz * scale; // z maps to y downwards
        const r = (b.size ?? 3);
        // clamp to edge
        const dxc = px - cx, dyc = py - cy;
        const d = Math.hypot(dxc, dyc);
        const maxD = w / 2 - 6;
        if (d > maxD) {
          const k = maxD / d;
          const ex = cx + dxc * k;
          const ey = cy + dyc * k;
          // draw as arrow at edge
          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.arc(ex, ey, r * 0.7, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = b.color;
          ctx.shadowColor = b.color;
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(px, py, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      // player arrow (always up)
      ctx.fillStyle = "#7ee6ff";
      ctx.shadowColor = "#7ee6ff";
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 8);
      ctx.lineTo(cx - 6, cy + 6);
      ctx.lineTo(cx, cy + 3);
      ctx.lineTo(cx + 6, cy + 6);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.restore();

      // frame
      ctx.strokeStyle = "#7ee6ff88";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, w / 2 - 1, 0, Math.PI * 2);
      ctx.stroke();

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [playerRef, facingRef, blipsRef, radius]);

  return (
    <canvas
      ref={canvasRef}
      width={size} height={size}
      style={{
        width: size, height: size,
        borderRadius: "50%",
        background: "#000",
        boxShadow: "0 0 20px #7ee6ff44, inset 0 0 20px #000",
      }}
    />
  );
}
