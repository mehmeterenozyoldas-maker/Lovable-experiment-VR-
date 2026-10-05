# Next MVP Iteration: Feature Proposals

This document outlines proposed features and architectural enhancements for the next MVP phase of the VR Scandinavian Showroom Gallery.

All proposals are designed with both WebXR (VR) and Desktop parity in mind.

## 1. Advanced Spatial Audio & Acoustic Environments
**Goal:** Evolve the "Sound Explorer" from global audio playback to a physically accurate acoustic environment.
- **3D Positional Audio:** Transition exhibits from standard HTML5 Audio nodes to `THREE.PositionalAudio`. Sound will naturally originate from the physical pedestal and fade/pan dynamically as the user navigates the gallery.
- **Acoustic Reverb Zones:** Utilize Web Audio API Convolver nodes to simulate architectural acoustics (e.g., dense reverb under the oculus, muffled echoes near the mycelium surfaces).
- **Audio-Reactive Particle Systems:** Expand the global particle system to pulsate and alter its vectors based on real-time FFT frequency data of the nearest active exhibit.

## 2. Immersive Hand Tracking & Gesture Controls
**Goal:** Provide a seamless controller-less experience using the WebXR Hand Tracking API.
- **Direct UI Manipulation:** Allow users to physically press UI panel buttons and slide sliders using their virtual index fingers ("poke" interaction).
- **Pinch-to-Inspect:** Users can reach out, pinch, and manipulate floating artifacts directly with their hands instead of relying on laser pointers.
- **Gesture Teleportation:** Implement a pinch-and-pull or palm-facing gesture to trigger parabolic teleportation when controllers are absent.

## 3. Dynamic Exhibition Environments & Lighting Themes
**Goal:** Give users control over the architectural atmosphere of the gallery.
- **Atmospheric Time of Day:** Add UI controls to transition the showroom lighting between "Scandi Morning" (cool, diffuse), "Gallery Spotlight" (high contrast, dramatic shadows), and "Night Exhibition" (bioluminescent glows).
- **Material State Changes:** Implement dynamic shader transitions for the architecture (e.g., the pool rippling to the beat, or the mycelium walls glowing based on exhibit proximity).
- **Persistent Gallery State:** Serialize the user's modifications to the gallery (artifact rotations, audio levels, lighting themes) to `localStorage` so the showroom retains their specific curation upon return.

## 4. Multi-User Showroom (Social MVP)
**Goal:** Evolve the solitary gallery into a collaborative viewing space.
- **Shared Presence:** Introduce simple floating head/hand avatars to represent multiple visitors navigating the gallery simultaneously via WebSockets.
- **Networked Interactions:** Synchronize artifact inspections, UI interactions, and audio playback across clients so users can co-curate the space.
- **Spatial Voice Chat:** Integrate WebRTC spatial audio for organic conversation between visitors.

---
**Status:** Awaiting review. No code changes have been made.
