import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, 
  Wand2, 
  Volume2, 
  VolumeX, 
  Loader2, 
  Sliders, 
  Layers, 
  BookOpen, 
  Check, 
  ChevronRight,
  Info,
  Leaf,
  Music,
  Maximize2
} from 'lucide-react';

interface AIAssistantPanelProps {
  engine: any;
  onLog?: (msg: string) => void;
  onThemeChange?: (theme: string) => void;
}

export function AIAssistantPanel({ engine, onLog, onThemeChange }: AIAssistantPanelProps) {
  const [activeTab, setActiveTab] = useState<'architecture' | 'curator'>('architecture');
  
  // Architecture Prompt State
  const [archPrompt, setArchPrompt] = useState('Transform the room into a spiraling wooden cathedral with high acoustic resonance');
  const [isGeneratingArch, setIsGeneratingArch] = useState(false);
  const [archResult, setArchResult] = useState<any>(null);
  const [archError, setArchError] = useState<string | null>(null);

  // Curator State
  const [selectedExhibit, setSelectedExhibit] = useState('orrery');
  const [curatorQuery, setCuratorQuery] = useState('What sustainable materials and acoustic frequencies make up this installation?');
  const [isCurating, setIsCurating] = useState(false);
  const [curationResult, setCurationResult] = useState<any>(null);
  const [curatorError, setCuratorError] = useState<string | null>(null);

  // Audio Narration State
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // Sample prompt presets for fast one-click architectural morphing
  const promptPresets = [
    {
      title: "Wooden Cathedral",
      prompt: "Transform the room into a spiraling wooden cathedral with high acoustic resonance, sweeping arched rafters, and open sky oculus."
    },
    {
      title: "Glacier Ice Pavilion",
      prompt: "Construct a minimalist Nordic ice glacier pavilion with sharp geometric wall extrusions, cold light filtering, and acoustic damping benches."
    },
    {
      title: "Boreal Mycelium Lounge",
      prompt: "Design a bio-organic mycelium timber lounge with soft flowing ergonomic curves, dense wooden seating, and a undulating canopy."
    },
    {
      title: "Acoustic Diagrid Shell",
      prompt: "Build an acoustic diagrid shell featuring hyper-twisted exhibit pedestals, dense ceiling slats, and rhythmic wall wave contours."
    }
  ];

  const handleGenerateArchitecture = async (promptToUse?: string) => {
    const finalPrompt = promptToUse || archPrompt;
    if (!finalPrompt.trim()) return;

    setIsGeneratingArch(true);
    setArchError(null);
    if (onLog) onLog(`Initiated Gemini Generative Architecture morph: "${finalPrompt.substring(0, 40)}..."`);

    try {
      const response = await fetch('/api/generate-architecture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: finalPrompt })
      });

      const data = await response.json();

      if (!response.ok || data.status !== 'success') {
        throw new Error(data.error || 'Failed to generate architectural parameters');
      }

      setArchResult(data.parameters);

      // Morph the 3D scene in real-time
      if (engine && engine.applyParametricUpdate) {
        engine.applyParametricUpdate(data.parameters);
      }

      if (data.parameters.recommendedTheme && onThemeChange) {
        onThemeChange(data.parameters.recommendedTheme);
      }

      if (onLog) onLog(`Gemini generated geometry: [${data.parameters.conceptTitle || 'Custom Morph'}]`);
    } catch (err: any) {
      console.error("Architecture generation error:", err);
      setArchError(err.message || 'Error communicating with Gemini AI Assistant');
    } finally {
      setIsGeneratingArch(false);
    }
  };

  const handleCurateExhibit = async () => {
    setIsCurating(true);
    setCuratorError(null);
    
    let exhibitTitle = "Celestial Orrery";
    let exhibitDesc = "Interactive gravitational pendulum and spatial sound generator.";

    if (selectedExhibit === 'swarm') {
      exhibitTitle = "Generative Particle Swarm";
      exhibitDesc = "Self-organizing acoustic point cloud reacting to visitor spatial proximity.";
    } else if (selectedExhibit === 'relic') {
      exhibitTitle = "Nordic Brass & Timber Relic";
      exhibitDesc = "Tactile acoustic resonator crafted from recycled brass and ancient pine.";
    }

    if (onLog) onLog(`Consulting AI Curator for exhibit: ${exhibitTitle}`);

    try {
      const response = await fetch('/api/curate-exhibit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exhibitId: selectedExhibit,
          title: exhibitTitle,
          description: exhibitDesc,
          userPrompt: curatorQuery
        })
      });

      const data = await response.json();

      if (!response.ok || data.status !== 'success') {
        throw new Error(data.error || 'Failed to curate exhibit');
      }

      setCurationResult(data.curation);
      if (onLog) onLog(`Curator response received for ${exhibitTitle}`);
    } catch (err: any) {
      console.error("Curation error:", err);
      setCuratorError(err.message || 'Error contacting AI Curator');
    } finally {
      setIsCurating(false);
    }
  };

  const handlePlayVoiceNarration = async (textToSpeak: string) => {
    if (isPlayingAudio && audioElement) {
      audioElement.pause();
      setIsPlayingAudio(false);
      return;
    }

    setIsLoadingAudio(true);
    try {
      const response = await fetch('/api/generate-narration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToSpeak })
      });

      const data = await response.json();

      if (data.status === 'success' && data.audioBase64) {
        try {
          const audioSrc = `data:${data.mimeType || 'audio/mp3'};base64,${data.audioBase64}`;
          const audio = new Audio(audioSrc);
          audio.onended = () => setIsPlayingAudio(false);
          audio.onerror = () => {
            console.warn("Audio element failed to load source, falling back to speech synthesis");
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            utterance.rate = 0.95;
            utterance.pitch = 1.0;
            utterance.onend = () => setIsPlayingAudio(false);
            window.speechSynthesis.speak(utterance);
            setIsPlayingAudio(true);
          };
          audio.play().catch(() => {
            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            utterance.rate = 0.95;
            utterance.pitch = 1.0;
            utterance.onend = () => setIsPlayingAudio(false);
            window.speechSynthesis.speak(utterance);
            setIsPlayingAudio(true);
          });
          setAudioElement(audio);
          setIsPlayingAudio(true);
          if (onLog) onLog("Playing AI Curator voice narration audio stream.");
        } catch (e) {
          // Fallback speech synthesis
          const utterance = new SpeechSynthesisUtterance(textToSpeak);
          utterance.rate = 0.95;
          utterance.pitch = 1.0;
          utterance.onend = () => setIsPlayingAudio(false);
          window.speechSynthesis.speak(utterance);
          setIsPlayingAudio(true);
        }
      } else {
        // Fallback speech synthesis using Web Speech API if TTS model is fallback
        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.rate = 0.95;
        utterance.pitch = 1.0;
        utterance.onend = () => setIsPlayingAudio(false);
        window.speechSynthesis.speak(utterance);
        setIsPlayingAudio(true);
        if (onLog) onLog("Playing synthesized Web Speech AI curator narration.");
      }
    } catch (err) {
      console.error("Audio narration error:", err);
      // Web Speech API fallback
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.onend = () => setIsPlayingAudio(false);
      window.speechSynthesis.speak(utterance);
      setIsPlayingAudio(true);
    } finally {
      setIsLoadingAudio(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-5 rounded-2xl bg-zinc-950/90 border border-teal-500/20 backdrop-blur-xl shadow-2xl text-white max-w-xl w-full">
      {/* Header Tabs */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-teal-500/10 border border-teal-500/30 text-teal-400">
            <Sparkles size={18} className="animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-wide text-white">GENERATIVE ARCHITECTURAL ASSISTANT</h3>
            <p className="text-[10px] font-mono text-teal-400/80">GEMINI @GOOGLE/GENAI SDK // EXPRESS ENGINE</p>
          </div>
        </div>

        <div className="flex bg-zinc-900/80 p-1 rounded-xl border border-white/5">
          <button
            onClick={() => setActiveTab('architecture')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${activeTab === 'architecture' ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40' : 'text-zinc-400 hover:text-white'}`}
          >
            <Sliders size={13} />
            <span>Design AI</span>
          </button>
          <button
            onClick={() => setActiveTab('curator')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium transition-all ${activeTab === 'curator' ? 'bg-teal-500/20 text-teal-300 border border-teal-500/40' : 'text-zinc-400 hover:text-white'}`}
          >
            <BookOpen size={13} />
            <span>Curator AI</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Prompt-Driven Parametric Design */}
      {activeTab === 'architecture' && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-mono tracking-wider text-zinc-300 flex items-center justify-between">
              <span>PROMPT-DRIVEN ARCHITECTURAL MORPH</span>
              <span className="text-[10px] text-zinc-500">NATURAL LANGUAGE TO 3D</span>
            </label>
            <div className="relative">
              <textarea
                value={archPrompt}
                onChange={(e) => setArchPrompt(e.target.value)}
                rows={3}
                placeholder="e.g. Transform the room into a spiraling wooden cathedral with high acoustic resonance..."
                className="w-full rounded-xl bg-zinc-900/90 border border-white/10 p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500/60 focus:ring-1 focus:ring-teal-500/50 transition-all resize-none font-sans"
              />
            </div>
          </div>

          {/* Prompt Quick Presets */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-mono text-zinc-400">DESIGN PRESETS & INSPIRATIONS:</span>
            <div className="grid grid-cols-2 gap-2">
              {promptPresets.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setArchPrompt(preset.prompt);
                    handleGenerateArchitecture(preset.prompt);
                  }}
                  className="flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-900/60 border border-white/5 hover:border-teal-500/30 hover:bg-teal-500/10 text-left transition-all group"
                >
                  <span className="text-xs text-zinc-300 group-hover:text-teal-300 font-medium">{preset.title}</span>
                  <ChevronRight size={12} className="text-zinc-500 group-hover:text-teal-400 transition-transform group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={() => handleGenerateArchitecture()}
            disabled={isGeneratingArch || !archPrompt.trim()}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-zinc-950 font-semibold text-xs tracking-wider uppercase shadow-lg shadow-teal-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGeneratingArch ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Computing Parametric Geometry...</span>
              </>
            ) : (
              <>
                <Wand2 size={16} />
                <span>Morph Museum Architecture</span>
              </>
            )}
          </button>

          {archError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
              <Info size={14} className="shrink-0 mt-0.5" />
              <span>{archError}</span>
            </div>
          )}

          {/* Result Card */}
          {archResult && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-zinc-900/80 border border-teal-500/30 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-xs font-semibold text-teal-400 uppercase tracking-wider">{archResult.conceptTitle || 'GENERATED CONCEPT'}</span>
                <span className="text-[10px] font-mono text-zinc-400 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded">
                  THEME: {archResult.recommendedTheme?.toUpperCase() || 'MORNING'}
                </span>
              </div>

              <p className="text-xs text-zinc-300 leading-relaxed font-sans">{archResult.description}</p>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5 text-[10px] font-mono">
                <div className="flex flex-col bg-black/40 p-2 rounded border border-white/5">
                  <span className="text-zinc-500">ROOF WAVE</span>
                  <span className="text-teal-300 font-bold">{archResult.waveAmplitude?.toFixed(2)}m</span>
                </div>
                <div className="flex flex-col bg-black/40 p-2 rounded border border-white/5">
                  <span className="text-zinc-500">ARCH COMPR</span>
                  <span className="text-teal-300 font-bold">{archResult.archCompression?.toFixed(2)}</span>
                </div>
                <div className="flex flex-col bg-black/40 p-2 rounded border border-white/5">
                  <span className="text-zinc-500">WALL FREQ</span>
                  <span className="text-teal-300 font-bold">{archResult.wallFreq?.toFixed(2)}</span>
                </div>
                <div className="flex flex-col bg-black/40 p-2 rounded border border-white/5">
                  <span className="text-zinc-500">BENCH WAVE</span>
                  <span className="text-teal-300 font-bold">{archResult.benchWave?.toFixed(2)}</span>
                </div>
                <div className="flex flex-col bg-black/40 p-2 rounded border border-white/5">
                  <span className="text-zinc-500">DIAGRID TWIST</span>
                  <span className="text-teal-300 font-bold">{archResult.standTwist?.toFixed(2)}rad</span>
                </div>
                <div className="flex flex-col bg-black/40 p-2 rounded border border-white/5">
                  <span className="text-zinc-500">OCULUS RAD</span>
                  <span className="text-teal-300 font-bold">{archResult.oculusRadius?.toFixed(1)}m</span>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Tab 2: AI Exhibit Curator */}
      {activeTab === 'curator' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setSelectedExhibit('orrery')}
              className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all text-center ${selectedExhibit === 'orrery' ? 'bg-teal-500/20 border-teal-500/50 text-teal-300' : 'bg-zinc-900/60 border-white/5 text-zinc-400 hover:text-white'}`}
            >
              <div className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
              <span className="text-xs font-semibold">Celestial Orrery</span>
            </button>
            <button
              onClick={() => setSelectedExhibit('swarm')}
              className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all text-center ${selectedExhibit === 'swarm' ? 'bg-teal-500/20 border-teal-500/50 text-teal-300' : 'bg-zinc-900/60 border-white/5 text-zinc-400 hover:text-white'}`}
            >
              <div className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
              <span className="text-xs font-semibold">Particle Swarm</span>
            </button>
            <button
              onClick={() => setSelectedExhibit('relic')}
              className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all text-center ${selectedExhibit === 'relic' ? 'bg-teal-500/20 border-teal-500/50 text-teal-300' : 'bg-zinc-900/60 border-white/5 text-zinc-400 hover:text-white'}`}
            >
              <div className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
              <span className="text-xs font-semibold">Nordic Relic</span>
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-mono text-zinc-300">CURATOR QUESTION / INQUIRY:</label>
            <input
              type="text"
              value={curatorQuery}
              onChange={(e) => setCuratorQuery(e.target.value)}
              placeholder="e.g. How does the spatial acoustics interact with the timber geometry?"
              className="w-full rounded-xl bg-zinc-900/90 border border-white/10 px-3 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-teal-500/60 transition-all font-sans"
            />
          </div>

          <button
            onClick={handleCurateExhibit}
            disabled={isCurating}
            className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-zinc-950 font-semibold text-xs tracking-wider uppercase shadow-lg shadow-teal-500/20 transition-all disabled:opacity-50"
          >
            {isCurating ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Curating Spatial Artifact...</span>
              </>
            ) : (
              <>
                <BookOpen size={16} />
                <span>Generate Curator Curation</span>
              </>
            )}
          </button>

          {curatorError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {curatorError}
            </div>
          )}

          {curationResult && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-zinc-900/80 border border-teal-500/30 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-xs font-semibold text-teal-400 tracking-wider uppercase">{curationResult.title}</span>
                <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                  <Leaf size={10} /> {curationResult.sustainabilityScore}% ECO-RATING
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-xs text-zinc-200 leading-relaxed">{curationResult.curatorInsight}</p>
                <div className="p-2.5 rounded bg-black/40 border border-white/5 text-[11px] text-zinc-300 flex flex-col gap-1">
                  <span className="font-mono text-[9px] text-teal-400 tracking-wider uppercase">Materiality & Fabrication</span>
                  <span>{curationResult.materialAnalysis}</span>
                </div>
              </div>

              {/* Audio Synth Preset */}
              {curationResult.audioPreset && (
                <div className="flex items-center justify-between p-2.5 rounded bg-black/50 border border-white/10 text-[10px] font-mono">
                  <div className="flex items-center gap-2 text-teal-300">
                    <Music size={14} />
                    <span>SYNTH: {curationResult.audioPreset.synthWave?.toUpperCase()} // ROOT: {curationResult.audioPreset.rootNote} // {curationResult.audioPreset.tempoBpm} BPM</span>
                  </div>
                </div>
              )}

              {/* AI Voice Narration Button */}
              <button
                onClick={() => handlePlayVoiceNarration(curationResult.curatorInsight)}
                disabled={isLoadingAudio}
                className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-teal-500/15 hover:bg-teal-500/25 border border-teal-500/30 text-teal-300 text-xs font-semibold tracking-wide transition-all"
              >
                {isLoadingAudio ? (
                  <>
                    <Loader2 size={14} className="animate-spin text-teal-400" />
                    <span>Synthesizing Voice Stream...</span>
                  </>
                ) : isPlayingAudio ? (
                  <>
                    <VolumeX size={14} className="text-rose-400 animate-pulse" />
                    <span>Pause Voice Narration</span>
                  </>
                ) : (
                  <>
                    <Volume2 size={14} className="text-teal-400" />
                    <span>Play AI Curator Voice Audio</span>
                  </>
                )}
              </button>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
