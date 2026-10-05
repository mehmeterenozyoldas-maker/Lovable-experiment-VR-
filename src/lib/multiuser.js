import * as THREE from 'three';
import { io } from 'socket.io-client';

export class MultiUserManager {
    constructor(scene, mainReverb, Tone) {
        this.scene = scene;
        this.mainReverb = mainReverb;
        this.Tone = Tone;
        this.peers = new Map();
        this.socket = null;
        this.localStream = null;
        this.materials = {
            head: new THREE.MeshStandardMaterial({ color: 0x00ffaa, roughness: 0.4, metalness: 0.6, transparent: true, opacity: 0.8 }),
            visor: new THREE.MeshStandardMaterial({ color: 0x05080c, roughness: 0.1, metalness: 0.9 })
        };
    }

    async init(initialPosition, initialRotation) {
        // Request Microphone
        try {
            if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
                this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            }
        } catch (err) {
            console.warn("Microphone access denied or unavailable. Voice chat disabled.", err);
        }

        this.socket = io();

        this.socket.on("init", (id) => {
            console.log("Connected as", id);
        });

        this.socket.on("user-joined", (id) => {
            console.log("User joined", id);
            this.createPeer(id, true);
        });

        this.socket.on("user-left", (id) => {
            console.log("User left", id);
            this.removePeer(id);
            if (this.onPeerLeft) this.onPeerLeft(id);
        });

        this.socket.on("spatial-state", (data) => {
            if (this.onSpatialState) this.onSpatialState(data);
        });

        this.socket.on("current-users", (userIds) => {
            console.log("Current users", userIds);
            userIds.forEach(id => this.createPeer(id, false));
        });

        this.socket.on("signal", async (data) => {
            const peer = this.peers.get(data.caller);
            if (!peer) return;
            
            if (data.signal.type === "offer") {
                await peer.pc.setRemoteDescription(new RTCSessionDescription(data.signal));
                const answer = await peer.pc.createAnswer();
                await peer.pc.setLocalDescription(answer);
                this.socket.emit("signal", { target: data.caller, signal: peer.pc.localDescription });
            } else if (data.signal.type === "answer") {
                await peer.pc.setRemoteDescription(new RTCSessionDescription(data.signal));
            } else if (data.signal.candidate) {
                try {
                    await peer.pc.addIceCandidate(new RTCIceCandidate(data.signal));
                } catch(e) {
                    console.error("Error adding ice candidate", e);
                }
            }
        });

        this.socket.on("user-moved", (data) => {
            const p = this.peers.get(data.id);
            if (p && p.model) {
                // Support both unpacked legacy data and compressed packed arrays
                if (data.p) {
                    this.unpackVec3(data.p, p.targetPosition);
                } else if (data.position) {
                    p.targetPosition.copy(data.position);
                }

                if (data.h) {
                    this.unpackQuatArrayToEuler(data.h, p.targetRotation);
                } else if (data.r) {
                    this.unpackQuatArrayToEuler(data.r, p.targetRotation);
                } else if (data.headPose) {
                    p.targetRotation.set(data.headPose.x, data.headPose.y, data.headPose.z, 'YXZ');
                } else if (data.rotation) {
                    p.targetRotation.set(data.rotation.x, data.rotation.y, 0, 'YXZ');
                }

                if (data.lp) {
                    this.unpackVec3(data.lp, p.leftHandTargetPosition);
                    this.unpackQuatArrayToEuler(data.lr, p.leftHandTargetRotation);
                } else if (data.leftHandPose) {
                    p.leftHandTargetPosition.copy(data.leftHandPose.position);
                    p.leftHandTargetRotation.set(data.leftHandPose.rotation.x, data.leftHandPose.rotation.y, data.leftHandPose.rotation.z, 'XYZ');
                } else {
                    // default to resting
                    if (!this._tempLHOffset) this._tempLHOffset = new THREE.Vector3(-0.25, 1.2, 0);
                    p.leftHandTargetPosition.copy(p.targetPosition).add(this._tempLHOffset);
                }

                if (data.rp) {
                    this.unpackVec3(data.rp, p.rightHandTargetPosition);
                    this.unpackQuatArrayToEuler(data.rr, p.rightHandTargetRotation);
                } else if (data.rightHandPose) {
                    p.rightHandTargetPosition.copy(data.rightHandPose.position);
                    p.rightHandTargetRotation.set(data.rightHandPose.rotation.x, data.rightHandPose.rotation.y, data.rightHandPose.rotation.z, 'XYZ');
                } else {
                    // default to resting
                    if (!this._tempRHOffset) this._tempRHOffset = new THREE.Vector3(0.25, 1.2, 0);
                    p.rightHandTargetPosition.copy(p.targetPosition).add(this._tempRHOffset);
                }
            }
        });

