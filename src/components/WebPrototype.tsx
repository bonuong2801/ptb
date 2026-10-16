import React, { useState, useEffect } from 'react';
import { ViewMode } from '../types/booth';
import ControlScreen from './ControlScreen';
import CameraScreen from './CameraScreen';

export default function WebPrototype() {
  const [viewMode, setViewMode] = useState<ViewMode>('control');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    if (mode === 'camera') {
      setViewMode('camera');
    } else {
      setViewMode('control');
    }
  }, []);

  if (viewMode === 'control') return <ControlScreen />;
  if (viewMode === 'camera') return <CameraScreen />;
  
  return null;
}
