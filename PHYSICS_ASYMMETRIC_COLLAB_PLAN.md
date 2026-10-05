# Deep Dive: Networked Rigid Body Physics for Asymmetric Collaboration

This document outlines the technical architecture and implementation strategy for realizing **Scenario 5: Tangible, Asymmetric Collaboration**. This feature will allow Director (Desktop) users and VR users to seamlessly interact with the same physical objects in real-time.

---

## 1. System Architecture

To ensure all users see objects bouncing, rolling, and reacting consistently, we must implement a robust physics synchronization model.

### **The Authoritative Server Model**
Relying on client-side physics computation leads to "desync" (where an object falls off a table for one user but stays on the table for another). Instead, we will use an **Authoritative Server** architecture.

1.  **Physics Engine (`cannon-es`):** We will use the `cannon-es` library. It is lightweight, written in JavaScript, and can run in both the browser and a Node.js environment.
2.  **Server-Side Simulation:** The Node.js Socket server will run a headless `cannon-es` world at a fixed timestep (e.g., 30Hz or 60Hz). It handles all collision detection, gravity, and rigid body dynamics.
3.  **State Broadcasting:** The server broadcasts the resulting `position`, `quaternion`, `linearVelocity`, and `angularVelocity` of all dynamic objects to all connected clients.
4.  **Client-Side Interpolation:** The Three.js clients do *not* run the physics engine for shared objects. Instead, they receive the network ticks and use interpolation (`THREE.Vector3.lerp` and `THREE.Quaternion.slerp`) to smoothly animate the meshes at 90+ FPS, hiding any network latency.

---

## 2. Implementation Phases

### Phase 1: Local Physics Foundation
Before networking, we must establish the physical interaction rules locally.
*   **Action:** Install `cannon-es` on the client to prototype object behaviors.
*   **Implementation:** 
    *   Create a physical `Plane` for the floor.
    *   Add dynamic `Box` or `Sphere` bodies for interactable exhibits.
    *   Map Three.js mesh transforms to Cannon.js body transforms in the render loop.

### Phase 2: VR "Grab" Mechanics (Kinematic Constraints)
VR controllers need a physical presence to push or grab objects.
*   **Action:** Represent VR hands as "Kinematic" bodies (objects that affect physics but are not affected by gravity or collisions themselves).
*   **Implementation:**
    *   When the VR user presses the `squeeze` trigger, cast a short ray or use a bounding box intersection to find the nearest dynamic body.
    *   If an object is found, create a `PointToPointConstraint` between the Kinematic Hand Body and the Dynamic Object Body. 
    *   This allows the object to swing naturally from the hand with momentum, rather than snapping rigidly to the controller's exact coordinate.

### Phase 3: Network Authority Transfer (Server Setup)
Moving the logic to the backend to ensure consistency.
*   **Action:** Install `cannon-es` on the Node.js server.
*   **Implementation:**
    *   Replicate the physical environment (floor, static gallery walls) on the server.
    *   When a user connects, their client sends their hand/camera transforms to the server. The server updates their corresponding Kinematic bodies.
    *   The server runs `world.step()` and broadcasts the state of all dynamic props to all clients.

### Phase 4: Director Asymmetric Interaction
Giving the Desktop Director tools to interact with the physical world.
*   **Action:** Implement raycasting from the Director's 2D/3D camera.
*   **Implementation:**
    *   When the Director clicks and drags on their screen, the client sends a "DirectorGrab" event to the server with the intersection point.
    *   The server creates a temporary Kinematic body at that intersection point and links it to the target object via a spring or point constraint.
    *   As the Director moves their mouse, the Kinematic body moves, dragging the physical object along with it. To VR users, the object appears to be lifted by an invisible, omniscient force.

---

## 3. Potential Challenges & Solutions

| Challenge | Impact | Proposed Solution |
| :--- | :--- | :--- |
| **Network Latency (Rubber-banding)** | VR users grabbing objects might feel a delay before the object moves, breaking immersion. | **Client-Side Prediction:** When a VR user grabs an object, their local client temporarily takes "ownership" and runs local physics for that specific object, sending state *to* the server until they let go. |
| **Server CPU Load** | Running physics for dozens of objects on the Node thread could slow down the socket server. | Use simplified collision meshes (primitives like boxes/spheres) on the server. Keep complex parametric geometry purely visual on the client. |
| **Director Z-Depth Sorting** | Dragging an object in 2D space makes it hard to determine how far away (Z-depth) it should be placed. | Provide the Director with a split view (Top-down Map + Orbital view) or bind dragged objects to a specific Y-plane (e.g., hovering exactly 1.5m off the ground) until dropped. |

---

## 4. Next Steps for Development
If we move forward with this architecture, the first technical step is:
1.  **Refactoring the Server:** Modify `server.ts` to include a server-side tick loop (`setInterval`).
2.  **Dependency Addition:** Run `npm install cannon-es` on both the client and server.
3.  **Prototyping a "Beachball":** Spawn a single, networked bouncing sphere in the center of the showroom to test latency and interpolation algorithms before building complex grab mechanics.
