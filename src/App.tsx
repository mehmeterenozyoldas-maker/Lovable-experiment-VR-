import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, PlayCircle, Loader2, Monitor, Wand2, X } from 'lucide-react';
import { createXREngine } from './lib/engine.js';
import { DirectorHUD } from './components/DirectorHUD.tsx';
import { AIAssistantPanel } from './components/AIAssistantPanel.tsx';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<any>(null);
  
  const [engineState, setEngineState] = useState<'booting' | 'ready' | 'running' | 'director'>('booting');
  const [showAIAssistant, setShowAIAssistant] = useState(false);

  
  useEffect(() => {
    if (!containerRef.current) return;

    let isCancelled = false;
    const engine = createXREngine(containerRef.current, () => {
      if (!isCancelled) {
        setEngineState((current) => current === 'booting' ? 'ready' : current);
      }
    });
    
    engineRef.current = engine;
    if (!isCancelled) {
      setEngineState((current) => current === 'booting' ? 'ready' : current);
    }

    return () => {
      isCancelled = true;
      engine.dispose();
      engineRef.current = null;
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, []);

  const handleEnter = async () => {
    if (engineRef.current) {
      setEngineState('running');
      try {
        await engineRef.current.start();
      } catch (err) {
        console.warn("Audio context start note:", err);
      }
    }
  };

  const handleEnterDirector = async () => {
    if (engineRef.current) {
      setEngineState('director');
      try {
        await engineRef.current.start();
        if (engineRef.current.setDirectorMode) {
          engineRef.current.setDirectorMode(true);
        }
      } catch (err) {
        console.warn("Director Mode start note:", err);
      }
    }
  };

  const handleDirectorThemeChange = (theme: string) => {
    if (engineRef.current && engineRef.current.emitInteraction) {
      engineRef.current.emitInteraction({ type: 'theme', theme });
    }
  };

  const handleDirectorSummonAll = () => {
    if (engineRef.current && engineRef.current.emitInteraction) {
      const pos = engineRef.current.getCameraPos ? engineRef.current.getCameraPos() : { x: 0, y: 0, z: 0 };
      engineRef.current.emitInteraction({ type: 'summon', pos });
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black selection:bg-teal-500/30">
      {/* 3D WebGL / XR Canvas Container */}
      <div ref={containerRef} className="absolute inset-0 z-0" />

      {engineState === 'director' && (
        <DirectorHUD 
           engine={engineRef.current}
           onThemeChange={handleDirectorThemeChange}
           onSummonAll={handleDirectorSummonAll}
        />
      )}

      {engineState === 'running' && (
        <>
          {/* Top Right Floating AI Assistant Toggle */}
          <div className="absolute top-6 right-6 z-40">
            <button
              onClick={() => setShowAIAssistant(!showAIAssistant)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl border backdrop-blur-md font-mono text-xs font-semibold tracking-wider transition-all shadow-xl ${showAIAssistant ? 'bg-teal-500/20 text-teal-300 border-teal-500/50 shadow-teal-500/20' : 'bg-zinc-950/80 text-zinc-300 border-white/10 hover:border-teal-500/30 hover:text-teal-300'}`}
            >
              <Wand2 size={16} className="text-teal-400" />
              <span>AI ARCHITECT ASSISTANT</span>
            </button>
          </div>

          <AnimatePresence>
            {showAIAssistant && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                className="absolute top-20 right-6 z-50 max-h-[calc(100vh-120px)] overflow-y-auto scrollbar-thin"
              >
                <AIAssistantPanel
                  engine={engineRef.current}
                  onThemeChange={handleDirectorThemeChange}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* Crosshair Overlay (Managed by XR Engine internally, but DOM needs to exist) */}
      <div
        id="crosshair-container"
        className="pointer-events-none absolute top-1/2 left-1/2 z-40 hidden h-8 w-8 -translate-x-1/2 -translate-y-1/2 transform items-center justify-center"
      >
        <div
          id="gaze-loader"
          className="absolute h-8 w-8 rounded-full border-2 border-[rgba(0,255,170,0)] border-t-[rgba(0,255,170,0.85)] opacity-0 transition-opacity duration-150"
        />
        <div
          id="crosshair"
          className="h-2 w-2 rounded-full bg-white/80 shadow-[0_0_8px_rgba(0,0,0,0.5)] transition-all duration-100 ease-out"
        />
      </div>

      {/* Landing Experience Overlay */}
      <AnimatePresence>
        {(engineState !== 'running' && engineState !== 'director') && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, filter: 'blur(10px)', scale: 1.05 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950/90 backdrop-blur-md"
          >
            {/* Ambient background glows */}
            <div className="absolute top-1/4 left-1/4 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 scale-150 rounded-full bg-teal-500/10 blur-[120px]" />
            <div className="absolute bottom-1/4 right-1/4 h-[400px] w-[400px] translate-x-1/2 translate-y-1/2 scale-150 rounded-full bg-blue-600/10 blur-[100px]" />
            
            <motion.div 
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="relative flex max-w-2xl flex-col items-center justify-center p-8 text-center"
            >
              <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-teal-500/20 bg-teal-500/5 shadow-[0_0_40px_rgba(0,255,170,0.1)]">
                {engineState === 'booting' ? (
                  <Loader2 className="h-8 w-8 animate-spin text-teal-400" />
                ) : (
                  <PlayCircle className="h-10 w-10 text-teal-400" />
                )}
              </div>
              
              <h1 className="font-display mb-4 text-4xl font-light tracking-[0.2em] text-white sm:text-5xl lg:text-6xl text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60">
                SOUND EXPLORER
              </h1>
              
              <div className="mb-8 flex flex-col items-center gap-2">
                <span className="font-mono text-xs font-semibold tracking-[0.3em] text-teal-400">
                  {engineState === 'booting' ? 'INITIALIZING MODULES' : 'SYSTEM READY'}
                </span>
                <div className="h-px w-24 bg-gradient-to-r from-transparent via-teal-500/40 to-transparent" />
              </div>
              
              <p className="font-sans mb-12 max-w-lg leading-relaxed text-zinc-400">
                An advanced multi-modal XR gallery. Artifacts synthesize localized spatial audio. 
                UI panels tilt procedurally and react to live sound waves. 
                Hover to auto-gaze load panels, grab to feel physical sound inertia.
              </p>

              <div className="flex gap-4">
                <motion.button
                  whileHover={{ scale: 1.05, backgroundColor: 'rgba(0, 255, 170, 0.15)' }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleEnter}
                  disabled={engineState === 'booting'}
                  className="group relative overflow-hidden rounded border border-teal-500/50 bg-teal-500/10 px-8 py-4 px-8 font-mono text-sm font-semibold tracking-widest text-teal-400 uppercase transition-all hover:border-teal-400 hover:text-white hover:shadow-[0_0_30px_rgba(0,255,170,0.3)] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                  Enable Audio & Enter
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05, backgroundColor: 'rgba(255, 255, 255, 0.1)' }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleEnterDirector}
                  disabled={engineState === 'booting'}
                  className="group relative flex items-center overflow-hidden rounded border border-zinc-500/50 bg-zinc-500/10 px-8 py-4 font-mono text-sm font-semibold tracking-widest text-zinc-400 uppercase transition-all hover:border-zinc-300 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
                  <Monitor className="mr-2 h-4 w-4" /> Director
                </motion.button>
              </div>
            </motion.div>

            {/* Tech metadata footer */}
            <div className="absolute bottom-8 font-mono text-[10px] tracking-widest text-zinc-600">
              <p>WEBXR // THREE.JS / TONE.JS // SYSTEM 0.9.4</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
