const fs = require('fs');
let code = fs.readFileSync('src/components/WebPrototype.tsx', 'utf8');

const oldTop = `// -------------------------------------------------------------
// CAMERA SCREEN (Customer)
// -------------------------------------------------------------
function CameraScreen() {
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const [channel, setChannel] = useState<SyncService | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  
  // App State (synced from Control)
  const stateRef = useRef({ customConfig, capturedImages });
  const channelRef = useRef<SyncService | null>(null);`;

const newTop = `// -------------------------------------------------------------
// CAMERA SCREEN (Customer)
// -------------------------------------------------------------
function CameraScreen() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const [channel, setChannel] = useState<SyncService | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const [customConfig, setCustomConfig] = useState<CustomFrameConfig>({
    id: 'default',
    name: 'Khung Mặc Định',
    frameImage: null,
    totalShots: 4,
    frameShape: 'rectangle',
    photoShapes: ['rectangle', 'rectangle', 'rectangle', 'rectangle'], layoutMode: 'freeform', photoLayouts: [{x: 10, y: 5, width: 80, height: 20}, {x: 10, y: 28, width: 80, height: 20}, {x: 10, y: 51, width: 80, height: 20}, {x: 10, y: 74, width: 80, height: 20}]
  });
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [currentShotIndex, setCurrentShotIndex] = useState(0);
  const [flash, setFlash] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [finalImage, setFinalImage] = useState<string | null>(null);
  const [sessionDlUrl, setSessionDlUrl] = useState<string>('');
  
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  // App State (synced from Control)
  const stateRef = useRef({ customConfig, capturedImages });
  const channelRef = useRef<SyncService | null>(null);`;

if (code.includes(oldTop)) {
    code = code.replace(oldTop, newTop);
    
    // Now REMOVE the bottom states:
    const bottomStates = `  const [customConfig, setCustomConfig] = useState<CustomFrameConfig>({
    id: 'default',
    name: 'Khung Mặc Định',
    frameImage: null,
    totalShots: 4,
    frameShape: 'rectangle',
    photoShapes: ['rectangle', 'rectangle', 'rectangle', 'rectangle'], layoutMode: 'freeform', photoLayouts: [{x: 10, y: 5, width: 80, height: 20}, {x: 10, y: 28, width: 80, height: 20}, {x: 10, y: 51, width: 80, height: 20}, {x: 10, y: 74, width: 80, height: 20}]
  });
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [currentShotIndex, setCurrentShotIndex] = useState(0);
  const [flash, setFlash] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [finalImage, setFinalImage] = useState<string | null>(null);
  const [sessionDlUrl, setSessionDlUrl] = useState<string>('');
  
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');`;

    if (code.includes(bottomStates)) {
       code = code.replace(bottomStates, '');
       fs.writeFileSync('src/components/WebPrototype.tsx', code);
       console.log("Success fix2.cjs");
    } else {
       console.log("Could not find bottomStates");
    }
} else {
    console.log("Could not find oldTop!");
}
