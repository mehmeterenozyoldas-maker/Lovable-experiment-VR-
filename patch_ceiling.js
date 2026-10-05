const fs = require('fs');
let code = fs.readFileSync('src/lib/engine.js', 'utf8');

const ceilingStart = code.indexOf('rebuildCeilingFunc = () => {');
const ceilingEnd = code.indexOf('};', ceilingStart) + 2;

const newCeilingFunc = `rebuildCeilingFunc = () => {
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
            acousticIM.instanceMatrix.needsUpdate = true;
            slatIM.instanceMatrix.needsUpdate = true;
            ledIM.instanceMatrix.needsUpdate = true;

            ceilingGroup.add(beamIM);
            ceilingGroup.add(rodIM);
            if (acousticIdx > 0) ceilingGroup.add(acousticIM);
            if (slatIdx > 0) ceilingGroup.add(slatIM);
            if (ledIdx > 0) ceilingGroup.add(ledIM);
        };`;

code = code.substring(0, ceilingStart) + newCeilingFunc + code.substring(ceilingEnd);
fs.writeFileSync('src/lib/engine.js', code);
console.log('Ceiling patched');
