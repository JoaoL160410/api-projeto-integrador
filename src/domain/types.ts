export type Flow = 'nenhum' | 'leve' | 'moderado' | 'intenso';
export type Mood = 'bem' | 'normal' | 'sensivel' | 'ansiosa' | 'cansada';
export interface DailyRecord { date: string; flow?: Flow; mood?: Mood; symptoms?: string[]; notes?: string; menstruation?: boolean; }
export interface CycleProfile { displayName: string; username: string; averageCycleDays: number; theme: 'rosa' | 'lilas' | 'verde' | 'terracota'; }
export interface ExportPayload { application: 'Florescer'; exportedAt: string; profile: CycleProfile; records: Record<string, DailyRecord>; }
