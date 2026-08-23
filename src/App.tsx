/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import WebPrototype from './components/WebPrototype';

export default function App() {
  return (
    <div className="min-h-screen text-white font-sans selection:bg-amber-glow/20 selection:text-amber-glow relative bg-bg-deep overflow-hidden">
      <div className="atmosphere"></div>
      <div className="grid-overlay"></div>
      
      <div className="relative z-10 w-full h-screen flex flex-col">
        <WebPrototype />
      </div>
    </div>
  );
}
