import { afterEach, describe, expect, it, vi } from "vitest";
import { getExternalCareSignals } from "./externalCareSignals";

const TODAY = new Date("2026-09-11T00:00:00+09:00");
const JMA_WARNING_URL = "https://www.jma.go.jp/bosai/warning/data/warning/230000.json";
const WBGT_ALERT_URL = "https://www.wbgt.env.go.jp/alert/dl/2026/alert_20260911_05.csv";
const JIHS_INDEX_URL = "https://id-info.jihs.go.jp/surveillance/idwr/index.html";
const JIHS_CSV_URL = "https://id-info.jihs.go.jp/surveillance/idwr/provisional/2026/35/2026-35-teiten-tougai.csv";

describe("getExternalCareSignals", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("combines current official warning, WBGT alert, and two-week infection trends", async () => {
    const originalTextDecoder = globalThis.TextDecoder;
    vi.stubGlobal(
      "TextDecoder",
      class extends originalTextDecoder {
        constructor() {
          super();
        }

        decode(input?: AllowSharedBufferSource) {
          return new originalTextDecoder().decode(input);
        }
      },
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url === JMA_WARNING_URL) {
        return Response.json({
          areaTypes: [{ areas: [{ code: "230010", warnings: [{ code: "14", status: "発表" }] }] }],
          reportDatetime: "2026-09-11T05:00:00+09:00",
        });
      }

      if (url === WBGT_ALERT_URL) {
        return new Response("Title,熱中症特別警戒情報・熱中症警戒情報\n愛知県,51,0,230000,愛知,23,1,0");
      }

      if (url === JIHS_INDEX_URL) {
        return new Response('<a href="/surveillance/idwr/provisional/2026/35/index.html">latest</a>');
      }

      if (url === JIHS_CSV_URL) {
        const csv = [
          "報告数・定点当り報告数",
          "2026年35週(08月24日～08月30日),2026年09月02日作成",
          "インフルエンザ",
          ",総数,総数,33週,33週,34週,34週,35週,35週",
          ",報告,定当,報告,定当,報告,定当,報告,定当",
          "愛知県,0,0,1,1.0,2,2.0,3,3.0",
          "COVID-19",
          ",総数,総数,33週,33週,34週,34週,35週,35週",
          ",報告,定当,報告,定当,報告,定当,報告,定当",
          "愛知県,0,0,1,1.0,2,2.0,4,4.0",
        ].join("\n");
        return new Response(new TextEncoder().encode(csv));
      }

      throw new Error(`Unexpected URL: ${url}`);
    });

    await expect(getExternalCareSignals(TODAY)).resolves.toMatchObject({
      jmaWarnings: [{ code: "14", kind: "thunder", name: "雷注意報", severity: "advisory" }],
      wbgtAlert: "warning",
      infectionTrend: {
        diseases: ["influenza", "covid19"],
        reportingWeek: "2026年第35週",
      },
    });
  });

  it("ignores stale infection and warning data", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);

      if (url === JMA_WARNING_URL) {
        return Response.json({
          areaTypes: [{ areas: [{ code: "230010", warnings: [{ code: "14", status: "発表" }] }] }],
          reportDatetime: "2026-09-08T05:00:00+09:00",
        });
      }

      if (url === WBGT_ALERT_URL) {
        return new Response("Title\n愛知県,51,0,230000,愛知,23,0,0");
      }

      if (url === JIHS_INDEX_URL) {
        return new Response('<a href="/surveillance/idwr/provisional/2026/34/index.html">latest</a>');
      }

      return new Response(
        new TextEncoder().encode([
          "報告数・定点当り報告数",
          "2026年34週(08月17日～08月23日),2026年08月24日作成",
          "インフルエンザ",
          ",総数,総数,32週,32週,33週,33週,34週,34週",
          ",報告,定当,報告,定当,報告,定当,報告,定当",
          "愛知県,0,0,1,1.0,2,2.0,3,3.0",
        ].join("\n")),
      );
    });

    await expect(getExternalCareSignals(TODAY)).resolves.toEqual({
      infectionTrend: null,
      jmaWarnings: [],
      wbgtAlert: null,
    });
  });

  it("fails open when all external sources are unavailable", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("upstream unavailable"));

    await expect(getExternalCareSignals(TODAY)).resolves.toEqual({
      infectionTrend: null,
      jmaWarnings: [],
      wbgtAlert: null,
    });
  });
});
