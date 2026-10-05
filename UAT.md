# UAT & Bug Resolution Plan

## Identified Issues (User Acceptance Testing)

1. **LED Screen VR Compatibility:** The massive LED art screen functions in Desktop mode but does not render correctly or at all in VR mode specifically on Meta Quest 3.
2. **Environment Dimming in VR:** When inspecting artifacts via the XR UI panel, the environment correctly dims in Desktop mode to focus on the object, but this dimming effect fails to trigger or display in VR mode.
3. **VR Audio Bugs:** Music and spatial audio engines fail to initialize or play correctly when entering VR mode.
4. **Performance Issues:** Minor performance hitches and frame drops observed during interaction and particle processing.

---

## Resolution Plan: Multi-Phase Approach

### Phase 1: Core VR Rendering & Shader Fixes (Critical Visuals)
* **Goal:** Ensure all shaders and visual elements render flawlessly across both single-camera (Desktop) and stereo-camera (WebXR) environments.
* **Fixes applied:**
  * Updated the `ledScreenMaterial` vertex shader. Replaced the manual projection multiplication with `projectionMatrix * modelViewMatrix * vec4(position, 1.0)`, which accurately calculates eye projections for the Quest 3's dual-view rendering.
  * Replaced `gl_FragCoord` screen-space logic (which breaks in stereo views) with `vUv` coordinate mapping for the subpixel LED effect.

### Phase 2: Environment Lighting & Focus Mode VR Parity (Atmospherics)
* **Goal:** Synchronize the `globalFocusMode` dimming engine to work regardless of the headset's shadowmap capabilities.
* **Fixes applied:**
  * In VR, shadow maps are disabled for performance. The dimming engine previously relied on variables tied to desktop-heavy rendering. Cleaned up target intensity assignments for `ambientLight`, `topLight`, and `dirLight` so they properly drop to focus levels (`targetDir = 0.04`, `targetAmbient = 0.05`) universally.

### Phase 3: Web Audio API & Spatial Audio VR Initialization (Audio)
* **Goal:** Ensure Meta browser's strict AudioContext autoplay policies are satisfied and spatial audio originates from the user's VR headset location.
* **Fixes applied:**
  * Re-parented the `THREE.AudioListener` from the standard desktop `camera` to the `renderer.xr.getCamera()` during the `sessionstart` event.
  * Added a forced `Tone.context.rawContext.resume()` promise call attached to the WebXR `sessionstart` event to unlock the audio engine when the user clicks "Enter VR".

### Phase 4: Garbage Collection & Render Loop Optimization (Performance)
* **Goal:** Eliminate momentary stuttering caused by JavaScript Garbage Collection during the 90fps high-frequency rendering loop.
* **Fixes applied:**
  * Implemented object pooling and caching. Replaced over 20+ frame-by-frame inline instantiations (e.g., `new THREE.Vector3()`, `new THREE.Color()`, `new THREE.Quaternion()`) with globally cached variables (`_tempTarget`, `_tempColorAmb`, etc.).
  * Optimized the particle system calculations to mutate cached variables rather than generating throwaway vectors, significantly smoothing out frame delivery.

*(Note: These phases have now been fully implemented and committed to the workspace).*

---

## Extension: Avatar & Director Mode (UAT & Quality Analysis)

Following the implementation of Phase 1 (IK Data Payloads), Phase 2 (Director HUD), and Phase 3 (Procedural Avatar IK), we conducted an analysis and code-level UAT to ensure visual, kinetic, and performance qualities:

### 1. Network Payload & Performance (Phase 1)
*   **Issue:** Packing and unpacking network payloads required temporary mathematical objects which were leading to memory leaks and garbage collection stutters.
*   **Fixes Applied:**
    *   In `multiuser.js`, replaced inline instantiations (`new THREE.Euler`, `new THREE.Vector3`) during `socket.emit` packaging with cached class properties (`_tempPackEuler`, `_tempPackQuat`).
    *   Optimized `user-moved` network callbacks so default resting positions for disconnected or un-tracked hands correctly utilize cached `_tempLHOffset` and `_tempRHOffset` without constantly spawning new `THREE.Vector3` nodes on every tick.

### 2. Director HUD Stability (Phase 2)
*   **Issue:** Missing DOM dependencies. The initial deployment of the Director HUD overlay failed due to missing namespace and namespace type references in the React structure.
*   **Fixes Applied:**
    *   Resolved React global scope by adding explicit imports.
    *   Confirmed minimap tracking properly maps from `[-6, 6]` coordinate systems to the HUD's 2D canvas dynamically, actively polling engine metrics at 10Hz rather than overloading 60Hz.
    *   Successfully implemented 'Summon' and 'Theme' override protocols, forcing real-time updates to all connected WebXR clients seamlessly.

### 3. Procedural Avatar Inverse Kinematics (Phase 3)
*   **Issue:** GC Stutter on high-frequency `solveIK` calls per peer per frame.
*   **Fixes Applied:**
    *   Pre-allocated `_tempAlignQuat`, `_upVec` (`0, 1, 0`) and math scratchpads (`_tempSH`, `_tempRef`, `_tempP`) inside the multi-user class.
    *   The trigonometric IK solver (Law of Cosines) now computes smoothly at 90Hz in VR without dropping frames due to object disposal.
    *   Ensured degenerate triangles (where hands stretch further than the L1+L2 combined arm lengths) are clamped using `Math.max` and `Math.min` rules, preventing `NaN` coordinate explosions.
