# NEXT MVP: Advanced Locomotion & Comfort Suite (Plan V3)

This plan outlines the architecture, mathematics, and implementation strategies for introducing industry-standard locomotion and comfort features to our XR Parametric Showroom. This represents the next evolution of spatial travel, focusing on **Parabolic Arc Aiming**, **NavMesh Constraints**, and **Snap/Smooth Thumbstick Turning**.

---

## 1. Feature 1: Parabolic Arc Teleportation
### Concept
Instead of a straight raycast line—which feels rigid and cannot handle height elevation changes or natural depth perception—we will implement a physics-based **Parabolic Arc**. The arc simulates a projectile thrown with an initial velocity, under the influence of gravity, which terminates upon intersecting with the walkable floor.

### Technical & Math Formulation
*   **Vector Projectile Simulation:** Given a controller's starting position $\vec{p}_0$ and forward direction vector $\vec{v}_0$:
    $$\vec{p}(t) = \vec{p}_0 + \vec{v}_0 \cdot v_{\text{scale}} \cdot t + \frac{1}{2}\vec{g} \cdot t^2$$
    where:
    *   $\vec{g}$ is the gravity vector $[0, -9.8, 0]$.
    *   $t$ is the step interval parameter ($0 \le t \le 1$ over $N$ segments).
    *   $v_{\text{scale}}$ is a user-adjustable velocity scalar (typically $6.0$ to $12.0$).
*   **Segmented Collision Detection:** We will sample $N = 30$ vertices along this arc. For each segment $i$ from $\vec{p}_{i-1}$ to $\vec{p}_i$, we perform a mini-raycast check. The first segment to hit a collision plane stops the arc generation and marks the teleport target point.
*   **Visual Representation:**
    *   A `THREE.Line` or a series of instanced mesh segments with an emissive, pulsing shader representing the trajectory.
    *   A localized, floating circular target ring (`THREE.RingGeometry`) mapped to the intersection normal to prevent flat rendering on inclined slopes.

---

## 2. Feature 2: Walking NavMesh (Navigation Mesh Constraints)
### Concept
Currently, players can teleport anywhere, leading to clip-throughs of the central exhibits (Orrery, Swarm, Relic) or walking off the showroom platform. We will implement a mathematical, high-performance **NavMesh Boundary Validator**.

### Technical formulation
Instead of loading external heavy OBJ NavMeshes, we can utilize a dual-layer geometric boundary solver directly inside the frame loop:
*   **Outer Boundary Boundary (Showroom Limits):** A polar distance check or axis-aligned box constraint. The showroom floor is a circle of radius $R = 6.5\text{m}$.
    $$\Delta = x^2 + z^2 \le (6.5)^2$$
*   **Exhibit Keep-Out Zones (Bounding Radii):** Circle-circle collision bounds surrounding our three majestic exhibit pedestals to prevent teleportation directly into the artwork:
    *   **Orrery Pedestal:** Distance to Center $[-3.4, -2.5] > 1.2\text{m}$
    *   **Swarm Pedestal:** Distance to Center $[0.0, -4.2] > 1.2\text{m}$
    *   **Relic Pedestal:** Distance to Center $[3.4, -2.5] > 1.2\text{m}$
*   **Visual Warning State:** If the arc points to an out-of-bounds area, the arc's color dynamically interpolates from bright **Teal** (`#00ffaa`) to **Crimson Red** (`#ff3366`), and the teleport trigger action is safely blocked.

---

## 3. Feature 3: Snap & Smooth Thumbstick Turning
### Concept
Physical 360-degree rotation can be difficult or fatiguing for seated VR users, or those with constrained physical play areas. Implementing thumbstick turning allows users to rotate their virtual body easily.

### Technical Formulation
*   **Input Polling:** We poll the active WebXR gamepads for the horizontal axis of the right controller thumbstick (typically `gamepad.axes[2]`).
*   **Debounced Snap Turning:** When the axis value exceeds a threshold ($\pm 0.7$) and was previously neutral ($< 0.1$):
    *   Instantaneously rotate the `cameraGroup` around the Y-axis by $\pm 45^\circ$ ($\pm \frac{\pi}{4}$ radians).
    *   Trigger a momentary "Comfort Blink" (fade out and in over 80ms) to bypass vestibular-ocular conflict.
*   **Smooth Turning (Optional Comfort Toggle):**
    *   If smooth turn is selected, rotate the Y-axis of the `cameraGroup` continuously proportional to the stick deflection rate:
        $$\Delta \theta = \text{axisValue} \cdot \text{speed} \cdot dt$$

---

## 4. Implementation Timeline

### Step 1: Layout & State Preparation
*   Integrate a comfort selection submenu onto the Left Wrist UI. Let users toggle between **Snap Turn** vs. **Smooth Turn**, and adjust the **Locomotion Arc Curve Intensity**.

### Step 2: Parabolic Arc Math Implementation
*   In `engine.js`, refactor the current straight-line pointer line generation to calculate a 30-vertex bezier/parabolic point list.
*   Implement segment-by-segment raycasting using a reusable `THREE.Raycaster` to detect intersections with the gallery floor mesh.

### Step 3: NavMesh Hardening
*   Enforce the geometric constraint checks in the target calculation function.
*   Add visual feedback (color changes from teal to red) for invalid target areas.

### Step 4: WebXR Input Hook-ins
*   Access the WebXR controllers inside the animate/render loop. Poll gamepad axes to handle comfort snap-turning.

---

*Status: Plan draft finalized. Awaiting client review and consent prior to writing any codebase files.*