        this.socket.on("remote-interact", (data) => {
            if (this.onRemoteInteract) this.onRemoteInteract(data);
        });

        this.physicsObjects = new Map();

        this.socket.on("physics-sync", (stateArray) => {
            stateArray.forEach(obj => {
                let mesh = this.physicsObjects.get(obj.id);
                if (!mesh) {
                    if (obj.id === 'beachball') {
                        const geo = new THREE.SphereGeometry(0.2, 32, 32);
                        const mat = new THREE.MeshStandardMaterial({ color: 0xff0055, roughness: 0.2, metalness: 0.1 });
                        mesh = new THREE.Mesh(geo, mat);
                        mesh.castShadow = true;
                        mesh.receiveShadow = true;
                        this.scene.add(mesh);
                        this.physicsObjects.set(obj.id, mesh);
                    }
                }
                
                if (mesh) {
                    if (!mesh.userData.targetPosition) {
                        mesh.userData.targetPosition = new THREE.Vector3();
                        mesh.userData.targetQuaternion = new THREE.Quaternion();
                    }
                    mesh.userData.targetPosition.set(obj.position.x, obj.position.y, obj.position.z);
                    mesh.userData.targetQuaternion.set(obj.quaternion.x, obj.quaternion.y, obj.quaternion.z, obj.quaternion.w);
                }
            });
        });
        
