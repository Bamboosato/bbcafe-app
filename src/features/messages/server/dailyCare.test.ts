import { describe, expect, it } from "vitest";
import { buildDailyCareNotices } from "./dailyCare";

const TODAY = new Date("2026-07-10T00:00:00+09:00");

describe("buildDailyCareNotices", () => {
  it("uses official WBGT signals and keeps only the two highest-priority notices", () => {
    const notices = buildDailyCareNotices(
      {
        precipitationProbability: 70,
        weatherText: "雨",
        wbgtMax: 32,
        windText: "南東の風 やや強く",
      },
      TODAY,
    );

    expect(notices.map((notice) => notice.type)).toEqual(["heat", "rain"]);
    expect(notices[0]?.text).toContain("暑さ指数が高い");
    expect(notices).toHaveLength(2);
  });

  it.each([
    [25, "【暑さ対策】"],
    [28, "【暑さ対策】暑さ指数が高め"],
    [31, "【熱中症対策】"],
  ])("applies the official WBGT boundary at %s", (wbgtMax, expectedText) => {
    const notices = buildDailyCareNotices({ wbgtMax }, TODAY);

    expect(notices).toHaveLength(1);
    expect(notices[0]?.text).toContain(expectedText);
  });

  it("warns about possible freezing after snow when the minimum temperature is at or below zero", () => {
    const notices = buildDailyCareNotices(
      {
        minTemperature: 0,
        weatherText: "雪",
      },
      new Date("2026-01-10T00:00:00+09:00"),
    );

    expect(notices).toEqual([
      {
        priority: 100,
        text: "【路面注意】雪や冷え込みで路面が凍るおそれがあるため、足元にご注意ください。",
        type: "freeze",
      },
    ]);
  });

  it("does not add a heat notice for a cool day even during summer", () => {
    const notices = buildDailyCareNotices(
      {
        maxTemperature: 28,
        wbgtMax: 20,
      },
      TODAY,
    );

    expect(notices).toEqual([]);
  });

  it("uses a temperature fallback when WBGT is unavailable", () => {
    const notices = buildDailyCareNotices(
      {
        maxTemperature: 31,
        wbgtMax: null,
      },
      TODAY,
    );

    expect(notices.map((notice) => notice.type)).toEqual(["heat"]);
    expect(notices[0]?.text).toContain("暑さ対策");
  });

  it("does not infer frozen roads from cold and dry weather alone", () => {
    const notices = buildDailyCareNotices(
      {
        minTemperature: -2,
        weatherText: "晴れ",
      },
      new Date("2026-01-10T00:00:00+09:00"),
    );

    expect(notices).toEqual([]);
  });
});
