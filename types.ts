export enum VoiceName {
  Puck = 'Puck',
  Charon = 'Charon',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr',
}

export interface AudioVisualizerProps {
  stream: MediaStream | null;
  isActive: boolean;
}

export interface LiveConfig {
  voiceName: VoiceName;
  stylePrompt: string;
}
