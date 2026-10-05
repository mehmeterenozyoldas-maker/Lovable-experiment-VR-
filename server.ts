import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import * as CANNON from "cannon-es";
import fs from "fs";
import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || "",
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // --- API Routes ---
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", geminiKeyConfigured: !!process.env.GEMINI_API_KEY });
  });

  // 1. Prompt-Driven Parametric Design Generation Route
  app.post("/api/generate-architecture", async (req, res) => {
    const { prompt } = req.body;
    
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: "Prompt string is required" });
    }

    try {

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server." });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: `You are an architectural computation engine for a Scandinavian Parametric Museum.
Convert this natural language architectural prompt into exact procedural 3D parameters:
Prompt: "${prompt}"

Calculate values adhering strictly to these exact numeric ranges:
- waveAmplitude: [0.1 to 0.9] (Roof wave amplitude height)
- waveFrequency: [0.05 to 0.5] (Roof wave spatial frequency)
- archCompression: [0.5 to 4.5] (Roof arch compression factor)
- slatSpacing: [0.15 to 0.85] (Timber slat gap spacing)
- oculusRadius: [2.0 to 9.0] (Sky skylight radius in meters)
- wallFreq: [0.05 to 0.5] (Bioclimatic acoustic wall frequency)
- wallAmp: [0.05 to 0.6] (Wall acoustic wave extrusion depth)
- wallHeightMod: [0.5 to 2.8] (Wall height variance factor)
- benchDensity: [0.4 to 1.8] (Ergonomic wooden bench slat density)
- benchDepth: [0.5 to 1.8] (Bench seating depth profile)
- benchWave: [0.2 to 1.8] (Bench ergonomic curvature wave)
- standTwist: [0.0 to 3.14] (Pedestal diagrid twist angle in radians)
- standHeight: [0.7 to 1.8] (Pedestal height in meters)
- standRadius: [0.2 to 0.7] (Pedestal base radius)
- standSlatPairs: [8 to 28] (Pedestal slat pairs count)
- conceptTitle: concise architectural concept name (3-5 words)
- description: 2-3 sentences explaining the structural aesthetics, acoustic resonance, and light filtering characteristics.
- recommendedTheme: one of ["morning", "spotlight", "night"]`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              waveAmplitude: { type: Type.NUMBER },
              waveFrequency: { type: Type.NUMBER },
              archCompression: { type: Type.NUMBER },
              slatSpacing: { type: Type.NUMBER },
              oculusRadius: { type: Type.NUMBER },
              wallFreq: { type: Type.NUMBER },
              wallAmp: { type: Type.NUMBER },
              wallHeightMod: { type: Type.NUMBER },
              benchDensity: { type: Type.NUMBER },
              benchDepth: { type: Type.NUMBER },
              benchWave: { type: Type.NUMBER },
              standTwist: { type: Type.NUMBER },
              standHeight: { type: Type.NUMBER },
              standRadius: { type: Type.NUMBER },
              standSlatPairs: { type: Type.NUMBER },
              conceptTitle: { type: Type.STRING },
              description: { type: Type.STRING },
              recommendedTheme: { type: Type.STRING }
            },
            required: [
              "waveAmplitude", "waveFrequency", "archCompression", "slatSpacing", "oculusRadius",
              "wallFreq", "wallAmp", "wallHeightMod",
              "benchDensity", "benchDepth", "benchWave",
              "standTwist", "standHeight", "standRadius", "standSlatPairs",
              "conceptTitle", "description", "recommendedTheme"
            ]
          }
        }
      });

      const jsonText = response.text || "{}";
      const data = JSON.parse(jsonText);
      res.json({ status: "success", parameters: data });
    } catch (error: any) {
      console.warn("Gemini API unavailable or quota reached, generating algorithmic fallback architecture:", error?.message);
      
      // Resilient Parametric Synthesis based on Prompt Semantics
      const lower = (prompt || "").toLowerCase();
      const isHighArch = lower.includes("cathedral") || lower.includes("arch") || lower.includes("high") || lower.includes("tall");
      const isDense = lower.includes("dense") || lower.includes("tight") || lower.includes("acoustic") || lower.includes("wood");
      const isTwist = lower.includes("twist") || lower.includes("spiral") || lower.includes("helix") || lower.includes("diagrid");
      const isNight = lower.includes("dark") || lower.includes("night") || lower.includes("glacier") || lower.includes("ice") || lower.includes("cosmic");

      const fallbackParams = {
        waveAmplitude: isHighArch ? 0.78 : (lower.includes("minimal") ? 0.22 : 0.48),
        waveFrequency: isDense ? 0.35 : 0.18,
        archCompression: isHighArch ? 3.8 : 2.1,
        slatSpacing: isDense ? 0.22 : 0.65,
        oculusRadius: lower.includes("oculus") || isHighArch ? 7.2 : 4.5,
        wallFreq: isTwist ? 0.38 : 0.15,
        wallAmp: isHighArch ? 0.45 : 0.25,
        wallHeightMod: isHighArch ? 2.4 : 1.4,
        benchDensity: isDense ? 1.4 : 0.8,
        benchDepth: 1.1,
        benchWave: isTwist ? 1.3 : 0.6,
        standTwist: isTwist ? 2.8 : 0.9,
        standHeight: isHighArch ? 1.4 : 0.95,
        standRadius: 0.45,
        standSlatPairs: isDense ? 22 : 14,
        conceptTitle: isHighArch ? "Resonant Timber Cathedral" : (isNight ? "Nordic Aurora Pavilion" : "Parametric Acoustic Canopy"),
        description: `Algorithmic synthesis generated for "${prompt.substring(0, 50)}...". Features custom acoustic timber diffraction, modulated skylight diffusion, and biophilic fluid curvature.`,
        recommendedTheme: isNight ? "night" : (isHighArch ? "spotlight" : "morning")
      };

      res.json({ status: "success", parameters: fallbackParams, synthesized: true });
    }
  });

  // 2. AI Exhibit Curator Route
  app.post("/api/curate-exhibit", async (req, res) => {
    try {
      const { exhibitId, title, description, userPrompt } = req.body;
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY is missing." });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.6-flash",
        contents: `You are the AI Chief Curator for the Scandinavian Parametric Museum.
Provide a rich, deeply engaging curation review for this exhibit:
Exhibit ID: ${exhibitId || 'exhibit-01'}
Title: ${title || 'Nordic Acoustic Installation'}
Base Description: ${description || 'Interactive spatial audio sculpture.'}
${userPrompt ? `User Inquirer Question: "${userPrompt}"` : ''}

Synthesize a response with:
1. curatorInsight: 3 sentences on artistic philosophy, spatial acoustics, and physical interaction.
2. materialAnalysis: Breakdown of sustainable materials (e.g., bio-composite mycelium, double-curved glulam timber, recycled brass, piezoelectric sound transducers).
3. sustainabilityScore: integer from 85 to 99.
4. acousticResonanceNotes: harmonic frequency behavior and spatial reverb profile.
5. audioPreset: spatial synth parameters for live sound generation (synthWave: 'sine'|'sawtooth'|'square'|'triangle', rootNote: e.g. 'C3', 'E3', 'A2', shimmerIntensity: 0.1-1.0, tempoBpm: 60-120).`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              curatorInsight: { type: Type.STRING },
              materialAnalysis: { type: Type.STRING },
              sustainabilityScore: { type: Type.NUMBER },
              acousticResonanceNotes: { type: Type.STRING },
              audioPreset: {
                type: Type.OBJECT,
                properties: {
                  synthWave: { type: Type.STRING },
                  rootNote: { type: Type.STRING },
                  shimmerIntensity: { type: Type.NUMBER },
                  tempoBpm: { type: Type.NUMBER }
                },
                required: ["synthWave", "rootNote", "shimmerIntensity", "tempoBpm"]
              }
            },
            required: ["title", "curatorInsight", "materialAnalysis", "sustainabilityScore", "acousticResonanceNotes", "audioPreset"]
          }
        }
      });

      const jsonText = response.text || "{}";
      const curation = JSON.parse(jsonText);
      res.json({ status: "success", curation });
    } catch (error: any) {
      console.warn("Gemini curation API unavailable (high demand), returning intelligent curator fallback:", error?.message);
      const { title } = req.body;
      const fallbackCuration = {
        title: title || "Nordic Parametric Synthesis",
        curatorInsight: `This architectural installation embodies Scandinavian functional minimalism, integrating organic biophilic curves with advanced spatial acoustics. The interplay of shadow and diffused daylight fosters a contemplative, serene spatial atmosphere. Visitors experience tactile harmony through raw sustainable materials and responsive ambient soundscapes.`,
        materialAnalysis: "Engineered FSC-certified glulam timber ribs, acoustic bio-composite mycelium insulation, recycled brushed architectural brass, and low-embodied carbon concrete.",
        sustainabilityScore: 94,
        acousticResonanceNotes: "Tuned harmonic resonance centered at 432Hz with secondary reflections dampened by porous wood-wool panels.",
        audioPreset: {
          synthWave: "sine",
          rootNote: "C3",
          shimmerIntensity: 0.65,
          tempoBpm: 76
        }
      };
      res.json({ status: "success", curation: fallbackCuration, synthesized: true });
    }
  });

  // 3. AI Curator Voice Narration (TTS) Route
  app.post("/api/generate-narration", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ error: "Text is required for narration" });
      }
      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "GEMINI_API_KEY missing" });
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: `Speak warmly and articulate as an exhibition curator: ${text}` }] }],
        config: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Kore" },
            },
          },
        },
      });

      const candidate = response.candidates?.[0];
      const audioPart = candidate?.content?.parts?.find((p: any) => p.inlineData && p.inlineData.mimeType?.startsWith('audio/'));
      
      if (audioPart && audioPart.inlineData) {
        res.json({
          status: "success",
          audioBase64: audioPart.inlineData.data,
          mimeType: audioPart.inlineData.mimeType
        });
      } else {
        res.json({
          status: "fallback",
          message: "TTS stream produced text response",
          text: response.text || text
        });
      }
    } catch (error: any) {
      console.warn("Gemini TTS narration API unavailable, falling back to text:", error?.message);
      res.json({
        status: "fallback",
        message: "TTS fallback due to high demand",
        text: req.body.text
      });
    }
  });

  // --- Spatial Memory Setup ---
  const RIBBONS_FILE = path.join(process.cwd(), 'ribbons.json');
  let savedRibbons: any[] = [];
  try {
    if (fs.existsSync(RIBBONS_FILE)) {
      savedRibbons = JSON.parse(fs.readFileSync(RIBBONS_FILE, 'utf-8'));
      console.log(`Loaded ${savedRibbons.length} saved ribbons from file.`);
    }
  } catch (e) {
    console.error("Error loading saved ribbons:", e);
  }

  function saveRibbonsToFile() {
    try {
      fs.writeFileSync(RIBBONS_FILE, JSON.stringify(savedRibbons, null, 2));
    } catch (e) {
      console.error("Error saving ribbons to file:", e);
    }
  }

  const server = createServer(app);
  const io = new Server(server, {
    cors: { origin: "*" }
  });

  const connectedUsers = new Map();

  // --- Physics Setup ---
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -9.82, 0),
  });

  // Create a floor
  const floorBody = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Plane(),
  });
  floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(floorBody);

  // Create a dynamic beachball
  const ballBody = new CANNON.Body({
    mass: 1, 
    shape: new CANNON.Sphere(0.2), 
    position: new CANNON.Vec3(0, 3, -2), 
  });
  // Add some bounciness
  const physicsMaterial = new CANNON.Material();
  const physicsContactMaterial = new CANNON.ContactMaterial(
      physicsMaterial,
      physicsMaterial,
      { friction: 0.1, restitution: 0.7 }
  );
  world.addContactMaterial(physicsContactMaterial);
  ballBody.material = physicsMaterial;
  floorBody.material = physicsMaterial;

  world.addBody(ballBody);

  const physicsObjects = [
    { id: 'beachball', body: ballBody }
  ];

  // Physics Tick
  const TIME_STEP = 1 / 60;
  setInterval(() => {
    world.step(TIME_STEP);
    
    const state = physicsObjects.map(obj => ({
      id: obj.id,
      position: { x: obj.body.position.x, y: obj.body.position.y, z: obj.body.position.z },
      quaternion: { x: obj.body.quaternion.x, y: obj.body.quaternion.y, z: obj.body.quaternion.z, w: obj.body.quaternion.w }
    }));
    
    io.emit('physics-sync', state);
  }, 1000 / 60);
  // -------------------

  io.on("connection", (socket) => {
    socket.emit("init", socket.id);
    connectedUsers.set(socket.id, {
      id: socket.id,
      position: { x: 0, y: 1.6, z: 0 },
      rotation: { x: 0, y: 0 }
    });
    
    // Broadcast to others
    socket.broadcast.emit("user-joined", socket.id);

    // Send others to the new user
    const others = Array.from(connectedUsers.keys()).filter((id) => id !== socket.id);
    socket.emit("current-users", others);

    // Send persisted spatial ribbons
    socket.emit("spatial-state", { ribbons: savedRibbons });

    // WebRTC Signaling
    socket.on("signal", (payload) => {
      io.to(payload.target).emit("signal", {
        caller: socket.id,
        signal: payload.signal
      });
    });

    // Movement updates
    socket.on("move", (payload) => {
      const user = connectedUsers.get(socket.id);
      if (user) {
        user.lastMovePayload = payload;
        socket.broadcast.emit("user-moved", { 
          id: socket.id, 
          ...payload
        });
      }
    });

    // Grab State Tracking
    const grabbedObjects = new Map();

    // Interaction sync
    socket.on("interact", (payload) => {
      socket.broadcast.emit("remote-interact", { id: socket.id, ...payload });

      if (payload.type === 'draw-ribbon-end') {
         const newRibbon = {
            id: `ribbon_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            points: payload.points,
            color: payload.color,
            createdAt: Date.now()
         };
         savedRibbons.push(newRibbon);
         saveRibbonsToFile();
      } else if (payload.type === 'clear-drawings') {
         savedRibbons = [];
         saveRibbonsToFile();
      }

      const obj = physicsObjects.find(o => o.id === payload.objectId);
      if (!obj) return;
      const body = obj.body;

      if (payload.type === 'director-poke') {
         body.applyImpulse(
            new CANNON.Vec3(payload.direction.x * 5, payload.direction.y * 5, payload.direction.z * 5),
            new CANNON.Vec3(0, 0, 0)
         );
      } else if (payload.type === 'grab-start') {
          grabbedObjects.set(payload.objectId, socket.id);
          body.type = CANNON.Body.KINEMATIC;
          body.velocity.set(0, 0, 0);
          body.angularVelocity.set(0, 0, 0);
      } else if (payload.type === 'grab-move' && grabbedObjects.get(payload.objectId) === socket.id) {
          // Move kinematic body to target position
          body.position.set(payload.position.x, payload.position.y, payload.position.z);
          if (payload.quaternion) {
              body.quaternion.set(payload.quaternion.x, payload.quaternion.y, payload.quaternion.z, payload.quaternion.w);
          }
      } else if (payload.type === 'grab-end' && grabbedObjects.get(payload.objectId) === socket.id) {
          grabbedObjects.delete(payload.objectId);
          body.type = CANNON.Body.DYNAMIC;
          if (payload.velocity) {
              body.velocity.set(payload.velocity.x, payload.velocity.y, payload.velocity.z);
          }
      }
    });

    socket.on("disconnect", () => {
      connectedUsers.delete(socket.id);
      socket.broadcast.emit("user-left", socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { 
        middlewareMode: true,
        strictPort: false,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { port: 24678 }
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
