
export enum AppState {
  IDLE = 'IDLE',
  RECORDING = 'RECORDING',
  ANALYZING = 'ANALYZING',
  VIEWING = 'VIEWING',
}

export type AspectRatio = '16:9' | '1:1' | '9:16';

export interface DreamEntry {
  id: string;
  date: string;
  transcription: string;
  imageUrl: string;
  interpretation: string;
  isFavorite?: boolean;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}
