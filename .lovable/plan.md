# Plan de mejoras del juego

Es mucho contenido para una sola tanda. Propongo dividirlo en **7 fases** que puedes aprobar completas o pedir solo las que quieras primero. Todo se mantiene 100% en frontend (sin backend) usando `localStorage` para persistencia, salvo que luego quieras sincronizar con Lovable Cloud.

---

## Fase 1 — HUD en pantalla
- Barra de **vida** (rojo) y **stamina** (verde) arriba a la izquierda, con animación al recibir daño.
- **Minimapa** circular arriba a la derecha: puntos para jugador (flecha), enemigos (rojo), objetivos (dorado), hogueras (naranja).
- **Brújula de objetivo**: banda superior tipo Skyrim con marcadores que aparecen/desaparecen según ángulo hacia el objetivo activo.
- Contador de munición/linterna (batería).
- Toggle con tecla `H` para ocultar HUD.

## Fase 2 — Stamina + batería de linterna (mecánica)
- Correr, atacar y esquivar consumen stamina; regenera al parar.
- Sin stamina no puedes correr ni atacar (parpadea la barra).
- La linterna consume batería; recogibles "Batería" restauran carga; se apaga sola al llegar a 0.

## Fase 3 — Menú de pausa + ajustes
- `Esc` abre menú modal: Continuar, Guardar, Cargar, Ajustes, Salir al menú principal.
- **Ajustes de gráficos**: calidad (bajo/medio/alto), sombras on/off, post-FX on/off, FOV, brillo.
- **Audio**: master / música / SFX / voces (sliders independientes).
- **Controles**: rebind de todas las teclas con captura en vivo, reset a defecto.
- Todo persiste en `localStorage`.

## Fase 4 — Inventario + equipamiento visible
- Panel `I` con **grid drag & drop** (usando `dnd-kit`).
- Slots de equipo: cabeza, torso, manos, arma principal, arma secundaria, linterna.
- El objeto equipado se refleja **visualmente en el personaje 3D** (cambia el mesh de la mano/casco).
- Rareza con bordes de color (común/raro/épico/legendario) y tooltip con stats.
- Loot al matar enemigos entra al inventario.

## Fase 5 — Diario de misiones + bestiario
- Tecla `J` abre diario con pestañas: **Misiones** (activas/completadas) y **Bestiario**.
- Cada enemigo derrotado añade entrada al bestiario con: nombre, retrato render, contador de bajas, debilidades, lore corto.
- Misiones tipo "Mata 10 sombras", "Encuentra el altar", con objetivo activo que alimenta la brújula.

## Fase 6 — Guardado auto + slots
- **Auto-save** al entrar a nueva zona, subir de nivel o cada 2 minutos.
- **6 slots manuales** en menú Guardar/Cargar con: timestamp, ubicación, nivel, screenshot del canvas.
- Estado guardado: posición, vida/stamina, inventario, equipamiento, misiones, bestiario, progreso, personalización.

## Fase 7 — Audio posicional + post-processing + personalización
- **Audio 3D**: `PositionalAudio` de three.js para pasos, susurros y enemigos; reverberación distinta por bioma (cueva vs exterior) usando `ConvolverNode`.
- **Post-processing** con `@react-three/postprocessing`: Bloom, Vignette, MotionBlur sutil, FilmGrain, ChromaticAberration ligero en zonas de terror.
- **Editor de personaje** al iniciar partida nueva:
  - Género (masculino/femenino) — cambia proporciones del rig.
  - Color de piel, pelo (estilo + color), ojos.
  - Marcas/cicatrices, complexión (delgado/atlético/robusto) vía scale de huesos.
  - Ropa base con paleta de 2 colores primarios.
  - Preview 3D rotatorio en vivo.

---

## Detalles técnicos

**Dependencias nuevas**
- `@dnd-kit/core` + `@dnd-kit/sortable` — inventario drag & drop
- `@react-three/postprocessing` + `postprocessing` — efectos visuales
- `zustand` — store global para HUD/inventario/misiones/ajustes (evita prop drilling)

**Arquitectura de estado**
```text
src/game/
  store.ts          // zustand: player, inventory, quests, bestiary, settings
  persistence.ts    // save/load a localStorage con slots
  types.ts          // Item, Quest, EnemyEntry, Loadout, Appearance
src/components/hud/
  HealthBar.tsx  StaminaBar.tsx  Minimap.tsx  QuestCompass.tsx  HudRoot.tsx
src/components/menus/
  PauseMenu.tsx  SettingsPanel.tsx  KeyRebind.tsx
  Inventory.tsx  Journal.tsx  Bestiary.tsx
  CharacterCreator.tsx  SaveLoadPanel.tsx
src/game/
  audio.ts          // sistema posicional + reverb por zona
  postfx.tsx        // <EffectComposer> con bloom/vignette/etc
```

**Impacto en el archivo actual (`src/routes/index.tsx`)**
- Extraer estado del jugador (vida, stamina, batería, posición) al store de zustand.
- Renderizar `<HudRoot />` como overlay sobre el canvas.
- Envolver `<Canvas>` con `<EffectComposer>` de la Fase 7.
- El personaje 3D pasa a leer `appearance` y `loadout` del store para reflejar equipamiento y customización.

---

## Cómo prefieres avanzar

1. **Ir por fases** aprobando una a una (recomendado; cada fase es entregable y jugable).
2. **Todo de golpe** en una implementación larga (más riesgo, más tiempo, mismo resultado final).

¿Cuál prefieres? Si vas por fases, ¿empezamos por **Fase 1 (HUD)** o prefieres arrancar por la **personalización del personaje** ya que la mencionaste al final?
