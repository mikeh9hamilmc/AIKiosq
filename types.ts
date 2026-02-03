export enum LessonStage {
  IDLE = 'idle',
  COMPARE_THREADS = 'compare-threads',
  HIGHLIGHT_FERRULE = 'highlight-ferrule',
  PLAYING_VIDEO = 'playing-video',
  ANALYZING_PART = 'analyzing-part',
  COUNTDOWN_TO_SNAPSHOT = 'countdown-to-snapshot',
  SHOWING_ANALYSIS = 'showing-analysis',
  SHOWING_INVENTORY = 'showing-inventory',
  SHOWING_AISLE = 'showing-aisle'
}

export interface PartAnalysis {
  partName: string;
  instructions: string;
  snapshotBase64: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  aisle: string;
  stock: number;
  price: number;
  description: string;
}

export interface PlumbingThreadTeacherProps {
  lessonStage: LessonStage;
  isConnected?: boolean;
  videoUrl?: string;
  partAnalysis?: PartAnalysis;
  inventoryItems?: InventoryItem[];
  aisleSignPath?: string;
  countdownValue?: number;
}

export type AudioContextState = {
  inputAudioContext: AudioContext | null;
  outputAudioContext: AudioContext | null;
};