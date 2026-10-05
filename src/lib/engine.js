import * as THREE from 'three';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';
import * as Tone from 'tone';
import { Text } from 'troika-three-text';
import { MultiUserManager } from './multiuser.js';

export function createXREngine(containerNode, onLoaded) {
    // --- GLOBAL STATE ---
    let scene, camera, renderer, cameraGroup;
    let controllers = [];
    let hands = [];
    let raycaster;
    const interactablePanels = [];
    const diegeticButtons = [];
    const exhibits = [];
    const visualizerBars = []; // Holds references to physical 3D audio bars
    let wristMenu, rightWristMenu, hudMenu;
    let parametricConsole;
    let parametricState = {
        waveAmplitude: 0.3,
        waveFrequency: 0.18,
        archCompression: 2.2,
        slatSpacing: 0.35,
        oculusRadius: 5.5,
        
        // Wall
        wallFreq: 0.18,
        wallAmp: 0.2,
        wallHeightMod: 1.5,
        
        // Bench
        benchDensity: 1.0,
        benchDepth: 1.0,
        benchWave: 1.0,
        
        // Stand
        standTwist: Math.PI / 4,
        standHeight: 1.3,
        standRadius: 0.3,
        standSlatPairs: 14
    };
    let rebuildCeilingFunc = null;
    let rebuildWallFunc = null;
    let rebuildBenchFunc = null;
    let rebuildPedestalFunc = null;
    let lastParametricRebuildTime = 0;
    let maxTeleportDistance = Number(localStorage.getItem('NavigatorMaxTeleportDistance')) || 10.0;
    let isComfortBlinkEnabled = localStorage.getItem('NavigatorComfortBlink') !== 'false';
    let isSmoothTurnEnabled = localStorage.getItem('NavigatorSmoothTurn') === 'true';
    let arcVelocityScale = Number(localStorage.getItem('NavigatorArcScale')) || 12.0;
    let baseCameraHeightOffset = Number(localStorage.getItem('NavigatorHeightOffset')) || 0.0;
    
    // Spatial Memory
    let isDrawModeEnabled = false;
    let localRibbons = []; // Finished ribbons
    let allRibbonMeshes = []; // All finished meshes in the scene
    let activeDrawings = new Map(); // controller -> current drawing data
    let remoteDrawings = new Map(); // socketId -> current drawing data
    
    // Lighting & Environment
    let bigWallMaterial, myceliumMat, waterMat;
    let ledScreenMaterial, ledScreenMesh, ledScreenGlowLight;
    let ambientLight, topLight, dirLight;
    let waterNormalMap;
    let concreteTex, woodTex, myceliumTex;
    let globalFocusMode = false;
    let currentActiveAnalyser = null; 
    let teleportMarker;
    let vrButton = null;
    let galleryTheme = localStorage.getItem('ScandinavianGalleryTheme') || 'morning';

    // Pre-allocated static objects for memory optimization (zero GC allocation inside anim loop)
    const _tempColorAmb = new THREE.Color();
    const _tempColorTop = new THREE.Color();
    const _tempColorDir = new THREE.Color();
    const _tempColorFog = new THREE.Color();
    
    const _tempTarget = new THREE.Vector3();
    const _tempPPos = new THREE.Vector3();
    const _tempDir = new THREE.Vector3();
    const _tempUp = new THREE.Vector3(0, 1, 0);
    const _tempSwirl = new THREE.Vector3();
    
    const _cachedHeadPos = new THREE.Vector3();
    const _cachedTipPos = new THREE.Vector3();
    const _cachedLeftPos = new THREE.Vector3();
    const _cachedRightPos = new THREE.Vector3();
    const _cachedIndexPos = new THREE.Vector3();
    const _cachedThumbPos = new THREE.Vector3();
    const _cachedActiveColor = new THREE.Color();
    const _cachedWaterColNight = new THREE.Color(0x050510);
    const _cachedWaterColDay = new THREE.Color(0x05080c);
    const _mycColNight = new THREE.Color(0x3366ff);
    const _mycColDay = new THREE.Color(0xffaaaa);
    const _cachedCurrentRot = new THREE.Quaternion();
    const _cachedPrevRot = new THREE.Quaternion();
    const _cachedDeltaQuat = new THREE.Quaternion();
    const _cachedWrPos = new THREE.Vector3();
    const _cachedMidPos = new THREE.Vector3();
    const _cachedHandDir = new THREE.Vector3();
    const _cachedExPos = new THREE.Vector3();
    
    // Additional zero-allocation loop variables
    const _tempVec3_1 = new THREE.Vector3();
    const _tempVec3_2 = new THREE.Vector3();
    const _tempVec3_3 = new THREE.Vector3();
    const _tempMat4 = new THREE.Matrix4();
    const _tempQuat = new THREE.Quaternion();
    const _tempQuat2 = new THREE.Quaternion();
    const _tempQuat3 = new THREE.Quaternion();
    const _tempVec2 = new THREE.Vector2();
    const _tempRay = new THREE.Ray();
    const _tempRayOrigins = [new THREE.Ray(), new THREE.Ray(), new THREE.Ray()];
    let _activeRayOriginsCount = 0;

    // Visual Effects
    let particleSystem;
    const PARTICLE_COUNT = 1500; 

    // Audio System (SoundExplorer specific)
    let audioListener;
    let mainReverb;
    let oculusZone, myceliumZone;
    const audioNodes = []; 
    let multiuser;

    // Desktop Controls & State
    let isDragging = false, isPointerDown = false;
    let previousMousePosition = { x: 0, y: 0 };
    let targetCameraRotation = { x: 0, y: 0 }, currentCameraRotation = { x: 0, y: 0 };
    const mouse = new THREE.Vector2(0, 0); 

    // Interaction State & Physics Momentum
    let hoveredUIElement = null; 
    let draggedArtifact = null; 
    let activeSlider = null; 
    let isDirectorMode = false;
    const tossVelocity = new THREE.Vector2(0, 0);
    let grabbedPhysicsObject = null; // { id, controller, distance }
    const _dragPlane = new THREE.Plane();

    // Gaze Dwell Selection Parameters
    let lastHoveredItem = null;
    let dwellStartTime = 0;
    const DWELL_DURATION = 1200; // 1.2 seconds to auto-click
    
    // External listeners referencing
    let windowResizeListener, windowMouseDownListener, windowMouseMoveListener, windowMouseUpListener, windowClickListener;

    // Loading Manager with robust fallbacks to bypass blocking network states
    let hasLoaded = false;
    let isDisposed = false;
    let loadFallbackTimer = null;
    let initLoadTimer = null;
    let voiceRestartTimeout = null;
    let voiceRecognition = null;
    let shouldRunVoice = false;

    const triggerLoaded = () => {
        if (!isDisposed && !hasLoaded) {
            hasLoaded = true;
            if (onLoaded) onLoaded();
        }
    };

    const manager = new THREE.LoadingManager();
    manager.onProgress = (url, itemsLoaded, itemsTotal) => {};
    manager.onLoad = function () {
        triggerLoaded();
    };
    manager.onError = function (url) {
        console.warn("Asset load failed or bypassed gracefully. URL:", url);
        triggerLoaded();
    };
    
    // Guarantee loading screen resolves within 2500ms under any network conditions
    loadFallbackTimer = setTimeout(triggerLoaded, 2500);
    
    const gltfLoader = new GLTFLoader(manager);

    init();
    
    function init() {
        
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xdddddd);
        scene.fog = new THREE.FogExp2(0xdddddd, 0.025);

        cameraGroup = new THREE.Group();
        cameraGroup.position.set(0, 1.6, 0); 
        scene.add(cameraGroup);

        camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
        cameraGroup.add(camera);

        renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.xr.enabled = true;
        renderer.xr.setFramebufferScaleFactor(1.0); 
        renderer.xr.setFoveation(1.0); // Maximum Fixed Foveated Rendering for VR performance
        renderer.xr.setReferenceSpaceType('local-floor');
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2; 

        renderer.xr.addEventListener('sessionstart', () => {
            // Quest/Mobile VR headsets compute eye height relative to floor.
            // When in VR, the headset adds eye height, so clear cameraGroup height offset to prevent floating at 3.2m
            cameraGroup.position.y = 0;
            // Balanced exposure in VR matching the fine-tuned desktop display
            renderer.toneMappingExposure = 1.15;

            // Move audioListener to the active XR camera for accurate spatial audio tracking in VR
            const xrCamera = renderer.xr.getCamera();
            if (audioListener) {
                camera.remove(audioListener);
                xrCamera.add(audioListener);
            }

            // Move HUD menu to the active XR camera in VR for proper tracking
            if (hudMenu) {
                camera.remove(hudMenu);
                xrCamera.add(hudMenu);
            }

            // High compatibility AudioContext activation for Meta Quest browsers
            if (Tone && Tone.context && Tone.context.rawContext) {
                Tone.context.rawContext.resume().then(() => {
                    console.log("AudioContext successfully resumed on WebXR sessionstart.");
                }).catch(err => {
                    console.warn("Failed to resume AudioContext dynamically on sessionstart:", err);
                });
            }

            scene.traverse(child => {
                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach(m => m.needsUpdate = true);
                    else child.material.needsUpdate = true;
                }
            });
        });

        renderer.xr.addEventListener('sessionend', () => {
            // Restore desktop floor offset eye level
            cameraGroup.position.y = 1.6;
            // Restore desktop exposure
            renderer.toneMappingExposure = 1.2;

            // Restore audioListener to main desktop camera
            if (audioListener) {
                const xrCamera = renderer.xr.getCamera();
                xrCamera.remove(audioListener);
                camera.add(audioListener);
            }

            // Restore HUD menu to the desktop camera
            if (hudMenu) {
                const xrCamera = renderer.xr.getCamera();
                xrCamera.remove(hudMenu);
                camera.add(hudMenu);
            }

            detachAllAttachedPanels();
            scene.traverse(child => {
                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach(m => m.needsUpdate = true);
                    else child.material.needsUpdate = true;
                }
            });
        });
        
        containerNode.appendChild(renderer.domElement);
        
        // Add VR Button to container rather than body to isolate
        vrButton = VRButton.createButton(renderer);
        
        // Critical: Unlock AudioContext aggressively on direct user click for Meta browsers
        vrButton.addEventListener('click', () => {
            if (Tone && Tone.context && Tone.context.rawContext) {
                Tone.context.rawContext.resume().then(() => {
                    console.log("AudioContext officially resumed directly from VRButton click!");
                }).catch(err => console.warn(err));
            }
        });

        vrButton.style.background = 'rgba(10, 12, 16, 0.8)';
        vrButton.style.border = '1px solid rgba(0, 255, 170, 0.3)';
        vrButton.style.color = '#00ffaa';
        vrButton.style.borderRadius = '8px';
        vrButton.style.padding = '14px 28px';
        vrButton.style.fontFamily = 'Inter, sans-serif';
        vrButton.style.fontWeight = '600';
        vrButton.style.letterSpacing = '1px';
        vrButton.style.backdropFilter = 'blur(10px)';
        vrButton.style.bottom = '40px';
        vrButton.style.zIndex = '999';
        
        containerNode.appendChild(vrButton);

        concreteTex = createConcreteTextures();
        woodTex = createWoodTextures();
        myceliumTex = createMyceliumTextures();

        setupLightingAndEnvironment();
        buildGallerySpace();
        initParticleSystem();
        buildMainSpatialTitle();
        buildGalleryControlPanel();

        // Setup Premium Teleport Marker Group
        teleportMarker = new THREE.Group();
        
        const outerRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.35, 0.012, 8, 48),
            new THREE.MeshBasicMaterial({ color: 0x00ffaa, transparent: true, opacity: 0.9 })
        );
        outerRing.rotation.x = -Math.PI / 2;
        outerRing.name = "outerRing";
        teleportMarker.add(outerRing);

        const innerRing = new THREE.Mesh(
            new THREE.TorusGeometry(0.18, 0.008, 8, 36),
            new THREE.MeshBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.7 })
        );
        innerRing.rotation.x = -Math.PI / 2;
        innerRing.name = "innerRing";
        teleportMarker.add(innerRing);

        const centerDot = new THREE.Mesh(
            new THREE.RingGeometry(0.0, 0.05, 16),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1.0, side: THREE.DoubleSide })
        );
        centerDot.rotation.x = -Math.PI / 2;
        teleportMarker.add(centerDot);

        // Volumetric glowing beacon cylinder rising from teleport point
        const beaconGeo = new THREE.CylinderGeometry(0.3, 0.35, 1.2, 16, 1, true);
        const beaconMat = new THREE.MeshBasicMaterial({
            color: 0x00ffaa,
            transparent: true,
            opacity: 0.15,
            side: THREE.DoubleSide,
            depthWrite: false
        });
        const beacon = new THREE.Mesh(beaconGeo, beaconMat);
        beacon.position.y = 0.6;
        beacon.name = "beacon";
        teleportMarker.add(beacon);

        teleportMarker.position.y = 0.02; // Slightly above floor
        teleportMarker.visible = false;
        scene.add(teleportMarker);

        // Load Exhibits
        buildExhibit(
            createOrreryArtifact(),
            "Celestial Orrery",
            "Spatial Arpeggiator. Tone.js FM synthesis tracking coordinates.",
            new THREE.Vector3(-3.4, 0, -2.5), Math.PI / 6.5, "orrery"
        );

        buildExhibit(
            createGenerativeSwarm(),
            "Generative Swarm",
            "Swarm Intelligence. Formations morph dynamically based on amplitude and frequency.",
            new THREE.Vector3(0, 0, -4.2), 0, "swarm"
        );

        buildExhibit(
            createProceduralRelic(),
            "Sentient Core",
            "Psycho-acoustic displacement lattice. Shaders react directly to audio FFT inputs.",
            new THREE.Vector3(3.4, 0, -2.5), -Math.PI / 6.5, "relic"
        );

        raycaster = new THREE.Raycaster();
        setupXRControllers();
        setupDesktopControls();
        setupVoiceCommands();
        
        windowResizeListener = onWindowResize;
        window.addEventListener('resize', windowResizeListener);
        
        // Scene generation is procedural; trigger loaded immediately after initialization
        triggerLoaded();

        
        // --- STEP 4: TELEPORT COMFORT GRID ---
        const teleportGrid = new THREE.GridHelper(20, 20, 0x00aaff, 0x00aaff);
        teleportGrid.position.y = 0.01;
        teleportGrid.material.opacity = 0.0;
        teleportGrid.material.transparent = true;
        scene.add(teleportGrid);
        
        // Shadow Gap Baseboard (Horizon Anchor)
        const baseboardGeo = new THREE.BoxGeometry(60, 0.15, 60);
        const baseboardMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
        const baseboard = new THREE.Mesh(baseboardGeo, baseboardMat);
        baseboard.position.y = 0.075;
        // cut out the inside so it's just the perimeter
        // Actually, easiest way is just 4 thin boxes around the perimeter
        const b1 = new THREE.Mesh(new THREE.BoxGeometry(60, 0.15, 0.2), baseboardMat); b1.position.set(0, 0.075, -30);
        const b2 = new THREE.Mesh(new THREE.BoxGeometry(60, 0.15, 0.2), baseboardMat); b2.position.set(0, 0.075, 30);
        const b3 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 60), baseboardMat); b3.position.set(-30, 0.075, 0);
        const b4 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 60), baseboardMat); b4.position.set(30, 0.075, 0);
        scene.add(b1, b2, b3, b4);
        // -------------------------------------

        
