import { EffectComposer, Bloom, Vignette, Noise } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { useGame } from "@/game/store";

export function PostFX() {
  const on = useGame((s) => s.settings.postFx);
  if (!on) return null;
  return (
    <EffectComposer>
      <Bloom intensity={0.55} luminanceThreshold={0.55} luminanceSmoothing={0.15} mipmapBlur />
      <Vignette eskil={false} offset={0.28} darkness={0.85} />
      <Noise premultiply blendFunction={BlendFunction.OVERLAY} opacity={0.18} />
    </EffectComposer>
  );
}

