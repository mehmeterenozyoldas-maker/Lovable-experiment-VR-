import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sun, 
  Moon, 
  Aperture, 
  Users, 
  MapPin, 
  Radio, 
  Eye, 
  RotateCcw, 
  Sparkles, 
  Navigation, 
  Shield, 
  Compass, 
  Activity,
  Plus,
  Wand2,
  X
} from 'lucide-react';
import { AIAssistantPanel } from './AIAssistantPanel.tsx';

interface DirectorHUDProps {
  engine: any;
  onThemeChange: (theme: string) => void;
  onSummonAll: () => void;
}

interface UserPos {
  id: string;
  position: { x: number; y: number; z: number };
}

export function DirectorHUD({ engine, onThemeChange, onSummonAll }: DirectorHUDProps) {
  const [activeTheme, setActiveTheme] = useState('morning');
  const [activeView, setActiveView] = useState('default');
  const [connectedUsers, setConnectedUsers] = useState<UserPos[]>([]);
  const [directorPos, setDirectorPos] = useState({ x: 2, z: 8 });
  const [directorRot, setDirectorRot] = useState(0);
  const [showAIPanel, setShowAIPanel] = useState(true);
  const [logs, setLogs] = useState<string[]>([
    "Director HUD Initialized.",
    "Generative AI Assistant (@google/genai) active.",
    "System 0.9.4 ready."
  ]);

  const addLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${timestamp}] ${msg}`, ...prev.slice(0, 7)]);
  };

  // Poll engine state for the minimap and connection stats
  useEffect(() => {
    if (!engine) return;

    const interval = setInterval(() => {
      // Get Director Cam Info
      if (engine.getCameraPos) {
        const dPos = engine.getCameraPos();
        setDirectorPos({ x: dPos.x, z: dPos.z });
      }
      if (engine.getCameraRot) {
        setDirectorRot(engine.getCameraRot());
      }

      // Get Active Peers
      if (engine.getConnectedUsers) {
        const users = engine.getConnectedUsers();
        setConnectedUsers(users);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [engine]);

  const handleTheme = (theme: string) => {
    setActiveTheme(theme);
    onThemeChange(theme);
    addLog(`Changed global exhibition theme to ${theme.toUpperCase()}`);
  };

  const handleViewChange = (viewId: string) => {
    setActiveView(viewId);
    if (engine.setDirectorView) {
      engine.setDirectorView(viewId);
    }
    addLog(`Switched viewport vantage preset to [${viewId.toUpperCase()}]`);
  };

  const handleSummonToSpot = (exhibitId: string, x: number, z: number, name: string) => {
    if (engine && engine.emitInteraction) {
      engine.emitInteraction({ type: 'summon', pos: { x, y: 0, z } });
      addLog(`Dispatched GATHER PROTOCOL: Summoned all visitors to ${name}`);
    }
  };

  const handleSummonToMyPosition = () => {
    if (engine && engine.emitInteraction) {
      engine.emitInteraction({ type: 'summon', pos: { x: directorPos.x, y: 0, z: directorPos.z } });
      addLog(`Dispatched GATHER PROTOCOL: Summoned all visitors to Director's spot`);
    }
  };

  const handleTossBeachball = () => {
    if (engine && engine.emitInteraction) {
      // Direct beachball poke with randomized force
      const dirX = (Math.random() - 0.5) * 3;
      const dirY = 4 + Math.random() * 3;
      const dirZ = (Math.random() - 0.5) * 3;
      engine.emitInteraction({
        type: 'director-poke',
        objectId: 'beachball',
        direction: { x: dirX, y: dirY, z: dirZ }
      });
      addLog("Tossed/Energized interactive physics sphere into center court");
    }
  };

  // Convert 3D scene coordinates (-6 to 6) to 2D Minimap coordinates (0 to 180px)
  const mapCoord = (val: number) => {
    // Map -6 -> 10, 6 -> 170
    return 90 + (val / 6.5) * 80;
  };

  const handleMinimapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickZ = e.clientY - rect.top;

    // Convert back from 0-180 to -6 to 6 range
    const sceneX = ((clickX - 90) / 80) * 6.5;
    const sceneZ = ((clickZ - 90) / 80) * 6.5;

    if (engine && engine.teleportCamera) {
      engine.teleportCamera(sceneX, sceneZ);
      addLog(`Teleported Director viewport coordinates to (${sceneX.toFixed(2)}, ${sceneZ.toFixed(2)})`);
    }
  };

  return (
    <div className="absolute inset-0 z-40 pointer-events-none flex flex-col justify-between p-6 select-none font-sans text-white">
      {/* Top Header Deck */}
      <div className="flex justify-between items-start w-full">
        {/* Connection status card & AI Toggle */}
        <div className="flex gap-3 items-center">
          <motion.div 
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl bg-zinc-950/80 border border-white/10 backdrop-blur-md shadow-lg"
          >
            <div className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500"></span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold tracking-wider text-teal-400">DIRECTOR COMMAND ONLINE</span>
              </div>
              <span className="text-[10px] text-zinc-400">Active VR Audiences: {connectedUsers.length}</span>
            </div>
          </motion.div>

          <motion.button
            initial={{ y: -30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.05 }}
            onClick={() => setShowAIPanel(!showAIPanel)}
            className={`pointer-events-auto flex items-center gap-2 px-4 py-3 rounded-xl border backdrop-blur-md font-mono text-xs font-semibold tracking-wider transition-all shadow-lg ${showAIPanel ? 'bg-teal-500/20 text-teal-300 border-teal-500/50 shadow-teal-500/20' : 'bg-zinc-950/80 text-zinc-300 border-white/10 hover:border-teal-500/30 hover:text-teal-300'}`}
          >
            <Wand2 size={16} className="text-teal-400" />
            <span>AI ARCHITECT ASSISTANT</span>
          </motion.button>
        </div>

        {/* Dynamic Activity/Live Feed Terminal */}
        <motion.div 
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="pointer-events-auto hidden md:flex flex-col w-80 px-4 py-3 rounded-xl bg-zinc-950/80 border border-white/10 backdrop-blur-md shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-white/5 pb-1.5 mb-1.5">
            <span className="text-[10px] font-mono tracking-widest text-zinc-400 flex items-center gap-1">
              <Activity size={12} className="text-teal-400 animate-pulse" /> LIVE TELEMETRY DECK
            </span>
            <span className="text-[9px] font-mono text-zinc-500">SECURE SHELL</span>
          </div>
          <div className="flex flex-col gap-1 font-mono text-[10px] leading-tight text-zinc-400 max-h-24 overflow-y-auto scrollbar-thin">
            {logs.map((log, idx) => (
              <div key={idx} className={idx === 0 ? "text-teal-300" : ""}>{log}</div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Floating AI Architect Assistant Panel */}
      <AnimatePresence>
        {showAIPanel && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, x: 30 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            exit={{ opacity: 0, scale: 0.95, x: 30 }}
            className="pointer-events-auto absolute top-20 right-6 z-50 max-h-[calc(100vh-180px)] overflow-y-auto scrollbar-thin"
          >
            <AIAssistantPanel
              engine={engine}
              onLog={addLog}
              onThemeChange={handleTheme}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Control Sidebar & Bottom Dock layout */}
      <div className="flex justify-between items-end w-full h-full min-h-[400px]">
        {/* Left Side: Interactive Map & Teleport Controls */}
        <motion.div 
          initial={{ x: -50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: 'spring', damping: 20 }}
          className="pointer-events-auto flex flex-col gap-4 p-4 rounded-2xl bg-zinc-950/85 border border-white/10 backdrop-blur-lg shadow-2xl w-[220px]"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-[10px] font-mono tracking-widest text-zinc-400 flex items-center gap-1">
              <Compass size={14} className="text-teal-400" /> SHOWROOM RADAR
            </span>
            <span className="text-[9px] font-mono text-zinc-500">2D PLAN</span>
          </div>

          {/* Minimap SVG */}
          <div className="relative flex justify-center items-center bg-black/40 rounded-xl border border-white/5 p-1">
            <svg 
              width="180" 
              height="180" 
              className="cursor-crosshair overflow-visible"
              onClick={handleMinimapClick}
            >
              {/* Outer Circular wall */}
              <circle cx="90" cy="90" r="85" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
              <circle cx="90" cy="90" r="5" fill="none" stroke="rgba(255,255,255,0.05)" />
              
              {/* Exhibit Nodes */}
              {/* Orrery: -3.4, -0.7 */}
              <g transform={`translate(${mapCoord(-3.4)}, ${mapCoord(-0.7)})`}>
                <circle r="6" fill="rgba(20, 184, 166, 0.2)" stroke="#14b8a6" strokeWidth="1" />
                <text y="-9" textAnchor="middle" fill="#14b8a6" fontSize="8" className="font-mono tracking-wider font-semibold">ORR</text>
              </g>

              {/* Swarm: 0, -2.4 */}
              <g transform={`translate(${mapCoord(0)}, ${mapCoord(-2.4)})`}>
                <circle r="6" fill="rgba(20, 184, 166, 0.2)" stroke="#14b8a6" strokeWidth="1" />
                <text y="-9" textAnchor="middle" fill="#14b8a6" fontSize="8" className="font-mono tracking-wider font-semibold">SWR</text>
              </g>

              {/* Relic: 3.4, -0.7 */}
              <g transform={`translate(${mapCoord(3.4)}, ${mapCoord(-0.7)})`}>
                <circle r="6" fill="rgba(20, 184, 166, 0.2)" stroke="#14b8a6" strokeWidth="1" />
                <text y="-9" textAnchor="middle" fill="#14b8a6" fontSize="8" className="font-mono tracking-wider font-semibold">RLC</text>
              </g>

              {/* Interactive Beachball marker */}
              <circle cx={mapCoord(0)} cy={mapCoord(0)} r="4" fill="#ff0055" stroke="#fff" strokeWidth="0.5" className="animate-pulse" />

              {/* Active Connected Users (Blips) */}
              {connectedUsers.map((u) => (
                <g key={u.id} transform={`translate(${mapCoord(u.position.x)}, ${mapCoord(u.position.z)})`}>
                  <circle r="5" fill="#f43f5e" className="animate-ping absolute" />
                  <circle r="4" fill="#f43f5e" stroke="#fff" strokeWidth="1" />
                  <line x1="0" y1="0" x2="0" y2="5" stroke="#f43f5e" strokeWidth="1" />
                  <text y="-7" textAnchor="middle" fill="#f43f5e" fontSize="7" className="font-mono bg-black/80 rounded px-0.5">VR USER</text>
                </g>
              ))}

              {/* Director's Current Position Marker */}
              <g transform={`translate(${mapCoord(directorPos.x)}, ${mapCoord(directorPos.z)})`}>
                {/* Vision Field (Frustum Angle indicator) */}
                <path 
                  d="M -15 -35 L 0 0 L 15 -35 Z" 
                  fill="rgba(234, 179, 8, 0.15)" 
                  stroke="rgba(234, 179, 8, 0.3)" 
                  strokeWidth="1"
                  style={{ transform: `rotate(${directorRot * (180 / Math.PI) + 180}deg)`, transformOrigin: '0px 0px' }}
                />
                <circle r="5" fill="#eab308" stroke="#fff" strokeWidth="1" />
              </g>
            </svg>
          </div>

          <div className="flex flex-col gap-1 text-[10px] font-mono text-zinc-400 mt-1">
            <div className="flex justify-between">
              <span>Director Coord:</span>
              <span className="text-yellow-400">[{directorPos.x.toFixed(1)}, {directorPos.z.toFixed(1)}]</span>
            </div>
            <div className="text-[9px] text-zinc-500 leading-normal">
              Click map to teleport viewpoint.
            </div>
          </div>
        </motion.div>

        {/* Center/Right Bottom Panel: Exhibition and Atmospheric Overlords */}
        <motion.div 
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', damping: 20 }}
          className="pointer-events-auto flex flex-col md:flex-row gap-6 p-5 rounded-2xl bg-zinc-950/85 border border-white/10 backdrop-blur-lg shadow-2xl"
        >
          {/* Section 1: Viewport Vantage Points */}
          <div className="flex flex-col gap-2 md:border-r border-white/10 md:pr-6">
            <span className="text-[10px] font-mono tracking-widest text-zinc-400 flex items-center gap-1">
              <Eye size={12} className="text-yellow-400" /> CAMERA VANTAGE
            </span>
            <div className="grid grid-cols-2 gap-2 mt-1 w-[180px]">
              <button 
                onClick={() => handleViewChange('default')}
                className={`px-3 py-2 rounded-xl text-xs font-mono tracking-wider transition-all border text-left ${activeView === 'default' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' : 'hover:bg-white/5 text-zinc-400 border-transparent'}`}
              >
                Wide angle
              </button>
              <button 
                onClick={() => handleViewChange('orrery')}
                className={`px-3 py-2 rounded-xl text-xs font-mono tracking-wider transition-all border text-left ${activeView === 'orrery' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' : 'hover:bg-white/5 text-zinc-400 border-transparent'}`}
              >
                Orrery focus
              </button>
              <button 
                onClick={() => handleViewChange('swarm')}
                className={`px-3 py-2 rounded-xl text-xs font-mono tracking-wider transition-all border text-left ${activeView === 'swarm' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' : 'hover:bg-white/5 text-zinc-400 border-transparent'}`}
              >
                Swarm focus
              </button>
              <button 
                onClick={() => handleViewChange('relic')}
                className={`px-3 py-2 rounded-xl text-xs font-mono tracking-wider transition-all border text-left ${activeView === 'relic' ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' : 'hover:bg-white/5 text-zinc-400 border-transparent'}`}
              >
                Relic focus
              </button>
            </div>
          </div>

          {/* Section 2: Atmospheric Theme Controls */}
          <div className="flex flex-col gap-2 md:border-r border-white/10 md:pr-6">
            <span className="text-[10px] font-mono tracking-widest text-zinc-400 flex items-center gap-1">
              <Sparkles size={12} className="text-teal-400" /> LIGHT & SPACE
            </span>
            <div className="flex gap-2 mt-1.5">
              <button 
                onClick={() => handleTheme('morning')}
                title="Morning Theme"
                className={`p-3 rounded-xl transition-all border ${activeTheme === 'morning' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'hover:bg-white/5 text-zinc-400 border-transparent'}`}
              >
                <Sun size={20} />
              </button>
              <button 
                onClick={() => handleTheme('spotlight')}
                title="Spotlight Theme"
                className={`p-3 rounded-xl transition-all border ${activeTheme === 'spotlight' ? 'bg-zinc-100 text-zinc-900 border-white' : 'hover:bg-white/5 text-zinc-400 border-transparent'}`}
              >
                <Aperture size={20} />
              </button>
              <button 
                onClick={() => handleTheme('night')}
                title="Night Theme"
                className={`p-3 rounded-xl transition-all border ${activeTheme === 'night' ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40' : 'hover:bg-white/5 text-zinc-400 border-transparent'}`}
              >
                <Moon size={20} />
              </button>
            </div>
          </div>

          {/* Section 3: Summon / Gather Protocol & Interactive Toys */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-mono tracking-widest text-zinc-400 flex items-center gap-1">
              <Radio size={12} className="text-teal-400" /> INTERACTION DECKS
            </span>
            <div className="flex flex-wrap gap-2 mt-1">
              {/* Summon All to Me */}
              <button 
                onClick={handleSummonToMyPosition}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-teal-500/15 text-teal-400 hover:bg-teal-500/25 transition-all text-xs font-semibold tracking-wide border border-teal-500/30"
              >
                <Users size={14} />
                <span>Summon All Here</span>
              </button>

              {/* Fast Gather specific spots */}
              <button 
                onClick={() => handleSummonToSpot('orrery', -3.4, -0.7, 'Celestial Orrery')}
                className="flex items-center gap-1 px-3 py-2.5 rounded-xl bg-zinc-900 text-zinc-300 hover:bg-zinc-800 transition-all text-xs border border-white/5"
              >
                <MapPin size={12} />
                <span>Gather Orrery</span>
              </button>

              <button 
                onClick={() => handleSummonToSpot('swarm', 0, -2.4, 'Generative Swarm')}
                className="flex items-center gap-1 px-3 py-2.5 rounded-xl bg-zinc-900 text-zinc-300 hover:bg-zinc-800 transition-all text-xs border border-white/5"
              >
                <MapPin size={12} />
                <span>Gather Swarm</span>
              </button>

              {/* Toss Beachball Toy */}
              <button 
                onClick={handleTossBeachball}
                className="flex items-center gap-1 px-3 py-2.5 rounded-xl bg-pink-500/15 text-pink-400 hover:bg-pink-500/25 transition-all text-xs border border-pink-500/30 font-semibold"
              >
                <Plus size={14} />
                <span>Toss Beachball</span>
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
