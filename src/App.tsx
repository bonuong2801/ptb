/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import WebPrototype from './components/WebPrototype';
import VinylMusicPlayer from './vinyl-player/VinylMusicPlayer';
import { Disc, Camera } from 'lucide-react';

export default function App() {
  const [activeApp, setActiveApp] = useState<'vinyl' | 'booth'>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('mode') || params.get('app') === 'booth') return 'booth';
    return params.get('app') === 'vinyl' ? 'vinyl' : 'booth';
  });

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('app', activeApp);
    window.history.replaceState({}, '', url.toString());
  }, [activeApp]);

  return (
    <div className="min-h-screen text-white font-sans selection:bg-cyan-500/30 selection:text-cyan-200 relative bg-black overflow-hidden">
      {/* Floating App Switcher Pill */}
      <div className="fixed top-3 right-3 z-50 flex items-center gap-1 p-1 rounded-full bg-zinc-950/80 backdrop-blur-md border border-white/10 shadow-xl select-none">
        <button
          onClick={() => setActiveApp('vinyl')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono tracking-wider transition ${
            activeApp === 'vinyl'
              ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
          title="Switch to Vinyl Player & Standby Decor"
        >
          <Disc className="w-3.5 h-3.5 animate-spin" style={{ animationDuration: '4s' }} />
          <span>VINYL DECOR</span>
        </button>

        <button
          onClick={() => setActiveApp('booth')}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono tracking-wider transition ${
            activeApp === 'booth'
              ? 'bg-zinc-800 text-white border border-white/20 shadow-sm'
              : 'text-zinc-400 hover:text-white'
          }`}
          title="Switch to Photobooth"
        >
          <Camera className="w-3.5 h-3.5" />
          <span>PHOTOBOOTH</span>
        </button>
      </div>

      {activeApp === 'vinyl' ? (
        <VinylMusicPlayer />
      ) : (
        <div className="relative w-full h-screen flex flex-col bg-bg-deep">
          <div className="atmosphere">
            <div className="atmosphere-orb atmosphere-orb-1" />
            <div className="atmosphere-orb atmosphere-orb-2" />
            <div className="atmosphere-orb atmosphere-orb-3" />
          </div>
          <div className="grid-overlay"></div>
          <div className="relative z-10 w-full h-full flex flex-col">
            <WebPrototype />
          </div>
        </div>
      )}
    </div>
  );
}