renderer.setAnimationLoop(render);
    }

    function initAudioSystem() {
        if (mainReverb) return; // Prevent double init
        
        if (THREE.AudioContext) {
            THREE.AudioContext.setContext(Tone.context.rawContext);
        }
        audioListener = new THREE.AudioListener();
        camera.add(audioListener);
        audioListener.gain.disconnect(); // We handle routing, disable master output
        
        mainReverb = new Tone.Gain(1).toDestination();
        oculusZone = new Tone.Freeverb({ roomSize: 0.9, dampening: 2000, wet: 1.0 });
        oculusZone.connect(mainReverb);
        
        myceliumZone = new Tone.Freeverb({ roomSize: 0.4, dampening: 4000, wet: 1.0 });
        const myceliumFilter = new Tone.Filter({ type: "lowpass", frequency: 1200 }).connect(myceliumZone);
        myceliumZone.connect(mainReverb);

        try {
            const rawListener = Tone.getContext?.()?.rawContext?.listener;
            if (rawListener) {
                if (rawListener.upX && rawListener.upX.setValueAtTime) {
                    rawListener.upX.setValueAtTime(0, 0);
                    rawListener.upY.setValueAtTime(1, 0);
                    rawListener.upZ.setValueAtTime(0, 0);
                } else if (rawListener.setOrientation) {
                    rawListener.setOrientation(0, 0, -1, 0, 1, 0);
                }
            }
        } catch (e) {}
        
        multiuser = new MultiUserManager(scene, mainReverb, Tone);
        const startPos = cameraGroup ? cameraGroup.position.clone() : new THREE.Vector3();
        const startRot = cameraGroup ? cameraGroup.rotation.clone() : new THREE.Euler();
        multiuser.init(startPos, startRot).then(() => {
            multiuser.onSpatialState = (data) => {
                if (data && data.ribbons) {
                    clearClientDrawings();
                    data.ribbons.forEach(ribbon => {
                        createRibbonMesh(ribbon.points, ribbon.color);
                    });
                }
            };

            multiuser.onPeerLeft = (id) => {
                if (remoteDrawings.has(id)) {
                    const drawing = remoteDrawings.get(id);
                    scene.remove(drawing.mesh);
                    if (drawing.mesh.geometry) drawing.mesh.geometry.dispose();
                    if (drawing.mesh.material) drawing.mesh.material.dispose();
                    remoteDrawings.delete(id);
                }
            };

            multiuser.onRemoteInteract = (data) => {
                if (data.type === 'summon') {
                    if (!cameraGroup || !camera) return;
                    const targetPos = new THREE.Vector3(data.pos.x, data.pos.y, data.pos.z);
                    const originalExposure = renderer.toneMappingExposure;
                    if (isComfortBlinkEnabled) renderer.toneMappingExposure = 0.01;
                    
                    _tempVec3_1.setFromMatrixPosition(camera.matrixWorld);
                    const shiftX = targetPos.x - _tempVec3_1.x;
                    const shiftZ = targetPos.z - _tempVec3_1.z;
                    cameraGroup.position.x += shiftX;
                    cameraGroup.position.z += shiftZ;
                    cameraGroup.position.y = targetPos.y + baseCameraHeightOffset;
                    if (!renderer.xr.isPresenting) cameraGroup.position.y += 1.6;
                    
                    if (isComfortBlinkEnabled) {
                        setTimeout(() => { renderer.toneMappingExposure = originalExposure; }, 85);
                    }
                } else if (data.type === 'theme') {
                    galleryTheme = data.theme;
                    localStorage.setItem('ScandinavianGalleryTheme', galleryTheme);
                } else if (data.type === 'toggle') {
                    const artifact = exhibits.find(ex => ex.userData.parentExhibit && ex.userData.parentExhibit.id === data.exhibitGroupId);
                    if (artifact) artifact.userData.isRotating = !artifact.userData.isRotating;
                } else if (data.type === 'slider') {
                    const artifact = exhibits.find(ex => ex.userData.parentExhibit && ex.userData.parentExhibit.id === data.exhibitGroupId);
                    if (artifact) {
                        const panel = interactablePanels.find(p => p.userData.artifact === artifact);
                        if (panel) {
                            const item = panel.userData.interactables.find(i => i.id === data.sliderId);
                            if (item) {
                                // Simulate click to reuse updateSliderValue natively locally but without emit recursion
                                const originalEmit = multiuser.emitInteraction;
                                multiuser.emitInteraction = null; // disable briefly to avoid echo
                                updateSliderValue({ item, panel }, item.x + data.value * item.w, item.y + (1.0 - data.value) * item.h);
                                multiuser.emitInteraction = originalEmit;
                            }
                        }
                    }
                } else if (data.type === 'inspect') {
                    const artifact = exhibits.find(ex => ex.userData.parentExhibit && ex.userData.parentExhibit.id === data.exhibitGroupId);
                    if (artifact && !artifact.userData.isInspected) {
                        exhibits.forEach(ex => { if(ex.userData.isInspected && ex !== artifact) resetArtifact(ex); });
                        artifact.userData.targetPosition.set(-0.6, 1.2, 1.5); 
                        artifact.userData.targetScale = new THREE.Vector3(1.5, 1.5, 1.5);
                        artifact.userData.isInspected = true; 
                        artifact.userData.parentExhibit.userData.pedestalRing.color.setHex(0xffaa00);
                        artifact.userData.parentExhibit.userData.pedestalRing.opacity = 0.8;
                        triggerParticleBurst(artifact.position, 1.5);
                        globalFocusMode = true; 
                        artifact.userData.spotLight.intensity = 5.0; 
                        if(artifact.userData.audioData) {
                            currentActiveAnalyser = artifact.userData.audioData.analyser;
                        }
                    }
                } else if (data.type === 'reset') {
                    const artifact = exhibits.find(ex => ex.userData.parentExhibit && ex.userData.parentExhibit.id === data.exhibitGroupId);
                    if (artifact && artifact.userData.isInspected) {
                        resetArtifact(artifact);
                    }
                } else if (data.type === 'draw-ribbon-update') {
                    const peerId = data.id;
                    const pts = data.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
                    if (pts.length < 2) {
                        pts.push(pts[0].clone().add(new THREE.Vector3(0, -0.001, 0)));
                    }
                    if (remoteDrawings.has(peerId)) {
                        const drawing = remoteDrawings.get(peerId);
                        const curve = new THREE.CatmullRomCurve3(pts);
                        const newGeometry = new THREE.TubeGeometry(curve, pts.length * 2, 0.015, 8, false);
                        drawing.mesh.geometry.dispose();
                        drawing.mesh.geometry = newGeometry;
                        drawing.points = pts;
                    } else {
                        const color = new THREE.Color(data.color);
                        const material = new THREE.MeshStandardMaterial({
                            color: color,
                            emissive: color,
                            emissiveIntensity: 2.0,
                            roughness: 0.2,
                            metalness: 0.8,
                            side: THREE.DoubleSide
                        });
                        const curve = new THREE.CatmullRomCurve3(pts);
                        const geometry = new THREE.TubeGeometry(curve, pts.length * 2, 0.015, 8, false);
                        const mesh = new THREE.Mesh(geometry, material);
                        scene.add(mesh);
                        remoteDrawings.set(peerId, {
                            mesh: mesh,
                            material: material,
                            points: pts
                        });
                    }
                } else if (data.type === 'draw-ribbon-end') {
                    const peerId = data.id;
                    const pts = data.points.map(p => new THREE.Vector3(p.x, p.y, p.z));
                    if (pts.length >= 2) {
                        if (remoteDrawings.has(peerId)) {
                            const drawing = remoteDrawings.get(peerId);
                            const curve = new THREE.CatmullRomCurve3(pts);
                            const newGeometry = new THREE.TubeGeometry(curve, pts.length * 2, 0.015, 8, false);
                            drawing.mesh.geometry.dispose();
                            drawing.mesh.geometry = newGeometry;
                            allRibbonMeshes.push(drawing.mesh);
                            remoteDrawings.delete(peerId);
                        } else {
                            createRibbonMesh(data.points, data.color);
                        }
                    }
                } else if (data.type === 'clear-drawings') {
                    clearClientDrawings();
                }
            };
        });

        exhibits.forEach((artifact) => {
            const exhibitId = artifact.userData.exhibitId || (artifact.userData.parentExhibit && artifact.userData.parentExhibit.id);
            if (!exhibitId) return;
            
            // 3D Positional Audio via Three.js
            const panner = new THREE.PositionalAudio(audioListener);
            panner.setDistanceModel('exponential');
            panner.setRefDistance(1);
            panner.setMaxDistance(12);
            panner.setRolloffFactor(1.5);
            artifact.add(panner);
            
            // Re-route native panner output to our Tone mixing zones
            const nativePanner = panner.getOutput();
            nativePanner.disconnect();
            
            const dryGain = new Tone.Gain(1).connect(mainReverb);
            const oculusSend = new Tone.Gain(0.5).connect(oculusZone);
            const myceliumSend = new Tone.Gain(0.0).connect(myceliumFilter);
            
            nativePanner.connect(dryGain.input || dryGain._gainNode || dryGain);
            nativePanner.connect(oculusSend.input || oculusSend._gainNode || oculusSend);
            nativePanner.connect(myceliumSend.input || myceliumSend._gainNode || myceliumSend);

            // Create intermediate native GainNode for panner source
            const pannerInput = Tone.context.rawContext.createGain();
            panner.setNodeSource(pannerInput);

            const filter = new Tone.Filter(2000, "lowpass");
            // Native connect from filter to panner source
            Tone.connect(filter, pannerInput);

            const analyser = new Tone.Analyser("waveform", 256);
            const fft = new Tone.Analyser("fft", 32); 
            const meter = new Tone.Meter();
            let synth, loop;

            if (exhibitId === 'orrery') {
                synth = new Tone.PolySynth(Tone.FMSynth, {
                    harmonicity: 3, modulationIndex: 10,
                    envelope: { attack: 0.05, decay: 0.4, sustain: 0.2, release: 0.8 }
                });
                synth.connect(filter); synth.connect(analyser); synth.connect(fft); synth.connect(meter);
                const notes = ["D4", "F#4", "A4", "C#5", "D5", "F#5"]; let step = 0;
                loop = new Tone.Loop(time => {
                    const freq = artifact.userData.sliders.freq;
                    const mod = artifact.userData.sliders.mod;
                    synth.set({ modulationIndex: mod * 30 });
                    filter.frequency.value = 500 + mod * 3500;
                    if(artifact.userData.isRotating) {
                        synth.triggerAttackRelease(notes[step % notes.length], "8n", time, 0.4 * freq);
                        step++;
                    }
                }, "8n");
                Tone.Transport.start(); loop.start(0);

            } else if (exhibitId === 'camera') {
                synth = new Tone.MetalSynth({
                    frequency: 300, envelope: { attack: 0.001, decay: 0.2, release: 0.05 },
                    harmonicity: 6.0, modulationIndex: 25, resonance: 3000, octaves: 2.0
                });
                synth.connect(filter); synth.connect(analyser); synth.connect(fft); synth.connect(meter);
                loop = new Tone.Loop(time => {
                    const freq = artifact.userData.sliders.freq;
                    const mod = artifact.userData.sliders.mod;
                    synth.frequency.value = 100 + freq * 800;
                    filter.frequency.value = 400 + mod * 4000;
                    if(artifact.userData.isRotating) {
                        synth.triggerAttackRelease("16n", time, 0.35);
                    }
                }, "4n");
                loop.start(0);

            } else if (exhibitId === 'relic') {
                synth = new Tone.FMSynth({
                    harmonicity: 0.5, modulationIndex: 12,
                    oscillator: { type: "sine" },
                    envelope: { attack: 1.5, decay: 1.5, sustain: 0.8, release: 4 }
                });
                const lfo = new Tone.LFO(0.3, 35, 75).start();
                lfo.connect(synth.frequency);
                synth.connect(filter); synth.connect(analyser); synth.connect(fft); synth.connect(meter);
                synth.triggerAttack("D2"); 
                loop = new Tone.Loop(() => { 
                    const freq = artifact.userData.sliders.freq;
                    const mod = artifact.userData.sliders.mod;
                    lfo.frequency.value = 0.1 + freq * 5.0;
                    synth.modulationIndex.value = 2 + mod * 30;
                    filter.frequency.value = 300 + mod * 1500;
                    synth.volume.value = Tone.gainToDb(artifact.userData.speedMultiplier * 0.6); 
                }, "10n").start(0);
            }

            const audioEntry = { exhibitId, panner, filter, analyser, fft, meter, synth, loop, oculusSend, myceliumSend };
            audioNodes.push(audioEntry);
            artifact.userData.audioData = audioEntry;
            if (artifact.userData.parentExhibit) {
                artifact.userData.parentExhibit.userData.audioData = audioEntry;
            }
            
            // Set initial space reverb from sliders
            if (artifact.userData.sliders && artifact.userData.sliders.space !== undefined) {
                const val = artifact.userData.sliders.space;
                if (panner.setRolloffFactor) panner.setRolloffFactor(Math.max(0.1, 3.0 - (val * 2.9)));
                if (panner.setRefDistance) panner.setRefDistance(Math.max(0.1, 1.0 + (val * 3.0)));
            }
        });
    }

    function triggerHapticPulse(controller, intensity = 0.5, duration = 50) {
        if (controller && controller.gamepad && controller.gamepad.hapticActuators && controller.gamepad.hapticActuators.length > 0) {
            controller.gamepad.hapticActuators[0].pulse(Math.min(1.0, intensity), duration);
        }
    }

    // Curved Spatial Panel Geometry generator for ergonomic XR readability
    function createCurvedPlaneGeometry(width, height, curveAngle = 0.35, segments = 24) {
        const geo = new THREE.PlaneGeometry(width, height, segments, 1);
        const pos = geo.attributes.position;
        const halfW = width / 2;
        const radius = width / Math.max(0.01, curveAngle);
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            // Bend backwards into a smooth cylinder arc facing user
            const z = (1 - Math.cos((x / halfW) * (curveAngle * 0.5))) * (-radius * 0.12);
            pos.setZ(i, z);
        }
        geo.computeVertexNormals();
        return geo;
    }

    // Points of Interest for Magnetic Teleport Snapping
    const EXHIBIT_POIS = [
        { id: 'orrery', name: 'Celestial Orrery Sweet Spot', position: new THREE.Vector3(-3.0, 0, -1.2) },
        { id: 'swarm', name: 'Particle Swarm Sweet Spot', position: new THREE.Vector3(3.0, 0, -1.2) },
        { id: 'relic', name: 'Nordic Relic Sweet Spot', position: new THREE.Vector3(0, 0, -4.5) },
        { id: 'oculus', name: 'Gallery Center Oculus', position: new THREE.Vector3(0, 0, 0) },
        { id: 'console', name: 'Architectural Command Deck', position: new THREE.Vector3(2.6, 0, 2.6) }
    ];

    function triggerAudioHapticSync(controller, artifact) {
        if (controller.userData.grabbedObject === artifact && artifact.userData.audioData) {
            const db = artifact.userData.audioData.meter.getValue();
            const gain = Tone.dbToGain(db); 
            if (gain > 0.05) {
                triggerHapticPulse(controller, gain * 1.6, 15);
            }
        }
    }

    function createConcreteTextures() {
        const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#6e7377'; ctx.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 40000; i++) {
            const x = Math.random() * 512; const y = Math.random() * 512;
            const r = Math.random() * 1.5; ctx.fillStyle = Math.random() > 0.5 ? 'rgba(30, 32, 35, 0.15)' : 'rgba(255, 255, 255, 0.06)';
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)'; ctx.lineWidth = 2;
        for (let y = 128; y < 512; y += 128) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
        }
        for (let i = 0; i < 6; i++) {
            const x = Math.random() * 512; const y = Math.random() * 512; const r = 30 + Math.random() * 50;
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, 'rgba(40, 42, 45, 0.12)'); grad.addColorStop(1, 'rgba(40, 42, 45, 0)');
            ctx.fillStyle = grad; ctx.fillRect(x - r, y - r, r * 2, r * 2);
        }
        const map = new THREE.CanvasTexture(canvas); map.wrapS = THREE.RepeatWrapping; map.wrapT = THREE.RepeatWrapping; map.repeat.set(2, 2);

        // Bump Map
        const bCanvas = document.createElement('canvas'); bCanvas.width = 512; bCanvas.height = 512;
        const bCtx = bCanvas.getContext('2d'); bCtx.fillStyle = '#808080'; bCtx.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 50000; i++) {
            const x = Math.random() * 512; const y = Math.random() * 512; const r = Math.random() * 1.2;
            bCtx.fillStyle = Math.random() > 0.45 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.06)';
            bCtx.beginPath(); bCtx.arc(x, y, r, 0, Math.PI * 2); bCtx.fill();
        }
        for (let y = 128; y < 512; y += 128) {
            bCtx.fillStyle = 'rgba(0,0,0,0.15)'; bCtx.fillRect(0, y, 512, 1);
            bCtx.fillStyle = 'rgba(255,255,255,0.08)'; bCtx.fillRect(0, y + 1, 512, 1);
        }
        const bumpMap = new THREE.CanvasTexture(bCanvas); bumpMap.wrapS = THREE.RepeatWrapping; bumpMap.wrapT = THREE.RepeatWrapping; bumpMap.repeat.set(2, 2);

        return { map, bumpMap };
    }

    function createWoodTextures() {
        const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#c4a482'; ctx.fillRect(0, 0, 512, 512);
        for (let x = 0; x < 512; x += 1.5) {
            const val = Math.sin(x * 0.05) * 10 + Math.cos(x * 0.01) * 30;
            const offset = Math.sin(val * 0.1) * 2;
            ctx.strokeStyle = Math.random() > 0.5 ? 'rgba(125, 95, 65, 0.15)' : 'rgba(235, 215, 185, 0.12)';
            ctx.lineWidth = 1 + Math.random() * 1.5;
            ctx.beginPath(); ctx.moveTo(x + offset, 0); ctx.lineTo(x + offset, 512); ctx.stroke();
        }
        for (let i = 0; i < 3; i++) {
            const cx = 100 + Math.random() * 312; const cy = 100 + Math.random() * 312;
            for (let r = 5; r < 50; r += 5) {
                ctx.strokeStyle = 'rgba(125, 95, 65, 0.06)'; ctx.lineWidth = 1.2;
                ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.35, r, 0, 0, Math.PI * 2); ctx.stroke();
            }
        }
        const map = new THREE.CanvasTexture(canvas); map.wrapS = THREE.RepeatWrapping; map.wrapT = THREE.RepeatWrapping; map.repeat.set(1, 4);

        // Bump
        const bCanvas = document.createElement('canvas'); bCanvas.width = 512; bCanvas.height = 512;
        const bCtx = bCanvas.getContext('2d'); bCtx.fillStyle = '#808080'; bCtx.fillRect(0, 0, 512, 512);
        for (let x = 0; x < 512; x += 3) {
            const val = Math.sin(x * 0.05) * 10 + Math.cos(x * 0.01) * 30;
            const offset = Math.sin(val * 0.1) * 2;
            bCtx.strokeStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
            bCtx.lineWidth = 1;
            bCtx.beginPath(); bCtx.moveTo(x + offset, 0); bCtx.lineTo(x + offset, 512); bCtx.stroke();
        }
        const bumpMap = new THREE.CanvasTexture(bCanvas); bumpMap.wrapS = THREE.RepeatWrapping; bumpMap.wrapT = THREE.RepeatWrapping; bumpMap.repeat.set(1, 4);

        return { map, bumpMap };
    }

    function createMyceliumTextures() {
        const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#f2f0e6'; // Off-white organic base
        ctx.fillRect(0, 0, 512, 512);
        
        // Procedural fungal network pattern
        for (let i = 0; i < 5000; i++) {
            const x = Math.random() * 512; const y = Math.random() * 512;
            const r = Math.random() * 2.0; 
            ctx.fillStyle = Math.random() > 0.5 ? 'rgba(215, 212, 198, 0.2)' : 'rgba(255, 255, 255, 0.4)';
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        
        // Fibrous connections
        ctx.strokeStyle = 'rgba(215, 212, 198, 0.15)'; ctx.lineWidth = 0.5;
        for (let i = 0; i < 2000; i++) {
            const x = Math.random() * 512; const y = Math.random() * 512;
            const angle = Math.random() * Math.PI * 2; const len = 5 + Math.random() * 15;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(angle)*len, y + Math.sin(angle)*len); ctx.stroke();
        }

        const map = new THREE.CanvasTexture(canvas); map.wrapS = THREE.RepeatWrapping; map.wrapT = THREE.RepeatWrapping; map.repeat.set(3, 3);

        const bCanvas = document.createElement('canvas'); bCanvas.width = 512; bCanvas.height = 512;
        const bCtx = bCanvas.getContext('2d'); bCtx.fillStyle = '#808080'; bCtx.fillRect(0, 0, 512, 512);
        for (let i = 0; i < 60000; i++) {
            const x = Math.random() * 512; const y = Math.random() * 512; const r = Math.random() * 2.0;
            bCtx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
            bCtx.beginPath(); bCtx.arc(x, y, r, 0, Math.PI * 2); bCtx.fill();
        }
        const bumpMap = new THREE.CanvasTexture(bCanvas); bumpMap.wrapS = THREE.RepeatWrapping; bumpMap.wrapT = THREE.RepeatWrapping; bumpMap.repeat.set(3, 3);

        return { map, bumpMap };
    }

    function createPolishedFloorTexture() {
        const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 1024;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1e2124'; ctx.fillRect(0, 0, 1024, 1024);
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2.0;
        for (let i = 0; i <= 1024; i += 256) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 1024); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(1024, i); ctx.stroke();
            ctx.fillStyle = 'rgba(0,0,0,0.35)';
            for (let j = 0; j <= 1024; j += 256) {
                ctx.beginPath(); ctx.arc(i + 8, j + 8, 4, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.strokeStyle = 'rgba(255,255,255,0.025)'; ctx.lineWidth = 0.5;
        for (let i = 0; i < 60; i++) {
            const x1 = Math.random() * 1024; const y1 = Math.random() * 1024;
            const len = 10 + Math.random() * 40; const angle = Math.random() * Math.PI * 2;
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + Math.cos(angle) * len, y1 + Math.sin(angle) * len); ctx.stroke();
        }
        const texture = new THREE.CanvasTexture(canvas); texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(10, 10);
        return texture;
    }

    function createPolishedFloorBumpMap() {
        const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 1024;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 1024, 1024);
        for (let i = 0; i < 40000; i++) {
            const x = Math.random() * 1024; const y = Math.random() * 1024; const r = Math.random() * 1.5;
            ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        for (let i = 0; i <= 1024; i += 256) {
            ctx.fillRect(i - 1, 0, 2, 1024); ctx.fillRect(0, i - 1, 1024, 2);
        }
        const texture = new THREE.CanvasTexture(canvas); texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(10, 10);
        return texture;
    }

    function createWaterNormalMap() {
        const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#8080ff'; ctx.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 200; i++) {
            const x = Math.random() * 256; const y = Math.random() * 256; const r = 10 + Math.random() * 30;
            const nx = 128 + Math.floor((Math.random() - 0.5) * 40);
            const ny = 128 + Math.floor((Math.random() - 0.5) * 40);
            const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
            grad.addColorStop(0, `rgba(${nx}, ${ny}, 255, 0.1)`); grad.addColorStop(1, 'rgba(128, 128, 255, 0)');
            ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        const tex = new THREE.CanvasTexture(canvas); tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
        return tex;
    }

    function createProceduralPottedTree() {
        const group = new THREE.Group();
        const potGeo = new THREE.CylinderGeometry(0.35, 0.28, 0.7, 24);
        const textures = createConcreteTextures();
        const potMat = new THREE.MeshStandardMaterial({ color: 0x8a8e92, roughness: 0.7, metalness: 0.1, map: textures.map, bumpMap: textures.bumpMap, bumpScale: 0.04 });
        const pot = new THREE.Mesh(potGeo, potMat); pot.position.y = 0.35; pot.castShadow = true; pot.receiveShadow = true; group.add(pot);
        
        const soilGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.05, 12);
        const soilMat = new THREE.MeshStandardMaterial({ color: 0x221a15, roughness: 0.9 });
        const soil = new THREE.Mesh(soilGeo, soilMat); soil.position.y = 0.68; group.add(soil);
        
        const trunkGeo = new THREE.CylinderGeometry(0.03, 0.05, 2.0, 8);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8, metalness: 0.05 });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat); trunk.position.y = 1.68; trunk.castShadow = true; trunk.receiveShadow = true; group.add(trunk);
        
        for (let i = 0; i < 5; i++) {
            const ringGeo = new THREE.CylinderGeometry(0.041, 0.041, 0.03, 8);
            const ringMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.set(0, 1.0 + i * 0.35 + (Math.random() - 0.5) * 0.1, 0); ring.rotation.y = Math.random() * Math.PI * 2;
            group.add(ring);
        }
        
        const leafMat = new THREE.MeshStandardMaterial({ color: 0x5a755e, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide });
        const branchOffsets = [
            { x: 0.18, y: 2.0, z: 0.08, s: 0.4 },
            { x: -0.22, y: 2.2, z: -0.12, s: 0.35 },
            { x: 0.08, y: 2.4, z: -0.2, s: 0.45 },
            { x: -0.08, y: 2.6, z: 0.08, s: 0.38 },
            { x: 0.0, y: 2.85, z: 0.0, s: 0.52 }
        ];
        branchOffsets.forEach(b => {
            const twig = new THREE.Group(); twig.position.set(b.x, b.y, b.z);
            const cluster = new THREE.Mesh(new THREE.DodecahedronGeometry(b.s, 1), leafMat); cluster.castShadow = true; twig.add(cluster);
            const conGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.35); conGeo.rotateZ(Math.PI/4);
            const con = new THREE.Mesh(conGeo, trunkMat); con.position.set(-b.x * 0.5, -0.08, -b.z * 0.5); twig.add(con);
            group.add(twig);
        });
        return group;
    }

    function playUIFeedback(type) {
        if (Tone.context.state !== 'running') return;
        if (type === 'hover') {
            const s = new Tone.MembraneSynth().toDestination();
            s.volume.value = -32; s.triggerAttackRelease("D4", "32n");
        } else if (type === 'click') {
            const s = new Tone.MetalSynth().toDestination();
            s.volume.value = -28; s.triggerAttackRelease("16n");
        }
    }

    function setupLightingAndEnvironment() {
        ambientLight = new THREE.AmbientLight(0xffeedd, 0.5); scene.add(ambientLight);
        // Explicitly set decay to 1.0 to prevent modern Three.js default decay of 2.0 from extinguishing the light immediately
        topLight = new THREE.PointLight(0xfff5e6, 1.2, 45, 1.0);
        topLight.position.set(0, 7, 0); 
        topLight.castShadow = false; 
        scene.add(topLight);

        // Elegant Nordic Sun Directional Light to cast high-realism wood slat shadows
        dirLight = new THREE.DirectionalLight(0xfff6ee, 1.5);
        dirLight.position.set(10, 18, 5);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        dirLight.shadow.camera.near = 0.5;
        dirLight.shadow.camera.far = 45;
        dirLight.shadow.camera.left = -30;
        dirLight.shadow.camera.right = 30;
        dirLight.shadow.camera.top = 30;
        dirLight.shadow.camera.bottom = -30;
        dirLight.shadow.bias = -0.0005;
        scene.add(dirLight);

        const pmremGenerator = new THREE.PMREMGenerator(renderer);
        pmremGenerator.compileEquirectangularShader();
        
        // Move sky dome to radius 45, completely outside the museum architecture to avoid clipping pillars
        const wallGeo = new THREE.CylinderGeometry(45, 45, 32, 80, 1, true, -Math.PI/1.3, Math.PI * 1.5);
        
        bigWallMaterial = new THREE.ShaderMaterial({
            uniforms: { 
                uTime: { value: 0.0 }, 
                uOpacity: { value: 0.8 },
                uAudioLevel: { value: 0.0 } 
            },
            side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uTime; uniform float uOpacity; uniform float uAudioLevel; varying vec2 vUv;
                
                float random(in vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123); }
                float noise(in vec2 st) {
                    vec2 i = floor(st); vec2 f = fract(st);
                    float a = random(i); float b = random(i + vec2(1.0, 0.0));
                    float c = random(i + vec2(0.0, 1.0)); float d = random(i + vec2(1.0, 1.0));
                    vec2 u = f*f*(3.0-2.0*f);
                    return mix(a, b, u.x) + (c - a)* u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
                }
                float fbm(in vec2 st) {
                    float value = 0.0; float amplitude = 0.5;
                    for (int i = 0; i < 5; i++) { value += amplitude * noise(st); st *= 2.0; amplitude *= 0.5; }
                    return value;
                }

                void main() {
                    vec2 st = vUv * vec2(20.0, 8.0);
                    float t = uTime * 0.15;
                    float audioInfl = uAudioLevel * 2.5;

                    vec2 q = vec2(0.0);
                    q.x = fbm(st + vec2(t * 0.5, t * 0.2));
                    q.y = fbm(st + vec2(1.0));

                    vec2 r = vec2(0.0);
                    r.x = fbm(st + 4.0 * q + vec2(1.7, 9.2) + t * 1.2 + audioInfl);
                    r.y = fbm(st + 4.0 * q + vec2(8.3, 2.8) + t * 0.8 - audioInfl);

                    float f = fbm(st + 4.0 * r);

                    vec3 baseCol = vec3(0.01, 0.02, 0.05);
                    vec3 color = mix(baseCol, vec3(0.0, 0.2, 0.4), clamp((f*f)*4.0, 0.0, 1.0));
                    color = mix(color, vec3(0.0, 0.8, 1.0), clamp(length(q) * audioInfl * 0.8, 0.0, 1.0));
                    color = mix(color, vec3(0.6, 0.0, 1.0), clamp(length(r.x) * f, 0.0, 1.0));

                    float scanline = sin(vUv.y * 1200.0) * 0.04;
                    float glitch = step(0.98, random(vec2(uTime, vUv.y))) * audioInfl * 0.2;
                    
                    float fade = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
                    gl_FragColor = vec4((color + scanline + glitch) * fade, fade * uOpacity); 
                }
            `
        });
        const wall = new THREE.Mesh(wallGeo, bigWallMaterial);
        wall.position.set(0, 10, 0); scene.add(wall);

        // CREATE MASSIVE INTERACTIVE LED ART SCREEN WITH EXPERIMENTAL SHADER
        ledScreenMaterial = new THREE.ShaderMaterial({
            side: THREE.DoubleSide,
            uniforms: {
                uTime: { value: 0.0 },
                uAudioLevel: { value: 0.0 },
                uHeadPos: { value: new THREE.Vector3(0, 1.6, 0) },
                uLeftHandPos: { value: new THREE.Vector3(-1.0, 1.0, -1.0) },
                uRightHandPos: { value: new THREE.Vector3(1.0, 1.0, -1.0) },
                uLeftFingerPos: { value: new THREE.Vector3(-1.0, 1.0, -1.0) },
                uRightFingerPos: { value: new THREE.Vector3(1.0, 1.0, -1.0) },
                uResolution: { value: new THREE.Vector2(1024, 512) },
                uNightMode: { value: 0.0 },
                uThemeColor: { value: new THREE.Color() },
                uConcreteTex: { value: concreteTex.map }
            },
            vertexShader: `
                varying vec2 vUv;
                varying vec3 vWorldPosition;
                void main() {
                    vUv = uv;
                    vec4 worldPos = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPos.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform float uAudioLevel;
                uniform vec3 uHeadPos;
                uniform vec3 uLeftHandPos;
                uniform vec3 uRightHandPos;
                uniform vec3 uLeftFingerPos;
                uniform vec3 uRightFingerPos;
                uniform vec2 uResolution;
                uniform float uNightMode;
                uniform vec3 uThemeColor;
                uniform sampler2D uConcreteTex;
                varying vec2 vUv;
                varying vec3 vWorldPosition;

                float rand(vec2 co) {
                    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
                }

                float noise(vec2 p) {
                    vec2 ip = floor(p);
                    vec2 fp = fract(p);
                    fp = fp*fp*(3.0-2.0*fp);
                    float a = rand(ip);
                    float b = rand(ip + vec2(1.0, 0.0));
                    float c = rand(ip + vec2(0.0, 1.0));
                    float d = rand(ip + vec2(1.0, 1.0));
                    return mix(mix(a, b, fp.x), mix(c, d, fp.x), fp.y);
                }

                void main() {
                    vec2 uv = vUv;
                    float t = uTime * 0.9;
                    
                    // Procedural organic fluid simulation
                    float n = noise(uv * 8.0 + vec2(t * 0.12, t * 0.06));
                    n += 0.4 * noise(uv * 18.0 - vec2(t * 0.18, t * 0.12));
                    n = sin(uv.x * 25.0 + n * 6.28 + t) * 0.5 + 0.5;

                    // Compute distances in 3D world space to user's body landmarks
                    float dHead = length(vWorldPosition - uHeadPos);
                    float dLeftHand = length(vWorldPosition - uLeftHandPos);
                    float dRightHand = length(vWorldPosition - uRightHandPos);
                    float dLeftFing = length(vWorldPosition - uLeftFingerPos);
                    float dRightFing = length(vWorldPosition - uRightFingerPos);

                    // Multi-modal distance field triggers
                    float headField = exp(-dHead * dHead * 0.06); 
                    float leftHandField = exp(-dLeftHand * dLeftHand * 0.45); 
                    float rightHandField = exp(-dRightHand * dRightHand * 0.45); 
                    float leftFingField = exp(-dLeftFing * dLeftFing * 2.2); 
                    float rightFingField = exp(-dRightFing * dRightFing * 2.2);

                    float totalField = headField * 0.4 + leftHandField * 0.7 + rightHandField * 0.7 + leftFingField * 1.8 + rightFingField * 1.8;
                    totalField *= (1.0 + uAudioLevel * 2.5);

                    // Modern digital colors base
                    vec3 baseColor = mix(vec3(0.01, 0.02, 0.04), vec3(0.005, 0.015, 0.03), uNightMode);
                    
                    // Generative aura based on user interaction
                    vec3 headColor = vec3(0.12, 0.45, 0.95) * headField;
                    vec3 handColor = uThemeColor * (leftHandField + rightHandField) * 0.9;
                    vec3 fingerColor = vec3(1.0, 0.1, 0.4) * (leftFingField + rightFingField) * 1.2;
                    
                    // Audio responsive burst ripples
                    vec3 musicRipple = (uThemeColor + vec3(0.4, -0.2, 0.2)) * n * uAudioLevel * 0.75;
                    
                    vec3 finalArt = baseColor + headColor + handColor + fingerColor + musicRipple;
                    
                    // High-tech matrix grid matching user body reaction
                    float gridX = abs(sin(vUv.x * 300.0)) < 0.08 ? 1.0 : 0.0;
                    float gridY = abs(sin(vUv.y * 150.0)) < 0.08 ? 1.0 : 0.0;
                    float grid = (gridX + gridY) * 0.08 * (0.25 + totalField * 3.0);
                    finalArt += uThemeColor * grid;
                    
                    // Glitch dynamic scanlines
                    float scanline = sin(uv.y * 800.0 + t * 4.0) * 0.04;
                    finalArt += vec3(0.4, 1.0, 0.8) * scanline;

                    // Border attenuation / edge fade of projection
                    float border = uv.x * (1.0 - uv.x) * uv.y * (1.0 - uv.y) * 16.0;
                    border = pow(border, 0.35);
                    finalArt *= border;

                    // Support both WebGL1 texture2D and WebGL2 texture
                    #if __VERSION__ >= 300
                        vec3 concreteColor = texture(uConcreteTex, uv * vec2(3.0, 1.0)).rgb;
                    #else
                        vec3 concreteColor = texture2D(uConcreteTex, uv * vec2(3.0, 1.0)).rgb;
                    #endif
                    
                    vec3 finalProjectedColor = finalArt * (concreteColor * 2.2 + vec3(0.08));

                    gl_FragColor = vec4(finalProjectedColor, 1.0);
                }
            `
        });

        // 3D Physical Assembly of LED installation
        const screenW = 24.0;
        const screenH = 8.0;

        // Actual LED Screen mesh (placed directly flush on the concrete wall structure)
        const screenGeo = new THREE.PlaneGeometry(screenW, screenH);
        ledScreenMesh = new THREE.Mesh(screenGeo, ledScreenMaterial);
        ledScreenMesh.position.set(0, 5.0, -19.46); // Sits perfectly flush on the concrete wall Backdrop (at z = -19.5 with thickness)
        ledScreenMesh.frustumCulled = false; // Prevent Meta Quest aggressive VR frustum culling
        scene.add(ledScreenMesh);

        // Ambient floor scatter light
        ledScreenGlowLight = new THREE.PointLight(0x00ffaa, 0.6, 30, 1.1);
        ledScreenGlowLight.position.set(0, 5.0, -18.5);
        scene.add(ledScreenGlowLight);
    }

    function buildGallerySpace() {
        // Floor - High Gloss Polished Concrete Style
        const floorTex = createPolishedFloorTexture();
        const floorBump = createPolishedFloorBumpMap();
        const floorGeo = new THREE.PlaneGeometry(100, 100);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x1c1e20,
            roughness: 0.16,
            metalness: 0.45,
            map: floorTex,
            bumpMap: floorBump,
            bumpScale: 0.005
        });
        const floor = new THREE.Mesh(floorGeo, floorMat);
        floor.name = 'teleportFloor';
        floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

        // --- Scandinavian Architecture Materials with Tactile Grain ---
        const lightWoodMat = new THREE.MeshStandardMaterial({
            color: 0xc4a482,
            roughness: 0.6,
            metalness: 0.1,
            map: woodTex.map,
            bumpMap: woodTex.bumpMap,
            bumpScale: 0.012
        });
        const rawConcreteMat = new THREE.MeshStandardMaterial({
            color: 0x6e7377,
            roughness: 0.82,
            metalness: 0.12,
            map: concreteTex.map,
            bumpMap: concreteTex.bumpMap,
            bumpScale: 0.03
        });
        myceliumMat = new THREE.MeshStandardMaterial({
            color: 0xf5f5f0,
            roughness: 0.95,
            metalness: 0.05,
            map: myceliumTex.map,
            bumpMap: myceliumTex.bumpMap,
            bumpScale: 0.04,
            emissive: new THREE.Color(0x000000),
            emissiveIntensity: 0.0
        });

        const architectureGroup = new THREE.Group();

        // 1. Massive Concrete Accent Wall (Backdrop)
        const backWallGeo = new THREE.BoxGeometry(60, 16, 1);
        const backWall = new THREE.Mesh(backWallGeo, rawConcreteMat);
        backWall.position.set(0, 8, -20);
        backWall.receiveShadow = true; backWall.castShadow = true;
        architectureGroup.add(backWall);

        // 1b. Acoustic Diffusor Wall Paneling
        const diffusorGroup = new THREE.Group();
        architectureGroup.add(diffusorGroup);
        
        rebuildWallFunc = () => {
            for (let i = diffusorGroup.children.length - 1; i >= 0; i--) {
                const child = diffusorGroup.children[i];
                if (child.geometry) child.geometry.dispose();
                diffusorGroup.remove(child);
            }
            const numDiffusorSlats = 160;
            const panelWidth = 58; 
            for (let i = 0; i < numDiffusorSlats; i++) {
                const t = i / numDiffusorSlats;
                const xPos = -panelWidth/2 + t * panelWidth;
                
                const isBehindScreen = Math.abs(xPos) < 12.2;
                if (isBehindScreen) continue;
                
                const depth = 0.1 + Math.abs(Math.sin(i * parametricState.wallFreq) * parametricState.wallAmp + Math.cos(i * (parametricState.wallFreq * 0.3)) * (parametricState.wallAmp * 0.5));
                const height = 12.0 + Math.sin(i * (parametricState.wallFreq * 0.5)) * parametricState.wallHeightMod;
                const slatGeo = new THREE.BoxGeometry(0.15, height, depth);
                const slat = new THREE.Mesh(slatGeo, lightWoodMat);
                
                slat.position.set(xPos, height/2, -19.4 + depth/2);
                slat.receiveShadow = true; slat.castShadow = true;
                diffusorGroup.add(slat);
            }
        };
        rebuildWallFunc();

        // 1c. Sustainable Mycelium Acoustic Array
        const myceliumGroup = new THREE.Group();
        const numMyceliumBaffles = 24;
        const bRadius = 14; 
        const baffleGeo = new THREE.CylinderGeometry(0.8, 0.1, 4.0, 6);
        baffleGeo.rotateX(Math.PI / 2);
        
        const myceliumIM = new THREE.InstancedMesh(baffleGeo, myceliumMat, numMyceliumBaffles);
        myceliumIM.castShadow = true; myceliumIM.receiveShadow = true;
        
        const mMat = new THREE.Matrix4();
        const mPos = new THREE.Vector3();
        const mQuat = new THREE.Quaternion();
        const mScale = new THREE.Vector3(1, 1, 1);
        const dummyObj = new THREE.Object3D(); // for easy lookAt
        
        for (let i = 0; i < numMyceliumBaffles; i++) {
            const angle = (i / numMyceliumBaffles) * Math.PI * 2;
            dummyObj.position.set(Math.cos(angle)*bRadius, 10.5, Math.sin(angle)*bRadius - 2);
            dummyObj.lookAt(0, 10.5, -2);
            dummyObj.updateMatrix();
            myceliumIM.setMatrixAt(i, dummyObj.matrix);
        }
        myceliumGroup.add(myceliumIM);
        architectureGroup.add(myceliumGroup);

        // 2. Parametric Wooden Slatted Ceiling/Canopy
        const ceilingGroup = new THREE.Group();
        ceilingGroup.position.set(0, 11.5, -2); // Slightly higher to give more breathing room
        architectureGroup.add(ceilingGroup);
        
        const acousticMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, metalness: 0.1 });
        const ledStripMat = new THREE.MeshBasicMaterial({ color: 0xfff6ee });
        
        rebuildCeilingFunc = () => {
            // Clean up existing geometry
            for (let i = ceilingGroup.children.length - 1; i >= 0; i--) {
                const child = ceilingGroup.children[i];
                if (child.geometry) child.geometry.dispose();
                ceilingGroup.remove(child);
            }

            const slatSpacing = parametricState.slatSpacing;
            const numSlats = Math.floor(63.0 / slatSpacing); // Keep overall width ~63m
            const ceilingLength = 52; 
            const oculusRadius = parametricState.oculusRadius;
            
            // Instanced Meshes Setup
            const beamCount = Math.floor((22 - (-22)) / 4) + 1; // z = -22 to 22 by 4 = 12 beams.
            const beamGeo = new THREE.BoxGeometry(numSlats * slatSpacing, 0.4, 0.25);
            const beamIM = new THREE.InstancedMesh(beamGeo, rawConcreteMat, beamCount);
            beamIM.castShadow = true; beamIM.receiveShadow = true;

            const rodGeo = new THREE.CylinderGeometry(0.02, 0.02, numSlats * slatSpacing, 8);
            const rodMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9, roughness: 0.4 });
            const rodIM = new THREE.InstancedMesh(rodGeo, rodMat, beamCount);
            
            const acousticCount = numSlats; // At most numSlats
            const acousticGeo = new THREE.BoxGeometry(slatSpacing * 2.5, 0.05, ceilingLength);
            const acousticIM = new THREE.InstancedMesh(acousticGeo, acousticMat, acousticCount);

            // Slat count can be up to numSlats * 2
            const baseSlatGeo = new THREE.BoxGeometry(1, 1, 1);
            const slatIM = new THREE.InstancedMesh(baseSlatGeo, lightWoodMat, numSlats * 2);
            slatIM.castShadow = true; slatIM.receiveShadow = true;

            const ledCount = numSlats;
            const ledGeo = new THREE.BoxGeometry(1, 1, 1);
            const ledIM = new THREE.InstancedMesh(ledGeo, ledStripMat, ledCount);

            const matrix = new THREE.Matrix4();
            const position = new THREE.Vector3();
            const rotation = new THREE.Euler();
            const quaternion = new THREE.Quaternion();
            const scale = new THREE.Vector3();

            let beamIdx = 0;
            for (let z = -22; z <= 22; z += 4) {
                if (Math.abs(z) < oculusRadius + 1.0) continue;
                
                position.set(0, -0.2, z);
                quaternion.identity();
                scale.set(1, 1, 1);
                matrix.compose(position, quaternion, scale);
                beamIM.setMatrixAt(beamIdx, matrix);

                position.set(0, -0.35, z + 0.1);
                rotation.set(0, 0, Math.PI / 2);
                quaternion.setFromEuler(rotation);
                matrix.compose(position, quaternion, scale);
                rodIM.setMatrixAt(beamIdx, matrix);
                
                beamIdx++;
            }
            beamIM.count = beamIdx;
            rodIM.count = beamIdx;

            let acousticIdx = 0;
            let slatIdx = 0;
            let ledIdx = 0;

            for (let i = 0; i < numSlats; i++) {
                const xPos = (i - numSlats / 2 + 0.5) * slatSpacing;
                const archOffset = -Math.pow(xPos / 26, 2) * parametricState.archCompression; 
                const waveOffset = Math.sin(xPos * parametricState.waveFrequency) * parametricState.waveAmplitude + Math.cos(xPos * (parametricState.waveFrequency * 1.94)) * (parametricState.waveAmplitude * 0.33);
                const slatHeight = 0.6 + Math.cos(xPos * 0.12) * 0.3 + Math.abs(xPos)/30; 
                const yPos = archOffset + waveOffset;
                const distToCenter = Math.abs(xPos);
                
                if (i % Math.max(1, Math.floor(1.0/slatSpacing)) === 0 && distToCenter > oculusRadius) {
                    position.set(xPos, yPos + slatHeight + 0.1, 0);
                    quaternion.identity();
                    scale.set(1, 1, 1);
                    matrix.compose(position, quaternion, scale);
                    acousticIM.setMatrixAt(acousticIdx++, matrix);
                }
                
                if (distToCenter < oculusRadius) {
                    const zIntersect = Math.sqrt(Math.pow(oculusRadius, 2) - Math.pow(xPos, 2));
                    const length1 = (ceilingLength / 2) - zIntersect;
                    if (length1 > 0.1) {
                        position.set(xPos, yPos + slatHeight/2, - (ceilingLength/2 + zIntersect) / 2);
                        quaternion.identity();
                        scale.set(0.06, slatHeight, length1);
                        matrix.compose(position, quaternion, scale);
                        slatIM.setMatrixAt(slatIdx++, matrix);
                    }
                    const length2 = (ceilingLength / 2) - zIntersect;
                    if (length2 > 0.1) {
                        position.set(xPos, yPos + slatHeight/2, (ceilingLength/2 + zIntersect) / 2);
                        quaternion.identity();
                        scale.set(0.06, slatHeight, length2);
                        matrix.compose(position, quaternion, scale);
                        slatIM.setMatrixAt(slatIdx++, matrix);
                    }
                } else {
                    position.set(xPos, yPos + slatHeight/2, 0);
                    quaternion.identity();
                    scale.set(0.06, slatHeight, ceilingLength);
                    matrix.compose(position, quaternion, scale);
                    slatIM.setMatrixAt(slatIdx++, matrix);
                    
                    if (i % Math.max(2, Math.floor(3.5/slatSpacing)) === 0) {
                        position.set(xPos, yPos - 0.01, 0);
                        quaternion.identity();
                        scale.set(0.02, 0.02, ceilingLength - 4);
                        matrix.compose(position, quaternion, scale);
                        ledIM.setMatrixAt(ledIdx++, matrix);
                        
                        const pointLight = new THREE.PointLight(0xfff6ee, 0.2, 8);
                        pointLight.position.set(xPos, yPos - 0.5, 0);
                        ceilingGroup.add(pointLight);
                    }
                }
            }
            
            acousticIM.count = acousticIdx;
            slatIM.count = slatIdx;
            ledIM.count = ledIdx;

            // Notify renderer
            beamIM.instanceMatrix.needsUpdate = true;
            rodIM.instanceMatrix.needsUpdate = true;
            if(acousticIdx > 0) acousticIM.instanceMatrix.needsUpdate = true;
            if(slatIdx > 0) slatIM.instanceMatrix.needsUpdate = true;
            if(ledIdx > 0) ledIM.instanceMatrix.needsUpdate = true;

            ceilingGroup.add(beamIM);
            ceilingGroup.add(rodIM);
            if (acousticIdx > 0) ceilingGroup.add(acousticIM);
            if (slatIdx > 0) ceilingGroup.add(slatIM);
            if (ledIdx > 0) ceilingGroup.add(ledIM);
        };

        rebuildCeilingFunc(); // Initial build

        // 2b. Central Sky-Oculus (Skylight) and Parametric Chandelier
        const oculusGroup = new THREE.Group();
        oculusGroup.position.set(0, 12.0, -2);
        
        const oculusRingGeo = new THREE.TorusGeometry(5.2, 0.4, 16, 64);
        const oculusRing = new THREE.Mesh(oculusRingGeo, lightWoodMat);
        oculusRing.rotation.x = Math.PI / 2;
        oculusGroup.add(oculusRing);
        
        const skyGlowGeo = new THREE.CylinderGeometry(5.0, 5.0, 0.1, 64);
        const skyGlowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 });
        const skyGlow = new THREE.Mesh(skyGlowGeo, skyGlowMat);
        skyGlow.position.y = 0.1;
        oculusGroup.add(skyGlow);

        // Parametric Chandelier
        const numChandelierRibs = 48;
        for (let i = 0; i < numChandelierRibs; i++) {
            const angle = (i / numChandelierRibs) * Math.PI * 2;
            const ribGeo = new THREE.BoxGeometry(0.04, 3.5, 0.12);
            const rib = new THREE.Mesh(ribGeo, lightWoodMat);
            
            const radius = 2.0; 
            rib.position.set(Math.cos(angle)*radius, -1.0, Math.sin(angle)*radius);
            
            rib.rotation.y = -angle;
            rib.rotation.x = Math.PI / 8; // Lean outward
            rib.rotation.z = Math.PI / 16; // Slight twist
            
            rib.castShadow = true;
            oculusGroup.add(rib);
        }
        
        architectureGroup.add(oculusGroup);

        // 3. Wooden Support Pillars with Foothill Uplights
        const pillarGeo = new THREE.BoxGeometry(0.8, 12, 0.8);
        const pillarPositions = [
            [-30, 6, -18], [30, 6, -18],
            [-30, 6, 15], [30, 6, 15],
            [-12, 6, 15], [12, 6, 15]
        ];
        pillarPositions.forEach(pos => {
            const pillar = new THREE.Mesh(pillarGeo, lightWoodMat);
            pillar.position.set(pos[0], pos[1], pos[2]);
            pillar.castShadow = true; pillar.receiveShadow = true;
            architectureGroup.add(pillar);

            const collarGeo = new THREE.CylinderGeometry(0.52, 0.52, 0.12, 16);
            const collarMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4, metalness: 0.8 });
            const collar = new THREE.Mesh(collarGeo, collarMat);
            collar.position.set(pos[0], 0.06, pos[2]);
            collar.castShadow = true; collar.receiveShadow = true;
            architectureGroup.add(collar);

            const warmUplight = new THREE.PointLight(0xffd5aa, 0.85, 12, 1.8);
            warmUplight.position.set(pos[0], 0.2, pos[2]);
            // PointLights with shadows are highly costly and deplete WebGL texture units, so we let accent lights bypass shadow calculation.
            architectureGroup.add(warmUplight);
        });

        // 4. Bioclimatic Parametric Timber Screen
        const numRibs = 80;
        
        // Left Bioclimatic Screen
        for (let i = 0; i < numRibs; i++) {
            const angle = (i / numRibs) * Math.PI * 0.5;
            const radius = 12 + Math.sin(i * 0.15) * 1.5; 
            const cx = -20;
            const cz = -10;
            
            // Computionally driven porosity using interference
            const interference = Math.sin(i * 0.2) * Math.cos(i * 0.08);
            const ribWidth = 0.04 + Math.abs(interference) * 0.18;
            const ribAngle = -angle + interference * Math.PI / 6;
            
            const ribGeo = new THREE.BoxGeometry(ribWidth, 4.5, 0.4);
            const rib = new THREE.Mesh(ribGeo, lightWoodMat);
            rib.position.set(cx + Math.cos(angle)*radius, 2.25, cz + Math.sin(angle)*radius);
            rib.rotation.y = ribAngle;
            rib.receiveShadow = true; rib.castShadow = true;
            architectureGroup.add(rib);
        }

        // Right Bioclimatic Screen
        for (let i = 0; i < numRibs; i++) {
            const angle = Math.PI - (i / numRibs) * Math.PI * 0.5;
            const radius = 12 + Math.sin(i * 0.15) * 1.5;
            const cx = 20;
            const cz = -10;
            
            const interference = Math.sin(i * 0.2) * Math.cos(i * 0.08);
            const ribWidth = 0.04 + Math.abs(interference) * 0.18;
            const ribAngle = -angle - interference * Math.PI / 6;
            
            const ribGeo = new THREE.BoxGeometry(ribWidth, 4.5, 0.4);
            const rib = new THREE.Mesh(ribGeo, lightWoodMat);
            rib.position.set(cx + Math.cos(angle)*radius, 2.25, cz + Math.sin(angle)*radius);
            rib.rotation.y = ribAngle;
            rib.receiveShadow = true; rib.castShadow = true;
            architectureGroup.add(rib);
        }

        // 5. Topographic Slatted Seating
        const benchPoints = [
            { x: -10, z: -4, rot: Math.PI / 4 },
            { x: 10, z: -4, rot: -Math.PI / 4 },
            { x: 0, z: 8, rot: 0 }
        ];

        const benchesGroup = new THREE.Group();
        architectureGroup.add(benchesGroup);

        const createTopographicBench = () => {
            const benchGroup = new THREE.Group();
            const numRibs = Math.floor(36 * parametricState.benchDensity);
            const benchWidth = 3.6;
            const spacing = benchWidth / Math.max(1, numRibs);

            for (let i = 0; i < numRibs; i++) {
                const xOffset = (i - numRibs/2) * spacing;
                const t = i / Math.max(1, (numRibs - 1)); // 0 to 1
                
                // Ergonomic wave: high at ends, dipping into a seat in the middle
                const waveHeight = (Math.cos((t - 0.5) * Math.PI * 2) * -0.5 + 0.5) * parametricState.benchWave; // 0 at edges, 1 in center => dip
                
                // Seat profile height variation
                const height = 0.45 - waveHeight * 0.1; 
                const depth = (0.8 + waveHeight * 0.2) * parametricState.benchDepth; // Widen in the middle
                
                const profileGeo = new THREE.BoxGeometry(spacing * 0.7, height, depth);
                const rib = new THREE.Mesh(profileGeo, lightWoodMat);
                
                rib.position.set(xOffset, height/2, Math.sin((t-0.5)*Math.PI) * 0.1); 
                rib.castShadow = true; rib.receiveShadow = true;
                benchGroup.add(rib);
                
                // Add a concrete base rail connecting the slats
                if (i === 0 || i === numRibs - 1) {
                    const solidBase = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.3, 0.6), rawConcreteMat);
                    solidBase.position.set(xOffset, 0.15, 0);
                    solidBase.castShadow = true; solidBase.receiveShadow = true;
                    benchGroup.add(solidBase);
                }
            }
            
            // Central concrete spine
            const spineGeo = new THREE.BoxGeometry(benchWidth, 0.1, 0.4);
            const spine = new THREE.Mesh(spineGeo, rawConcreteMat);
            spine.position.y = 0.2;
            spine.castShadow = true; spine.receiveShadow = true;
            benchGroup.add(spine);
            
            return benchGroup;
        };

        rebuildBenchFunc = () => {
            for (let i = benchesGroup.children.length - 1; i >= 0; i--) {
                const bench = benchesGroup.children[i];
                bench.traverse((child) => {
                    if (child.geometry) child.geometry.dispose();
                });
                benchesGroup.remove(bench);
            }
            
            benchPoints.forEach(pos => {
                const bench = createTopographicBench();
                bench.position.set(pos.x, 0, pos.z);
                bench.rotation.y = pos.rot;
                benchesGroup.add(bench);
            });
        };
        rebuildBenchFunc();
        
        rebuildPedestalFunc = () => {
            exhibits.forEach(ex => {
                if (ex.userData.parentExhibit && ex.userData.parentExhibit.userData.rebuildPedestal) {
                    ex.userData.parentExhibit.userData.rebuildPedestal();
                }
            });
        };

        // 6. Perimeter Water Channel & Reflection Pool
        const poolGroup = new THREE.Group();
        poolGroup.position.set(0, 0.01, -12);
        
        const rimGeo = new THREE.BoxGeometry(45, 0.15, 10);
        const rimMat = new THREE.MeshStandardMaterial({
            color: 0x3e4244,
            roughness: 0.7,
            metalness: 0.1,
            map: concreteTex.map,
            bumpMap: concreteTex.bumpMap,
            bumpScale: 0.04
        });
        const rim = new THREE.Mesh(rimGeo, rimMat);
        rim.receiveShadow = true; rim.castShadow = true;
        poolGroup.add(rim);
        
        const waterGeo = new THREE.PlaneGeometry(44.6, 9.6);
        waterMat = new THREE.MeshStandardMaterial({
            color: 0x05080c,
            roughness: 0.08,
            metalness: 0.95,
            transparent: true,
            opacity: 0.9
        });
        
        waterNormalMap = createWaterNormalMap();
        waterNormalMap.repeat.set(4, 2);
        waterMat.normalMap = waterNormalMap;
        waterMat.normalScale.set(0.18, 0.18);
        
        const water = new THREE.Mesh(waterGeo, waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.y = 0.08;
        poolGroup.add(water);
        
        architectureGroup.add(poolGroup);
        
        // 6b. Ultra-Thin Floating Cantilevered Walkways over Water
        const walkwayGroup = new THREE.Group();
        walkwayGroup.position.set(0, 0.25, -12);
        
        const pathGeo = new THREE.BoxGeometry(4.5, 0.03, 10.4); 
        const pathMat = new THREE.MeshStandardMaterial({
            color: 0xdbdcdc, 
            roughness: 0.85,
            metalness: 0.1,
            bumpMap: concreteTex.bumpMap,
            bumpScale: 0.015
        });
        
        const path1 = new THREE.Mesh(pathGeo, pathMat);
        path1.position.set(-8, 0, 0);
        path1.castShadow = true; path1.receiveShadow = true;
        walkwayGroup.add(path1);
        
        const path2 = new THREE.Mesh(pathGeo, pathMat);
        path2.position.set(8, 0, 0);
        path2.castShadow = true; path2.receiveShadow = true;
        walkwayGroup.add(path2);

        architectureGroup.add(walkwayGroup);

        // 7. Biophilic Nordic Birch Potted Trees
        const plant1 = createProceduralPottedTree();
        plant1.position.set(-15, 0, 10);
        architectureGroup.add(plant1);

        const plant2 = createProceduralPottedTree();
        plant2.position.set(15, 0, 10);
        architectureGroup.add(plant2);

        
        // --- DIEGETIC UI: FOCUS MODE PEDESTAL ---
        const focusPedestalGroup = new THREE.Group();
        focusPedestalGroup.position.set(0, 0, -4); // Place center-ish
        
        // Pedestal Body
        const pGeo = new THREE.CylinderGeometry(0.3, 0.4, 0.9, 32);
        const pMesh = new THREE.Mesh(pGeo, rawConcreteMat);
        pMesh.position.y = 0.45;
        pMesh.castShadow = true; pMesh.receiveShadow = true;
        focusPedestalGroup.add(pMesh);
        
        // Angled Placard (20 degrees)
        const placardGroup = new THREE.Group();
        placardGroup.position.set(0, 0.95, 0.2); // 1.2m away would be further, but we place it attached for now
        placardGroup.rotation.x = -Math.PI / 9; // ~20 deg tilt up
        
        const placardGeo = new THREE.BoxGeometry(0.6, 0.3, 0.02);
        const placardMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.8 });
        const placardMesh = new THREE.Mesh(placardGeo, placardMat);
        placardGroup.add(placardMesh);
        
        // SDF Text
        const titleText = new Text();
        titleText.text = "FOCUS MODE";
        titleText.fontSize = 0.04;
        titleText.color = 0xffffff;
        titleText.position.set(-0.25, 0.08, 0.015);
        titleText.sync();
        placardGroup.add(titleText);
        
        const descText = new Text();
        descText.text = "Engage to isolate sensory environment\nand activate architectural lighting.";
        descText.fontSize = 0.018;
        descText.color = 0xaaaaaa;
        descText.position.set(-0.25, 0.02, 0.015);
        descText.sync();
        placardGroup.add(descText);
        
        // Physical Button
        const buttonGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.04, 32);
        const buttonMat = new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0x220000 });
        const buttonMesh = new THREE.Mesh(buttonGeo, buttonMat);
        buttonMesh.rotation.x = Math.PI / 2;
        buttonMesh.position.set(0, -0.06, 0.015);
        
        // Store states for interaction
        buttonMesh.userData = {
            isButton: true,
            baseZ: 0.015,
            pressedZ: -0.005,
            action: () => {
                toggleFocusMode();
                // Haptic handled in interaction
            }
        };
        placardGroup.add(buttonMesh);
        diegeticButtons.push(buttonMesh);
        
        focusPedestalGroup.add(placardGroup);
        scene.add(focusPedestalGroup);
        // ----------------------------------------
    scene.add(architectureGroup);
// --- STEP 3: AUDIO-REACTIVE HERO EXHIBIT ---
        const heroGroup = new THREE.Group();
        heroGroup.position.set(0, 1.5, -8);
        
        const heroUniforms = {
            uTime: { value: 0 },
            uAudioFreq: { value: 0 },
            uColor: { value: new THREE.Color(0x00aaff) }
        };
        
        const heroMat = new THREE.ShaderMaterial({
            uniforms: heroUniforms,
            vertexShader: `
                uniform float uTime;
                uniform float uAudioFreq;
                varying vec2 vUv;
                varying vec3 vNormal;
                varying float vDisplacement;
                
                // Simplex noise function can be complex, let's use a simple sine based displacement
                void main() {
                    vUv = uv;
                    vNormal = normal;
                    
                    float noise = sin(position.x * 5.0 + uTime) * cos(position.y * 5.0 + uTime) * sin(position.z * 5.0 + uTime);
                    float displacement = noise * uAudioFreq * 0.5;
                    vDisplacement = displacement;
                    
                    vec3 newPosition = position + normal * displacement;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
                }
            `,
            fragmentShader: `
                uniform float uTime;
                uniform vec3 uColor;
                varying vec2 vUv;
                varying vec3 vNormal;
                varying float vDisplacement;
                
                void main() {
                    // Fresnel effect
                    vec3 viewDir = normalize(cameraPosition - vNormal);
                    float fresnel = dot(viewDir, vNormal);
                    fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
                    fresnel = pow(fresnel, 3.0);
                    
                    vec3 baseColor = uColor + vec3(vDisplacement * 2.0);
                    vec3 finalColor = mix(baseColor, vec3(1.0), fresnel);
                    
                    gl_FragColor = vec4(finalColor, 0.9);
                }
            `,
            transparent: true,
            wireframe: true // Looks cool for computational geometry
        });
        
        const heroGeo = new THREE.IcosahedronGeometry(0.8, 16);
        const heroMesh = new THREE.Mesh(heroGeo, heroMat);
        heroGroup.add(heroMesh);
        
        // Add a base pedestal for it
        const hPedestalGeo = new THREE.CylinderGeometry(0.4, 0.5, 1.0, 32);
        const hPedestal = new THREE.Mesh(hPedestalGeo, rawConcreteMat);
        hPedestal.position.y = -1.0; // from 1.5 down
        hPedestal.castShadow = true; hPedestal.receiveShadow = true;
        heroGroup.add(hPedestal);
        
        scene.add(heroGroup);
        // ------------------------------------------
        // ------------------------------------------

        const gridHelper = new THREE.GridHelper(100, 150, 0x00ffaa, 0x004455);
        gridHelper.position.y = 0.01;
        gridHelper.material.opacity = 0.04; // Subtler grid against physical architecture
        gridHelper.material.transparent = true;
        gridHelper.material.depthWrite = false;
        scene.add(gridHelper);
    }

    function buildMainSpatialTitle() {
        const pr = 3;
        const canvas = document.createElement('canvas'); canvas.width = 1024 * pr; canvas.height = 512 * pr;
        const ctx = canvas.getContext('2d');
        ctx.scale(pr, pr);
        ctx.clearRect(0, 0, 1024, 512);
        ctx.fillStyle = '#ffffff'; ctx.font = '300 68px "Inter", sans-serif'; ctx.fillText("Personal Museum", 0, 100);
        ctx.fillStyle = '#a0aab5'; ctx.font = '400 28px "Inter", sans-serif';
        wrapText(ctx, "Gaze and click UI panels to inspect. Every spatial panel synthesizes live 3D localized audio with triple-slider modular registers.", 0, 160, 900, 42);
        
        const texture = new THREE.CanvasTexture(canvas); texture.minFilter = THREE.LinearFilter;
        const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.5), mat);
        mesh.position.set(-3.6, 3.4, -3.8); mesh.rotation.y = Math.PI / 7;
        scene.add(mesh);
    }

    function buildGalleryControlPanel() {
        const w = 480, h = 320;
        const pr = 3;
        const canvas = document.createElement('canvas'); canvas.width = w * pr; canvas.height = h * pr;
        const texture = new THREE.CanvasTexture(canvas); 
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;

        const uiData = {
            isThemePanel: true,
            title: "ATMOSPHERE", description: "Select gallery climate",
            canvas: canvas, ctx: canvas.getContext('2d'), texture: texture,
            width: w, height: h, pixelRatio: pr, pointer: { x: w/2, y: h/2, active: false }, hoveredItemId: null,
            interactables: [
                { type: 'button', id: 'theme-morning', x: 40, y: 150, w: 400, h: 48, text: 'Scandi Morning' },
                { type: 'button', id: 'theme-spotlight', x: 40, y: 210, w: 400, h: 48, text: 'Gallery Spotlight' },
                { type: 'button', id: 'theme-night', x: 40, y: 270, w: 400, h: 48, text: 'Night Exhibition' }
            ]
        };

        const panel = new THREE.Mesh(
            new THREE.PlaneGeometry(0.8, 0.5),
            new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide })
        );
        panel.position.set(-4.5, 1.4, -1.8);
        panel.rotation.y = Math.PI / 6;
        panel.userData = uiData;
        drawUIPanel(panel, 0); 
        scene.add(panel); 
        interactablePanels.push(panel);
    }

    function initParticleSystem() {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(PARTICLE_COUNT * 3); 
        const colors = new Float32Array(PARTICLE_COUNT * 3);
        const sizes = new Float32Array(PARTICLE_COUNT);
        const vels = [];
        const phases = [];

        const colorTheme1 = new THREE.Color(0x00ffaa);
        const colorTheme2 = new THREE.Color(0x0088ff);

        for(let i=0; i<PARTICLE_COUNT; i++) { 
            pos[i*3] = (Math.random() - 0.5) * 20; 
            pos[i*3+1] = Math.random() * 8; 
            pos[i*3+2] = (Math.random() - 0.5) * 20; 
            
            const mixRatio = Math.random();
            colors[i*3] = colorTheme1.r * mixRatio + colorTheme2.r * (1 - mixRatio);
            colors[i*3+1] = colorTheme1.g * mixRatio + colorTheme2.g * (1 - mixRatio);
            colors[i*3+2] = colorTheme1.b * mixRatio + colorTheme2.b * (1 - mixRatio);

            sizes[i] = Math.random() * 0.06 + 0.02;
            vels.push(new THREE.Vector3()); 
            phases.push(new THREE.Vector3(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2));
        }
        
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0.0 },
                uAudioLevel: { value: 0.0 }
            },
            vertexShader: `
                attribute float size;
                attribute vec3 color;
                varying vec3 vColor;
                uniform float uTime;
                uniform float uAudioLevel;
                void main() {
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    float sparkle = sin(uTime * 5.0 + position.x * 10.0) * 0.5 + 0.5;
                    gl_PointSize = size * (300.0 / -mvPosition.z) * (1.0 + uAudioLevel * 2.0 * sparkle);
                }
            `,
            fragmentShader: `
                varying vec3 vColor;
                void main() {
                    float dist = length(gl_PointCoord - vec2(0.5));
                    if (dist > 0.5) discard;
                    float alpha = smoothstep(0.5, 0.1, dist);
                    gl_FragColor = vec4(vColor * 1.5, alpha * 0.8);
                }
            `,
            transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
        });

        particleSystem = new THREE.Points(geo, mat); 
        particleSystem.userData.vels = vels; 
        particleSystem.userData.phases = phases;
        scene.add(particleSystem);
    }

    function triggerParticleBurst(origin, intensity = 1.0) {
        if(!particleSystem) return;
        const pos = particleSystem.geometry.attributes.position.array;
        const vels = particleSystem.userData.vels;
        const count = Math.floor((PARTICLE_COUNT * 0.4) * intensity);
        for(let i=0; i<count; i++) {
            pos[i*3] = origin.x + (Math.random() - 0.5) * 0.8;
            pos[i*3+1] = origin.y + (Math.random() - 0.5) * 0.8;
            pos[i*3+2] = origin.z + (Math.random() - 0.5) * 0.8;
            vels[i].set((Math.random() - 0.5) * 0.15, Math.random() * 0.2 * intensity, (Math.random() - 0.5) * 0.15);
        }
        particleSystem.geometry.attributes.position.needsUpdate = true;
    }

    function updateParticles(inspectedArtifact, timeSec) {
        if(!particleSystem) return;
        const pos = particleSystem.geometry.attributes.position.array;
        const vels = particleSystem.userData.vels;
        const phases = particleSystem.userData.phases;
        
        let currentDb = 0.0;
        let freqs = null;
        if (currentActiveAnalyser && inspectedArtifact && inspectedArtifact.userData.audioData) {
             currentDb = Tone.dbToGain(inspectedArtifact.userData.audioData.meter.getValue());
             freqs = inspectedArtifact.userData.audioData.fft.getValue();
        }

        if (inspectedArtifact) {
            inspectedArtifact.getWorldPosition(_tempTarget);
        }

        for(let i=0; i<PARTICLE_COUNT; i++) {
            const idx = i * 3;
            pos[idx] += vels[i].x; 
            pos[idx+1] += vels[i].y; 
            pos[idx+2] += vels[i].z;
            
            let bandLevel = currentDb;
            if (freqs) {
                const bandIndex = Math.floor((i / PARTICLE_COUNT) * freqs.length);
                bandLevel = Math.max(0.0, Tone.dbToGain(freqs[bandIndex] || -100) * 4.0);
            }
            
            if (inspectedArtifact) {
                _tempPPos.set(pos[idx], pos[idx+1], pos[idx+2]);
                _tempDir.subVectors(_tempTarget, _tempPPos);
                const dist = _tempDir.length();
                
                if (dist > 0.05) {
                    _tempDir.normalize();
                    _tempSwirl.crossVectors(_tempDir, _tempUp).multiplyScalar(0.04 + bandLevel * 0.08);
                    vels[i].x += _tempDir.x * (0.005 + bandLevel * 0.02) + _tempSwirl.x;
                    vels[i].y += _tempDir.y * (0.005 + bandLevel * 0.02) + _tempSwirl.y;
                    vels[i].z += _tempDir.z * (0.005 + bandLevel * 0.02) + _tempSwirl.z;
                }
                vels[i].multiplyScalar(0.92 - Math.min(0.1, bandLevel));
            } else {
                const pX = pos[idx]; const pY = pos[idx+1]; const pZ = pos[idx+2];
                const flowX = Math.sin(pZ * 0.2 + timeSec + phases[i].x) * 0.001;
                const flowY = Math.cos(pX * 0.3 + timeSec * 0.8 + phases[i].y) * 0.0005;
                const flowZ = Math.sin(pY * 0.2 + timeSec * 1.2 + phases[i].z) * 0.001;
                
                vels[i].x += flowX;
                vels[i].y += flowY;
                vels[i].z += flowZ;
                vels[i].y -= 0.0002;
                vels[i].multiplyScalar(0.98); 
            }

            if (pos[idx+1] < 0) {
                pos[idx+1] = 8 + Math.random() * 2;
                pos[idx] = (Math.random() - 0.5) * 20;
                pos[idx+2] = (Math.random() - 0.5) * 20;
                vels[i].set(0,0,0);
            } else if (pos[idx+1] > 12) {
                pos[idx+1] = 0;
            }
        }
        
        particleSystem.geometry.attributes.position.needsUpdate = true;
        if(particleSystem.material.uniforms) {
            particleSystem.material.uniforms.uTime.value = timeSec;
            particleSystem.material.uniforms.uAudioLevel.value += (currentDb - particleSystem.material.uniforms.uAudioLevel.value) * 0.1;
        }
    }

    function createOrreryArtifact() {
        const group = new THREE.Group();
        const sun = new THREE.Mesh(new THREE.SphereGeometry(0.12, 32, 32), new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffaa00, emissiveIntensity: 2 }));
        group.add(sun);
        const rings = [
            { radius: 0.25, speed: 0.02, size: 0.03, color: 0x00ffaa },
            { radius: 0.45, speed: 0.01, size: 0.05, color: 0xff5555 },
            { radius: 0.65, speed: 0.006, size: 0.02, color: 0xcccccc }
        ];
        group.userData.planets = [];
        rings.forEach(data => {
            const path = new THREE.Mesh(new THREE.RingGeometry(data.radius - 0.003, data.radius + 0.003, 64), new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide, transparent: true, opacity: 0.5 }));
            path.rotation.x = Math.PI / 2; group.add(path);
            const pivot = new THREE.Group();
            const planet = new THREE.Mesh(new THREE.SphereGeometry(data.size, 32, 32), new THREE.MeshStandardMaterial({ color: data.color, roughness: 0.3, metalness: 0.2 }));
            planet.position.x = data.radius; planet.castShadow = true;
            pivot.add(planet); group.add(pivot);
            group.userData.planets.push({ pivot: pivot, speed: data.speed });
        });
        group.userData.animate = function(speedMult = 1.0) {
            if (group.userData.isRotating) {
                group.userData.planets.forEach(p => { p.pivot.rotation.y += p.speed * speedMult; });
                sun.rotation.y += 0.005 * speedMult;
            }
        };
        return group;
    }

    function createGenerativeSwarm() {
        const group = new THREE.Group();
        const instanceCount = 5000;
        
        // We use a small plane geometry layered to look like fluid particles or ribbons
        const geometry = new THREE.PlaneGeometry(0.015, 0.015);
        
        // Pastel colors for the interference wave look
        const material = new THREE.MeshBasicMaterial({ 
            color: 0xffffff,
            transparent: true,
            opacity: 0.6,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });
        
        const instancedMesh = new THREE.InstancedMesh(geometry, material, instanceCount);
        
        const dummy = new THREE.Object3D();
        const baseOffset = [];
        const colors = [];
        const color = new THREE.Color();
        
        // Create an organic distribution
        for (let i = 0; i < instanceCount; i++) {
            // Assign a normalized coordinate for math positioning (e.g. u, v of a surface)
            const u = Math.random();
            const v = Math.random();
            const w = Math.random();
            
            baseOffset.push({ u, v, w });
            
            // Generate pastel colors (pink, light blue, soft purple)
            const hue = 0.55 + Math.random() * 0.35; // 0.55 to 0.9 (cyan to pink)
            color.setHSL(hue, 0.8, 0.6);
            colors.push(color.r, color.g, color.b);
            
            instancedMesh.setColorAt(i, color);
            
            // Initial matrix
            dummy.position.set(0, 0, 0);
            dummy.updateMatrix();
            instancedMesh.setMatrixAt(i, dummy.matrix);
        }
        
        instancedMesh.instanceColor.needsUpdate = true;
        group.add(instancedMesh);
        
        group.userData.animate = (speedMultiplier) => {
            const timeSec = performance.now() * 0.0005;
            const freqVal = group.parent && group.parent.userData.sliders && group.parent.userData.sliders.freq ? group.parent.userData.sliders.freq : 0.5;
            let audioAmp = 0;
            
            if (group.parent && group.parent.userData.audioData && group.parent.userData.audioData.meter) {
                audioAmp = Math.max(0, Tone.dbToGain(group.parent.userData.audioData.meter.getValue()));
            }
            
            const pulse = 1.0 + audioAmp * 3.0;
            const complexity = 2.0 + freqVal * 4.0;
            
            for (let i = 0; i < instanceCount; i++) {
                const off = baseOffset[i];
                
                // Computational art: Clifford/Clifford-like strange attractor mixed with a parametric wave
                // We use u, v, w to drive parametric equations
                const t = timeSec * speedMultiplier + off.w * Math.PI * 2;
                
                // Base torus knot / Mobius strip math
                const r = 0.3 + 0.2 * Math.sin(off.u * Math.PI * 2 + t);
                const angle1 = off.u * Math.PI * 2 * complexity + t * 0.5;
                const angle2 = off.v * Math.PI * 2 + t * 0.3;
                
                let x = Math.cos(angle1) * (0.4 + r * Math.cos(angle2));
                let y = Math.sin(angle1) * (0.4 + r * Math.cos(angle2));
                let z = r * Math.sin(angle2);
                
                // Add fluid interference waves
                const interference = Math.sin(x * 5.0 - t * 2.0) * Math.cos(y * 5.0 + t) * Math.sin(z * 5.0);
                const flow = interference * 0.2 * pulse;
                
                x += Math.sin(off.v * Math.PI * 10 + t) * flow;
                y += Math.cos(off.u * Math.PI * 10 - t) * flow;
                z += Math.sin((off.u + off.v) * Math.PI * 10) * flow;
                
                dummy.position.set(x, y, z);
                
                // Orient the particles slightly along their movement or randomly
                dummy.rotation.x = t + x * 2;
                dummy.rotation.y = t * 0.5 + y * 2;
                dummy.rotation.z = z * 2;
                
                // Scale based on audio pulse and interference
                const scale = 0.5 + Math.abs(interference) * 1.5 + audioAmp * 2.0;
                dummy.scale.setScalar(scale);
                
                dummy.updateMatrix();
                instancedMesh.setMatrixAt(i, dummy.matrix);
            }
            
            instancedMesh.instanceMatrix.needsUpdate = true;
        };
        
        return group;
    }

    function createProceduralRelic() {
        const group = new THREE.Group();
        
        const uniforms = {
            time: { value: 0 },
            audioAmp: { value: 0 },
            complexity: { value: 1.0 }
        };
        
        const vertexShader = `
            uniform float time;
            uniform float audioAmp;
            uniform float complexity;
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vPosition;
            
            // Simplex noise function
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
            vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
            float snoise(vec3 v) {
                const vec2 C = vec2(1.0/6.0, 1.0/3.0);
                const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
                vec3 i  = floor(v + dot(v, C.yyy));
                vec3 x0 = v - i + dot(i, C.xxx);
                vec3 g = step(x0.yzx, x0.xyz);
                vec3 l = 1.0 - g;
                vec3 i1 = min(g.xyz, l.zxy);
                vec3 i2 = max(g.xyz, l.zxy);
                vec3 x1 = x0 - i1 + C.xxx;
                vec3 x2 = x0 - i2 + C.yyy;
                vec3 x3 = x0 - D.yyy;
                i = mod289(i);
                vec4 p = permute(permute(permute(
                            i.z + vec4(0.0, i1.z, i2.z, 1.0))
                          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
                float n_ = 0.142857142857;
                vec3 ns = n_ * D.wyz - D.xzx;
                vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
                vec4 x_ = floor(j * ns.z);
                vec4 y_ = floor(j - 7.0 * x_);
                vec4 x = x_ *ns.x + ns.yyyy;
                vec4 y = y_ *ns.x + ns.yyyy;
                vec4 h = 1.0 - abs(x) - abs(y);
                vec4 b0 = vec4(x.xy, y.xy);
                vec4 b1 = vec4(x.zw, y.zw);
                vec4 s0 = floor(b0)*2.0 + 1.0;
                vec4 s1 = floor(b1)*2.0 + 1.0;
                vec4 sh = -step(h, vec4(0.0));
                vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
                vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
                vec3 p0 = vec3(a0.xy,h.x);
                vec3 p1 = vec3(a0.zw,h.y);
                vec3 p2 = vec3(a1.xy,h.z);
                vec3 p3 = vec3(a1.zw,h.w);
                vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
                p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
                vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                m = m * m; return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
            }
            
            void main() {
                vUv = uv;
                vNormal = normal;
                
                // Audio-reactive displacement
                float noise = snoise(position * (3.0 + complexity * 2.0) + time);
                vec3 displacedPosition = position + normal * noise * (0.1 + audioAmp * 0.3);
                
                vPosition = displacedPosition;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(displacedPosition, 1.0);
            }
        `;
        
        const fragmentShader = `
            uniform float time;
            uniform float audioAmp;
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vPosition;
            
            void main() {
                // Iridescent effect based on normal and view vector
                vec3 viewDir = normalize(cameraPosition - vPosition);
                float fresnel = dot(viewDir, vNormal);
                fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
                fresnel = pow(fresnel, 3.0);
                
                // Color shifting based on time, position and audio
                vec3 color1 = vec3(0.0, 1.0, 0.66); // Teal #00ffaa
                vec3 color2 = vec3(0.8, 0.0, 1.0);  // Purple
                vec3 color3 = vec3(0.0, 0.4, 1.0);  // Blue
                
                float mix1 = sin(vPosition.y * 10.0 + time * 2.0) * 0.5 + 0.5;
                float mix2 = cos(vPosition.x * 8.0 - time) * 0.5 + 0.5;
                
                vec3 baseColor = mix(color1, mix(color2, color3, mix2), mix1);
                
                // Boost brightness with audio
                baseColor += baseColor * audioAmp * 2.0;
                
                // Add fresnel glow
                vec3 finalColor = baseColor + vec3(fresnel * 1.5);
                
                // scanlines
                float scanline = sin(vUv.y * 100.0 - time * 10.0) * 0.5 + 0.5;
                finalColor -= scanline * 0.1;
                
                gl_FragColor = vec4(finalColor, 0.85);
            }
        `;
        
        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms,
            transparent: true,
            side: THREE.DoubleSide
        });
        
        // Use a highly detailed geometry for vertex displacement
        const geometry = new THREE.IcosahedronGeometry(0.3, 32); // High subdivision
        const mesh = new THREE.Mesh(geometry, material);
        group.add(mesh);
        
        // Add an inner glowing core
        const coreMat = new THREE.MeshStandardMaterial({ 
            color: 0xffffff, emissive: 0x00ffaa, emissiveIntensity: 2.0, wireframe: true 
        });
        const coreGeo = new THREE.OctahedronGeometry(0.15, 2);
        const core = new THREE.Mesh(coreGeo, coreMat);
        group.add(core);

        // Surrounding orbital rings
        const ringMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.1, metalness: 1.0 });
        const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.015, 8, 64), ringMat);
        ring1.rotation.y = Math.PI/4;
        group.add(ring1);
        
        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.01, 8, 64), ringMat);
        ring2.rotation.x = Math.PI/3;
        group.add(ring2);
        
        // Bind animation
        group.userData.animate = (speedMultiplier) => {
            const timeSec = performance.now() * 0.001;
            const freqVal = group.parent && group.parent.userData.sliders && group.parent.userData.sliders.freq ? group.parent.userData.sliders.freq : 0.5;
            
            let audioAmp = 0;
            if (group.parent && group.parent.userData.audioData && group.parent.userData.audioData.meter) {
                audioAmp = Math.max(0, Tone.dbToGain(group.parent.userData.audioData.meter.getValue()));
            }
            
            uniforms.time.value = timeSec * speedMultiplier;
            uniforms.audioAmp.value += (audioAmp - uniforms.audioAmp.value) * 0.1; // Smooth interpolate
            uniforms.complexity.value = freqVal;
            
            core.rotation.y = timeSec * 2.0 * speedMultiplier;
            core.rotation.x = timeSec * 1.5 * speedMultiplier;
            core.scale.setScalar(1.0 + audioAmp * 0.5);
            
            ring1.rotation.z = timeSec * 0.5 * speedMultiplier;
            ring1.rotation.x = Math.PI/4 + Math.sin(timeSec) * 0.2;
            
            ring2.rotation.y = timeSec * -0.3 * speedMultiplier;
            ring2.rotation.z = Math.PI/3 + Math.cos(timeSec * 0.8) * 0.2;
        };

        return group;
    }

    function loadGLTFArtifact(url, scale, fallbackGenerator) {
        const group = new THREE.Group();
        const pivot = new THREE.Group(); group.add(pivot);
        group.userData.animate = function(speedMult = 1.0) {
            if (group.userData.isRotating) {
                if (group.userData.model) {
                    group.userData.model.rotation.y += 0.005 * speedMult;
                } else if (group.userData.fallback) {
                    group.userData.fallback.rotation.y += 0.005 * speedMult;
                    group.userData.fallback.rotation.x += 0.002 * speedMult;
                }
            }
        };
        gltfLoader.load(url, (gltf) => {
            const model = gltf.scene; model.scale.setScalar(scale);
            const box = new THREE.Box3().setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            model.position.sub(center); 
            model.traverse((child) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; child.frustumCulled = false; } });
            pivot.add(model); group.userData.model = pivot;
        }, undefined, (err) => {
            console.warn("Failed to load GLTF model from", url, "- generating procedural fallback.", err);
            if (fallbackGenerator) {
                const fallback = fallbackGenerator();
                fallback.traverse((child) => { if (child.isMesh) child.frustumCulled = false; });
                pivot.add(fallback);
                group.userData.fallback = fallback;
            }
        });
        return group;
    }

    function buildExhibit(artifactGroup, title, description, position, rotationY, exhibitId) {
        let artifactContainer = null;
        const exhibitGroup = new THREE.Group();
        exhibitGroup.position.copy(position); exhibitGroup.rotation.y = rotationY;
        scene.add(exhibitGroup);

        // Next-Level Parametric Scandinavian Diagrid Hyperboloid Stand Design
        const pedestalGroup = new THREE.Group();
        
        // Materials
        const scandWoodMat = new THREE.MeshStandardMaterial({
            color: 0xdec6af, // Warm, light birch timber
            roughness: 0.6,
            metalness: 0.08,
            map: woodTex.map,
            bumpMap: woodTex.bumpMap,
            bumpScale: 0.012
        });
        
        const topPlatterMat = new THREE.MeshStandardMaterial({
            color: 0xf5f5f0, // Sustainable off-white mycelium plate
            roughness: 0.8,
            metalness: 0.05,
            map: myceliumTex.map,
            bumpMap: myceliumTex.bumpMap,
            bumpScale: 0.015
        });
        
        const brassBaseMat = new THREE.MeshStandardMaterial({
            color: 0xd4bc82, // Brushed warm brass ring
            roughness: 0.25,
            metalness: 0.82
        });

        const glowColors = [0x00ffaa, 0x00aaff, 0xffaa44];
        let numericId = 0;
        if (typeof exhibitId === 'string') {
            for(let i=0; i<exhibitId.length; i++) numericId += exhibitId.charCodeAt(i);
        } else {
            numericId = Number(exhibitId) || 0;
        }
        const currentGlow = glowColors[numericId % glowColors.length];
        const coreGlowMat = new THREE.MeshStandardMaterial({
            color: currentGlow,
            emissive: currentGlow,
            emissiveIntensity: 1.4,
            transparent: true,
            opacity: 0.45,
            roughness: 0.15
        });

        exhibitGroup.userData.pedestalRing = null; // Set below

        const localBars = [];
        const numBars = 12;
        const barRadius = 0.52;
        for (let i = 0; i < numBars; i++) {
            const angle = (i / numBars) * Math.PI * 2;
            const barGeo = new THREE.BoxGeometry(0.04, 0.01, 0.04);
            const barMat = new THREE.MeshBasicMaterial({ color: currentGlow, transparent: true, opacity: 0.65 });
            const barMesh = new THREE.Mesh(barGeo, barMat);
            
            barMesh.position.set(Math.cos(angle) * barRadius, 1.02, Math.sin(angle) * barRadius);
            exhibitGroup.add(barMesh);
            localBars.push(barMesh);
        }

        const pedLight = new THREE.Mesh(
            new THREE.RingGeometry(0.37, 0.39, 64),
            new THREE.MeshBasicMaterial({ color: currentGlow, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
        );
        pedLight.rotation.x = -Math.PI / 2; pedLight.position.y = 1.002;
        exhibitGroup.add(pedLight); 
        exhibitGroup.userData.pedestalRing = pedLight.material; 
        
        exhibitGroup.userData.rebuildPedestal = () => {
            for (let i = pedestalGroup.children.length - 1; i >= 0; i--) {
                const child = pedestalGroup.children[i];
                if (child.geometry) child.geometry.dispose();
                pedestalGroup.remove(child);
            }
            if (pedLight.geometry) pedLight.geometry.dispose();

            const standHeight = parametricState.standHeight;
            const rBottom = parametricState.standRadius + 0.14;
            const rTop = parametricState.standRadius + 0.06;
            const numSlatPairs = Math.max(1, Math.floor(parametricState.standSlatPairs));
            const twistAngle = parametricState.standTwist;
            
            // 1. Internal Glowing Core
            const coreGeo = new THREE.CylinderGeometry(Math.max(0.05, rTop - 0.2), Math.max(0.05, rBottom - 0.2), standHeight - 0.06, 32);
            const coreMesh = new THREE.Mesh(coreGeo, coreGlowMat);
            coreMesh.position.y = (standHeight - 0.06) / 2 + 0.03;
            pedestalGroup.add(coreMesh);

            // 2. Brass Base Ring (Plinth)
            const plinthGeo = new THREE.CylinderGeometry(rBottom + 0.02, rBottom + 0.02, 0.04, 32);
            const plinthMesh = new THREE.Mesh(plinthGeo, brassBaseMat);
            plinthMesh.position.y = 0.02;
            plinthMesh.castShadow = true; plinthMesh.receiveShadow = true;
            pedestalGroup.add(plinthMesh);

            // 3. Diagrid Slats
            const upVec = new THREE.Vector3(0, 1, 0);
            for (let i = 0; i < numSlatPairs; i++) {
                const theta = (i / numSlatPairs) * Math.PI * 2;
                const beams = [
                    { twist: twistAngle },
                    { twist: -twistAngle }
                ];
                beams.forEach(b => {
                    const start = new THREE.Vector3(
                        rBottom * Math.cos(theta),
                        0.03,
                        rBottom * Math.sin(theta)
                    );
                    const end = new THREE.Vector3(
                        rTop * Math.cos(theta + b.twist),
                        standHeight - 0.02,
                        rTop * Math.sin(theta + b.twist)
                    );
                    const beamDir = new THREE.Vector3().subVectors(end, start);
                    const beamLen = beamDir.length();
                    beamDir.normalize();
                    const beamGeo = new THREE.BoxGeometry(0.018, beamLen, 0.035);
                    const beamMesh = new THREE.Mesh(beamGeo, scandWoodMat);
                    
                    const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
                    beamMesh.position.copy(midPoint);
                    beamMesh.quaternion.setFromUnitVectors(upVec, beamDir);
                    beamMesh.castShadow = true; beamMesh.receiveShadow = true;
                    pedestalGroup.add(beamMesh);
                });
            }

            // 4. Sustainable Composted Mycelium Top Platter
            const topPlatterGeo = new THREE.CylinderGeometry(rTop + 0.04, rTop + 0.05, 0.03, 32);
            const topPlatterMesh = new THREE.Mesh(topPlatterGeo, topPlatterMat);
            topPlatterMesh.position.y = standHeight - 0.015;
            topPlatterMesh.castShadow = true; topPlatterMesh.receiveShadow = true;
            pedestalGroup.add(topPlatterMesh);

            pedLight.geometry = new THREE.RingGeometry(rTop + 0.01, rTop + 0.03, 64);
            pedLight.position.y = standHeight + 0.002;
            
            localBars.forEach(bar => bar.position.y = standHeight + 0.02);
            
            if (artifactContainer && artifactContainer.userData) {
                if (artifactContainer.userData.basePosition) {
                    artifactContainer.userData.basePosition.y = standHeight + 0.4;
                }
                if (!artifactContainer.userData.isInspected) {
                    artifactContainer.userData.targetPosition.y = standHeight + 0.4;
                    artifactContainer.position.y = standHeight + 0.4;
                }
            }
        };
        exhibitGroup.add(pedestalGroup);
        exhibitGroup.userData.rebuildPedestal();

        visualizerBars.push({ exhibitId, bars: localBars });

        let isRotating = true;
        let sliderFreq = 0.5, sliderMod = 0.5, sliderSpace = 0.5;
        let rotY = 0;
        let speedMult = 1.0;

        try {
            const savedStateStr = localStorage.getItem('ScandinavianGalleryState');
            if (savedStateStr) {
                const state = JSON.parse(savedStateStr);
                const artifactState = state[exhibitId];
                if (artifactState) {
                    if (artifactState.isRotating !== undefined) isRotating = artifactState.isRotating;
                    if (artifactState.sliders) {
                        sliderFreq = artifactState.sliders.freq ?? 0.5;
                        sliderMod = artifactState.sliders.mod ?? 0.5;
                        sliderSpace = artifactState.sliders.space ?? 0.5;
                    }
                    if (artifactState.rotationY !== undefined) rotY = artifactState.rotationY;
                    if (artifactState.speedMultiplier !== undefined) speedMult = artifactState.speedMultiplier;
                }
            }
        } catch(e) {}

        artifactGroup.rotation.y = rotY;

        artifactContainer = new THREE.Group();
        artifactContainer.add(artifactGroup);
        artifactContainer.position.set(0, 1.4, 0); 
        artifactContainer.userData = {
            isRotating: isRotating, speedMultiplier: speedMult, 
            basePosition: new THREE.Vector3(0, 1.4, 0), targetPosition: new THREE.Vector3(0, 1.4, 0),
            isInspected: false, parentExhibit: exhibitGroup,
            sliders: { freq: sliderFreq, mod: sliderMod, space: sliderSpace },
            angularVelocity: new THREE.Vector2(0, 0),
            title: title,
            exhibitId: exhibitId
        };
        exhibitGroup.add(artifactContainer); exhibits.push(artifactContainer); 

        // Explicitly configure spotlight parameters and optimize shadows to prevent WebGL texture unit exhaustion
        const spotLight = new THREE.SpotLight(0xffffff, 0.8, 15, Math.PI / 4, 0.5, 1.0); 
        spotLight.position.set(0, 4, 1.5); 
        spotLight.target = artifactContainer; 
        spotLight.castShadow = false;
        exhibitGroup.add(spotLight); artifactContainer.userData.spotLight = spotLight;

        const w = 1024, h = 600;
        const pr = 3;  // Increased pixel ratio for high resolution in VR
        const canvas = document.createElement('canvas'); canvas.width = w * pr; canvas.height = h * pr;
        const texture = new THREE.CanvasTexture(canvas); 
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;

        const uiData = {
            exhibitId: exhibitId, artifact: artifactContainer,
            title: title, description: description,
            canvas: canvas, ctx: canvas.getContext('2d'), texture: texture,
            width: w, height: h, pixelRatio: pr, pointer: { x: w/2, y: h/2, active: false, targetTiltX: 0, targetTiltY: 0, currentTiltX: 0, currentTiltY: 0 }, hoveredItemId: null,
            interactables: [
                { type: 'button', id: 'toggle', x: 60, y: 460, w: 160, h: 70, text: 'Play/Pause' },
                { type: 'button', id: 'inspect', x: 235, y: 460, w: 160, h: 70, text: 'Inspect' },
                { type: 'button', id: 'reset', x: 410, y: 460, w: 160, h: 70, text: 'Return' },
                { type: 'button', id: 'attach', x: 585, y: 460, w: 160, h: 70, text: 'Attach UI' },
                { type: 'slider', id: 'freq', x: 800, y: 150, w: 40, h: 320, value: 0.5, label: 'FREQ' },
                { type: 'slider', id: 'mod', x: 870, y: 150, w: 40, h: 320, value: 0.5, label: 'MOD' },
                { type: 'slider', id: 'space', x: 940, y: 150, w: 40, h: 320, value: 0.5, label: 'SPACE' }
            ]
        };
        
        const panel = new THREE.Mesh(
            createCurvedPlaneGeometry(1.2, 0.7, 0.35, 24),
            new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide })
        );
        panel.position.set(1.2, 1.5, 0); panel.rotation.y = -Math.PI / 6;
        panel.userData = uiData;
        drawUIPanel(panel, 0); exhibitGroup.add(panel); interactablePanels.push(panel);
    }

    function drawUIPanel(panelMesh, timeSec) {
        const d = panelMesh.userData;
        
        // Dynamically update button label text to provide instant visual telemetry
        if (d.interactables) {
            const toggleBtn = d.interactables.find(item => item.id === 'toggle');
            if (toggleBtn && d.artifact) {
                toggleBtn.text = d.artifact.userData.isRotating ? 'Pause auto-rot' : 'Play auto-rot';
            }
            const inspectBtn = d.interactables.find(item => item.id === 'inspect');
            if (inspectBtn && d.artifact) {
                inspectBtn.text = d.artifact.userData.isInspected ? 'Inspecting' : 'Inspect close';
            }
            const shutterBtn = d.interactables.find(item => item.id === 'toggle-shutter');
            if (shutterBtn) {
                shutterBtn.text = `Comfort Blink: ${isComfortBlinkEnabled ? 'ON' : 'OFF'}`;
            }
            const turnBtn = d.interactables.find(item => item.id === 'toggle-turn-mode');
            if (turnBtn) {
                turnBtn.text = `Turn: ${isSmoothTurnEnabled ? 'SMOOTH' : 'SNAP'}`;
            }
            const drawBtn = d.interactables.find(item => item.id === 'toggle-draw-mode');
            if (drawBtn) {
                drawBtn.text = `Draw: ${isDrawModeEnabled ? 'ON' : 'OFF'}`;
            }
        }

        const ctx = d.ctx; const w = d.width; const h = d.height; const pr = d.pixelRatio || 1;
        const ptr = d.pointer;
        const audioData = d.artifact ? d.artifact.userData.audioData : null;

        if (d.isWristMenu || d.isRightWristMenu) {
            ctx.clearRect(0, 0, w * pr, h * pr);
            ctx.save();
            ctx.scale(pr, pr);
            
            // Subdued sci-fi backdrop
            ctx.beginPath();
            ctx.arc(w/2, h/2, w/2 - 10, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(10, 15, 20, 0.85)';
            ctx.fill();
            
            ctx.lineWidth = 3;
            // Outer dynamic ring
            ctx.beginPath();
            ctx.arc(w/2, h/2, w/2 - 10, timeSec, timeSec + Math.PI * 1.5);
            ctx.strokeStyle = d.isRightWristMenu ? '#00aaff' : '#00ffaa';
            ctx.stroke();
            
            // Inner grid lines
            ctx.beginPath();
            ctx.arc(w/2, h/2, w/2 - 40, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1;
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(w/2 - 200, h/2); ctx.lineTo(w/2 + 200, h/2);
            ctx.stroke();
            
            ctx.fillStyle = d.isRightWristMenu ? '#00aaff' : '#00ffaa';
            ctx.font = '600 24px "Inter"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(d.isRightWristMenu ? "PORTAL TRAVEL DECK" : "SYNTH W.R.I.S.T.", w/2, 60);

            let tFloat = Math.floor(timeSec);
            if (!d.lastRenderedTimeSec || d.lastRenderedTimeSec !== tFloat) {
                d.lastRenderedTimeSec = tFloat;
                d.cachedTimeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
            }
            
            ctx.fillStyle = '#fff';
            ctx.font = '400 16px "Inter"';
            ctx.fillText(d.cachedTimeStr, w/2, 90);
            
            // Theme title
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = '500 14px "Inter"';
            ctx.fillText(d.isRightWristMenu ? "SPATIAL GALACTIC NODES" : "ATMOSPHERE LINK", w/2, h - 80);
            
            // Render buttons in a circular arrangement
            d.interactables.forEach(item => {
                const isHovered = d.hoveredItemId === item.id;
                if (item.type === 'button') {
                    if (item.cx !== undefined) {
                        ctx.beginPath();
                        // Octagon shaped buttons around cx, cy
                        const r = 35;
                        ctx.moveTo(item.cx + r * Math.cos(0), item.cy + r * Math.sin(0));
                        for (let i = 1; i <= 6; i++) {
                            ctx.lineTo(item.cx + r * Math.cos(i * Math.PI / 3), item.cy + r * Math.sin(i * Math.PI / 3));
                        }
                        ctx.closePath();
                        
                        // Determine theme highlight colors
                        let activeColor = null;
                        if (item.id === 'theme-morning' && galleryTheme === 'morning') {
                            activeColor = '#00ffaa';
                        } else if (item.id === 'theme-spotlight' && galleryTheme === 'spotlight') {
                            activeColor = '#00ffff';
                        } else if (item.id === 'theme-night' && galleryTheme === 'night') {
                            activeColor = '#aa00ff';
                        } else if (item.id.startsWith('jump-')) {
                            activeColor = '#00aaff'; // beautiful portal-cyan highlight!
                        }

                        ctx.fillStyle = isHovered ? 'rgba(0, 255, 170, 0.4)' : (activeColor ? 'rgba(0, 170, 255, 0.15)' : 'rgba(255, 255, 255, 0.05)');
                        ctx.fill();
                        
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = isHovered ? '#00ffaa' : (activeColor ? activeColor : 'rgba(255, 255, 255, 0.2)');
                        ctx.stroke();
                        
                        ctx.fillStyle = isHovered ? '#fff' : (activeColor ? activeColor : '#a0aab5');
                        ctx.font = '600 15px "Inter"'; ctx.textBaseline = 'middle';
                        ctx.fillText(item.text, item.cx, item.cy);
                    } else {
                        // Rectangular pill buttons (shutter toggle button)
                        ctx.beginPath();
                        ctx.roundRect(item.x, item.y, item.w, item.h, item.h / 2);
                        ctx.closePath();
                        
                        let activeColor = null;
                        if (item.id === 'toggle-shutter') {
                            activeColor = isComfortBlinkEnabled ? '#00aaff' : null;
                        } else if (item.id === 'toggle-turn-mode') {
                            activeColor = isSmoothTurnEnabled ? '#00ffaa' : null;
                        } else if (item.id === 'toggle-draw-mode') {
                            activeColor = isDrawModeEnabled ? '#00ffaa' : null;
                        } else if (item.id === 'clear-drawings') {
                            activeColor = isHovered ? '#ff3366' : 'rgba(255, 51, 102, 0.2)';
                        }

                        ctx.fillStyle = isHovered ? (item.id === 'clear-drawings' ? 'rgba(255, 51, 102, 0.4)' : 'rgba(0, 255, 170, 0.4)') : (activeColor ? (item.id === 'clear-drawings' ? 'rgba(255, 51, 102, 0.15)' : 'rgba(0, 170, 255, 0.15)') : 'rgba(255, 255, 255, 0.05)');
                        ctx.fill();
                        
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = isHovered ? '#00ffaa' : (activeColor ? (item.id === 'clear-drawings' ? '#ff3366' : activeColor) : 'rgba(255, 255, 255, 0.2)');
                        ctx.stroke();
                        
                        ctx.fillStyle = isHovered ? '#fff' : (activeColor ? (item.id === 'clear-drawings' ? '#ff4f7a' : activeColor) : '#a0aab5');
                        ctx.font = '600 15px "Inter"'; ctx.textBaseline = 'middle';
                        ctx.fillText(item.text, item.x + item.w / 2, item.y + item.h / 2);
                    }
                } else if (item.type === 'slider') {
                    // Draw custom compact slider
                    const currentVal = item.value;
                    const r = 50;
                    const cx = item.x + item.w / 2;
                    const cy = item.y + item.h / 2;
                    
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 2.2); 
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                    ctx.lineWidth = 14;
                    ctx.stroke();
                    
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 0.8 + currentVal * Math.PI * 1.4);
                    const isRightSld = d.isRightWristMenu;
                    ctx.strokeStyle = isHovered || (activeSlider && activeSlider.item === item) 
                        ? (isRightSld ? '#00aaff' : '#00ffaa') 
                        : (isRightSld ? 'rgba(0, 170, 255, 0.5)' : 'rgba(0, 255, 170, 0.5)');
                    ctx.stroke();
                    
                    ctx.fillStyle = '#fff';
                    ctx.font = '500 16px "Inter"';
                    
                    let displayText = Math.round(currentVal * 100) + "%";
                    if (item.id === 'teleport-dist') {
                        displayText = Math.round(2 + currentVal * 13) + "m";
                    }
                    ctx.fillText(displayText, cx, cy + 5);
                    
                    ctx.fillStyle = isRightSld ? '#00aaff' : '#00ffaa';
                    ctx.font = '400 12px "Inter"';
                    ctx.fillText(item.label, cx, cy - 15);
                }
            });
            
            if (ptr.active) {
                let progressAngle = 0;
                if (lastHoveredItem && lastHoveredItem.panel === panelMesh) {
                    const elapsed = performance.now() - dwellStartTime;
                    progressAngle = Math.min(1, elapsed / DWELL_DURATION) * Math.PI * 2;
                }
    
                ctx.beginPath(); ctx.arc(ptr.x, ptr.y, 16 + Math.sin(timeSec * 12) * 2, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(0, 255, 170, 0.6)'; ctx.lineWidth = 2; ctx.stroke();
                
                if (progressAngle > 0) {
                    ctx.beginPath(); ctx.arc(ptr.x, ptr.y, 20, -Math.PI / 2, -Math.PI / 2 + progressAngle);
                    ctx.strokeStyle = '#00ffaa'; ctx.lineWidth = 3; ctx.stroke();
                }
    
                ctx.beginPath(); ctx.arc(ptr.x, ptr.y, 3, 0, Math.PI * 2);
                ctx.fillStyle = '#00ffaa'; ctx.fill();
            }

            ctx.restore();
            d.texture.needsUpdate = true;
            return;
        }

        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        ctx.save();
        ctx.scale(pr, pr);

        // Render Panel Backdrop
        ctx.beginPath();
        ctx.fillStyle = 'rgba(8, 10, 14, 0.4)'; 
        ctx.roundRect(0, 0, w, h, 36); 
        ctx.fill();

        ctx.save(); 
        ctx.beginPath();
        ctx.roundRect(0, 0, w, h, 36); 
        ctx.clip();

        if (d.isThemePanel || d.isWristMenu || d.isRightWristMenu) {
            // No audio waveform for theme/wrist panel
        } else if (audioData && audioData.analyser) {
            const values = audioData.analyser.getValue();
            ctx.beginPath();
            ctx.lineWidth = 4;
            ctx.strokeStyle = `hsla(${200 + d.artifact.userData.sliders.freq * 100}, 100%, 60%, 0.45)`;
            
            const sliceWidth = w * 0.75 / values.length;
            let x = 0;
            for (let i = 0; i < values.length; i++) {
                const v = values[i] * 120; 
                const y = h/2 + v;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                x += sliceWidth;
            }
            ctx.stroke();
        }

        if (ptr.active) {
            let progressAngle = 0;
            if (lastHoveredItem && lastHoveredItem.panel === panelMesh) {
                const elapsed = performance.now() - dwellStartTime;
                progressAngle = Math.min(1, elapsed / DWELL_DURATION) * Math.PI * 2;
            }

            ctx.beginPath(); ctx.arc(ptr.x, ptr.y, 22 + Math.sin(timeSec * 12) * 4, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0, 255, 170, 0.3)'; ctx.lineWidth = 2; ctx.stroke();
            
            if (progressAngle > 0) {
                ctx.beginPath(); ctx.arc(ptr.x, ptr.y, 26, -Math.PI / 2, -Math.PI / 2 + progressAngle);
                ctx.strokeStyle = 'rgba(0, 255, 170, 0.9)'; ctx.lineWidth = 3; ctx.stroke();
            }

            ctx.beginPath(); ctx.arc(ptr.x, ptr.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#00ffaa'; ctx.fill();
        }

        const uiGrad = ctx.createLinearGradient(0, 0, w * 0.8, 0);
        uiGrad.addColorStop(0, 'rgba(5, 6, 8, 0.95)'); uiGrad.addColorStop(0.8, 'rgba(5, 6, 8, 0.5)'); uiGrad.addColorStop(1, 'rgba(5, 6, 8, 0.0)');
        ctx.fillStyle = uiGrad; ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#ffffff'; ctx.font = '500 46px "Inter"'; ctx.fillText(d.title, 60, 90);
        ctx.fillStyle = '#00ffaa'; ctx.font = '600 18px "Inter"'; ctx.letterSpacing = "2px";
        
        let subtitle = "SOUND EXPLORER NODE";
        if (d.isThemePanel) subtitle = "ATMOSPHERE CONTROLS";
        if (d.isWristMenu) subtitle = "SYSTEM OVERRIDES";
        if (d.isRightWristMenu) subtitle = "NAVIGATION DECK";
        if (d.isParametricConsole) subtitle = "GENERATIVE GEOMETRY";
        ctx.fillText(subtitle, 60, 130);
        
        ctx.beginPath(); ctx.moveTo(60, 150); ctx.lineTo(w - 60, 150);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.stroke();

        ctx.fillStyle = '#cbd2dc'; ctx.font = '300 24px "Inter"'; ctx.letterSpacing = "0px";
        wrapText(ctx, d.description, 60, 200, d.isThemePanel || d.isWristMenu || d.isRightWristMenu || d.isParametricConsole ? 400 : 680, 36);

        d.interactables.forEach(item => {
            const isHovered = d.hoveredItemId === item.id;
            if (item.type === 'button') {
                ctx.beginPath();
                ctx.fillStyle = isHovered ? 'rgba(0,255,170,0.35)' : 'rgba(255,255,255,0.06)';
                ctx.roundRect(item.x, item.y, item.w, item.h, item.h / 2); ctx.fill();
                ctx.beginPath();
                ctx.roundRect(item.x, item.y, item.w, item.h, item.h / 2);
                ctx.strokeStyle = isHovered ? 'rgba(0,255,170,0.85)' : 'rgba(255,255,255,0.15)';
                ctx.lineWidth = 2; ctx.stroke();
                
                // Define active state telemetry color highlights for buttons
                let activeColor = null;
                if (item.id === 'toggle' && d.artifact && d.artifact.userData.isRotating) {
                    activeColor = '#00ffaa'; // active rot green
                } else if (item.id === 'inspect' && d.artifact && d.artifact.userData.isInspected) {
                    activeColor = '#ffaa00'; // active inspecting amber
                } else if (item.id === 'theme-morning' && galleryTheme === 'morning') {
                    activeColor = '#00ffaa';
                } else if (item.id === 'theme-spotlight' && galleryTheme === 'spotlight') {
                    activeColor = '#00ffff';
                } else if (item.id === 'theme-night' && galleryTheme === 'night') {
                    activeColor = '#aa00ff';
                }

                if (activeColor) {
                    // Render a gorgeous glowing radial-style LED badge next to the button text
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(item.x + 25, item.y + item.h / 2, 6, 0, Math.PI * 2);
                    ctx.fillStyle = activeColor;
                    ctx.shadowColor = activeColor;
                    ctx.shadowBlur = 8;
                    ctx.fill();
                    ctx.restore();
                    
                    ctx.fillStyle = isHovered ? '#ffffff' : '#f1f5f9';
                    ctx.font = '500 22px "Inter"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(item.text, item.x + item.w / 2 + 10, item.y + item.h / 2);
                } else {
                    ctx.fillStyle = isHovered ? '#ffffff' : '#a0aab5';
                    ctx.font = '500 22px "Inter"'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(item.text, item.x + item.w/2, item.y + item.h/2);
                }
            } else if (item.type === 'slider') {
                const currentVal = (d.artifact && d.artifact.userData.sliders && d.artifact.userData.sliders[item.id] !== undefined) ? d.artifact.userData.sliders[item.id] : item.value;
                item.value = currentVal;
                
                const isHorizontal = item.w > item.h;
                const r = isHorizontal ? item.h / 2 : item.w / 2;

                ctx.beginPath();
                ctx.fillStyle = 'rgba(255,255,255,0.05)';
                ctx.roundRect(item.x, item.y, item.w, item.h, r); ctx.fill();
                ctx.beginPath();
                ctx.roundRect(item.x, item.y, item.w, item.h, r);
                ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.stroke();
                
                let fillCol = isHovered || (activeSlider && activeSlider.item === item) ? 'rgba(0,255,170,0.9)' : 'rgba(0,255,170,0.45)';
                if(audioData && audioData.meter) {
                    const level = Tone.dbToGain(audioData.meter.getValue());
                    if (level > 0.08) fillCol = `rgba(0, 255, 170, ${Math.min(1.0, 0.5 + level * 2)})`;
                }
                
                if (isHorizontal) {
                    const fillW = currentVal * item.w;
                    if (fillW > 0) {
                        ctx.beginPath();
                        ctx.fillStyle = fillCol;
                        const radius = Math.min(r, fillW / 2);
                        ctx.roundRect(item.x, item.y, fillW, item.h, radius); ctx.fill();
                    }
                    ctx.fillStyle = '#fff';
                    ctx.beginPath(); ctx.arc(item.x + fillW, item.y + item.h/2, r + 3, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#a0aab5'; ctx.font = '600 14px "Inter"'; ctx.textAlign = 'center';
                    ctx.fillText(item.label, item.x + item.w/2, item.y - 15);
                } else {
                    const fillH = currentVal * item.h;
                    if (fillH > 0) {
                        ctx.beginPath();
                        ctx.fillStyle = fillCol;
                        const radius = Math.min(r, fillH / 2);
                        ctx.roundRect(item.x, item.y + item.h - fillH, item.w, fillH, radius); ctx.fill();
                    }
                    ctx.fillStyle = '#fff';
                    ctx.beginPath(); ctx.arc(item.x + item.w/2, item.y + item.h - fillH, r + 3, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#a0aab5'; ctx.font = '600 14px "Inter"'; ctx.textAlign = 'center';
                    ctx.fillText(item.label, item.x + item.w/2, item.y - 15);
                }
            }
        });
        ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.restore(); 
        ctx.restore(); 
        d.texture.needsUpdate = true;
    }

    function wrapText(context, text, x, y, maxWidth, lineHeight) {
        const words = text.split(' '); let line = '';
        for(let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            if (context.measureText(testLine).width > maxWidth && n > 0) { context.fillText(line, x, y); line = words[n] + ' '; y += lineHeight; } 
            else line = testLine;
        }
        context.fillText(line, x, y);
    }

    function setupXRControllers() {
        const controllerModelFactory = new XRControllerModelFactory();
        const handModelFactory = new XRHandModelFactory();

        for (let i = 0; i < 2; i++) {
            const controller = renderer.xr.getController(i);
            controller.addEventListener('selectstart', onSelectStart);
            controller.addEventListener('selectend', onSelectEnd);
            controller.addEventListener('squeezestart', onSqueezeStart);
            controller.addEventListener('squeezeend', onSqueezeEnd);
            cameraGroup.add(controller); controllers.push(controller);
            const geometry = new THREE.BufferGeometry().setFromPoints([ new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-5) ]);
            const material = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.5, transparent: true });
            const line = new THREE.Line(geometry, material);
            line.name = 'line';
            controller.add(line);
            
            const curveGeo = new THREE.BufferGeometry().setFromPoints(new Array(31).fill(new THREE.Vector3()));
            const curveMat = new THREE.LineBasicMaterial({ color: 0x00aaff, opacity: 0.8, transparent: true, linewidth: 3 });
            const teleportLine = new THREE.Line(curveGeo, curveMat);
            teleportLine.name = 'teleportLine';
            teleportLine.visible = false;
            scene.add(teleportLine);
            
            controller.userData = { 
                isSelecting: false, 
                grabbedObject: null, 
                previousMatrix: new THREE.Matrix4(),
                teleportLine: teleportLine 
            };

            const controllerGrip = renderer.xr.getControllerGrip(i);
            controllerGrip.add( controllerModelFactory.createControllerModel( controllerGrip ) );
            cameraGroup.add( controllerGrip );

            const hand = renderer.xr.getHand(i);
            hand.add( handModelFactory.createHandModel( hand, 'mesh' ) );
            hand.addEventListener('pinchstart', onPinchStart);
            hand.addEventListener('pinchend', onPinchEnd);
            cameraGroup.add( hand );
            hands.push(hand);
        }
        
        createWristMenu();
        createRightWristMenu();
        createParametricConsole();
        createHUDMode();
    }

    function createRibbonMesh(pointsArray, colorHex) {
        const pts = pointsArray.map(p => new THREE.Vector3(p.x, p.y, p.z));
        if (pts.length < 2) return null;
        
        const color = new THREE.Color(colorHex);
        const material = new THREE.MeshStandardMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 2.0,
            roughness: 0.2,
            metalness: 0.8,
            side: THREE.DoubleSide
        });
        
        const curve = new THREE.CatmullRomCurve3(pts);
        const geometry = new THREE.TubeGeometry(curve, pts.length * 2, 0.015, 8, false);
        const mesh = new THREE.Mesh(geometry, material);
        
        scene.add(mesh);
        allRibbonMeshes.push(mesh);
        return mesh;
    }

    function clearClientDrawings() {
        allRibbonMeshes.forEach(mesh => {
            scene.remove(mesh);
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) mesh.material.dispose();
        });
        allRibbonMeshes = [];
        
        activeDrawings.forEach(drawing => {
            scene.remove(drawing.mesh);
            if (drawing.mesh.geometry) drawing.mesh.geometry.dispose();
            if (drawing.mesh.material) drawing.mesh.material.dispose();
        });
        activeDrawings.clear();
        
        remoteDrawings.forEach(drawing => {
            scene.remove(drawing.mesh);
            if (drawing.mesh.geometry) drawing.mesh.geometry.dispose();
            if (drawing.mesh.material) drawing.mesh.material.dispose();
        });
        remoteDrawings.clear();
        
        localRibbons = [];
    }

    function createWristMenu() {
        const w = 500, h = 500; const pr = 2; // Circular 500x500
        const canvas = document.createElement('canvas'); canvas.width = w * pr; canvas.height = h * pr;
        const texture = new THREE.CanvasTexture(canvas); texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
        
        const uiData = {
            isWristMenu: true,
            title: "XR TERMINAL",
            description: "GLOBAL OVERRIDES",
            canvas: canvas, ctx: canvas.getContext('2d'), texture: texture,
            width: w, height: h, pixelRatio: pr, 
            pointer: { x: w/2, y: h/2, active: false, targetTiltX: 0, targetTiltY: 0, currentTiltX: 0, currentTiltY: 0 }, 
            hoveredItemId: null,
            interactables: [
                // Octagon buttons uses bounding box for hit test, so we define bounding rects around the centers
                // Center is (150, 220), r=35 -> x=115, y=185, w=70, h=70
                { type: 'button', id: 'theme-morning', x: 75, y: 155, cx: 110, cy: 190, w: 70, h: 70, text: 'DAY' },
                { type: 'button', id: 'theme-spotlight', x: 215, y: 95, cx: 250, cy: 130, w: 70, h: 70, text: 'SPOT' },
                { type: 'button', id: 'theme-night', x: 355, y: 155, cx: 390, cy: 190, w: 70, h: 70, text: 'NIGHT' },
                { type: 'button', id: 'summon-all', x: 215, y: 175, cx: 250, cy: 210, w: 70, h: 70, text: 'GATH' },
                
                // Toggle Button for Turn Mode and Draw Mode and Clear
                { type: 'button', id: 'toggle-turn-mode', x: 50, y: 270, w: 120, h: 48, text: isSmoothTurnEnabled ? 'Turn: SMOOTH' : 'Turn: SNAP' },
                { type: 'button', id: 'toggle-draw-mode', x: 190, y: 270, w: 120, h: 48, text: 'Draw: OFF' },
                { type: 'button', id: 'clear-drawings', x: 330, y: 270, w: 120, h: 48, text: 'Clear Art' },
                
                // Vertical sliders
                { type: 'slider', id: 'master-vol', x: 80, y: 350, w: 100, h: 100, value: 0.8, label: 'VOL' },
                { type: 'slider', id: 'height-adjust', x: 200, y: 350, w: 100, h: 100, value: (baseCameraHeightOffset + 0.5), label: 'HEIGHT' },
                { type: 'slider', id: 'arc-curve', x: 320, y: 350, w: 100, h: 100, value: (arcVelocityScale - 6.0) / 12.0, label: 'ARC' }
            ]
        };
        
        wristMenu = new THREE.Mesh(
            new THREE.PlaneGeometry(0.25, 0.25), // square plane to hold circle texture
            new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide })
        );
        wristMenu.position.set(0, 0.05, 0.1);
        wristMenu.rotation.x = -Math.PI / 4;
        wristMenu.userData = uiData;
        
        // Hide initially
        wristMenu.visible = true; // Let's make it visible for now to test, later hide based on rotation
        
        // We attach it to the left controller by default
        controllers[0].add(wristMenu);
        interactablePanels.push(wristMenu);
        drawUIPanel(wristMenu, 0);
    }

    function createRightWristMenu() {
        const w = 500, h = 500; const pr = 2; // Circular 500x500
        const canvas = document.createElement('canvas'); canvas.width = w * pr; canvas.height = h * pr;
        const texture = new THREE.CanvasTexture(canvas); texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
        
        const uiData = {
            isRightWristMenu: true,
            title: "TRAVEL DECK",
            description: "FAST TELEPORT NODES",
            canvas: canvas, ctx: canvas.getContext('2d'), texture: texture,
            width: w, height: h, pixelRatio: pr, 
            pointer: { x: w/2, y: h/2, active: false, targetTiltX: 0, targetTiltY: 0, currentTiltX: 0, currentTiltY: 0 }, 
            hoveredItemId: null,
            interactables: [
                // Quick teleport destination nodes arranged in a cross
                { type: 'button', id: 'jump-orrery', x: 75, y: 185, cx: 110, cy: 220, w: 70, h: 70, text: 'ORR' },
                { type: 'button', id: 'jump-swarm', x: 165, y: 110, cx: 200, cy: 145, w: 70, h: 70, text: 'SWR' },
                { type: 'button', id: 'jump-relic', x: 255, y: 185, cx: 290, cy: 220, w: 70, h: 70, text: 'RLC' },
                { type: 'button', id: 'jump-center', x: 165, y: 260, cx: 200, cy: 295, w: 70, h: 70, text: 'CTR' },
                
                // Toggle Button for Comfort Blink Shutter Effect
                { type: 'button', id: 'toggle-shutter', x: 100, y: 350, w: 300, h: 48, text: 'Comfort Blink: ON' },
                
                // Slider for Teleport Distance limit (Range)
                { type: 'slider', id: 'teleport-dist', x: 190, y: 400, w: 120, h: 80, value: (maxTeleportDistance - 2.0) / 13.0, label: 'RANGE' }
            ]
        };
        
        rightWristMenu = new THREE.Mesh(
            new THREE.PlaneGeometry(0.25, 0.25),
            new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide })
        );
        rightWristMenu.position.set(0, 0.05, 0.1);
        rightWristMenu.rotation.x = -Math.PI / 4;
        rightWristMenu.userData = uiData;
        
        rightWristMenu.visible = true;
        
        // We attach it to the right controller by default
        if (controllers[1]) {
            controllers[1].add(rightWristMenu);
        }
        interactablePanels.push(rightWristMenu);
        drawUIPanel(rightWristMenu, 0);
    }

    function createParametricConsole() {
        const w = 1500, h = 600; const pr = 2;
        const canvas = document.createElement('canvas'); canvas.width = w * pr; canvas.height = h * pr;
        const texture = new THREE.CanvasTexture(canvas); texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
        
        const uiData = {
            isParametricConsole: true,
            title: "PARAMETRIC ARCHITECTURE ENGINE",
            description: "GLOBAL GEOMETRY CONTROLS",
            canvas: canvas, ctx: canvas.getContext('2d'), texture: texture,
            width: w, height: h, pixelRatio: pr, 
            pointer: { x: w/2, y: h/2, active: false, targetTiltX: 0, targetTiltY: 0, currentTiltX: 0, currentTiltY: 0 }, 
            hoveredItemId: null,
            interactables: [
                // ROOF (Column 1)
                { type: 'slider', id: 'param-amp', x: 40, y: 180, w: 320, h: 40, value: parametricState.waveAmplitude / 1.0, label: 'ROOF: WAVE AMP' },
                { type: 'slider', id: 'param-freq', x: 40, y: 260, w: 320, h: 40, value: parametricState.waveFrequency / 1.0, label: 'ROOF: WAVE FREQ' },
                { type: 'slider', id: 'param-arch', x: 40, y: 340, w: 320, h: 40, value: parametricState.archCompression / 5.0, label: 'ROOF: ARCH COMPRESSION' },
                { type: 'slider', id: 'param-slat', x: 40, y: 420, w: 320, h: 40, value: (parametricState.slatSpacing - 0.1) / 0.9, label: 'ROOF: SLAT DENSITY' },
                { type: 'slider', id: 'param-oculus', x: 40, y: 500, w: 320, h: 40, value: parametricState.oculusRadius / 10.0, label: 'ROOF: OCULUS RADIUS' },
                
                // WALL (Column 2)
                { type: 'slider', id: 'param-wall-freq', x: 400, y: 180, w: 320, h: 40, value: parametricState.wallFreq / 1.0, label: 'WALL: WAVE FREQUENCY' },
                { type: 'slider', id: 'param-wall-amp', x: 400, y: 260, w: 320, h: 40, value: parametricState.wallAmp / 1.0, label: 'WALL: WAVE AMPLITUDE' },
                { type: 'slider', id: 'param-wall-height', x: 400, y: 340, w: 320, h: 40, value: parametricState.wallHeightMod / 3.0, label: 'WALL: HEIGHT VARIANCE' },
                
                // BENCH (Column 3)
                { type: 'slider', id: 'param-bench-dens', x: 760, y: 180, w: 320, h: 40, value: parametricState.benchDensity / 2.0, label: 'BENCH: SLAT DENSITY' },
                { type: 'slider', id: 'param-bench-depth', x: 760, y: 260, w: 320, h: 40, value: parametricState.benchDepth / 2.0, label: 'BENCH: DEPTH PROFILE' },
                { type: 'slider', id: 'param-bench-wave', x: 760, y: 340, w: 320, h: 40, value: parametricState.benchWave / 2.0, label: 'BENCH: ERGONOMIC WAVE' },
                
                // STAND (Column 4)
                { type: 'slider', id: 'param-stand-twist', x: 1120, y: 180, w: 320, h: 40, value: parametricState.standTwist / Math.PI, label: 'STAND: DIAGRID TWIST' },
                { type: 'slider', id: 'param-stand-height', x: 1120, y: 260, w: 320, h: 40, value: (parametricState.standHeight - 0.5) / 1.5, label: 'STAND: HEIGHT' },
                { type: 'slider', id: 'param-stand-radius', x: 1120, y: 340, w: 320, h: 40, value: parametricState.standRadius / 0.8, label: 'STAND: BASE RADIUS' },
                { type: 'slider', id: 'param-stand-slats', x: 1120, y: 420, w: 320, h: 40, value: parametricState.standSlatPairs / 32.0, label: 'STAND: SLAT COUNT' }
            ]
        };
        
        parametricConsole = new THREE.Mesh(
            createCurvedPlaneGeometry(3.0, 1.2, 0.45, 32),
            new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide })
        );
        parametricConsole.position.set(3.8, 1.4, 3.8); // Placed in the spacious back-right open area as requested
        parametricConsole.rotation.y = Math.PI / 4;
        parametricConsole.userData = uiData;
        
        scene.add(parametricConsole);
        interactablePanels.push(parametricConsole);
        drawUIPanel(parametricConsole, 0);
    }

    function createHUDMode() {
        const w = 500, h = 180; const pr = 2;
        const canvas = document.createElement('canvas'); canvas.width = w * pr; canvas.height = h * pr;
        const texture = new THREE.CanvasTexture(canvas); texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
        
        hudMenu = new THREE.Mesh(
            new THREE.PlaneGeometry(1.0, 0.36),
            new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthTest: false })
        );
        // Position it up, slightly forward
        hudMenu.position.set(0, 0.45, -1.2); 
        hudMenu.rotation.x = 0;
        
        hudMenu.userData = { canvas, ctx: canvas.getContext('2d'), w: w * pr, h: h * pr, texture };
        camera.add(hudMenu);
    }
    
    function drawHUDMode(timeSec, fps, inspectedTitle) {
        if (!hudMenu) return;
        const ctx = hudMenu.userData.ctx;
        const w = hudMenu.userData.w; const h = hudMenu.userData.h;
        ctx.clearRect(0, 0, w, h);
        
        ctx.fillStyle = 'rgba(10, 15, 20, 0.5)';
        ctx.beginPath(); ctx.roundRect(0, 0, w, h, 24); ctx.fill();
        ctx.strokeStyle = 'rgba(0, 255, 170, 0.4)'; ctx.lineWidth = 2; ctx.stroke();
        
        ctx.fillStyle = '#00ffaa'; ctx.font = '600 28px "Inter"'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(`SCANDINAVIAN SOUNDSCAPE • XR`, 30, 25);
        
        ctx.fillStyle = '#ffffff'; ctx.font = '400 22px "Inter"'; 
        ctx.fillText(`THEME: ${galleryTheme.toUpperCase()}`, 30, 70);
        ctx.fillText(`FPS: ${fps}hz`, 30, 105);
        
        ctx.fillStyle = inspectedTitle ? '#00ffaa' : '#888888';
        ctx.fillText(`TARGET: ${inspectedTitle || 'NONE'}`, 30, 140);
        
        // Navigation visual
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(w - 120, 30, 90, 90);
        ctx.strokeStyle = '#00ffaa'; ctx.lineWidth = 2;
        ctx.beginPath();
        const activeCam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
        activeCam.getWorldDirection(_tempVec3_1);
        const navAngle = Math.atan2(_tempVec3_1.x, _tempVec3_1.z);
        ctx.arc(w - 75, 75, 30, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(w - 75, 75);
        ctx.lineTo(w - 75 + Math.sin(-navAngle) * 30, 75 + Math.cos(-navAngle) * 30);
        ctx.stroke();
        
        ctx.textAlign = 'center'; ctx.font = '14px "Inter"';
        ctx.fillText("NAV", w - 75, 145);
        
        hudMenu.userData.texture.needsUpdate = true;
    }

    function setupVoiceCommands() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return; // not supported
        
        try {
            voiceRecognition = new SpeechRecognition();
            voiceRecognition.continuous = true;
            voiceRecognition.interimResults = false;
            voiceRecognition.lang = 'en-US';
            
            voiceRecognition.onresult = (event) => {
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    if (event.results[i].isFinal) {
                        const transcript = event.results[i][0].transcript.toLowerCase();
                        console.log("Voice Command Recognized:", transcript);
                        
                        if (transcript.includes('morning')) {
                            galleryTheme = 'morning';
                            localStorage.setItem('ScandinavianGalleryTheme', galleryTheme);
                            if (multiuser) multiuser.emitInteraction({ type: 'theme', theme: galleryTheme });
                        } else if (transcript.includes('night') || transcript.includes('dark')) {
                            galleryTheme = 'night';
                            localStorage.setItem('ScandinavianGalleryTheme', galleryTheme);
                            if (multiuser) multiuser.emitInteraction({ type: 'theme', theme: galleryTheme });
                        } else if (transcript.includes('spotlight') || transcript.includes('focus')) {
                            galleryTheme = 'spotlight';
                            localStorage.setItem('ScandinavianGalleryTheme', galleryTheme);
                            if (multiuser) multiuser.emitInteraction({ type: 'theme', theme: galleryTheme });
                        } else if (transcript.includes('reset') || transcript.includes('return')) {
                            const artifact = exhibits.find(ex => ex.userData.isInspected);
                            if (artifact) {
                                resetArtifact(artifact);
                                if (multiuser) multiuser.emitInteraction({ type: 'reset', exhibitGroupId: artifact.userData.parentExhibit.id });
                            }
                        }
                    }
                }
            };
            
            voiceRecognition.onerror = (err) => {
                if (err.error === 'not-allowed' || err.error === 'service-not-allowed') {
                    shouldRunVoice = false;
                }
            };
            
            // Safe debounced restart
            voiceRecognition.onend = () => {
                if (shouldRunVoice && !isDisposed) {
                    clearTimeout(voiceRestartTimeout);
                    voiceRestartTimeout = setTimeout(() => {
                        if (shouldRunVoice && !isDisposed && voiceRecognition) {
                            try { voiceRecognition.start(); } catch(e){}
                        }
                    }, 4000);
                }
            };
        } catch(e) {
            console.warn("Speech recognition setup bypassed:", e);
        }
    }

    function setupDesktopControls() {
        windowMouseDownListener = (e) => {
            isPointerDown = true; previousMousePosition = { x: e.clientX, y: e.clientY };
            mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);

            const uiHits = raycaster.intersectObjects(interactablePanels);
            if (uiHits.length > 0) {
                const hit = uiHits[0]; const panel = hit.object;
                const pixelX = hit.uv.x * panel.userData.width; const pixelY = (1 - hit.uv.y) * panel.userData.height;
                for (const item of panel.userData.interactables) {
                    if (item.type === 'slider' && pixelX >= item.x && pixelX <= item.x + item.w && pixelY >= item.y && pixelY <= item.y + item.h) {
                        activeSlider = { panel, item }; updateSliderValue(activeSlider, pixelX, pixelY); return; 
                    }
                }
            }
            if (isDirectorMode && multiuser && multiuser.physicsObjects) {
                const physHits = raycaster.intersectObjects(Array.from(multiuser.physicsObjects.values()));
                if (physHits.length > 0) {
                    let hitId = null;
                    for (const [id, mesh] of multiuser.physicsObjects.entries()) {
                        if (mesh === physHits[0].object) hitId = id;
                    }
                    if (hitId) {
                        grabbedPhysicsObject = { id: hitId, controller: null, distance: physHits[0].distance };
                        multiuser.socket.emit('interact', {
                            type: 'grab-start',
                            objectId: hitId
                        });
                        return;
                    }
                }
            }
            const intersects = raycaster.intersectObjects(exhibits, true);
            if (intersects.length > 0) {
                let root = intersects[0].object;
                while(root.parent && !exhibits.includes(root)) root = root.parent;
                if (exhibits.includes(root) && root.userData.isInspected) {
                    draggedArtifact = root; document.body.style.cursor = 'grabbing'; return; 
                }
            }
            isDragging = true;
        };
        
        windowMouseMoveListener = (e) => {
            mouse.x = (e.clientX / window.innerWidth) * 2 - 1; mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
            if (activeSlider) {
                raycaster.setFromCamera(mouse, camera); const uiHits = raycaster.intersectObject(activeSlider.panel);
                if (uiHits.length > 0) {
                    const pixelX = uiHits[0].uv.x * activeSlider.panel.userData.width;
                    const pixelY = (1 - uiHits[0].uv.y) * activeSlider.panel.userData.height;
                    updateSliderValue(activeSlider, pixelX, pixelY);
                }
                return;
            }
            const deltaX = e.clientX - previousMousePosition.x; const deltaY = e.clientY - previousMousePosition.y;
            if (draggedArtifact) { 
                draggedArtifact.rotation.y += deltaX * 0.008; draggedArtifact.rotation.x += deltaY * 0.008; 
                tossVelocity.set(deltaX * 0.002, deltaY * 0.002);
            }
            else if (isDragging && !renderer.xr.isPresenting && !isDirectorMode) {
                targetCameraRotation.y -= deltaX * 0.0025; targetCameraRotation.x -= deltaY * 0.0025;
                targetCameraRotation.x = Math.max(-Math.PI/4, Math.min(Math.PI/4, targetCameraRotation.x));
            }
            previousMousePosition = { x: e.clientX, y: e.clientY };
        };
        
        windowMouseUpListener = () => {
            isPointerDown = false; activeSlider = null; isDragging = false;
            
            if (grabbedPhysicsObject && !grabbedPhysicsObject.controller) {
                if (multiuser && multiuser.socket) {
                    multiuser.socket.emit('interact', {
                        type: 'grab-end',
                        objectId: grabbedPhysicsObject.id,
                        velocity: { x: tossVelocity.x * 2, y: tossVelocity.y * 2, z: 0 } 
                    });
                }
                grabbedPhysicsObject = null;
            }

            if (draggedArtifact) { 
                draggedArtifact.userData.angularVelocity.copy(tossVelocity);
                draggedArtifact = null; document.body.style.cursor = 'default'; 
            }
        };
        
        windowClickListener = () => { 
            if (isDirectorMode) {
                raycaster.setFromCamera(mouse, camera);
                const dir = raycaster.ray.direction.clone();
                if (multiuser) {
                    multiuser.emitInteraction({
                        type: 'director-poke',
                        objectId: 'beachball',
                        direction: { x: dir.x, y: dir.y, z: dir.z }
                    });
                }
            } else {
                if (renderer && !renderer.xr.isPresenting && !isDragging && !draggedArtifact && !activeSlider) executeHoveredAction(); 
            }
        };

        window.addEventListener('mousedown', windowMouseDownListener);
        window.addEventListener('mousemove', windowMouseMoveListener);
        window.addEventListener('mouseup', windowMouseUpListener);
        window.addEventListener('click', windowClickListener);
    }

    function onPinchStart(event) {
        const hand = event.target;
        // Check if hand is right hand to activate teleport
        // In WebXR, handedness is on the inputSource. If right hand, initiate teleport
        hand.userData.isTeleporting = true;
    }

    function onPinchEnd(event) {
        const hand = event.target;
        hand.userData.isTeleporting = false;
        if (hand.userData.teleportTarget) {
            _tempVec3_1.setFromMatrixPosition(camera.matrixWorld);
            
            const originalExposure = renderer.toneMappingExposure;
            if (isComfortBlinkEnabled) {
                renderer.toneMappingExposure = 0.01;
            }
            
            const shiftX = hand.userData.teleportTarget.x - _tempVec3_1.x;
            const shiftZ = hand.userData.teleportTarget.z - _tempVec3_1.z;
            
            cameraGroup.position.x += shiftX;
            cameraGroup.position.z += shiftZ;
            cameraGroup.position.y = hand.userData.teleportTarget.y + baseCameraHeightOffset;
            if (!renderer.xr.isPresenting) {
                cameraGroup.position.y += 1.6;
            }
            
            if (isComfortBlinkEnabled) {
                setTimeout(() => {
                    renderer.toneMappingExposure = originalExposure;
                }, 85);
            }
            
            hand.userData.teleportTarget = null;
            if (mainReverb) playUIFeedback('hover');
        }
    }

    function onSqueezeStart(event) {
        const controller = event.target;
        controller.userData.isTeleporting = true;
    }

    function onSqueezeEnd(event) {
        const controller = event.target;
        controller.userData.isTeleporting = false;
        if (controller.userData.teleportTarget) {
            _tempVec3_1.setFromMatrixPosition(camera.matrixWorld);
            const shiftX = controller.userData.teleportTarget.x - _tempVec3_1.x;
            const shiftZ = controller.userData.teleportTarget.z - _tempVec3_1.z;
            
            // Comfort-blind shutter blink/fade to black (if enabled)
            const originalExposure = renderer.toneMappingExposure;
            if (isComfortBlinkEnabled) {
                renderer.toneMappingExposure = 0.01; // nearly instant dark
            }
            
            cameraGroup.position.x += shiftX;
            cameraGroup.position.z += shiftZ;
            
            // Adjust height based on whether WebXR is presenting (where headset tracker adds height) or desktop mode
            if (renderer.xr.isPresenting) {
                cameraGroup.position.y = controller.userData.teleportTarget.y + baseCameraHeightOffset; 
            } else {
                cameraGroup.position.y = controller.userData.teleportTarget.y + 1.6 + baseCameraHeightOffset; 
            } 
            
            triggerHapticPulse(controller, 0.7, 30);
            playUIFeedback('hover');

            if (isComfortBlinkEnabled) {
                // Rapidly fade exposure back to normal to complete the blind transition comfortably
                setTimeout(() => {
                    renderer.toneMappingExposure = originalExposure;
                }, 85);
            }
            
            controller.userData.teleportTarget = null;
        }
        teleportMarker.visible = false;
    }

    function onSelectStart(event) {
        const controller = event.target; controller.userData.isSelecting = true;
        _tempMat4.identity().extractRotation(controller.matrixWorld);
        raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
        raycaster.ray.direction.set(0, 0, -1).applyMatrix4(_tempMat4);

        // Filter out panels attached to this controller
        
        const buttonHits = raycaster.intersectObjects(diegeticButtons);
        if (buttonHits.length > 0) {
            const btn = buttonHits[0].object;
            if (btn.userData.isButton) {
                // Depress button
                btn.position.z = btn.userData.pressedZ;
                btn.userData.action();
                triggerHapticPulse(controller, 1.0, 50); // Sharp click
                return;
            }
        }
    const targetPanels = interactablePanels.filter(panel => {
            if (panel.userData.isAttached && panel.userData.attachedTo === 'controller' && panel.userData.controllerRef === controller) {
                return false;
            }
            return true;
        });

        const uiHits = raycaster.intersectObjects(targetPanels);
        if (uiHits.length > 0) {
            const panel = uiHits[0].object; const uv = uiHits[0].uv;
            const pixelX = uv.x * panel.userData.width; const pixelY = (1 - uv.y) * panel.userData.height;
            for (const item of panel.userData.interactables) {
                if (item.type === 'slider' && pixelX >= item.x && pixelX <= item.x + item.w && pixelY >= item.y && pixelY <= item.y + item.h) {
                    activeSlider = { panel, item, controller }; updateSliderValue(activeSlider, pixelX, pixelY); return; 
                }
            }
        }
        const intersects = raycaster.intersectObjects(exhibits, true);
        if (intersects.length > 0) {
            let root = intersects[0].object; while(root.parent && !exhibits.includes(root)) root = root.parent;
            if (exhibits.includes(root) && root.userData.isInspected) {
                controller.userData.grabbedObject = root; controller.userData.previousMatrix.copy(controller.matrixWorld);
                triggerHapticPulse(controller, 1.0, 50); 
                return; 
            }
        }

        if (multiuser && multiuser.physicsObjects) {
            const physHits = raycaster.intersectObjects(Array.from(multiuser.physicsObjects.values()));
            if (physHits.length > 0) {
                let hitId = null;
                for (const [id, mesh] of multiuser.physicsObjects.entries()) {
                    if (mesh === physHits[0].object) hitId = id;
                }
                if (hitId) {
                    grabbedPhysicsObject = { id: hitId, controller: controller, distance: physHits[0].distance };
                    multiuser.socket.emit('interact', {
                        type: 'grab-start',
                        objectId: hitId
                    });
                    triggerHapticPulse(controller, 0.8, 40);
                    return;
                }
            }
        }

        // Direct Point-and-Click Teleportation on trigger-pull fallback
        if (uiHits.length === 0 && intersects.length === 0) {
            const floorObj = scene.getObjectByName('teleportFloor');
            if (floorObj) {
                const floorHits = raycaster.intersectObject(floorObj);
                if (floorHits.length > 0) {
                    const targetPoint = floorHits[0].point;
                    _tempVec3_1.setFromMatrixPosition(camera.matrixWorld);
                    if (_tempVec3_1.distanceTo(targetPoint) <= maxTeleportDistance) {
                        const shiftX = targetPoint.x - _tempVec3_1.x;
                        const shiftZ = targetPoint.z - _tempVec3_1.z;
                        
                        cameraGroup.position.x += shiftX;
                        cameraGroup.position.z += shiftZ;
                        cameraGroup.position.y = targetPoint.y; // Match height levels perfectly in WebXR
                        
                        triggerHapticPulse(controller, 0.7, 30);
                        playUIFeedback('hover');
                        return;
                    }
                }
            }
        }

        if (isDrawModeEnabled) {
            const color = new THREE.Color().setHSL(Math.random(), 1.0, 0.5);
            const material = new THREE.MeshStandardMaterial({
                color: color,
                emissive: color,
                emissiveIntensity: 2.0,
                roughness: 0.2,
                metalness: 0.8,
                side: THREE.DoubleSide
            });
            const points = [];
            _tempVec3_1.setFromMatrixPosition(controller.matrixWorld);
            points.push(_tempVec3_1.clone());
            points.push(_tempVec3_1.clone().add(new THREE.Vector3(0, -0.001, 0))); // Initial dummy point to form a tube
            
            const curve = new THREE.CatmullRomCurve3(points);
            const geometry = new THREE.TubeGeometry(curve, 2, 0.015, 8, false);
            const mesh = new THREE.Mesh(geometry, material);
            scene.add(mesh);
            
            activeDrawings.set(controller, {
                points: points,
                mesh: mesh,
                color: color.getHex(),
                lastPoint: _tempVec3_1.clone(),
                lastEmitTime: performance.now()
            });
            
            triggerHapticPulse(controller, 0.5, 30);
            return;
        }

        executeHoveredAction(controller);
    }

    function onSelectEnd(event) {
        const controller = event.target; 
        // Pop all buttons back up
        diegeticButtons.forEach(btn => {
            if (btn.userData.isButton) {
                btn.position.z = btn.userData.baseZ;
            }
        });
    controller.userData.isSelecting = false;
        
        if (activeDrawings.has(controller)) {
            const drawing = activeDrawings.get(controller);
            localRibbons.push(drawing);
            allRibbonMeshes.push(drawing.mesh);
            activeDrawings.delete(controller);
            
            if (multiuser) {
                const serializedPoints = drawing.points.map(p => ({x: p.x, y: p.y, z: p.z}));
                multiuser.emitInteraction({
                    type: 'draw-ribbon-end',
                    color: drawing.color,
                    points: serializedPoints
                });
            }
            return;
        }
        
        if (grabbedPhysicsObject && grabbedPhysicsObject.controller === controller) {
            if (multiuser && multiuser.socket) {
                multiuser.socket.emit('interact', {
                    type: 'grab-end',
                    objectId: grabbedPhysicsObject.id,
                    velocity: { x: 0, y: 0, z: 0 } // Basic end for now, can calculate later
                });
            }
            grabbedPhysicsObject = null;
        }

        if (controller.userData.grabbedObject) {
            controller.userData.grabbedObject.userData.angularVelocity.set(0.01 * (Math.random() - 0.5), 0.01 * (Math.random() - 0.5));
        }
        controller.userData.grabbedObject = null;
        if (activeSlider && activeSlider.controller === controller) activeSlider = null;
    }

    function isTeleportLocationValid(pos) {
        const distSq = pos.x * pos.x + pos.z * pos.z;
        if (distSq > 6.5 * 6.5) return false;

        const dx1 = pos.x - (-3.4), dz1 = pos.z - (-2.5);
        if (dx1 * dx1 + dz1 * dz1 < 1.2 * 1.2) return false;

        const dx2 = pos.x - 0.0, dz2 = pos.z - (-4.2);
        if (dx2 * dx2 + dz2 * dz2 < 1.2 * 1.2) return false;

        const dx3 = pos.x - 3.4, dz3 = pos.z - (-2.5);
        if (dx3 * dx3 + dz3 * dz3 < 1.2 * 1.2) return false;

        return true;
    }

    function updateSliderValue(sliderObj, pixelX, pixelY) {
        const { item, panel } = sliderObj;
        let val;
        if (item.w > item.h) {
            val = (pixelX - item.x) / item.w;
        } else {
            val = 1.0 - ((pixelY - item.y) / item.h);
        }
        val = Math.max(0, Math.min(1, val));
        const prevVal = item.value || 0;
        item.value = val;
        
        // Haptic detent feedback when crossing 10% notches
        if (activeSlider && activeSlider.controller && Math.floor(prevVal * 10) !== Math.floor(val * 10)) {
            triggerHapticPulse(activeSlider.controller, 0.15, 12);
        }
        
        // Handle global master volume slider on wrist menu
        if (item.id === 'master-vol') {
            if (window.Tone && Tone.Destination) {
                Tone.Destination.volume.rampTo(Tone.gainToDb(val * 1.2), 0.1);
            }
            if (multiuser) {
                multiuser.emitInteraction({ type: 'master-vol', value: val });
            }
            return;
        }
        
        // Handle height adjust slider
        if (item.id === 'height-adjust') {
            baseCameraHeightOffset = val - 0.5; // -0.5m to +0.5m offset
            localStorage.setItem('NavigatorHeightOffset', String(baseCameraHeightOffset));
            // Apply immediately to current position
            if (renderer.xr.isPresenting) {
                const floorObj = scene.getObjectByName('teleportFloor');
                if (floorObj) {
                    _tempVec3_1.setFromMatrixPosition(cameraGroup.matrixWorld);
                    raycaster.ray.origin.copy(_tempVec3_1);
                    raycaster.ray.origin.y += 10.0;
                    raycaster.ray.direction.set(0, -1, 0);
                    const floorHits = raycaster.intersectObject(floorObj);
                    if (floorHits.length > 0) {
                        cameraGroup.position.y = floorHits[0].point.y + baseCameraHeightOffset;
                    }
                }
            } else {
                cameraGroup.position.y = 1.6 + baseCameraHeightOffset;
            }
            return;
        }

        if (item.id === 'arc-curve') {
            arcVelocityScale = 6.0 + (val * 12.0); // 6.0 to 18.0
            localStorage.setItem('NavigatorArcScale', String(arcVelocityScale));
            return;
        }

        // Handle teleport range control on right wrist menu
        if (item.id === 'teleport-dist') {
            maxTeleportDistance = 2.0 + val * 13.0; // scales from 2m to 15m
            localStorage.setItem('NavigatorMaxTeleportDistance', String(maxTeleportDistance));
            return;
        }

        if (item.id.startsWith('param-')) {
            // Roof
            if (item.id === 'param-amp') parametricState.waveAmplitude = val * 1.0;
            if (item.id === 'param-freq') parametricState.waveFrequency = val * 1.0;
            if (item.id === 'param-arch') parametricState.archCompression = val * 5.0;
            if (item.id === 'param-slat') parametricState.slatSpacing = 0.1 + val * 0.9;
            if (item.id === 'param-oculus') parametricState.oculusRadius = val * 10.0;
            
            // Wall
            if (item.id === 'param-wall-freq') parametricState.wallFreq = val * 1.0;
            if (item.id === 'param-wall-amp') parametricState.wallAmp = val * 1.0;
            if (item.id === 'param-wall-height') parametricState.wallHeightMod = val * 3.0;
            
            // Bench
            if (item.id === 'param-bench-dens') parametricState.benchDensity = val * 2.0;
            if (item.id === 'param-bench-depth') parametricState.benchDepth = val * 2.0;
            if (item.id === 'param-bench-wave') parametricState.benchWave = val * 2.0;
            
            // Stand
            if (item.id === 'param-stand-twist') parametricState.standTwist = val * Math.PI;
            if (item.id === 'param-stand-height') parametricState.standHeight = 0.5 + val * 1.5;
            if (item.id === 'param-stand-radius') parametricState.standRadius = val * 0.8;
            if (item.id === 'param-stand-slats') parametricState.standSlatPairs = val * 32.0;
            
            const now = performance.now();
            if (now - lastParametricRebuildTime > 100) { // 10fps limit during drag
                if (item.id.startsWith('param-wall-') && rebuildWallFunc) rebuildWallFunc();
                else if (item.id.startsWith('param-bench-') && rebuildBenchFunc) rebuildBenchFunc();
                else if (item.id.startsWith('param-stand-') && rebuildPedestalFunc) rebuildPedestalFunc();
                else if (rebuildCeilingFunc) rebuildCeilingFunc();
                
                lastParametricRebuildTime = now;
            }
            return;
        }

        const artifact = panel.userData.artifact;
        if (!artifact) return; // Guard against non-artifact panels with sliders
        
        artifact.userData.sliders[item.id] = val;

        const audioData = artifact.userData.audioData;
        if(audioData) {
            if (item.id === 'freq') {
                artifact.userData.speedMultiplier = val * 2.0;
                if (audioData.filter) audioData.filter.frequency.rampTo(200 + val * 3000, 0.1);
            } else if (item.id === 'mod') {
                if (audioData.synth) audioData.synth.volume.rampTo(Tone.gainToDb(val * 0.8), 0.1);
            } else if (item.id === 'space' && audioData.panner) {
                if (audioData.panner.setRolloffFactor) audioData.panner.setRolloffFactor(Math.max(0.1, 3.0 - (val * 2.9))); 
                if (audioData.panner.setRefDistance) audioData.panner.setRefDistance(Math.max(0.1, 1.0 + (val * 3.0)));
            }
        }
        
        if (multiuser && artifact.userData.parentExhibit) {
           multiuser.emitInteraction({ type: 'slider', exhibitGroupId: artifact.userData.parentExhibit.id, sliderId: item.id, value: val });
        }
    }

    function updateHoverStates() {
        let newlyHoveredPanel = null; let newlyHoveredItemId = null;
        for (let i = 0; i < _activeRayOriginsCount; i++) {
            const ray = _tempRayOrigins[i];
            raycaster.ray.copy(ray);
            
            // Filter panels to ignore those attached to the casting controller
            const targetPanels = interactablePanels.filter(panel => {
                if (panel.userData.isAttached && panel.userData.attachedTo === 'controller' && ray.sourceController && panel.userData.controllerRef === ray.sourceController) {
                    return false;
                }
                return true;
            });

            const intersects = raycaster.intersectObjects(targetPanels);
            if (intersects.length > 0) {
                const hit = intersects[0]; const panel = hit.object;
                let pixelX = hit.uv.x * panel.userData.width; 
                let pixelY = (1 - hit.uv.y) * panel.userData.height;

                // Magnetic Snapping for far-field laser precision
                if (panel.userData.interactables) {
                    for (const item of panel.userData.interactables) {
                        const centerX = item.x + item.w / 2;
                        const centerY = item.y + item.h / 2;
                        const distToCenter = Math.hypot(pixelX - centerX, pixelY - centerY);
                        if (distToCenter < 28) {
                            // Magnetic attraction toward button/slider center
                            pixelX = pixelX * 0.4 + centerX * 0.6;
                            pixelY = pixelY * 0.4 + centerY * 0.6;
                            if (ray.sourceController && panel.userData.hoveredItemId !== item.id) {
                                triggerHapticPulse(ray.sourceController, 0.1, 15);
                            }
                            break;
                        }
                    }
                }

                panel.userData.pointer.x = pixelX; panel.userData.pointer.y = pixelY; panel.userData.pointer.active = true;
                
                const normalizedX = (pixelX / panel.userData.width) * 2 - 1;
                const normalizedY = -(pixelY / panel.userData.height) * 2 + 1;
                panel.userData.pointer.targetTiltX = normalizedY * 0.15; 
                panel.userData.pointer.targetTiltY = normalizedX * 0.15; 

                if (activeSlider && activeSlider.controller && activeSlider.panel === panel) updateSliderValue(activeSlider, pixelX, pixelY);
                panel.userData.interactables.forEach(item => {
                    if (pixelX >= item.x && pixelX <= item.x + item.w && pixelY >= item.y && pixelY <= item.y + item.h) { newlyHoveredPanel = panel; newlyHoveredItemId = item.id; }
                });
                if (newlyHoveredPanel) break; 
            }
        }
        interactablePanels.forEach(panel => {
            const ptr = panel.userData.pointer;
            if (panel === newlyHoveredPanel) {
                if (panel.userData.hoveredItemId !== newlyHoveredItemId) {
                    panel.userData.hoveredItemId = newlyHoveredItemId;
                    if (newlyHoveredItemId) playUIFeedback('hover');
                }
            } else { 
                panel.userData.hoveredItemId = null; ptr.active = false; 
                ptr.targetTiltX = 0; ptr.targetTiltY = 0; 
            }

            ptr.currentTiltX += (ptr.targetTiltX - ptr.currentTiltX) * 0.1;
            ptr.currentTiltY += (ptr.targetTiltY - ptr.currentTiltY) * 0.1;
            
            if (panel.userData.isAttached) {
                if (panel.userData.attachedTo === 'camera') {
                    panel.rotation.set(ptr.currentTiltX, -Math.PI / 12 + ptr.currentTiltY, 0, 'YXZ');
                } else if (panel.userData.attachedTo === 'controller') {
                    panel.rotation.set(-Math.PI / 4 + ptr.currentTiltX, ptr.currentTiltY, 0, 'YXZ');
                }
            } else {
                panel.rotation.set(ptr.currentTiltX, -Math.PI / 6 + ptr.currentTiltY, 0, 'YXZ');
            }
        });

        const crosshairDOM = document.getElementById('crosshair-container');
        const loader = document.getElementById('gaze-loader');
        
        // Disable gaze dwell selection when presenting in VR
        const isDwellActive = newlyHoveredItemId && newlyHoveredItemId !== 'freq' && newlyHoveredItemId !== 'mod' && newlyHoveredItemId !== 'space' && !(renderer && renderer.xr.isPresenting);
        if (isDwellActive) {
            const currentItemKey = `${newlyHoveredPanel.uuid}_${newlyHoveredItemId}`;
            if (lastHoveredItem && lastHoveredItem.key === currentItemKey) {
                const elapsed = performance.now() - dwellStartTime;
                if (loader) {
                    loader.style.opacity = '1';
                    loader.style.transform = `rotate(${(elapsed / DWELL_DURATION) * 360}deg)`;
                }
                if (elapsed >= DWELL_DURATION) {
                    executeHoveredAction();
                    lastHoveredItem = null; 
                    if (loader) loader.style.opacity = '0';
                }
            } else {
                lastHoveredItem = { panel: newlyHoveredPanel, itemId: newlyHoveredItemId, key: currentItemKey };
                dwellStartTime = performance.now();
            }
        } else {
            lastHoveredItem = null;
            if (loader) loader.style.opacity = '0';
        }

        hoveredUIElement = newlyHoveredPanel ? { panel: newlyHoveredPanel, itemId: newlyHoveredItemId } : null;
    }

    function executeHoveredAction(controller = null) {
        if (hoveredUIElement && hoveredUIElement.itemId) {
            playUIFeedback('click');
            if (controller) triggerHapticPulse(controller, 0.8, 20); 

            // Handle theme button presses on both wall panels and the popup wrist panel
            if (hoveredUIElement.panel.userData.isThemePanel || hoveredUIElement.panel.userData.isWristMenu) {
                if (hoveredUIElement.itemId === 'summon-all') {
                    if (multiuser) {
                        const activeCam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
                        _tempVec3_1.setFromMatrixPosition(activeCam.matrixWorld);
                        multiuser.emitInteraction({ type: 'summon', pos: { x: _tempVec3_1.x, y: 0, z: _tempVec3_1.z } });
                    }
                    if (controller) triggerHapticPulse(controller, 1.0, 50);
                    return;
                }
                if (hoveredUIElement.itemId === 'theme-morning') galleryTheme = 'morning';
                if (hoveredUIElement.itemId === 'theme-spotlight') galleryTheme = 'spotlight';
                if (hoveredUIElement.itemId === 'theme-night') galleryTheme = 'night';
                if (hoveredUIElement.itemId === 'toggle-turn-mode') {
                    isSmoothTurnEnabled = !isSmoothTurnEnabled;
                    localStorage.setItem('NavigatorSmoothTurn', String(isSmoothTurnEnabled));
                    return;
                }
                if (hoveredUIElement.itemId === 'toggle-draw-mode') {
                    isDrawModeEnabled = !isDrawModeEnabled;
                    return;
                }
                if (hoveredUIElement.itemId === 'clear-drawings') {
                    clearClientDrawings();
                    if (multiuser) {
                        multiuser.emitInteraction({ type: 'clear-drawings' });
                    }
                    return;
                }
                localStorage.setItem('ScandinavianGalleryTheme', galleryTheme);
                if (multiuser) multiuser.emitInteraction({ type: 'theme', theme: galleryTheme });
                return;
            }

            if (hoveredUIElement.panel.userData.isRightWristMenu) {
                const actionId = hoveredUIElement.itemId;
                if (actionId === 'toggle-shutter') {
                    isComfortBlinkEnabled = !isComfortBlinkEnabled;
                    localStorage.setItem('NavigatorComfortBlink', String(isComfortBlinkEnabled));
                    return;
                }
                
                let targetPos = null;
                if (actionId === 'jump-orrery') targetPos = new THREE.Vector3(-3.4, 0, -0.7);
                if (actionId === 'jump-swarm') targetPos = new THREE.Vector3(0, 0, -2.4);
                if (actionId === 'jump-relic') targetPos = new THREE.Vector3(3.4, 0, -0.7);
                if (actionId === 'jump-center') targetPos = new THREE.Vector3(0, 0, 1.0);
                
                if (targetPos) {
                    const originalExposure = renderer.toneMappingExposure;
                    if (isComfortBlinkEnabled) {
                        renderer.toneMappingExposure = 0.01;
                    }
                    
                    _tempVec3_1.setFromMatrixPosition(camera.matrixWorld);
                    const shiftX = targetPos.x - _tempVec3_1.x;
                    const shiftZ = targetPos.z - _tempVec3_1.z;
                    
                    cameraGroup.position.x += shiftX;
                    cameraGroup.position.z += shiftZ;
                    cameraGroup.position.y = targetPos.y + baseCameraHeightOffset;
                    if (!renderer.xr.isPresenting) {
                        cameraGroup.position.y += 1.6;
                    }
                    
                    if (isComfortBlinkEnabled) {
                        setTimeout(() => {
                            renderer.toneMappingExposure = originalExposure;
                        }, 85);
                    }
                    
                    if (controller) {
                        triggerHapticPulse(controller, 0.9, 40);
                    }
                    playUIFeedback('hover');
                }
                return;
            }

            if (hoveredUIElement.panel.userData.isParametricConsole) {
                return; // Sliders are handled earlier. Console has no buttons.
            }

            const artifact = hoveredUIElement.panel.userData.artifact;
            const exhibit = artifact.userData.parentExhibit;
            const itemDef = hoveredUIElement.panel.userData.interactables.find(i => i.id === hoveredUIElement.itemId);
            
            if (itemDef && itemDef.type === 'slider') return;

            switch(hoveredUIElement.itemId) {
                case 'toggle': 
                    artifact.userData.isRotating = !artifact.userData.isRotating; 
                    if (multiuser) multiuser.emitInteraction({ type: 'toggle', exhibitGroupId: exhibit.id });
                    break;
                case 'inspect':
                    if (!artifact.userData.isInspected) {
                        exhibits.forEach(ex => { if(ex.userData.isInspected && ex !== artifact) resetArtifact(ex); });
                        artifact.userData.targetPosition.set(-0.6, 1.2, 1.5); 
                        artifact.userData.targetScale = new THREE.Vector3(1.5, 1.5, 1.5);
                        artifact.userData.isInspected = true; 
                        exhibit.userData.pedestalRing.color.setHex(0xffaa00); exhibit.userData.pedestalRing.opacity = 0.8;
                        
                        triggerParticleBurst(artifact.position, 1.5);
                        globalFocusMode = true; 
                        artifact.userData.spotLight.intensity = 5.0; 
                        
                        // Cozy auto-teleportation transition to stand in front of this exhibit's pedestal
                        // Ensures that if the user teleports elsewhere, clicking inspect glides them dynamically back
                        // to the exhibit pedestal viewpoint.
                        const targetWorldPlayerPos = new THREE.Vector3(0, 0, 1.8);
                        targetWorldPlayerPos.applyMatrix4(exhibit.matrixWorld);
                        
                        const originalExposure = renderer.toneMappingExposure;
                        renderer.toneMappingExposure = 0.01; // nearly instant dark blink
                        
                        _tempVec3_1.setFromMatrixPosition(camera.matrixWorld);
                        const shiftX = targetWorldPlayerPos.x - _tempVec3_1.x;
                        const shiftZ = targetWorldPlayerPos.z - _tempVec3_1.z;
                        
                        cameraGroup.position.x += shiftX;
                        cameraGroup.position.z += shiftZ;
                        cameraGroup.position.y = targetWorldPlayerPos.y;
                        if (!renderer.xr.isPresenting) {
                            cameraGroup.position.y += 1.6; // camera offset on flat screen
                        }
                        
                        // Visual camera orientation look-at Pedestal Center
                        const pedestalWorldPos = new THREE.Vector3(0, 1.4, 0);
                        pedestalWorldPos.applyMatrix4(exhibit.matrixWorld);
                        camera.lookAt(pedestalWorldPos);
                        targetCameraRotation.y = exhibit.rotation.y;
                        targetCameraRotation.x = 0;
                        
                        setTimeout(() => {
                            renderer.toneMappingExposure = originalExposure;
                        }, 85);
                        
                        if(artifact.userData.audioData) {
                            currentActiveAnalyser = artifact.userData.audioData.analyser;
                        }
                        if (multiuser) multiuser.emitInteraction({ type: 'inspect', exhibitGroupId: exhibit.id });
                    }
                    break;
                case 'reset':
                    if (artifact.userData.isInspected) {
                        resetArtifact(artifact);
                        if (multiuser) multiuser.emitInteraction({ type: 'reset', exhibitGroupId: exhibit.id });
                    }
                    break;
                case 'attach': {
                    const isAttached = hoveredUIElement.panel.userData.isAttached;
                    if (isAttached) {
                        // Detach
                        hoveredUIElement.panel.userData.isAttached = false;
                        hoveredUIElement.panel.userData.attachedTo = null;
                        
                        // Put back in original exhibitGroup
                        const exhibitGroup = artifact.userData.parentExhibit;
                        exhibitGroup.add(hoveredUIElement.panel);
                        
                        // Reset original transform
                        hoveredUIElement.panel.position.set(1.2, 1.5, 0);
                        hoveredUIElement.panel.rotation.set(0, -Math.PI / 6, 0);
                        if (itemDef) itemDef.text = 'Attach UI';
                        
                        playUIFeedback('click');
                        if (controller) triggerHapticPulse(controller, 0.6, 20);
                    } else {
                        // Attach
                        hoveredUIElement.panel.userData.isAttached = true;
                        
                        if (renderer.xr.isPresenting) {
                            let targetController = null;
                            if (controller) {
                                targetController = controllers.find(c => c !== controller);
                                if (!targetController) targetController = controller;
                            } else if (controllers.length > 0) {
                                targetController = controllers[0];
                            }
                            
                            if (targetController) {
                                hoveredUIElement.panel.userData.attachedTo = 'controller';
                                hoveredUIElement.panel.userData.controllerRef = targetController;
                                targetController.add(hoveredUIElement.panel);
                                
                                // Beautiful floating position/rotation on the non-dominant VR controller
                                hoveredUIElement.panel.position.set(-0.25, 0.15, -0.35);
                                hoveredUIElement.panel.rotation.set(-Math.PI / 4, 0, 0);
                                if (itemDef) itemDef.text = 'Detach UI';
                                
                                playUIFeedback('hover');
                                triggerHapticPulse(targetController, 0.8, 40);
                            }
                        } else {
                            // Desktop mode: Attach to camera
                            hoveredUIElement.panel.userData.attachedTo = 'camera';
                            camera.add(hoveredUIElement.panel);
                            hoveredUIElement.panel.position.set(0.3, -0.22, -0.8);
                            hoveredUIElement.panel.rotation.set(0, -Math.PI / 12, 0);
                            if (itemDef) itemDef.text = 'Detach UI';
                            
                            playUIFeedback('hover');
                        }
                    }
                    break;
                }
            }
        }
    }

    function resetArtifact(artifact) {
        const exhibit = artifact.userData.parentExhibit;
        artifact.userData.isRotating = true;
        artifact.userData.targetPosition.copy(artifact.userData.basePosition);
        artifact.userData.targetScale = new THREE.Vector3(1, 1, 1);
        artifact.userData.isInspected = false;
        exhibit.userData.pedestalRing.color.setHex(0x00ffaa); exhibit.userData.pedestalRing.opacity = 0.2;
        artifact.userData.spotLight.intensity = 0.5;
        if (!exhibits.some(ex => ex.userData.isInspected)) {
            globalFocusMode = false;
            currentActiveAnalyser = null;
        }
    }

    function detachAllAttachedPanels() {
        interactablePanels.forEach(panel => {
            if (panel.userData.isAttached) {
                panel.userData.isAttached = false;
                panel.userData.attachedTo = null;
                panel.userData.controllerRef = null;
                
                const exhibitGroup = panel.userData.artifact.userData.parentExhibit;
                exhibitGroup.add(panel);
                
                panel.position.set(1.2, 1.5, 0);
                panel.rotation.set(0, -Math.PI / 6, 0);
                
                const itemDef = panel.userData.interactables.find(i => i.id === 'attach');
                if (itemDef) itemDef.text = 'Attach UI';
            }
        });
    }

    function onWindowResize() {
        if (!camera || !renderer) return;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix(); 
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    let timeToNextSave = 2.0;

    function saveGalleryState() {
        try {
            const state = {};
            exhibits.forEach((container) => {
                if (container.userData && container.userData.parentExhibit) {
                    const artifactNode = container.children[0];
                    if (!artifactNode) return;
                    const exhibitId = interactablePanels.find(p => p.userData.artifact === container)?.userData.exhibitId;
                    if (exhibitId) {
                        state[exhibitId] = {
                            isRotating: container.userData.isRotating,
                            rotationY: artifactNode.rotation.y,
                            speedMultiplier: container.userData.speedMultiplier,
                            sliders: { ...container.userData.sliders }
                        };
                    }
                }
            });
            localStorage.setItem('ScandinavianGalleryState', JSON.stringify(state));
        } catch(e) {}
    }

    let lastNetworkUpdate = 0;
    let frames = 0;
    let lastFpsTime = 0;
    let currentFps = 60;
    
    function render(time) {
        try {
            const timeSec = time * 0.001;
            
            if (grabbedPhysicsObject && multiuser && multiuser.socket) {
                let targetPos = new THREE.Vector3();
                if (grabbedPhysicsObject.controller) {
                    const c = grabbedPhysicsObject.controller;
                    targetPos.set(0, 0, -grabbedPhysicsObject.distance).applyMatrix4(c.matrixWorld);
                } else {
                    raycaster.setFromCamera(mouse, camera);
                    targetPos.copy(raycaster.ray.direction).multiplyScalar(grabbedPhysicsObject.distance).add(camera.getWorldPosition(new THREE.Vector3()));
                }
                multiuser.socket.emit('interact', {
                    type: 'grab-move',
                    objectId: grabbedPhysicsObject.id,
                    position: { x: targetPos.x, y: targetPos.y, z: targetPos.z }
                });
            }

            frames++;
            if (time - lastFpsTime > 1000) {
                currentFps = Math.round((frames * 1000) / (time - lastFpsTime));
                frames = 0;
                lastFpsTime = time;
            }

            timeToNextSave -= 0.016; 
            if (timeToNextSave <= 0) {
                saveGalleryState();
                timeToNextSave = 2.0;
            }

            if (waterNormalMap) {
                waterNormalMap.offset.x = timeSec * 0.015;
                waterNormalMap.offset.y = timeSec * 0.010;
            }

        if (!renderer.xr.isPresenting) {
            currentCameraRotation.x += (targetCameraRotation.x - currentCameraRotation.x) * 0.08;
            currentCameraRotation.y += (targetCameraRotation.y - currentCameraRotation.y) * 0.08;
            cameraGroup.rotation.set(currentCameraRotation.x, currentCameraRotation.y, 0, 'YXZ');
        }

        if (Tone.context.state === 'running') {
            const activeCam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
            activeCam.getWorldPosition(_tempVec3_1);
            activeCam.getWorldDirection(_tempVec3_2);
            activeCam.getWorldQuaternion(_tempQuat);
            _tempVec3_3.set(0, 1, 0).applyQuaternion(_tempQuat);

        // Phase 3: Synchronize Spatial Audio Listener to headset/camera dynamically
            try {
                const rawListener = Tone.getContext?.()?.rawContext?.listener || (typeof Tone.getListener === 'function' ? Tone.getListener() : null);
                if (rawListener) {
                    const now = (Tone.now && typeof Tone.now === 'function') ? Tone.now() : 0;
                    if (rawListener.positionX && rawListener.positionX.setValueAtTime) {
                        rawListener.positionX.setValueAtTime(_tempVec3_1.x, now);
                        rawListener.positionY.setValueAtTime(_tempVec3_1.y, now);
                        rawListener.positionZ.setValueAtTime(_tempVec3_1.z, now);
                        if (rawListener.forwardX) {
                            rawListener.forwardX.setValueAtTime(_tempVec3_2.x, now);
                            rawListener.forwardY.setValueAtTime(_tempVec3_2.y, now);
                            rawListener.forwardZ.setValueAtTime(_tempVec3_2.z, now);
                        }
                        if (rawListener.upX) {
                            rawListener.upX.setValueAtTime(_tempVec3_3.x, now);
                            rawListener.upY.setValueAtTime(_tempVec3_3.y, now);
                            rawListener.upZ.setValueAtTime(_tempVec3_3.z, now);
                        }
                    } else if (rawListener.setPosition) {
                        rawListener.setPosition(_tempVec3_1.x, _tempVec3_1.y, _tempVec3_1.z);
                        if (rawListener.setOrientation) {
                            rawListener.setOrientation(_tempVec3_2.x, _tempVec3_2.y, _tempVec3_2.z, _tempVec3_3.x, _tempVec3_3.y, _tempVec3_3.z);
                        }
                    }
                }
            } catch (e) {
                // Silently guard spatial audio listener sync
            }

            // Phase 1: Acoustic Reverb Zones Crossfade based on coordinates
            const distFromCenter = Math.hypot(_tempVec3_1.x, _tempVec3_1.z);
            const oculusWeight = Math.max(0, 1.0 - (distFromCenter / 8.0));
            const myceliumWeight = Math.min(1.0, distFromCenter / 12.0);
            
            audioNodes.forEach(node => {
                if (node.oculusSend) node.oculusSend.gain.rampTo(oculusWeight * 0.8, 0.1);
                if (node.myceliumSend) node.myceliumSend.gain.rampTo(myceliumWeight * 0.8, 0.1);
            });
            
            if (multiuser && timeSec - lastNetworkUpdate > 0.05) {
               let lhPose = null;
               let rhPose = null;
               if (controllers.length >= 2) {
                   const lc = controllers[0];
                   const rc = controllers[1];
                   if (lc.visible) {
                       _tempVec3_2.setFromMatrixPosition(lc.matrixWorld);
                       _tempEuler.setFromRotationMatrix(lc.matrixWorld);
                       lhPose = { position: { x: _tempVec3_2.x, y: _tempVec3_2.y, z: _tempVec3_2.z }, rotation: { x: _tempEuler.x, y: _tempEuler.y, z: _tempEuler.z } };
                   }
                   if (rc.visible) {
                       _tempVec3_2.setFromMatrixPosition(rc.matrixWorld);
                       _tempEuler.setFromRotationMatrix(rc.matrixWorld);
                       rhPose = { position: { x: _tempVec3_2.x, y: _tempVec3_2.y, z: _tempVec3_2.z }, rotation: { x: _tempEuler.x, y: _tempEuler.y, z: _tempEuler.z } };
                   }
               }
               // Also check hand tracking as override if visible
               if (hands.length >= 2) {
                   if (hands[0].visible && Object.keys(hands[0].joints).length > 0) {
                       const wrist = hands[0].joints['wrist'];
                       if (wrist) {
                          _tempVec3_2.setFromMatrixPosition(wrist.matrixWorld);
                          _tempEuler.setFromRotationMatrix(wrist.matrixWorld);
                          lhPose = { position: { x: _tempVec3_2.x, y: _tempVec3_2.y, z: _tempVec3_2.z }, rotation: { x: _tempEuler.x, y: _tempEuler.y, z: _tempEuler.z } };
                       }
                   }
                   if (hands[1].visible && Object.keys(hands[1].joints).length > 0) {
                       const wrist = hands[1].joints['wrist'];
                       if (wrist) {
                          _tempVec3_2.setFromMatrixPosition(wrist.matrixWorld);
                          _tempEuler.setFromRotationMatrix(wrist.matrixWorld);
                          rhPose = { position: { x: _tempVec3_2.x, y: _tempVec3_2.y, z: _tempVec3_2.z }, rotation: { x: _tempEuler.x, y: _tempEuler.y, z: _tempEuler.z } };
                       }
                   }
               }
               multiuser.updatePosition(_tempVec3_1, cameraGroup.rotation, camera.rotation, lhPose, rhPose);
               lastNetworkUpdate = timeSec;
            }
        }
        
        if (multiuser) multiuser.update(timeSec);

        // Phase 3: Dynamic Theme Definitions
        const themes = {
            'morning': {
                ambCol: 0xffeedd, ambInt: 0.45,
                topCol: 0xfff5e6, topInt: 1.1,
                dirCol: 0xfff6ee, dirInt: 1.5,
                fogCol: 0xdddddd
            },
            'spotlight': {
                ambCol: 0xaaaaaa, ambInt: 0.1,
                topCol: 0xffeacc, topInt: 1.5,
                dirCol: 0xffffff, dirInt: 0.0, // sun disabled
                fogCol: 0x1a1a1a
            },
            'night': {
                ambCol: 0x05051a, ambInt: 0.2,
                topCol: 0x2244ff, topInt: 0.5,
                dirCol: 0x111155, dirInt: 0.5,
                fogCol: 0x050510
            }
        };

        const activeTheme = themes[galleryTheme] || themes['morning'];

        const targetAmbient = globalFocusMode ? 0.05 : activeTheme.ambInt;
        const targetTop = globalFocusMode ? 0.2 : activeTheme.topInt;
        const targetDir = globalFocusMode ? 0.04 : activeTheme.dirInt; // Completely solves VR/mobile dimming with shadowMap=false!
        
        ambientLight.intensity += (targetAmbient - ambientLight.intensity) * 0.05;
        topLight.intensity += (targetTop - topLight.intensity) * 0.05;
        dirLight.intensity += (targetDir - dirLight.intensity) * 0.05;

        _tempColorAmb.setHex(activeTheme.ambCol);
        _tempColorTop.setHex(activeTheme.topCol);
        _tempColorDir.setHex(activeTheme.dirCol);
        
        // Deep focus fog and background dimming (works across all display modes and Quest VR headsets)
        const currentFogColHex = globalFocusMode ? 0x020306 : activeTheme.fogCol;
        _tempColorFog.setHex(currentFogColHex);

        ambientLight.color.lerp(_tempColorAmb, 0.05);
        topLight.color.lerp(_tempColorTop, 0.05);
        dirLight.color.lerp(_tempColorDir, 0.05);
        scene.fog.color.lerp(_tempColorFog, 0.05);
        scene.background.lerp(_tempColorFog, 0.05);
        // Required for Meta Quest to honor background dimming in Immersive Sessions
        renderer.setClearColor(scene.background);

        if (bigWallMaterial) { 
            bigWallMaterial.uniforms.uTime.value = timeSec; 
            bigWallMaterial.uniforms.uOpacity.value += ((globalFocusMode ? 0.15 : 0.8) - bigWallMaterial.uniforms.uOpacity.value) * 0.05; 
            
            let ampValue = 0.0;
            if (currentActiveAnalyser) {
                const waveData = currentActiveAnalyser.getValue();
                let sum = 0.0;
                for(let j=0; j<waveData.length; j++) sum += Math.abs(waveData[j]);
                ampValue = sum / waveData.length;
            }
            bigWallMaterial.uniforms.uAudioLevel.value += (ampValue - bigWallMaterial.uniforms.uAudioLevel.value) * 0.1;
            
            
            if (typeof heroUniforms !== 'undefined') {
                heroUniforms.uTime.value = timeSec;
                // damp audio freq
                heroUniforms.uAudioFreq.value += (ampValue - heroUniforms.uAudioFreq.value) * 0.1;
                heroGroup.rotation.y += 0.005;
                heroGroup.rotation.x += 0.002;
            }
    if (myceliumMat) {
                const isNight = galleryTheme === 'night';
                const baseGlow = isNight ? 0.3 : 0.0;
                const audioGlow = ampValue * 2.0;
                const targetIntensity = globalFocusMode ? (isNight ? 0.1 : 0.0) : baseGlow + audioGlow;
                
                myceliumMat.emissiveIntensity += (targetIntensity - myceliumMat.emissiveIntensity) * 0.1;
                myceliumMat.emissive.lerp(isNight ? _mycColNight : _mycColDay, 0.05);
            }

            if (waterMat) {
                const isNight = galleryTheme === 'night';
                waterMat.color.lerp(isNight ? _cachedWaterColNight : _cachedWaterColDay, 0.05);
                const targetRipple = 0.18 + (ampValue * 0.3);
                waterMat.normalScale.set(
                    waterMat.normalScale.x + (targetRipple - waterMat.normalScale.x) * 0.1,
                    waterMat.normalScale.y + (targetRipple - waterMat.normalScale.y) * 0.1
                );
            }
        }

        if (ledScreenMaterial) {
            ledScreenMaterial.uniforms.uTime.value = timeSec;
            
            // Set dynamic theme color on the screen and soft floor scatter spot light
            _cachedActiveColor.setRGB(0.0, 1.0, 0.66); // spotlight cyan default
            if (galleryTheme === 'morning') {
                _cachedActiveColor.setRGB(1.0, 0.55, 0.15); // amber
            } else if (galleryTheme === 'night') {
                _cachedActiveColor.setRGB(0.6, 0.1, 1.0); // purple
            }
            ledScreenMaterial.uniforms.uThemeColor.value.copy(_cachedActiveColor);
            ledScreenMaterial.uniforms.uNightMode.value = (galleryTheme === 'night' ? 1.0 : 0.0);
            
            // Bring audio reactive amplification to LED art
            let ampValue = 0.0;
            if (currentActiveAnalyser) {
                const waveData = currentActiveAnalyser.getValue();
                let sum = 0.0;
                for(let j=0; j<waveData.length; j++) sum += Math.abs(waveData[j]);
                ampValue = sum / waveData.length;
            }
            ledScreenMaterial.uniforms.uAudioLevel.value += (ampValue - ledScreenMaterial.uniforms.uAudioLevel.value) * 0.1;

            if (ledScreenGlowLight) {
                ledScreenGlowLight.color.copy(_cachedActiveColor);
                // soft pulse based on sound amplitude!
                ledScreenGlowLight.intensity = 0.4 + ledScreenMaterial.uniforms.uAudioLevel.value * 2.5;
            }

            // Head tracking with active XR camera awareness in VR
            const activeCam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
            activeCam.getWorldPosition(_cachedHeadPos);
            ledScreenMaterial.uniforms.uHeadPos.value.copy(_cachedHeadPos);

            // Multimodal body/hand coordination update
            let hasLeftFinger = false;
            let hasRightFinger = false;
            
            if (renderer.xr.isPresenting) {
                // VR Mode hand / joint update
                hands.forEach((hand, idx) => {
                    if (hand.joints && Object.keys(hand.joints).length > 0) {
                        const indexTip = hand.joints['index-finger-tip'];
                        if (indexTip) {
                            _cachedTipPos.setFromMatrixPosition(indexTip.matrixWorld);
                            if (idx === 0) {
                                ledScreenMaterial.uniforms.uLeftFingerPos.value.copy(_cachedTipPos);
                                hasLeftFinger = true;
                            } else if (idx === 1) {
                                ledScreenMaterial.uniforms.uRightFingerPos.value.copy(_cachedTipPos);
                                hasRightFinger = true;
                            }
                        }
                    }
                });

                // Fallback to controllers if joints not ready
                if (!hasLeftFinger && controllers[0]) {
                    controllers[0].getWorldPosition(_cachedLeftPos);
                    ledScreenMaterial.uniforms.uLeftFingerPos.value.copy(_cachedLeftPos);
                    ledScreenMaterial.uniforms.uLeftHandPos.value.copy(_cachedLeftPos);
                }
                if (!hasRightFinger && controllers[1]) {
                    controllers[1].getWorldPosition(_cachedRightPos);
                    ledScreenMaterial.uniforms.uRightFingerPos.value.copy(_cachedRightPos);
                    ledScreenMaterial.uniforms.uRightHandPos.value.copy(_cachedRightPos);
                }
            } else {
                // Desktop fallbacks: map mouse ray intersection as physical field
                raycaster.setFromCamera(mouse, camera);
                const intersects = raycaster.intersectObject(ledScreenMesh);
                if (intersects.length > 0) {
                    const hitPoint = intersects[0].point;
                    ledScreenMaterial.uniforms.uRightFingerPos.value.copy(hitPoint);
                    ledScreenMaterial.uniforms.uLeftFingerPos.value.lerp(hitPoint, 0.05); // Smooth organic secondary wave chasing the mouse
                } else {
                    // Calm organic procedural wave idle state
                    const procX = Math.sin(timeSec) * 6.0;
                    const procY = 5.0 + Math.cos(timeSec * 0.7) * 2.0;
                    ledScreenMaterial.uniforms.uRightFingerPos.value.set(procX, procY, -18.5);
                    ledScreenMaterial.uniforms.uLeftFingerPos.value.set(-procX, procY + Math.sin(timeSec * 0.5) * 1.5, -18.5);
                }

                // Smoothly orbit hand auric attractors
                const leftOrbitX = Math.sin(timeSec * 0.4) * 8.0;
                const leftOrbitY = 4.0 + Math.cos(timeSec * 0.6) * 2.5;
                ledScreenMaterial.uniforms.uLeftHandPos.value.set(leftOrbitX, leftOrbitY, -18.5);
                
                const rightOrbitX = Math.cos(timeSec * 0.4) * 8.0;
                const rightOrbitY = 4.0 + Math.sin(timeSec * 0.6) * 2.5;
                ledScreenMaterial.uniforms.uRightHandPos.value.set(rightOrbitX, rightOrbitY, -18.5);
            }
        }

        const inspectedArtifact = exhibits.find(ex => ex.userData.isInspected);
        updateParticles(inspectedArtifact, timeSec);

        controllers.forEach(controller => {
            if (activeDrawings.has(controller)) {
                const drawing = activeDrawings.get(controller);
                _tempVec3_1.setFromMatrixPosition(controller.matrixWorld);
                
                // Add new point if moved enough (e.g. 2cm)
                if (_tempVec3_1.distanceTo(drawing.lastPoint) > 0.02) {
                    drawing.points.push(_tempVec3_1.clone());
                    drawing.lastPoint.copy(_tempVec3_1);
                    
                    // Rebuild geometry
                    const curve = new THREE.CatmullRomCurve3(drawing.points);
                    // TubeGeometry: curve, tubularSegments, radius, radialSegments, closed
                    const newGeometry = new THREE.TubeGeometry(curve, drawing.points.length * 2, 0.015, 8, false);
                    drawing.mesh.geometry.dispose();
                    drawing.mesh.geometry = newGeometry;
                    
                    // Emit stroke update to network periodically
                    const now = performance.now();
                    if (multiuser && now - drawing.lastEmitTime > 100) {
                        const serializedPoints = drawing.points.map(p => ({x: p.x, y: p.y, z: p.z}));
                        multiuser.emitInteraction({
                            type: 'draw-ribbon-update',
                            color: drawing.color,
                            points: serializedPoints
                        });
                        drawing.lastEmitTime = now;
                    }
                }
            }

            if (controller.userData.isSelecting && controller.userData.grabbedObject) {
                const curMat = controller.matrixWorld; const prevMat = controller.userData.previousMatrix;
                
                _cachedCurrentRot.setFromRotationMatrix(curMat);
                _cachedPrevRot.setFromRotationMatrix(prevMat);
                _cachedDeltaQuat.copy(_cachedCurrentRot).multiply(_cachedPrevRot.invert());
                controller.userData.grabbedObject.quaternion.premultiply(_cachedDeltaQuat);
                
                tossVelocity.set(_cachedDeltaQuat.y * 0.15, _cachedDeltaQuat.x * 0.15);
                controller.userData.grabbedObject.userData.angularVelocity.copy(tossVelocity);

                controller.userData.previousMatrix.copy(curMat);
                triggerAudioHapticSync(controller, controller.userData.grabbedObject);
            }
        });

        // Immersive Hand Tracking & Gesture Controls (Phase 2) - completely garbage allocation free
        if (renderer.xr.isPresenting) {
            hands.forEach(hand => {
                if (!hand.joints || Object.keys(hand.joints).length === 0) return;
                
                const indexTip = hand.joints['index-finger-tip'];
                const thumbTip = hand.joints['thumb-tip'];
                
                if (indexTip && thumbTip) {
                    _cachedIndexPos.setFromMatrixPosition(indexTip.matrixWorld);
                    _cachedThumbPos.setFromMatrixPosition(thumbTip.matrixWorld);
                    
                    const isPinching = _cachedIndexPos.distanceTo(_cachedThumbPos) < 0.025; // 2.5cm threshold
                    
                    if (!hand.userData.wasPinching && isPinching) {
                        hand.userData.wasPinching = true;
                        
                        // 1. Pinch-to-Inspect or Grab Exhibits
                        let grabbed = false;
                        for (let ex of exhibits) {
                            _cachedExPos.setFromMatrixPosition(ex.matrixWorld);
                            if (_cachedIndexPos.distanceTo(_cachedExPos) < 0.8) {
                                hand.userData.grabbedObject = ex;
                                hand.userData.previousMatrix = hand.matrixWorld.clone();
                                if (!ex.userData.isInspected) inspectArtifact(ex);
                                grabbed = true;
                                break;
                            }
                        }
                        
                        // 2. Gesture Teleportation via Palm Facing / Pinch-and-Pull
                        // If no artifact grabbed and palm facing up (teleport trigger)
                        if (!grabbed) {
                            const wrist = hand.joints['wrist'];
                            const middleBase = hand.joints['middle-finger-metacarpal'];
                            if (wrist && middleBase) {
                                _cachedWrPos.setFromMatrixPosition(wrist.matrixWorld);
                                _cachedMidPos.setFromMatrixPosition(middleBase.matrixWorld);
                                _cachedHandDir.subVectors(_cachedMidPos, _cachedWrPos).normalize();
                                
                                // Simplified: if hand points somewhat down, initiate teleport targeting
                                if (_cachedHandDir.dot(_tempUp) < -0.5) {
                                    hand.userData.isTeleporting = true;
                                }
                            }
                        }
                    } else if (hand.userData.wasPinching && !isPinching) {
                        hand.userData.wasPinching = false;
                        
                        // Release Inspect / Toss
                        if (hand.userData.grabbedObject) {
                            hand.userData.grabbedObject.userData.angularVelocity.set(0.01 * (Math.random() - 0.5), 0.01 * (Math.random() - 0.5));
                            hand.userData.grabbedObject = null;
                        }
                        
                        // Execute teleport
                        if (hand.userData.isTeleporting && hand.userData.teleportTarget) {
                            _tempVec3_1.setFromMatrixPosition(camera.matrixWorld);
                            const shiftX = hand.userData.teleportTarget.x - _tempVec3_1.x;
                            const shiftZ = hand.userData.teleportTarget.z - _tempVec3_1.z;
                            
                            const originalExposure = renderer.toneMappingExposure;
                            if (isComfortBlinkEnabled) {
                                renderer.toneMappingExposure = 0.01;
                            }
                            
                            cameraGroup.position.x += shiftX;
                            cameraGroup.position.z += shiftZ;
                            cameraGroup.position.y = hand.userData.teleportTarget.y + baseCameraHeightOffset;
                            if (!renderer.xr.isPresenting) {
                                cameraGroup.position.y += 1.6;
                            }
                            
                            if (isComfortBlinkEnabled) {
                                setTimeout(() => {
                                    renderer.toneMappingExposure = originalExposure;
                                }, 85);
                            }
                            
                            hand.userData.teleportTarget = null;
                            hand.userData.isTeleporting = false;
                            teleportMarker.visible = false;
                            if (mainReverb) playUIFeedback('hover');
                        }
                        hand.userData.isTeleporting = false;
                        teleportMarker.visible = false;
                    }
                    
                    // Teleport raycasting target logic on Hand Gesture
                    if (hand.userData.isTeleporting) {
                        const wrist = hand.joints['wrist'];
                        const index = hand.joints['index-finger-metacarpal'];
                        
                        if (wrist && index) {
                            _tempVec3_1.setFromMatrixPosition(wrist.matrixWorld);
                            _tempVec3_2.setFromMatrixPosition(index.matrixWorld);
                            _tempVec3_3.subVectors(_tempVec3_2, _tempVec3_1).normalize();
                            
                            const floorObj = scene.getObjectByName('teleportFloor');
                            if (floorObj) {
                                let p = _tempVec3_1.clone(); 
                                let v = _tempVec3_3.clone().multiplyScalar(arcVelocityScale); 
                                let dt = 0.05;
                                let hit = null;
                                
                                for (let i = 0; i < 30; i++) {
                                    _tempVec3_3.copy(p).addScaledVector(v, dt); // p_next
                                    v.y -= 9.8 * dt;
                                    
                                    raycaster.ray.origin.copy(p);
                                    raycaster.ray.direction.subVectors(_tempVec3_3, p).normalize();
                                    raycaster.near = 0;
                                    raycaster.far = p.distanceTo(_tempVec3_3);
                                    
                                    const hits = raycaster.intersectObject(floorObj);
                                    if (hits.length > 0) {
                                        hit = hits[0];
                                        break;
                                    }
                                    p.copy(_tempVec3_3);
                                }
                                raycaster.far = Infinity; // reset far
                                
                                if (hit && _tempVec3_1.distanceTo(hit.point) <= maxTeleportDistance && isTeleportLocationValid(hit.point)) {
                                    let finalPoint = hit.point.clone();
                                    let isPoiSnap = false;
                                    for (const poi of EXHIBIT_POIS) {
                                        if (hit.point.distanceTo(poi.position) < 1.35) {
                                            finalPoint.copy(poi.position);
                                            isPoiSnap = true;
                                            break;
                                        }
                                    }
                                    hand.userData.teleportTarget = finalPoint;
                                    teleportMarker.position.copy(finalPoint);
                                    teleportMarker.position.y += 0.02;
                                    teleportMarker.visible = true;
                                    teleportMarker.material.color.setHex(isPoiSnap ? 0xffcc00 : 0x00aaff);
                                } else {
                                    hand.userData.teleportTarget = null;
                                    teleportMarker.visible = hit != null;
                                    if (hit) {
                                        teleportMarker.position.copy(hit.point);
                                        teleportMarker.position.y += 0.02;
                                        teleportMarker.material.color.setHex(0xff3366);
                                    }
                                }
                            }
                        }
                    }

                    // Direct UI Manipulation ("Poke")
                    if (!isPinching) {
                        const pushThreshold = 0.04; // 4cm proximity to UI board
                        for (let panel of interactablePanels) {
                            const localPos = panel.worldToLocal(indexPos.clone());
                            
                            // Dynamically get the width and height of the plane
                            // geometry.parameters.width and geometry.parameters.height
                            const planeW = panel.geometry.parameters.width;
                            const planeH = panel.geometry.parameters.height;
                            const halfW = planeW / 2;
                            const halfH = planeH / 2;
                            
                            if (Math.abs(localPos.z) < pushThreshold && localPos.x > -halfW && localPos.x < halfW && localPos.y > -halfH && localPos.y < halfH) {
                                // Hit pixel mapped
                                const uvX = (localPos.x + halfW) / planeW; // 0 to 1
                                const uvY = (localPos.y + halfH) / planeH; // 0 to 1
                                const pixelX = uvX * panel.userData.width;
                                const pixelY = (1 - uvY) * panel.userData.height;
                                
                                let pushedItem = null;
                                for (const item of panel.userData.interactables) {
                                    if (pixelX >= item.x && pixelX <= item.x + item.w && pixelY >= item.y && pixelY <= item.y + item.h) {
                                        pushedItem = item;
                                        break;
                                    }
                                }
                                
                                if (pushedItem) {
                                    if (pushedItem.type === 'slider') {
                                        updateSliderValue({ item: pushedItem, panel: panel }, pixelX, pixelY);
                                    } else if (pushedItem.type === 'button') {
                                        // Simple debounce logic for poking buttons
                                        if (Date.now() - (hand.userData.lastPokeTime || 0) > 500) {
                                            hand.userData.lastPokeTime = Date.now();
                                            hoveredUIElement = { panel, itemId: pushedItem.id, artifact: panel.userData.artifact };
                                            executeHoveredAction(null); // Passing null since hand does not have Haptic act. directly
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    // Drag orientation with pinch
                    if (hand.userData.wasPinching && hand.userData.grabbedObject) {
                        const curMat = hand.matrixWorld; const prevMat = hand.userData.previousMatrix;
                        _tempQuat.setFromRotationMatrix(curMat);
                        _tempQuat2.setFromRotationMatrix(prevMat);
                        _tempQuat3.copy(_tempQuat).multiply(_tempQuat2.invert());
                        hand.userData.grabbedObject.quaternion.premultiply(_tempQuat3);
                        hand.userData.previousMatrix.copy(curMat);
                    }
                }
            });
        }

        exhibits.forEach(artifact => {
            const isGrabbed = controllers.some(c => c.userData.grabbedObject === artifact);
            if (artifact.children[0] && artifact.children[0].userData.animate && artifact !== draggedArtifact && !isGrabbed) {
                artifact.children[0].userData.animate(artifact.userData.speedMultiplier);
            }
            
            if (artifact.userData.angularVelocity && artifact.userData.angularVelocity.lengthSq() > 0.00001) {
                artifact.rotation.y += artifact.userData.angularVelocity.x;
                artifact.rotation.x += artifact.userData.angularVelocity.y;
                artifact.userData.angularVelocity.multiplyScalar(0.95); 
            } else if (!artifact.userData.isInspected && artifact !== draggedArtifact && !isGrabbed) {
                _tempQuat.identity();
                artifact.quaternion.slerp(_tempQuat, 0.06);
            }
            
            artifact.position.lerp(artifact.userData.targetPosition, 0.06);
            if (artifact.userData.targetScale) artifact.scale.lerp(artifact.userData.targetScale, 0.06);
            if (artifact !== draggedArtifact && !isGrabbed) artifact.position.y += Math.sin(time * 0.002 + artifact.id) * 0.0004;

            if (artifact.userData.audioData && artifact.userData.parentExhibit.userData.pedestalRing) {
                const ringMat = artifact.userData.parentExhibit.userData.pedestalRing;
                const level = Tone.dbToGain(artifact.userData.audioData.meter.getValue());
                ringMat.opacity = Math.max(0.2, Math.min(1.0, level * 2.0));
            }
        });

        visualizerBars.forEach(visualizerDeck => {
            const node = audioNodes.find(n => n.exhibitId === visualizerDeck.exhibitId);
            if (node && node.fft) {
                const freqs = node.fft.getValue(); 
                visualizerDeck.bars.forEach((bar, index) => {
                    const bandIndex = Math.floor((index / visualizerDeck.bars.length) * freqs.length);
                    const db = freqs[bandIndex] || -100;
                    const scale = Math.max(0.1, Tone.dbToGain(db) * 4.0); 
                    
                    bar.scale.y += (scale - bar.scale.y) * 0.15;
                    bar.position.y = 1.02 + bar.scale.y * 0.005;
                    bar.material.opacity = Math.max(0.2, Math.min(1.0, scale * 0.5));
                });
            }
        });

        interactablePanels.forEach(panel => { 
            if (time - (panel.userData._lastUIRenderMs || 0) > 33.3) {
                drawUIPanel(panel, timeSec); 
                panel.userData._lastUIRenderMs = time;
            }
        });

        // Rotate and pulse the advanced teleport marker volumetric beacon components
        if (teleportMarker && teleportMarker.visible) {
            const outer = teleportMarker.getObjectByName("outerRing");
            const inner = teleportMarker.getObjectByName("innerRing");
            const beacon = teleportMarker.getObjectByName("beacon");
            if (outer) outer.rotation.z = timeSec * 1.5;
            if (inner) inner.rotation.z = -timeSec * 2.2;
            if (beacon) {
                // Pulse size and glow opacity of rising cylinder
                beacon.scale.set(1 + Math.sin(timeSec * 8) * 0.05, 1 + Math.sin(timeSec * 6) * 0.1, 1 + Math.sin(timeSec * 8) * 0.05);
                beacon.material.opacity = 0.12 + Math.sin(timeSec * 10) * 0.06;
            }
        }

        _activeRayOriginsCount = 0;
        const crosshairContainer = document.getElementById('crosshair-container');
        const crosshair = document.getElementById('crosshair');

        if (renderer.xr.isPresenting) {
            if(crosshairContainer) crosshairContainer.style.display = 'none';
            let anyTeleporting = false;
            
            if (wristMenu && controllers[0]) {
                const c0 = controllers[0];
                const activeCam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
                activeCam.getWorldPosition(_tempVec3_1);
                c0.getWorldPosition(_tempVec3_2);
                _tempVec3_3.subVectors(_tempVec3_1, _tempVec3_2).normalize();
                
                _tempMat4.extractRotation(c0.matrixWorld);
                const cUp = _tempVec3_1.set(0, 1, 0).applyMatrix4(_tempMat4); // "Up" on the controller
                const cBack = _tempVec3_2.set(0, 0, 1).applyMatrix4(_tempMat4); // "Back" on the controller
                
                // When you look at your wrist, usually "Up" (Y) or "Back" (Z) points roughly at you.
                const dot = Math.max(cUp.dot(_tempVec3_3), cBack.dot(_tempVec3_3));
                
                if (dot > 0.4) {
                    if (!wristMenu.visible) { wristMenu.visible = true; wristMenu.scale.set(0.01, 0.01, 0.01); }
                    _tempVec3_1.set(1, 1, 1);
                    wristMenu.scale.lerp(_tempVec3_1, 0.15);
                } else {
                    _tempVec3_1.set(0.01, 0.01, 0.01);
                    wristMenu.scale.lerp(_tempVec3_1, 0.15);
                    if (wristMenu.scale.x < 0.05) wristMenu.visible = false;
                }
            }

            if (rightWristMenu && controllers[1]) {
                const c1 = controllers[1];
                const activeCam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
                activeCam.getWorldPosition(_tempVec3_1);
                c1.getWorldPosition(_tempVec3_2);
                _tempVec3_3.subVectors(_tempVec3_1, _tempVec3_2).normalize();
                
                _tempMat4.extractRotation(c1.matrixWorld);
                const cUp = _tempVec3_1.set(0, 1, 0).applyMatrix4(_tempMat4); // "Up" on the controller
                const cBack = _tempVec3_2.set(0, 0, 1).applyMatrix4(_tempMat4); // "Back" on the controller
                
                const dot = Math.max(cUp.dot(_tempVec3_3), cBack.dot(_tempVec3_3));
                
                if (dot > 0.4) {
                    if (!rightWristMenu.visible) { rightWristMenu.visible = true; rightWristMenu.scale.set(0.01, 0.01, 0.01); }
                    _tempVec3_1.set(1, 1, 1);
                    rightWristMenu.scale.lerp(_tempVec3_1, 0.15);
                } else {
                    _tempVec3_1.set(0.01, 0.01, 0.01);
                    rightWristMenu.scale.lerp(_tempVec3_1, 0.15);
                    if (rightWristMenu.scale.x < 0.05) rightWristMenu.visible = false;
                }
            }
            
            if (hudMenu) {
                const activeCam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
                // If the user's head pitch (rotation.x) is looking up
                _tempVec3_1.set(0,0,-1).applyQuaternion(activeCam.quaternion);
                const pitch = Math.asin(_tempVec3_1.y); // radians. looking directly up is pi/2
                if (pitch > 0.3) {
                    hudMenu.material.opacity += (0.9 - hudMenu.material.opacity) * 0.1;
                } else {
                    hudMenu.material.opacity += (0.0 - hudMenu.material.opacity) * 0.1;
                }
                const inspected = exhibits.find(ex => ex.userData.isInspected);
                if (hudMenu.material.opacity > 0.05) {
                    if (!hudMenu.userData._lastDrawMs) hudMenu.userData._lastDrawMs = 0;
                    if (time - hudMenu.userData._lastDrawMs > 33.3) {
                        drawHUDMode(timeSec, currentFps, inspected ? inspected.userData.title : null);
                        hudMenu.userData._lastDrawMs = time;
                    }
                }
            }

            const session = renderer.xr.getSession();
            if (session && session.inputSources) {
                for (const source of session.inputSources) {
                    if (source.gamepad && source.gamepad.axes && source.gamepad.axes.length >= 3) {
                        const x = source.gamepad.axes[2]; 
                        
                        if (!source.userData) source.userData = {};
                        if (!source.userData.snapTurnState) source.userData.snapTurnState = 0;
                        
                        if (isSmoothTurnEnabled) {
                            if (Math.abs(x) > 0.1) {
                                // Assume delta time is approx 1/60s for simplicity if we don't have it explicitly
                                // Actually we can use a hardcoded small step based on 90hz frame rate, roughly 0.011 seconds.
                                const dt = 0.016; 
                                const angle = -x * 1.5 * dt; // 1.5 rad/s speed
                                
                                const activeCam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
                                const headPos = new THREE.Vector3();
                                activeCam.getWorldPosition(headPos);
                                
                                cameraGroup.rotation.y += angle;
                                cameraGroup.updateMatrixWorld(true);
                                
                                const newHeadPos = new THREE.Vector3();
                                activeCam.getWorldPosition(newHeadPos);
                                
                                cameraGroup.position.x += (headPos.x - newHeadPos.x);
                                cameraGroup.position.z += (headPos.z - newHeadPos.z);
                            }
                        } else {
                            if (Math.abs(x) > 0.6) {
                                if (source.userData.snapTurnState === 0) {
                                    const originalExposure = renderer.toneMappingExposure;
                                    if (isComfortBlinkEnabled) renderer.toneMappingExposure = 0.01;
                                    
                                    const angle = (x > 0 ? -1 : 1) * (Math.PI / 4);
                                    const activeCam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
                                    const headPos = new THREE.Vector3();
                                    activeCam.getWorldPosition(headPos);
                                    
                                    cameraGroup.rotation.y += angle;
                                    cameraGroup.updateMatrixWorld(true);
                                    
                                    const newHeadPos = new THREE.Vector3();
                                    activeCam.getWorldPosition(newHeadPos);
                                    
                                    cameraGroup.position.x += (headPos.x - newHeadPos.x);
                                    cameraGroup.position.z += (headPos.z - newHeadPos.z);
                                    
                                    if (isComfortBlinkEnabled) {
                                        setTimeout(() => { renderer.toneMappingExposure = originalExposure; }, 85);
                                    }
                                    
                                    source.userData.snapTurnState = x > 0 ? 1 : -1;
                                }
                            } else if (Math.abs(x) < 0.2) {
                                source.userData.snapTurnState = 0;
                            }
                        }
                    }
                }
            }

            controllers.forEach(controller => {
                _tempMat4.identity().extractRotation(controller.matrixWorld);
                _tempRay.origin.setFromMatrixPosition(controller.matrixWorld);
                _tempRay.direction.set(0, 0, -1).applyMatrix4(_tempMat4); 
                
                if (_activeRayOriginsCount < _tempRayOrigins.length) {
                    _tempRayOrigins[_activeRayOriginsCount].copy(_tempRay);
                    _tempRayOrigins[_activeRayOriginsCount].sourceController = controller;
                    _activeRayOriginsCount++;
                }

                const targetPanels = interactablePanels.filter(panel => {
                    if (panel.userData.isAttached && panel.userData.attachedTo === 'controller' && panel.userData.controllerRef === controller) {
                        return false;
                    }
                    return true;
                });

                raycaster.ray.copy(_tempRay); const intersects = raycaster.intersectObjects(targetPanels);
                const line = controller.getObjectByName('line');
                const tLine = controller.userData.teleportLine;
                
                if (tLine) tLine.visible = false;

                if (line) {
                    if (controller.userData.isTeleporting) {
                        line.visible = false;
                    } else {
                        line.visible = true;
                        if (intersects.length > 0) { line.scale.z = intersects[0].distance / 5; line.material.color.setHex(0x00ffaa); line.material.opacity = 0.8; } 
                        else { line.scale.z = 1; line.material.color.setHex(0xffffff); line.material.opacity = 0.3; }
                    }
                }

                if (controller.userData.isTeleporting) {
                    anyTeleporting = true;
                    const floorObj = scene.getObjectByName('teleportFloor');
                    if (floorObj) {
                        let p = _tempVec3_1.copy(_tempRay.origin);
                        let v = _tempVec3_2.copy(_tempRay.direction).multiplyScalar(arcVelocityScale); // dynamic arc velocity
                        let dt = 0.05;
                        let hit = null;
                        
                        let positions;
                        if (tLine) positions = tLine.geometry.attributes.position.array;
                        let numPoints = 1;
                        if (tLine) {
                            positions[0] = p.x; positions[1] = p.y; positions[2] = p.z;
                        }
                        
                        for (let i = 0; i < 30; i++) {
                            _tempVec3_3.copy(p).addScaledVector(v, dt); // p_next
                            v.y -= 9.8 * dt;
                            
                            raycaster.ray.origin.copy(p);
                            raycaster.ray.direction.subVectors(_tempVec3_3, p).normalize();
                            raycaster.near = 0;
                            raycaster.far = p.distanceTo(_tempVec3_3);
                            
                            const floorHits = raycaster.intersectObject(floorObj);
                            if (floorHits.length > 0) {
                                hit = floorHits[0];
                                if (tLine) {
                                    positions[numPoints * 3] = hit.point.x;
                                    positions[numPoints * 3 + 1] = hit.point.y;
                                    positions[numPoints * 3 + 2] = hit.point.z;
                                }
                                numPoints++;
                                break;
                            }
                            
                            if (tLine) {
                                positions[numPoints * 3] = _tempVec3_3.x;
                                positions[numPoints * 3 + 1] = _tempVec3_3.y;
                                positions[numPoints * 3 + 2] = _tempVec3_3.z;
                            }
                            numPoints++;
                            p.copy(_tempVec3_3);
                        }
                        raycaster.far = Infinity; // reset far

                        if (hit && _tempRay.origin.distanceTo(hit.point) <= maxTeleportDistance && isTeleportLocationValid(hit.point)) {
                            let finalTeleportPoint = hit.point.clone();
                            let isPoiSnap = false;

                            // Magnetically snap to Exhibit POI Sweet Spots
                            for (const poi of EXHIBIT_POIS) {
                                if (hit.point.distanceTo(poi.position) < 1.35) {
                                    finalTeleportPoint.copy(poi.position);
                                    isPoiSnap = true;
                                    break;
                                }
                            }

                            teleportMarker.position.copy(finalTeleportPoint);
                            teleportMarker.position.y += 0.02;
                            teleportMarker.visible = true;
                            teleportMarker.material.color.setHex(isPoiSnap ? 0xffcc00 : 0x00aaff);
                            controller.userData.teleportTarget = finalTeleportPoint;
                            
                            if (tLine) {
                                tLine.visible = true;
                                tLine.material.color.setHex(isPoiSnap ? 0xffcc00 : 0x00aaff);
                                for (let i = numPoints; i <= 30; i++) {
                                    positions[i * 3] = finalTeleportPoint.x;
                                    positions[i * 3 + 1] = finalTeleportPoint.y;
                                    positions[i * 3 + 2] = finalTeleportPoint.z;
                                }
                                tLine.geometry.attributes.position.needsUpdate = true;
                            }
                        } else {
                            teleportMarker.visible = hit != null;
                            if (hit) {
                                teleportMarker.position.copy(hit.point);
                                teleportMarker.position.y += 0.02;
                                teleportMarker.material.color.setHex(0xff3366);
                            }
                            controller.userData.teleportTarget = null;
                            
                            if (tLine && hit) {
                                tLine.visible = true;
                                tLine.material.color.setHex(0xff3366);
                                for (let i = numPoints; i <= 30; i++) {
                                    positions[i * 3] = hit.point.x;
                                    positions[i * 3 + 1] = hit.point.y;
                                    positions[i * 3 + 2] = hit.point.z;
                                }
                                tLine.geometry.attributes.position.needsUpdate = true;
                            } else if (tLine) {
                                tLine.visible = false;
                            }
                            
                            if (line && (!tLine || !tLine.visible)) { line.visible = true; line.scale.z = 1; line.material.color.setHex(0x00aaff); }
                        }
                    }
                }
            });
            if (!anyTeleporting && teleportMarker) teleportMarker.visible = false;
        } else {
            if (crosshairContainer && crosshair) {
                crosshairContainer.style.display = 'flex';
                if (isPointerDown) {
                    _tempVec2.copy(mouse);
                } else {
                    _tempVec2.set(0, 0);
                }
                raycaster.setFromCamera(_tempVec2, camera); 
                
                if (_activeRayOriginsCount < _tempRayOrigins.length) {
                    _tempRayOrigins[_activeRayOriginsCount].copy(raycaster.ray);
                    _activeRayOriginsCount++;
                }

                const isHoveringExhibit = raycaster.intersectObjects(exhibits, true).some(h => exhibits.includes(h.object.parent?.parent) && h.object.parent?.parent.userData.isInspected);

                if (isPointerDown) { 
                    crosshairContainer.style.left = `${(mouse.x + 1) / 2 * 100}%`; 
                    crosshairContainer.style.top = `${(-mouse.y + 1) / 2 * 100}%`; 
                } else { 
                    crosshairContainer.style.left = '50%'; 
                    crosshairContainer.style.top = '50%'; 
                }

                if (activeSlider || hoveredUIElement) { 
                    crosshair.style.transform = 'scale(2.0)'; 
                    crosshair.style.backgroundColor = 'rgba(0, 255, 170, 0.8)'; 
                } 
                else if (isHoveringExhibit) { 
                    crosshair.style.transform = 'scale(1.5)'; 
                    crosshair.style.backgroundColor = 'rgba(255, 170, 0, 0.8)'; 
                } 
                else { 
                    crosshair.style.transform = 'scale(1)'; 
                    crosshair.style.backgroundColor = 'rgba(255, 255, 255, 0.6)'; 
                }
            }
        }
        
        updateHoverStates();
        renderer.render(scene, camera);
        } catch (e) {
            console.error(e);
            if (!window.renderErrLogged) {
                window.renderErrLogged = true;
                const errDiv = document.createElement("div");
                errDiv.style.position = "absolute"; errDiv.style.top = "50px"; errDiv.style.left = "10px"; errDiv.style.color = "yellow"; errDiv.style.zIndex = "9999"; errDiv.innerText = e.stack; document.body.appendChild(errDiv);
            }
        }
    }

    function applyParametricUpdate(newParams) {
        if (!newParams) return;
        Object.assign(parametricState, newParams);

        if (parametricConsole && parametricConsole.userData && parametricConsole.userData.interactables) {
            parametricConsole.userData.interactables.forEach(item => {
                if (item.id === 'param-amp' && parametricState.waveAmplitude !== undefined) item.value = Math.max(0, Math.min(1, parametricState.waveAmplitude / 1.0));
                if (item.id === 'param-freq' && parametricState.waveFrequency !== undefined) item.value = Math.max(0, Math.min(1, parametricState.waveFrequency / 1.0));
                if (item.id === 'param-arch' && parametricState.archCompression !== undefined) item.value = Math.max(0, Math.min(1, parametricState.archCompression / 5.0));
                if (item.id === 'param-slat' && parametricState.slatSpacing !== undefined) item.value = Math.max(0, Math.min(1, (parametricState.slatSpacing - 0.1) / 0.9));
                if (item.id === 'param-oculus' && parametricState.oculusRadius !== undefined) item.value = Math.max(0, Math.min(1, parametricState.oculusRadius / 10.0));

                if (item.id === 'param-wall-freq' && parametricState.wallFreq !== undefined) item.value = Math.max(0, Math.min(1, parametricState.wallFreq / 1.0));
                if (item.id === 'param-wall-amp' && parametricState.wallAmp !== undefined) item.value = Math.max(0, Math.min(1, parametricState.wallAmp / 1.0));
                if (item.id === 'param-wall-height' && parametricState.wallHeightMod !== undefined) item.value = Math.max(0, Math.min(1, parametricState.wallHeightMod / 3.0));

                if (item.id === 'param-bench-dens' && parametricState.benchDensity !== undefined) item.value = Math.max(0, Math.min(1, parametricState.benchDensity / 2.0));
                if (item.id === 'param-bench-depth' && parametricState.benchDepth !== undefined) item.value = Math.max(0, Math.min(1, parametricState.benchDepth / 2.0));
                if (item.id === 'param-bench-wave' && parametricState.benchWave !== undefined) item.value = Math.max(0, Math.min(1, parametricState.benchWave / 2.0));

                if (item.id === 'param-stand-twist' && parametricState.standTwist !== undefined) item.value = Math.max(0, Math.min(1, parametricState.standTwist / Math.PI));
                if (item.id === 'param-stand-height' && parametricState.standHeight !== undefined) item.value = Math.max(0, Math.min(1, (parametricState.standHeight - 0.5) / 1.5));
                if (item.id === 'param-stand-radius' && parametricState.standRadius !== undefined) item.value = Math.max(0, Math.min(1, parametricState.standRadius / 0.8));
                if (item.id === 'param-stand-slats' && parametricState.standSlatPairs !== undefined) item.value = Math.max(0, Math.min(1, parametricState.standSlatPairs / 32.0));
            });
        }

        if (rebuildCeilingFunc) rebuildCeilingFunc();
        if (rebuildWallFunc) rebuildWallFunc();
        if (rebuildBenchFunc) rebuildBenchFunc();
        if (rebuildPedestalFunc) rebuildPedestalFunc();
    }

    return {
        applyParametricUpdate,
        getParametricState: () => ({ ...parametricState }),
        start: async () => {
            try {
                if (Tone && Tone.context && Tone.context.state !== 'running') {
                    await Tone.start();
                }
            } catch (e) {
                console.warn("Tone.start note:", e);
            }
            try {
                initAudioSystem();
            } catch (e) {
                console.warn("initAudioSystem note:", e);
            }
            shouldRunVoice = true;
            if (voiceRecognition) {
                try { voiceRecognition.start(); } catch(e){}
            }
        },
        dispose: () => {
             isDisposed = true;
             shouldRunVoice = false;
             if (loadFallbackTimer) clearTimeout(loadFallbackTimer);
             if (initLoadTimer) clearTimeout(initLoadTimer);
             if (voiceRestartTimeout) clearTimeout(voiceRestartTimeout);
             if (voiceRecognition) {
                 try { voiceRecognition.abort(); } catch(e){}
                 voiceRecognition = null;
             }
             if (multiuser) {
                 try { multiuser.dispose(); } catch(e){}
                 multiuser = null;
             }
             if (Tone && Tone.Transport) {
                 try { Tone.Transport.stop(); } catch(e){}
             }
             audioNodes.forEach(node => {
                 try { if (node.loop) node.loop.dispose(); } catch(e){}
                 try { if (node.synth) node.synth.dispose(); } catch(e){}
                 try { if (node.filter) node.filter.dispose(); } catch(e){}
                 try { if (node.analyser) node.analyser.dispose(); } catch(e){}
                 try { if (node.fft) node.fft.dispose(); } catch(e){}
                 try { if (node.meter) node.meter.dispose(); } catch(e){}
             });
             audioNodes.length = 0;

             window.removeEventListener('resize', windowResizeListener);
             window.removeEventListener('mousedown', windowMouseDownListener);
             window.removeEventListener('mousemove', windowMouseMoveListener);
             window.removeEventListener('mouseup', windowMouseUpListener);
             window.removeEventListener('click', windowClickListener);
             if (vrButton && vrButton.parentNode) {
                 vrButton.parentNode.removeChild(vrButton);
             }
             if (renderer) {
                 renderer.setAnimationLoop(null);
                 renderer.dispose();
                 try {
                     renderer.forceContextLoss();
                 } catch(e){}
             }
        },
        setDirectorMode: (enabled) => {
            isDirectorMode = enabled;
            if (enabled) {
                if (cameraGroup) {
                    cameraGroup.position.set(2, 6, 8);
                    targetCameraRotation.x = -Math.PI/6;
                    targetCameraRotation.y = Math.PI/4;
                    currentCameraRotation.x = -Math.PI/6;
                    currentCameraRotation.y = Math.PI/4;
                    cameraGroup.rotation.set(-Math.PI/6, Math.PI/4, 0, 'YXZ');
                    // Force desktop mode camera control off for isometric
                }
                const btn = vrButton || document.getElementById('VRButton');
                if (btn) btn.style.display = 'none';
            } else {
                const btn = vrButton || document.getElementById('VRButton');
                if (btn) btn.style.display = '';
            }
        },
        emitInteraction: (data) => {
            if (multiuser) multiuser.emitInteraction(data);
        },
        getCameraPos: () => {
            if (camera) {
                _tempVec3_1.setFromMatrixPosition(camera.matrixWorld);
                return { x: _tempVec3_1.x, y: 0, z: _tempVec3_1.z };
            }
            
    function toggleFocusMode() {
        globalFocusMode = !globalFocusMode;
        // update the button visually if needed
        const btn = diegeticButtons[0];
        if (btn) {
            btn.material.emissive.setHex(globalFocusMode ? 0xff4444 : 0x220000);
        }
    }
    return { x: 0, y: 0, z: 0 };
        },
        getCameraRot: () => {
            if (camera) {
                return camera.rotation.y;
            }
            return 0;
        },
        getConnectedUsers: () => {
            if (!multiuser || !multiuser.peers) return [];
            const users = [];
            for (const [id, peer] of multiuser.peers.entries()) {
                users.push({
                    id: id,
                    position: {
                        x: peer.targetPosition.x,
                        y: peer.targetPosition.y,
                        z: peer.targetPosition.z
                    }
                });
            }
            return users;
        },
        teleportCamera: (x, z) => {
            if (cameraGroup) {
                cameraGroup.position.set(x, cameraGroup.position.y, z);
            }
        },
        setDirectorView: (viewId) => {
            if (!cameraGroup) return;
            if (viewId === 'default') {
                cameraGroup.position.set(2, 6, 8);
                targetCameraRotation.x = -Math.PI/6;
                targetCameraRotation.y = Math.PI/4;
                currentCameraRotation.x = -Math.PI/6;
                currentCameraRotation.y = Math.PI/4;
            } else if (viewId === 'orrery') {
                cameraGroup.position.set(-3.4, 3, 1.5);
                targetCameraRotation.x = -Math.PI/12;
                targetCameraRotation.y = 0;
                currentCameraRotation.x = -Math.PI/12;
                currentCameraRotation.y = 0;
            } else if (viewId === 'swarm') {
                cameraGroup.position.set(0, 3, 0.5);
                targetCameraRotation.x = -Math.PI/12;
                targetCameraRotation.y = 0;
                currentCameraRotation.x = -Math.PI/12;
                currentCameraRotation.y = 0;
            } else if (viewId === 'relic') {
                cameraGroup.position.set(3.4, 3, 1.5);
                targetCameraRotation.x = -Math.PI/12;
                targetCameraRotation.y = 0;
                currentCameraRotation.x = -Math.PI/12;
                currentCameraRotation.y = 0;
            }
        }
    };
}
