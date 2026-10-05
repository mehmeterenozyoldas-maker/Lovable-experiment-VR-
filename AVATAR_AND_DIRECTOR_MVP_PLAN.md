# Development Plan: Avatar Embodiment & Asymmetric Director Mode

This document outlines the architecture and implementation steps to introduce two major pillars into our XR Parametric Showroom: **Dynamic Avatar Embodiment** (Inverse Kinematics and physical representation) and **Cross-Platform Asymmetry** (a Director HUD for non-VR users).

---

## 1. Dynamic Avatar Embodiment
Currently, the multi-user architecture transmits discrete points representing users. To elevate the social presence, we will synthesize full positional data into physical avatar representations.

### Goals
*   **Visual Presence:** Move from floating cameras to abstract, aesthetic representations (floating heads, stylized hands, and a suggested torso).
*   **Kinematic Syncing:** Transmit Head (HMD), Left Hand/Controller, and Right Hand/Controller positions and rotations tightly over the network.
*   **Simplified IK (Inverse Kinematics):** Derive the shoulder and elbow bend automatically based on the distance between the head and the hands.

### Implementation Steps
1.  **Network Payload Expansion:**
    *   Extend `multiuser.js` to pack and unpack not just the camera pose, but also `leftHand` and `rightHand` transform matrices.
    *   Compress rotations to quaternions and positions to Float32 arrays to maintain low latency.
2.  **Procedural Avatar Construction:**
    *   Instead of loading heavy GLTF rigged models, we'll compose the avatar using three core, stylized modular components (Head, L-Hand, R-Hand).
    *   Design it to match the Scandinavian Parametric aesthetic (e.g., minimalist floating geometric shapes or glowing crystalline forms).
3.  **Local IK Interpolation:**
    *   Implement an interpolation curve. When receiving network updates (`updatePosition`), use `THREE.MathUtils.lerp` to smoothly animate the joints between ticks, eliminating network stuttering.

---

## 2. Cross-Platform Asymmetry (Director Mode HUD)
The showroom shouldn't be locked purely to those in VR. Desktop and Mobile users will access a specialized 2D interactive UI wrapper that communicates seamlessly with the 3D WebXR space.

### Goals
*   **Omniscient Oversight:** Instead of forcing desktop users into WASD "fake-VR" modes, shift their perspective to a high-level "Director/God view".
*   **Environmental Control:** Desktop users can change global lighting, theme states, and toggle exhibits for all current users.
*   **Guide Capabilities:** Provide tools for the Director to "Summon" users to specific exhibits. 

### Implementation Steps
1.  **Platform Detection Override:**
    *   Determine upon entry if the user intends to enter VR or use the browser mode.
    *   If browser mode: lock the 3D camera to a wide, isometric, or sweeping orbital view spanning the gallery.
2.  **HTML/CSS DOM HUD overlay:**
    *   Build a responsive React UI overlay (`DirectorHUD`) that completely hides the enter-VR buttons and replaces them with a control dashboard.
3.  **Command Hook-ins:**
    *   Connect the DOM buttons directly to the `multiuser.emitInteraction` payloads. 
    *   For example, triggering the "Spotlight" theme, or picking an exhibit from a dropdown and forcing all VR connected clients to teleport to it using the established `summon` event type.
4.  **Observer Markers:**
    *   In the Director view, project VR users as blips or markers dynamically moving across the 2D plane (or 3D orbital space), similar to an RTS minimap.

---

**Status:** Plan articulated. Awaiting approval to begin coding Phase 1 (Data structures and network prep for expanded IK payloads).
