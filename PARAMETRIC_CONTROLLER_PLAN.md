# Parametric Architecture Controller: Ideation & Implementation Plan

## 1. Overview
Yes, we can implement an advanced parametric controller. The goal is to create a spatial, interactive UI panel that allows the user to manipulate the mathematical variables driving the procedural generation of the architectural elements (such as the sweeping wooden ceiling) in real-time. 

## 2. Functional Scope (Controllable Parameters)
The controller will expose the variables that govern the procedural geometry:
* **Wave Amplitude:** Controls the depth of the organic modulation along the X-axis.
* **Wave Frequency:** Controls the number of waves or "ripples" across the ceiling span.
* **Arch Compression:** Modifies the parabolic arch offset (flattening or deepening the curve).
* **Slat Density:** Adjusts the spacing between individual slats (which dynamically updates the total slat count).
* **Oculus Radius:** Expands or contracts the central skylight void.

## 3. Interaction Design (UI/UX)
* **Spatial Form Factor:** Instead of cluttering the wrist menu, we will introduce a dockable or floating "Architectural Console" (a 3D panel positioned at a comfortable height).
* **Interface Rendering:** Utilizing the existing HTML Canvas-to-Texture pipeline to render crisp text and interactive sliders.
* **Input Routing:** Utilizing the existing XR raycaster system. Users will point and hold the trigger to drag sliders, triggering geometry updates.

## 4. Technical Architecture & Constraints
To ensure a smooth VR experience at 90fps without memory leaks:
* **State Management:** Introduce a global `parametricState` object to store current values.
* **Geometry Regeneration:** Extract the ceiling generation logic into a standalone function (`rebuildCeiling(params)`).
* **Memory Management (Critical):** Before generating new geometry, the system MUST iterate through the existing `ceilingGroup`, call `.dispose()` on all geometries and materials, and explicitly remove them from the scene.
* **Throttling/Debouncing:** Rapidly sliding a value can cause frame drops if heavy geometry is rebuilt every frame. Regeneration will be throttled (e.g., max 10 updates per second) while sliding, or optionally trigger only on "release" of the slider.

## 5. Phased Implementation Steps
1. **Refactoring:** Extract the current ceiling logic in `src/lib/engine.js` into an isolated `rebuildCeiling()` function that reads from a configuration object.
2. **UI Construction:** Create the canvas drawing logic and 3D plane mesh for the "Parametric Console".
3. **Event Mapping:** Update the `handleControllerIntersections` function to detect hits on the new console's sliders and update the configuration object.
4. **Lifecycle Hook:** Tie the slider update events to the `rebuildCeiling()` function with appropriate memory disposal.

---
*Please review this plan. If the scope and approach align with your vision, provide confirmation to begin implementation.*
