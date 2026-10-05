# WebXR Controller Attachment & Locomotion System

This guide outlines the implementation of the advanced, immersive hand controller integration, spatial UI attachment system, and fallback locomotion mechanisms engineered for the Scandinavian showroom gallery.

---

## 1. Hand Controller Spatial UI Attachment

To allow the user to comfortably wander the gallery without returning to static pedestals, we engineered a state-of-the-art **UI Attachment & Carry System** with perfect desktop-to-VR parity:

### Immersive VR State
- **Interaction**: Users gaze or aim their line-of-sight laser at any Sound Explorer panel.
- **Attachment**: Selecting the **"Attach UI"** button dynamically transfers the panel's hierarchical parenthood in Three.js from the physical exhibition group onto the user's non-dominant VR controller.
- **HUD Placement**: The panel gently floats at coordinates `(-0.25, 0.15, -0.35)` relative to the hand controller, tilted at a `-45°` angle facing the user, matching physical ergonomics.
- **Detachment**: Selecting **"Detach UI"** instantly snaps the panel back to its respective exhibition pedestal coordinate space with smooth, localized recovery matrices.

### Desktop Parity Mode
- **HUD Overlay**: Selecting **"Attach UI"** while in desktop mode embeds the active panel directly onto the standard screen `camera` object at coordinates `(0.3, -0.22, -0.8)` tilted slightly inward.
- **Universal Reachability**: The raycaster dynamically calculates hover tilts and slider drag events continuously, permitting the user to access adjustments while navigating freely.

---

## 2. Advanced Multi-Mode Teleportation

To accommodate multiple controller profiles, hardware constraints, and hand-tracking configurations:

### Parabolic Bezier Locomotion (Squeeze)
- **Aiming Mode**: Initiated by holding the secondary squeezer button on either VR controller.
- **Arc Projection**: Spawns a high-fidelity **Quadratic Bezier Curve** curving smoothly onto the floor space.
- **Placement**: Calculates a mid-aim point heightened proportionally to targeting distance, drawing a neon-glowing landing ring.
- **Translation**: Releasing the button triggers an instant, comfortable step transformation.

### Point-and-Click Fallback (Trigger)
- **Accessibility**: Ideal for headsets missing squeeze/grip mechanisms, or when utilizing modern **VR Hand-Tracking pinch gestures**.
- **Action**: Directing the pointer ray onto any valid area of the `teleportFloor` and pulling the primary trigger initiates instant translation, bypassing the need for multi-button coordinate coordination.

---

## 3. Session Isolation & Safety Cleanups
To avoid detached or floating panels when transitioning between VR mode and Desktop mode, we hook into the standard WebXR lifecycle triggers:
- Upon a `sessionend` event, the system executes `detachAllAttachedPanels()`.
- Every active UI panel is automatically detached from the VR controller's child list, restored safely onto its native architectural pedestal structure, and button values are reset to native states.
