export interface Marker {
  id: string; source: string; name: string; hasName?: boolean; lat: number; lon: number;
  typeLabel?: string; description?: string; inscription?: string; startDate?: string; nrhp?: boolean;
  osmType?: string; osmId?: number; wikiTitle?: string; lang?: string; thumb?: string; wikiUrl?: string;
  tags?: Record<string, string>; keys?: string[]; distance?: number;
}
export interface Research {
  t: number; words: number; synopsis: string; method: string;
  wikiTitle: string | null; wikiUrl: string | null; thumb: string; inscription: string;
}
export interface Settings {
  radius: number; autoSpeak: boolean; notify: boolean; wake: boolean; rate: number; units: 'imperial' | 'metric';
  repeatHours: number; includeAllWiki: boolean; maxWords: number;
}
export interface Pos { lat: number; lon: number; acc: number; speed?: number | null; t: number }
export interface Tile { lat: number; lon: number; t: number; partial?: boolean }
export type Mode = 'off' | 'background' | 'foreground' | 'test';
export interface HistoryItem { id: string; name: string; typeLabel?: string; t: number }
