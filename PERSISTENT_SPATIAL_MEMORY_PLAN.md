# NEXT MVP: Persistent Spatial Memory & Asynchronous Art

This document outlines the exploration and implementation strategy for transforming the XR Showroom from an ephemeral meeting space into a persistent, living canvas. We will introduce mechanisms for users to leave their mark via **3D Spatial Ribbons** and **Crystallized Voice Echoes**.

---

## 1. Core Concept & Philosophy
The gallery shouldn't just reset when empty. It should accumulate the creative energy and thoughts of its visitors. By introducing asynchronous elements, a user visiting alone can still feel the presence of past visitors, exploring a landscape of glowing trails and floating whispers.

## 2. Feature 1: Glowing 3D Spatial Ribbons (Drawing)
### Concept
Allow VR users to press a secondary button (e.g., the Grip or Trigger on a specific "Drawing Tool" mode) to paint in mid-air. 

### Technical Strategy
*   **Input & Generation:** 
    *   Poll the VR controller's position every few frames while the trigger is held.
    *   Store these points in a local array and use `THREE.CatmullRomCurve3` combined with `THREE.TubeGeometry` (or a custom continuous mesh generation) to create smooth glowing ribbons.
    *   Apply a neon/emissive `MeshStandardMaterial` with additive blending.
*   **Real-time Synchronization:**
    *   As a user draws, emit a `draw-stroke-update` over the WebRTC/Socket network so others see the ribbon being formed in real-time.
*   **Persistence:**
    *   Upon releasing the trigger, bundle the stroke data (array of Vector3 points, color, width) and send a `save-ribbon` event to the Node.js server.
    *   The server stores these in an SQLite database or an in-memory JSON structure.
    *   When new users connect, the server sends down the `spatial-memory-state` containing all historical ribbons.

## 3. Feature 2: Crystallized Voice Echoes (Audio Memos)
### Concept
Users can record a short audio message (an "Echo") and place it physically in the world as a glowing crystal or orb. Future visitors can interact with or approach the crystal to hear the message play back spatially.

### Technical Strategy
*   **Recording Audio:**
    *   Add a "Record Echo" button to the Wrist UI.
    *   Use the browser's `MediaRecorder` API to capture microphone input into an audio Blob.
*   **Upload & Storage:**
    *   Send the Blob to the server via an Express `POST /api/upload-echo` endpoint or via Socket.IO binary payloads.
    *   The server saves the `.webm` or `.ogg` file to the local disk and returns a static URL.
*   **Spatial Instantiation:**
    *   The client instantiates a `THREE.OctahedronGeometry` (the Crystal) at the user's hand location.
    *   Attach a `THREE.PositionalAudio` node to the Crystal, linked to the uploaded audio URL.
    *   Broadcast a `new-echo` event to the server containing `[position, audioUrl]`, which is persisted.

## 4. Feature 3: Server-Side State Engine (The Archive)
### Concept
The Node.js backend must evolve from a simple real-time relay into a stateful archive.

### Technical Strategy
*   Update `server.ts` to hold an array of `ribbons` and `echoes`.
*   Whenever a user joins (`init` event), they receive a payload of all existing artifacts to render immediately upon entering the gallery.
*   **Garbage Collection/Fading:** To prevent the gallery from becoming visually chaotic over weeks, implement an age-out mechanism. Ribbons older than 48 hours might slowly fade in opacity until they are removed, keeping the canvas fresh.

---

## 5. Implementation Phases
*   **Phase 1: Real-time Ribbon Prototyping:** Implement the 3D drawing tool locally for the VR controllers and sync the raw points over the existing WebRTC/Socket channels.
*   **Phase 2: Voice Recording & Positional Playback:** Integrate the `MediaRecorder` API and tie it to a new interactive 3D object in the scene.
*   **Phase 3: Backend Persistence:** Wire up the Node.js server to save, store, and serve the drawing and audio data to newly connected clients.

---

*Status: Ideation complete. Awaiting your review before proceeding with implementation.*
