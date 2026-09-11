import { afterEach, describe, expect, it, vi } from "vitest";
import { getNagoyaWeatherInfo } from "./weather";

describe("getNagoyaWeatherInfo", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds Nagoya weather info from the JMA Aichi forecast", async () => {
    const today = new Date("2026-06-06T15:00:00Z");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json([
        {
          timeSeries: [
            {
              areas: [
                {
                  area: { code: "230010", name: "西部" },
                  weathers: ["くもり   夜遅く   雨"],
                },
              ],
            },
            {},
            {
              timeDefines: [
                "2026-06-07T09:00:00+09:00",
                "2026-06-07T00:00:00+09:00",
                "2026-06-08T00:00:00+09:00",
                "2026-06-08T09:00:00+09:00",
              ],
              areas: [
                {
                  area: { code: "51106", name: "名古屋" },
                  temps: ["26", "28", "19", "35"],
                },
              ],
            },
          ],
        },
      ]),
    );

    await expect(getNagoyaWeatherInfo(today)).resolves.toBe(
      "名古屋市の天気は「くもり 夜遅く 雨」。予想最高気温は 28度 です。",
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://www.jma.go.jp/bosai/forecast/data/forecast/230000.json",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ cache: "no-store" }));
  });

  it("uses a temperature fallback when the JMA temperature shape is missing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json([
        {
          timeSeries: [
            {
              areas: [
                {
                  area: { code: "230010", name: "西部" },
                  weathers: ["晴れ"],
                },
              ],
            },
          ],
        },
      ]),
    );

    await expect(getNagoyaWeatherInfo()).resolves.toBe(
      "名古屋市の天気は「晴れ」。気温の変化に気をつけてお過ごしください。",
    );
  });

  it("uses today's weekly maximum when the short-range temperature series is unavailable", async () => {
    const today = new Date("2026-06-07T00:00:00+09:00");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json([
        {
          timeSeries: [
            {
              areas: [
                {
                  area: { code: "230010", name: "西部" },
                  weathers: ["晴れ"],
                },
              ],
            },
          ],
        },
        {
          timeSeries: [
            {},
            {
              timeDefines: ["2026-06-07T00:00:00+09:00", "2026-06-08T00:00:00+09:00"],
              areas: [
                {
                  area: { code: "51106", name: "名古屋" },
                  tempsMax: ["28", "35"],
                },
              ],
            },
          ],
        },
      ]),
    );

    await expect(getNagoyaWeatherInfo(today)).resolves.toBe(
      "名古屋市の天気は「晴れ」。予想最高気温は 28度 です。",
    );
  });

  it("does not use tomorrow's weekly maximum when today's temperature is unavailable", async () => {
    const today = new Date("2026-06-07T00:00:00+09:00");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json([
        {
          timeSeries: [
            {
              areas: [
                {
                  area: { code: "230010", name: "西部" },
                  weathers: ["晴れ"],
                },
              ],
            },
          ],
        },
        {
          timeSeries: [
            {},
            {
              timeDefines: ["2026-06-07T00:00:00+09:00", "2026-06-08T00:00:00+09:00"],
              areas: [
                {
                  area: { code: "51106", name: "名古屋" },
                  tempsMax: ["", "35"],
                },
              ],
            },
          ],
        },
      ]),
    );

    await expect(getNagoyaWeatherInfo(today)).resolves.toBe(
      "名古屋市の天気は「晴れ」。気温の変化に気をつけてお過ごしください。",
    );
  });

  it("falls back when the JMA request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(getNagoyaWeatherInfo()).resolves.toBe("名古屋市の今日の気候に合わせた穏やかな日です。");
  });
});
