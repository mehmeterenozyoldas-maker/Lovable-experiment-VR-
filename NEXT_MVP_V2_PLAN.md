# Next MVP Development Plan: Enhancing XR Navigation & Immersion

Based on the recent implementation of the **Right Hand Controller UI for Teleportation** (Travel Deck) and the core VR engine stabilization, the application is ready for its next evolutionary step. 

This document outlines the strategic plan for the **Next MVP Iteration**. We will focus heavily on refining the spatial navigation, strengthening user comfort, and pushing the boundaries of multi-user XR interactions.

---

## 1. Advanced Teleportation & Locomotion (Core Focus)
Since teleportation is a major pain point and right-hand UI improvements were well-received, the next MVP will elevate the movement systems to industry standards.

* **Parabolic Arc Aiming:** Replace the straight-line pointer with a physics-based curved parabolic arc. This intuitively shows the drop-point and accommodates height differences in the terrain.
* **Teleportation NavMesh (Navigation Mesh):** Implement a precise collision area restricting teleportation to valid, walkable floors. This prevents users from clipping inside walls, exhibits, or falling off the map.
* **Snap & Smooth Turning:** Add thumbstick turning (45-degree snap or smooth turn) to support seated experiences and users without 360-degree play spaces.
* **Dynamic Node Transitions:** When using the "Travel Deck" fast-travel nodes (Orrery, Swarm, Relic), introduce a smooth fade-to-black and fade-in transition to eliminate jarring instant-snaps.

## 2. Expanded Comfort & Accessibility Settings
VR sickness is a common barrier. We will build upon the newly introduced "Comfort Blink" feature to establish a comprehensive comfort suite.

* **Dynamic Vignetting (Tunnel Vision):** A shader effect that gently darkens the peripheral vision only during locomotion (teleporting, turning). This is the gold standard for reducing motion sickness.
* **Personal Space Bounds:** In multi-user modes, allow users to activate a "comfort bubble" that fades out other avatars who get too close.
* **Height Calibration:** An override slider on the Left Wrist UI to adjust baseline camera height, accommodating differing physical heights or seated users.

## 3. Hand-Tracking Integration Strategy
Moving beyond controllers to native hand tracking provides a frictionless "drop-in" experience.

* **Pinch-to-Teleport:** Implement a specific hand gesture (e.g., index-thumb pinch on the right hand) to summon the teleport arc, and releasing the pinch executes the jump.
* **Direct UI Finger-Pressing:** Evolve the Wrist Menus from raycast-only selection to physical volume intersection. Users should be able to actively push menu buttons with their index finger.

## 4. Multi-User Experiential Synchronization
Enhancing the collaborative nature of the VR showroom.

* **"Summon/Gather" Protocol:** Allow hosts or guide users to send a notification to other users' wrist menus, inviting them to fast-travel to their specific location.
* **Spatial Voice Chat Integration:** Integrate WebRTC positional audio so visitors can hear where others are standing.

## 5. Performance & Visual Optimizations
Ensuring 90+ FPS stability across standalone headset devices (Meta Quest 2/3).

* **Foveated Rendering Pass:** Implement fixed foveated rendering flags for performance improvements.
* **Texture Atlasing & Draw-Call Reduction:** Merge static modular architecture into unified instanced meshes to lower the WebGL draw-call count, making room for more intense particle effects during fast-travel.

---

**Status:** Awaiting review. No code changes, design adjustments, or implementation steps have been initiated. Please provide your feedback on this proposal before we proceed.
