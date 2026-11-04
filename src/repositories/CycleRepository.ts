import type { CycleEntry } from "../models/CycleEntry";
export interface CycleRepository { list(): Promise<CycleEntry[]>; save(entry: CycleEntry): Promise<void>; }
