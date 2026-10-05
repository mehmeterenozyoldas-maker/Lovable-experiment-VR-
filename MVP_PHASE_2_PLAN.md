# XR Museum: MVP Phase 2 Implementation Plan

**Goal:** Translate our advanced XR ideation into a tangible, performant Minimum Viable Product (MVP). 
**Focus:** Execution of performance engineering, diegetic UI, and our first fully computational exhibit.

---

### STEP 1: Performance Baseline (Instancing & Draw Calls)
*We must stabilize the framerate before adding complex interactions to ensure mobile XR headsets (like Quest 3) don't crash.*
*   **Action:** Refactor the procedural Scandinavian ceiling (wooden slats) and mycelium acoustic baffles.
*   **Implementation:** Replace individual `THREE.Mesh` generation loops with `THREE.InstancedMesh`. We will compute a single array of transformation matrices for the entire ceiling and push it to the GPU at once.
*   **Success Metric:** Reduce WebGL draw calls for the architectural shell from 1000+ down to under 50 per frame.

### STEP 2: The First Diegetic Interface (Spatial UI)
*Eliminating floating HTML and testing our physical interaction theories.*
*   **Action:** Build the "Focus Mode" interactive pedestal and diegetic placard.
*   **Implementation:** 
    *   Create a physical 3D button that actually depresses along its Z-axis upon raycaster/hand intersection.
    *   Implement Signed Distance Field (SDF) font rendering (using `troika-three-text` or similar) on an angled physical placard (20-degree tilt) for crisp text legibility in VR.
    *   Wire the physical button to trigger a localized `Tone.js` audio click, a Gamepad API haptic pulse, and a state change (dimming the lights/fog).

### STEP 3: The Audio-Reactive Prototype (Computational Art)
*Proving out the living, generative curation concept.*
*   **Action:** Implement one "Hero" computational exhibit in the center of the gallery.
*   **Implementation:** 
    *   Replace a static sculpture with a custom GLSL `ShaderMaterial` applied to a parametric mesh.
    *   Hook the shader's vertex displacement and normal distortion to the FFT (Fast Fourier Transform) output of our existing `Tone.js` generative audio.
    *   Apply mathematical damping to ensure smooth, non-flashing transitions that strictly adhere to Meta's photosensitivity guidelines.

### STEP 4: Spatial Anchoring & Teleportation Comfort
*Ensuring users do not experience simulator sickness during locomotion.*
*   **Action:** Upgrade the teleportation UX and spatial grounding.
*   **Implementation:** 
    *   Inject a subtle, 1x1 meter illuminated grid onto the concrete floor that fades in *only* while the user is actively aiming their teleport arc, giving the brain instant scale context.
    *   Solidify the high-contrast architectural shadow gap (baseboard) to act as a stable horizon anchor, keeping the user grounded regardless of dynamic lighting changes in the room.

---
**Review & Next Actions:** 
Please review this 4-step MVP plan. Once you approve, we will begin executing Step 1 (Performance Baseline) in the codebase.
