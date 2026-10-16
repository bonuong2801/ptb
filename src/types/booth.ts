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
    };
  }
}
