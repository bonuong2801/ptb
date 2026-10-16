/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import WebPrototype from './components/WebPrototype';

export default function App() {
  return (
    <div className="min-h-screen text-white font-sans selection:bg-cyan-500/30 selection:text-cyan-200 relative bg-bg-deep overflow-hidden">
      <div className="atmosphere">
        <div className="atmosphere-orb atmosphere-orb-1" />
        <div className="atmosphere-orb atmosphere-orb-2" />
        <div className="atmosphere-orb atmosphere-orb-3" />
      </div>
      <div className="grid-overlay"></div>
      
      <div className="relative z-10 w-full h-screen flex flex-col">
        <WebPrototype />
      </div>
    </div>
  );
}
