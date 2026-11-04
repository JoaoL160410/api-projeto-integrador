
import { describe, expect, it } from "vitest";
import { estimateNextPeriod } from "../src/services/cycleService";
import { estimateNextPeriod as estimateNextPeriodFromDomain } from "../src/domain/cycle";

describe("previsão de ciclo", () => {
  it("soma 28 dias à data inicial", () => {
    expect(
      estimateNextPeriod(new Date(2026, 0, 1)).toISOString().slice(0, 10)
    ).toBe("2026-01-29");
  });

  it("soma 20 dias em um ciclo curto", () => {
    expect(
      estimateNextPeriod(new Date(2026, 0, 1), 20)
        .toISOString()
        .slice(0, 10)
    ).toBe("2026-01-21");
  });

  it("soma 45 dias em um ciclo longo", () => {
    expect(
      estimateNextPeriod(new Date(2026, 0, 1), 45)
        .toISOString()
        .slice(0, 10)
    ).toBe("2026-02-15");
  });

  it("considera a mudança de mês", () => {
    expect(
      estimateNextPeriod(new Date(2026, 0, 20))
        .toISOString()
        .slice(0, 10)
    ).toBe("2026-02-17");
  });

  it("retorna uma data inválida para uma duração fora do limite", () => {
    expect(
      Number.isNaN(
        estimateNextPeriod(new Date(2026, 0, 1), 50).getTime()
      )
    ).toBe(true);
  });

  it("retorna uma data inválida quando a data inicial é inválida", () => {
    expect(
      Number.isNaN(
        estimateNextPeriod(new Date("data inválida")).getTime()
      )
    ).toBe(true);
  });

  it("rejeita uma data inexistente, como 31 de fevereiro", () => {
    expect(
      estimateNextPeriodFromDomain("2026-02-31", 28)
    ).toBeNull();
  });

  it("rejeita duração de ciclo com número decimal", () => {
    expect(
      estimateNextPeriodFromDomain("2026-01-01", 28.5)
    ).toBeNull();
  });
});
