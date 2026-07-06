import { useEffect, useRef } from "react";

export type CompassMark = { x: number; z: number; color: string; icon: string; label: string };

export function QuestCompass({
  playerRef, facingRef, marksRef, width = 460, height = 46,
}: {
  playerRef: React.MutableRefObject<{ x: number; z: number }>;
  facingRef: React.MutableRefObject<number>;
  marksRef: React.MutableRefObject<CompassMark[]>;
  width?: number;
  height?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    const draw = () => {
      const w = cv.width, h = cv.height;
      ctx.clearRect(0, 0, w, h);

      // bar background
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#0a0418cc");
      grad.addColorStop(1, "#000000cc");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#7ee6ff44";
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

      const facing = facingRef.current;
      // facing is camYaw + PI ; player looks along -sin(facing), -cos(facing) — but we just use facing directly for compass reference
      // We want 0 rad in the middle = where the player is looking
      const cardinals: [number, string][] = [
        [0, "N"], [Math.PI / 2, "E"], [Math.PI, "S"], [-Math.PI / 2, "O"],
      ];
      const fov = Math.PI * 1.2; // visible arc
      const midX = w / 2;
      const p = playerRef.current;

      // helper to project a world angle to x position
      const project = (worldAngle: number) => {
        // player looks in direction of angle = facing (in game facing.y is defined as camYaw+PI; using it as forward reference)
        let delta = worldAngle - facing;
        // wrap to -PI..PI
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        if (Math.abs(delta) > fov / 2) return null;
        return midX + (delta / (fov / 2)) * (w / 2 - 20);
      };

      // cardinals
      ctx.font = "bold 12px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const [ang, letter] of cardinals) {
        const px = project(ang);
        if (px == null) continue;
        ctx.fillStyle = "#7ee6ff";
        ctx.globalAlpha = 0.85;
        ctx.fillText(letter, px, 14);
        ctx.globalAlpha = 1;
      }

      // ticks
      ctx.strokeStyle = "#7ee6ff33";
      for (let a = -Math.PI; a < Math.PI; a += Math.PI / 12) {
        const px = project(a);
        if (px == null) continue;
        ctx.beginPath();
        ctx.moveTo(px, 24);
        ctx.lineTo(px, 30);
        ctx.stroke();
      }

      // marks — player-forward in world = (sin(facing), cos(facing))
      // so world direction angle uses atan2(dx, dz) to align 0 = "in front".
      for (const m of marksRef.current) {
        const dx = m.x - p.x;
        const dz = m.z - p.z;
        const targetAngle = Math.atan2(dx, dz);
        const px = project(targetAngle);
        const dist = Math.hypot(dx, dz);
        if (px != null) {
          ctx.fillStyle = m.color;
          ctx.shadowColor = m.color;
          ctx.shadowBlur = 6;
          ctx.font = "16px monospace";
          ctx.fillText(m.icon, px, 32);
          ctx.shadowBlur = 0;
          ctx.font = "10px monospace";
          ctx.fillStyle = "#eee";
          ctx.fillText(`${m.label} · ${Math.round(dist)}m`, px, h - 6);
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [playerRef, facingRef, marksRef]);

  return <canvas ref={ref} width={width} height={height} style={{ width, height, display: "block" }} />;
}