        // Push our initial state safely
        this.updatePosition(initialPosition, initialRotation, {x:0, y:0, z:0});
    }

    createPeer(id, isInitiator) {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
        });

        const peerObj = {
            id,
            pc,
            model: this.createAvatarModel(),
            targetPosition: new THREE.Vector3(),
            targetRotation: new THREE.Euler(),
            leftHandTargetPosition: new THREE.Vector3(),
            leftHandTargetRotation: new THREE.Euler(),
            rightHandTargetPosition: new THREE.Vector3(),
            rightHandTargetRotation: new THREE.Euler(),
            panner: null,
            audioEl: null
        };
        this.peers.set(id, peerObj);

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => pc.addTrack(track, this.localStream));
        }

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit("signal", { target: id, signal: event.candidate });
            }
        };

        pc.ontrack = (event) => {
            if (peerObj.audioEl) return; // already set
            
            // We need a dummy audio element to ensure the stream flows
            const audioEl = new Audio();
            audioEl.srcObject = event.streams[0];
            audioEl.autoplay = true;
            audioEl.muted = true; // Output handled by Tone
            peerObj.audioEl = audioEl;

            // Route audio to Tone.js
            try {
                const source = this.Tone.context.rawContext.createMediaStreamSource(event.streams[0]);
                const toneSource = new this.Tone.Gain(4.0); // Boost volume
                this.Tone.connect(source, toneSource._gainNode);
                
                peerObj.panner = new this.Tone.Panner3D({
                    panningModel: "HRTF", distanceModel: "exponential",
                    refDistance: 1, maxDistance: 20, rolloffFactor: 1.5
                }).connect(this.mainReverb);
                toneSource.connect(peerObj.panner);
                
                peerObj.meter = new this.Tone.Meter();
                toneSource.connect(peerObj.meter);
            } catch(e) {
                console.error("Failed to connect remote voice stream to Tone", e);
            }
        };

        if (isInitiator) {
            pc.createOffer().then(offer => {
                return pc.setLocalDescription(offer);
            }).then(() => {
                this.socket.emit("signal", { target: id, signal: pc.localDescription });
            });
        }
    }

    createAvatarModel() {
        const group = new THREE.Group();
        
        const headMat = this.materials.head.clone();
        const visorMat = this.materials.visor.clone();
        
        // Head
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.25), headMat);
        group.userData.headMesh = head;
        group.add(head);
        
        // Visor
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.08, 0.26), visorMat);
        visor.position.set(0, 0.03, 0.03);
        group.userData.visorMesh = visor;
        group.add(visor);
        
        // Voice ripple scale
        const voiceRipple = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 32, 32),
            new THREE.MeshBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 0, wireframe: true })
        );
        group.userData.rippleMesh = voiceRipple;
        group.add(voiceRipple);

        // Core / body suggestion
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), headMat);
        core.position.set(0, -0.25, 0);
        core.scale.set(1, 1.5, 1);
        head.add(core);

        // Hands
        const handGeo = new THREE.BoxGeometry(0.05, 0.05, 0.1);
        const lHand = new THREE.Mesh(handGeo, headMat);
        const rHand = new THREE.Mesh(handGeo, headMat);
        
        group.userData.lHand = lHand;
        group.userData.rHand = rHand;

        // Procedural IK Limbs (Height of Cylinder is 1.0; we scale dynamically in loop)
        const armGeo = new THREE.CylinderGeometry(0.012, 0.012, 1.0, 5);
        const lUpperArm = new THREE.Mesh(armGeo, headMat);
        const lForearm = new THREE.Mesh(armGeo, headMat);
        const rUpperArm = new THREE.Mesh(armGeo, headMat);
        const rForearm = new THREE.Mesh(armGeo, headMat);

        group.userData.lUpperArm = lUpperArm;
        group.userData.lForearm = lForearm;
        group.userData.rUpperArm = rUpperArm;
        group.userData.rForearm = rForearm;

        // Add hands and arms directly to the scene instead of group
        // so their positions aren't relative to the head
        this.scene.add(lHand);
        this.scene.add(rHand);
        this.scene.add(lUpperArm);
        this.scene.add(lForearm);
        this.scene.add(rUpperArm);
        this.scene.add(rForearm);
        
        this.scene.add(group);
        return group;
    }

    removePeer(id) {
        const peer = this.peers.get(id);
        if (peer) {
            if (peer.model) {
                if (peer.model.userData.lHand) this.scene.remove(peer.model.userData.lHand);
                if (peer.model.userData.rHand) this.scene.remove(peer.model.userData.rHand);
                if (peer.model.userData.lUpperArm) this.scene.remove(peer.model.userData.lUpperArm);
                if (peer.model.userData.lForearm) this.scene.remove(peer.model.userData.lForearm);
                if (peer.model.userData.rUpperArm) this.scene.remove(peer.model.userData.rUpperArm);
                if (peer.model.userData.rForearm) this.scene.remove(peer.model.userData.rForearm);
                this.scene.remove(peer.model);
            }
            if (peer.pc) peer.pc.close();
            if (peer.panner) peer.panner.dispose();
            if (peer.audioEl) {
                peer.audioEl.srcObject = null;
                peer.audioEl.remove();
            }
            this.peers.delete(id);
        }
    }

    packVec3(v) {
        if (!v) return null;
        return [parseFloat(v.x.toFixed(3)), parseFloat(v.y.toFixed(3)), parseFloat(v.z.toFixed(3))];
    }
    
    packEulerToQuatArray(e) {
        if (!e) return null;
        if (!this._tempPackQuat) {
            this._tempPackQuat = new THREE.Quaternion();
            this._tempPackEuler = new THREE.Euler();
        }
        
        if (e.isEuler) {
            this._tempPackQuat.setFromEuler(e);
        } else {
            this._tempPackEuler.set(e.x, e.y, e.z, e.order || 'XYZ');
            this._tempPackQuat.setFromEuler(this._tempPackEuler);
        }
        return [parseFloat(this._tempPackQuat.x.toFixed(3)), parseFloat(this._tempPackQuat.y.toFixed(3)), parseFloat(this._tempPackQuat.z.toFixed(3)), parseFloat(this._tempPackQuat.w.toFixed(3))];
    }

    unpackVec3(arr, target) {
        if (arr && arr.length >= 3) target.set(arr[0], arr[1], arr[2]);
    }
    
    unpackQuatArrayToEuler(arr, targetEuler) {
        if (arr && arr.length >= 4) {
            if (!this._tempUnpackQuat) this._tempUnpackQuat = new THREE.Quaternion();
            this._tempUnpackQuat.set(arr[0], arr[1], arr[2], arr[3]);
            targetEuler.setFromQuaternion(this._tempUnpackQuat, 'YXZ');
        }
    }

    updatePosition(pos, rot, headRot, leftHandPose, rightHandPose) {
        if (!this.socket) return;
        this.socket.emit("move", { 
            p: this.packVec3(pos), 
            r: this.packEulerToQuatArray(rot), 
            h: this.packEulerToQuatArray(headRot),
            lp: leftHandPose ? this.packVec3(leftHandPose.position) : null,
            lr: leftHandPose ? this.packEulerToQuatArray(leftHandPose.rotation) : null,
            rp: rightHandPose ? this.packVec3(rightHandPose.position) : null,
            rr: rightHandPose ? this.packEulerToQuatArray(rightHandPose.rotation) : null
        });
    }

    emitInteraction(data) {
        if (!this.socket) return;
        this.socket.emit("interact", data);
    }

    alignMeshToSegment(mesh, pA, pB) {
        if (!this._tempCenter) {
            this._tempCenter = new THREE.Vector3();
            this._tempDir = new THREE.Vector3();
            this._tempAlignQuat = new THREE.Quaternion();
            this._upVec = new THREE.Vector3(0, 1, 0);
        }
        
        // Center point of the segment
        this._tempCenter.addVectors(pA, pB).multiplyScalar(0.5);
        mesh.position.copy(this._tempCenter);

        // Direction vector
        this._tempDir.subVectors(pB, pA);
        const length = this._tempDir.length();
        
        // Scale mesh to match segment length (assuming original height is 1.0 along Y)
        mesh.scale.set(1, length, 1);

        this._tempDir.normalize();
        
        // Cylinder default direction is Y axis (0, 1, 0)
        this._tempAlignQuat.setFromUnitVectors(this._upVec, this._tempDir);
        mesh.quaternion.copy(this._tempAlignQuat);
    }

    solveIK(shoulderPos, handPos, isLeft, headQuat, upperArmMesh, forearmMesh) {
        const L1 = 0.35;
        const L2 = 0.35;

        if (!this._tempSH) {
            this._tempSH = new THREE.Vector3();
            this._tempD = new THREE.Vector3();
            this._tempP = new THREE.Vector3();
            this._tempRef = new THREE.Vector3();
            this._tempE = new THREE.Vector3();
        }

        // Vector from Shoulder to Hand
        const S = shoulderPos;
        const H = handPos;
        this._tempSH.subVectors(H, S);
        const d = this._tempSH.length();

        // Clamp distance to avoid degenerate triangle (cannot exceed L1 + L2, and cannot be too close to 0)
        const minD = 0.05;
        const maxD = L1 + L2 - 0.01;
        const clampedD = Math.max(minD, Math.min(maxD, d));

        // Direction from S to H
        this._tempD.copy(this._tempSH).normalize();

        // Angle alpha at shoulder using Law of Cosines
        // cos(alpha) = (L1^2 + d^2 - L2^2) / (2 * L1 * d)
        const cosAlpha = (L1 * L1 + clampedD * clampedD - L2 * L2) / (2 * L1 * clampedD);
        const alpha = Math.acos(Math.max(-1, Math.min(1, cosAlpha)));

        const x = L1 * cosAlpha;
        const y = L1 * Math.sin(alpha);

        // Calculate bending direction P
        this._tempRef.set(isLeft ? -0.4 : 0.4, -0.6, -0.2);
        this._tempRef.applyQuaternion(headQuat).normalize();

        // P is orthogonal to D and lies in the plane of D and refDir
        this._tempP.crossVectors(this._tempRef, this._tempD).normalize();
        this._tempP.crossVectors(this._tempD, this._tempP).normalize(); // project refDir onto orthogonal plane

        // If P is degenerate, fallback to a world down vector
        if (this._tempP.lengthSq() < 0.01) {
            this._tempRef.set(0, -1, 0).applyQuaternion(headQuat).normalize();
            this._tempP.crossVectors(this._tempRef, this._tempD).normalize();
            this._tempP.crossVectors(this._tempD, this._tempP).normalize();
        }

        // Elbow position E
        this._tempE.copy(S)
            .addScaledVector(this._tempD, x)
            .addScaledVector(this._tempP, y);

        // Align Upper Arm and Forearm meshes
        this.alignMeshToSegment(upperArmMesh, S, this._tempE);
        this.alignMeshToSegment(forearmMesh, this._tempE, H);
    }

    update(timeSec) {
        if (!this._tempQuat) {
            this._tempQuat = new THREE.Quaternion();
            this._tempVec3 = new THREE.Vector3(0.5, 0.5, 0.5);
        }
        this.peers.forEach(peer => {
            if (peer.model) {
                peer.model.position.lerp(peer.targetPosition, 0.1);
                
                // slerp rotation
                this._tempQuat.setFromEuler(peer.targetRotation);
                peer.model.quaternion.slerp(this._tempQuat, 0.1);
                
                // Update hands
                if (peer.model.userData.lHand && peer.leftHandTargetPosition) {
                    peer.model.userData.lHand.position.lerp(peer.leftHandTargetPosition, 0.2);
                    this._tempQuat.setFromEuler(peer.leftHandTargetRotation);
                    peer.model.userData.lHand.quaternion.slerp(this._tempQuat, 0.2);
                }
                
                if (peer.model.userData.rHand && peer.rightHandTargetPosition) {
                    peer.model.userData.rHand.position.lerp(peer.rightHandTargetPosition, 0.2);
                    this._tempQuat.setFromEuler(peer.rightHandTargetRotation);
                    peer.model.userData.rHand.quaternion.slerp(this._tempQuat, 0.2);
                }

                // Update procedural IK arms
                if (peer.model.userData.lUpperArm && peer.model.userData.lForearm && peer.model.userData.lHand) {
                    const headPos = peer.model.position;
                    const headQuat = peer.model.quaternion;
                    
                    if (!peer._shoulderL) {
                        peer._shoulderL = new THREE.Vector3();
                        peer._shoulderR = new THREE.Vector3();
                    }
                    
                    peer._shoulderL.set(-0.15, -0.25, 0).applyQuaternion(headQuat).add(headPos);
                    peer._shoulderR.set(0.15, -0.25, 0).applyQuaternion(headQuat).add(headPos);
                    
                    this.solveIK(peer._shoulderL, peer.model.userData.lHand.position, true, headQuat, peer.model.userData.lUpperArm, peer.model.userData.lForearm);
                    this.solveIK(peer._shoulderR, peer.model.userData.rHand.position, false, headQuat, peer.model.userData.rUpperArm, peer.model.userData.rForearm);
                }

                if (peer.panner) {
                    peer.panner.positionX.rampTo(peer.model.position.x, 0.1);
                    peer.panner.positionY.rampTo(peer.model.position.y, 0.1);
                    peer.panner.positionZ.rampTo(peer.model.position.z, 0.1);
                }
                
                if (peer.meter) {
                    const level = this.Tone.dbToGain(peer.meter.getValue());
                    const vol = Math.min(1.0, level * 5.0); // Boosted level for visuals
                    
                    if (peer.model.userData.rippleMesh) {
                        const ripple = peer.model.userData.rippleMesh;
                        if (vol > 0.05) {
                            ripple.scale.setScalar(1.0 + vol * 1.5);
                            ripple.material.opacity = vol * 0.4;
                            ripple.material.color.setHSL(0.4 - vol * 0.2, 1, 0.5); // shift 0x00ffaa towards blue when loud
                            peer.model.userData.visorMesh.material.emissiveIntensity = vol * 2.0;
                            peer.model.userData.visorMesh.material.emissive.setHex(0x00ffaa);
                        } else {
                            ripple.scale.lerp(this._tempVec3, 0.1);
                            ripple.material.opacity *= 0.8;
                            peer.model.userData.visorMesh.material.emissiveIntensity *= 0.9;
                        }
                    }
                }
            }
        });

        if (this.physicsObjects) {
            this.physicsObjects.forEach(mesh => {
                if (mesh.userData.targetPosition) {
                    mesh.position.lerp(mesh.userData.targetPosition, 0.3);
                    mesh.quaternion.slerp(mesh.userData.targetQuaternion, 0.3);
                }
            });
        }
    }

    dispose() {
        if (this.socket) {
            try {
                this.socket.disconnect();
            } catch (e) {}
            this.socket = null;
        }
        if (this.localStream) {
            try {
                this.localStream.getTracks().forEach(track => track.stop());
            } catch (e) {}
            this.localStream = null;
        }
        if (this.peers) {
            for (const [id, peer] of this.peers.entries()) {
                if (peer.pc) {
                    try { peer.pc.close(); } catch (e) {}
                }
                if (peer.model && peer.model.parent) {
                    peer.model.parent.remove(peer.model);
                }
            }
            this.peers.clear();
        }
        if (this.physicsObjects) {
            for (const [id, mesh] of this.physicsObjects.entries()) {
                if (mesh.parent) mesh.parent.remove(mesh);
            }
            this.physicsObjects.clear();
        }
    }
}
