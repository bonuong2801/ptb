export type FrameShape = 'rectangle' | 'square';
export type PhotoShape = 'rectangle' | 'square' | 'circle';

export interface CustomFrameConfig {
  id: string;
  name: string;
  frameImage: string | null;
  totalShots: number;
  frameShape: FrameShape;
  photoShapes: PhotoShape[];
  photoLayouts?: { x: number; y: number; width: number; height: number; rotation?: number; }[];
  frameLayering?: 'above' | 'below';
}

export type CaptureSourceMode = 'stream' | 'hotfolder';

export interface TetherPhotoData {
  filename: string;
  fullPath: string;
  dataUrl: string;
  size: number;
  timestamp: number;
}


export const DEFAULT_FRAME_CONFIG: CustomFrameConfig = {
  id: 'default',
  name: 'Khung Mặc Định',
  frameImage: null,
  totalShots: 4,
  frameShape: 'rectangle',
  photoShapes: ['rectangle', 'rectangle', 'rectangle', 'rectangle'],
  photoLayouts: [
    { x: 10, y: 5, width: 80, height: 20 },
    { x: 10, y: 28, width: 80, height: 20 },
    { x: 10, y: 51, width: 80, height: 20 },
    { x: 10, y: 74, width: 80, height: 20 }
  ]
};

export const CHANNEL_NAME = 'photobooth-sync';

declare global {
  interface Window {
    electronAPI?: {
      saveSession: (data: {
        sessionName: string;
        finalImage?: string;
        rawImages?: string[];
        videoBuffer?: ArrayBuffer;
      }) => Promise<{ success: boolean; folderPath?: string; downloadUrl?: string; mode?: string; sessionName?: string; error?: string }>;
      openCustomerScreen: () => Promise<{ success: boolean; error?: string }>;
      broadcastSync: (data: any) => void;
      onSyncReceived: (callback: (data: any) => void) => void;
      getSaveDirectory?: () => Promise<string>;
      selectDirectory?: () => Promise<string | null>;
      getPrinters?: () => Promise<any[]>;
      printImage?: (data: { imageBase64: string; copies: number; printerName?: string }) => Promise<{ success: boolean; error?: string }>;
      getSavedPrinter?: () => Promise<string>;
      savePrinter?: (name: string) => Promise<boolean>;
      saveAccountingBackup?: (data: any) => Promise<{ success: boolean; error?: string }>;
      getAccountingBackup?: () => Promise<any>;
      // Tethered Camera Hot Folder APIs
      getHotFolder?: () => Promise<string>;
      selectHotFolder?: () => Promise<string | null>;
      openHotFolder?: () => Promise<{ success: boolean }>;
      startTetherWatch?: (dir?: string) => Promise<{ success: boolean; isWatching: boolean; path: string }>;
      onTetherPhoto?: (callback: (data: TetherPhotoData) => void) => () => void;
    };
  }
}
