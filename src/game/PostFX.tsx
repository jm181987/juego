import { EffectComposer, Bloom, Vignette, Noise } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { useGame } from "@/game/store";

export function PostFX() {
  const on = useGame((s) => s.settings.postFx && s.settings.quality === "high");
  if (!on) return null;
  return (
    <EffectComposer multisampling={0}>
      <Bloom intensity={0.4} luminanceThreshold={0.65} luminanceSmoothing={0.2} />
      <Vignette eskil={false} offset={0.28} darkness={0.85} />
      <Noise premultiply blendFunction={BlendFunction.OVERLAY} opacity={0.1} />
    </EffectComposer>
  );
}

