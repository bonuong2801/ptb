export type FrameShape = 'rectangle' | 'square';
export type PhotoShape = 'rectangle' | 'square' | 'circle';

export interface CustomFrameConfig {
  id: string;
  name: string;
  frameImage: string | null;
  totalShots: number;
  frameShape: FrameShape;
  photoShapes: PhotoShape[];
  layoutMode?: 'grid' | 'freeform';
  photoLayouts?: { x: number; y: number; width: number; height: number; rotation?: number; }[];
  frameLayering?: 'above' | 'below';
}

export type ViewMode = 'control' | 'camera';
export type CaptureSourceMode = 'stream' | 'hotfolder';

export interface TetherPhotoData {
  filename: string;
  fullPath: string;
  dataUrl: string;
  size: number;
  timestamp: number;
}

export const CHANNEL_NAME = 'photobooth-sync';

declare global {
  interface Window {
    electronAPI?: {
      saveSession: (data: {
        sessionName: string;
        finalImage?: string;
        rawImages?: string[];
        videoBuffer?: ArrayBuffer;
        videoBase64?: string;
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
      setHotFolder?: (dir: string) => Promise<{ success: boolean; path?: string }>;
      selectHotFolder?: () => Promise<string | null>;
      openHotFolder?: () => Promise<{ success: boolean }>;
      startTetherWatch?: (dir?: string) => Promise<{ success: boolean; isWatching: boolean; path: string }>;
      stopTetherWatch?: () => Promise<{ success: boolean; isWatching: boolean }>;
      clearTetherHistory?: () => Promise<{ success: boolean }>;
      onTetherPhoto?: (callback: (data: TetherPhotoData) => void) => () => void;
    };
  }
}
