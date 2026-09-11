import { afterEach, describe, expect, it, vi } from "vitest";
import { getNagoyaWeatherContext, getNagoyaWeatherInfo } from "./weather";

const JMA_FORECAST_URL = "https://www.jma.go.jp/bosai/forecast/data/forecast/230000.json";
const WBGT_FORECAST_URL = "https://www.wbgt.env.go.jp/prev15WG/dl/yohou_51106.csv";
const JMA_WARNING_URL = "https://www.jma.go.jp/bosai/warning/data/warning/230000.json";
const WBGT_ALERT_URL = "https://www.wbgt.env.go.jp/alert/dl/2026/alert_20260607_05.csv";
const JIHS_INDEX_URL = "https://id-info.jihs.go.jp/surveillance/idwr/index.html";
const TODAY = new Date("2026-06-06T15:00:00Z");
const TEST_WBGT_CSV = [
  ",,2026060703,2026060706,2026060709,2026060712,2026060715,2026060718,2026060721,2026060724,2026060803",
  "51106,2026/06/07 05:00, 220, 240, 260, 280, 320, 300, 250, 230, 350",
].join("\n");

describe("getNagoyaWeatherContext", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds weather signals for today and ignores tomorrow's higher temperature and WBGT", async () => {
    const fetchMock = mockForecastFetch(
      createJmaResponse({
        pops: ["60", "70", "40", "20"],
        temps: ["26", "28", "19", "35"],
        tempsMax: ["28", "35"],
        tempsMin: ["3", "1"],
        weatherCode: "212",
        weatherText: "くもり   夜遅く   雨",
        windText: "南東の風 やや強く",
      }),
    );

    const context = await getNagoyaWeatherContext(TODAY);

    expect(context).toMatchObject({
      maxTemperature: 28,
      minTemperature: 3,
      precipitationProbability: 70,
      wbgtMax: 32,
      weatherCode: "212",
      weatherInfo: "名古屋市の天気は「くもり 夜遅く 雨」。予想最高気温は 28度 です。",
      weatherText: "くもり 夜遅く 雨",
      windText: "南東の風 やや強く",
    });
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(
      expect.arrayContaining([JMA_FORECAST_URL, WBGT_FORECAST_URL]),
    );
    const requestedUrls = fetchMock.mock.calls.map(([input]) => String(input));
    expect(requestedUrls).not.toContain(JMA_WARNING_URL);
    expect(requestedUrls).not.toContain(WBGT_ALERT_URL);
    expect(requestedUrls).not.toContain(JIHS_INDEX_URL);
  });

  it("uses today's weekly maximum when the short-range temperature series is unavailable", async () => {
    mockForecastFetch(
      createJmaResponse({
        temps: ["", "", "", ""],
        tempsMax: ["28", "35"],
      }),
    );

    await expect(getNagoyaWeatherInfo(TODAY)).resolves.toContain("予想最高気温は 28度 です。");
  });

  it("does not use tomorrow's weekly maximum when today's temperature is unavailable", async () => {
    mockForecastFetch(
      createJmaResponse({
        temps: ["", "", "", ""],
        tempsMax: ["", "35"],
      }),
    );

    await expect(getNagoyaWeatherInfo(TODAY)).resolves.toContain("気温の変化に気をつけてお過ごしください。");
    await expect(getNagoyaWeatherInfo(TODAY)).resolves.not.toContain("35度");
  });

  it("uses a temperature fallback when the JMA temperature shape is missing", async () => {
    mockForecastFetch([
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
    ]);

    await expect(getNagoyaWeatherInfo(TODAY)).resolves.toBe(
      "名古屋市の天気は「晴れ」。気温の変化に気をつけてお過ごしください。",
    );
  });

  it("continues with JMA weather when the official WBGT forecast is unavailable", async () => {
    mockForecastFetch(createJmaResponse(), "", 503);

    await expect(getNagoyaWeatherContext(TODAY)).resolves.toMatchObject({
      maxTemperature: 28,
      wbgtMax: null,
    });
  });

  it("requests external care signals only when the persisted setting is enabled", async () => {
    const fetchMock = mockForecastFetch(createJmaResponse());

    await getNagoyaWeatherContext(TODAY, { externalCareSignalsEnabled: true });

    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(
      expect.arrayContaining([JMA_WARNING_URL, WBGT_ALERT_URL, JIHS_INDEX_URL]),
    );
  });

  it("falls back when the JMA request fails", async () => {
    mockForecastFetch(null, TEST_WBGT_CSV, 200, new Error("network down"));

    await expect(getNagoyaWeatherInfo(TODAY)).resolves.toBe("名古屋市の今日の気候に合わせた穏やかな日です。");
  });
});

type ForecastOptions = {
  pops?: string[];
  temps?: string[];
  tempsMax?: string[];
  tempsMin?: string[];
  weatherCode?: string;
  weatherText?: string;
  windText?: string;
};

function createJmaResponse({
  pops = ["0", "0", "0", "0"],
  temps = ["26", "28", "19", "35"],
  tempsMax = ["28", "35"],
  tempsMin = ["3", "1"],
  weatherCode = "100",
  weatherText = "晴れ",
  windText = "南東の風",
}: ForecastOptions = {}) {
  return [
    {
      timeSeries: [
        {
          timeDefines: ["2026-06-07T05:00:00+09:00", "2026-06-08T00:00:00+09:00"],
          areas: [
            {
              area: { code: "230010", name: "西部" },
              weatherCodes: [weatherCode],
              weathers: [weatherText],
              winds: [windText],
            },
          ],
        },
        {
          timeDefines: [
            "2026-06-07T06:00:00+09:00",
            "2026-06-07T12:00:00+09:00",
            "2026-06-07T18:00:00+09:00",
            "2026-06-08T00:00:00+09:00",
          ],
          areas: [
            {
              area: { code: "230010", name: "西部" },
              pops,
            },
          ],
        },
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
              temps,
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
              tempsMax,
              tempsMin,
            },
          ],
        },
      ],
    },
  ];
}

function mockForecastFetch(
  jmaData: unknown,
  wbgtCsv = TEST_WBGT_CSV,
  wbgtStatus = 200,
  jmaError?: Error,
) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);

    if (url === WBGT_FORECAST_URL) {
      return new Response(wbgtCsv, { status: wbgtStatus });
    }

    if (jmaError) {
      throw jmaError;
    }

    return Response.json(jmaData);
  });
}
