/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ControlScreen } from './components/ControlScreen';
import { CameraScreen } from './components/CameraScreen';

export default function App() {
  const isCamera = new URLSearchParams(window.location.search).get('mode') === 'camera';

  return (
    <div className="min-h-screen text-white font-sans selection:bg-cyan-500/30 selection:text-cyan-200 relative bg-black overflow-hidden">
      <div className="relative w-full h-screen flex flex-col bg-bg-deep">
        <div className="atmosphere">
          <div className="atmosphere-orb atmosphere-orb-1" />
          <div className="atmosphere-orb atmosphere-orb-2" />
          <div className="atmosphere-orb atmosphere-orb-3" />
        </div>
        <div className="grid-overlay"></div>
        <div className="relative z-10 w-full h-full flex flex-col">
          {isCamera ? <CameraScreen /> : <ControlScreen />}
        </div>
      </div>
    </div>
  );
}
