import { describe, expect, it } from "vitest";
import { estimateNextPeriod } from "../src/services/cycleService";
describe("previsão de ciclo", () => { it("soma 28 dias à data inicial", () => { expect(estimateNextPeriod(new Date(2026, 0, 1)).toISOString().slice(0, 10)).toBe("2026-01-29"); }); });
