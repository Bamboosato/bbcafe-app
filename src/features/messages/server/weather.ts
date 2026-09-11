import type { DailyCareWeatherSignals } from "./dailyCare";
import { getExternalCareSignals } from "./externalCareSignals";

const JMA_AICHI_FORECAST_URL = "https://www.jma.go.jp/bosai/forecast/data/forecast/230000.json";
const NAGOYA_WBGT_FORECAST_URL = "https://www.wbgt.env.go.jp/prev15WG/dl/yohou_51106.csv";
const JMA_FORECAST_TIMEOUT_MS = 10000;
const JMA_TIME_ZONE = "Asia/Tokyo";
const NAGOYA_WEATHER_FALLBACK = "名古屋市の今日の気候に合わせた穏やかな日です。";
const NAGOYA_TEMPERATURE_FALLBACK = "気温の変化に気をつけてお過ごしください。";

type JmaForecastArea = {
  area?: {
    code?: string;
    name?: string;
  };
  temps?: string[];
  tempsMax?: string[];
  tempsMin?: string[];
  pops?: string[];
  weatherCodes?: string[];
  winds?: string[];
  weathers?: string[];
};

type JmaForecastTimeSeries = {
  timeDefines?: string[];
  areas?: JmaForecastArea[];
};

type JmaForecastEntry = {
  timeSeries?: JmaForecastTimeSeries[];
};

type JmaForecastResponse = JmaForecastEntry[];

export type NagoyaWeatherContext = DailyCareWeatherSignals & {
  weatherInfo: string;
};

export async function getNagoyaWeatherContext(
  today = new Date(),
  { externalCareSignalsEnabled = false }: { externalCareSignalsEnabled?: boolean } = {},
): Promise<NagoyaWeatherContext> {
  const externalCareSignalsPromise = externalCareSignalsEnabled
    ? getExternalCareSignals(today)
    : Promise.resolve<DailyCareWeatherSignals | null>(null);
  const [jmaResult, wbgtResult, externalCareSignalsResult] = await Promise.allSettled([
    fetchJmaForecastData(),
    fetchNagoyaWbgtMax(today),
    externalCareSignalsPromise,
  ]);
  const data = jmaResult.status === "fulfilled" ? jmaResult.value : null;
  const wbgtMax = wbgtResult.status === "fulfilled" ? wbgtResult.value : null;
  const externalCareSignals = externalCareSignalsResult.status === "fulfilled" ? externalCareSignalsResult.value : null;

  if (!data) {
    return {
      weatherInfo: NAGOYA_WEATHER_FALLBACK,
      wbgtMax,
      ...(externalCareSignals ?? {}),
    };
  }

  return buildNagoyaWeatherContext(data, today, wbgtMax, externalCareSignals);
}

export async function getNagoyaWeatherInfo(
  today = new Date(),
  options: { externalCareSignalsEnabled?: boolean } = {},
) {
  return (await getNagoyaWeatherContext(today, options)).weatherInfo;
}

async function fetchJmaForecast() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), JMA_FORECAST_TIMEOUT_MS);

  try {
    return await fetch(JMA_AICHI_FORECAST_URL, {
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJmaForecastData() {
  const response = await fetchJmaForecast();

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as JmaForecastResponse;
}

async function fetchNagoyaWbgtMax(today: Date) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), JMA_FORECAST_TIMEOUT_MS);

  try {
    const response = await fetch(NAGOYA_WBGT_FORECAST_URL, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    return extractWbgtMaxForDate(await response.text(), today);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function buildNagoyaWeatherContext(
  data: JmaForecastResponse,
  today: Date,
  wbgtMax: number | null,
  externalCareSignals: DailyCareWeatherSignals | null,
) {
  const weatherSeries = data[0]?.timeSeries?.[0];
  const precipitationSeries = data[0]?.timeSeries?.[1];
  const shortRange = data[0]?.timeSeries?.[2];
  const weekly = data[1]?.timeSeries?.[1];
  const weatherArea = findArea(weatherSeries?.areas, "230010", "西部");
  const precipitationArea = findArea(precipitationSeries?.areas, "230010", "西部");
  const shortRangeArea = findArea(shortRange?.areas, "51106", "名古屋");
  const weeklyArea = findArea(weekly?.areas, "51106", "名古屋");
  const weatherText = findFirstTextForDate(weatherSeries?.timeDefines, weatherArea?.weathers, today);
  const maxTemperature =
    findMaxNumberForDate(shortRange?.timeDefines, shortRangeArea?.temps, today) ??
    findMaxNumberForDate(weekly?.timeDefines, weeklyArea?.tempsMax, today);
  const temperatureText =
    maxTemperature === null ? NAGOYA_TEMPERATURE_FALLBACK : `予想最高気温は ${maxTemperature}度 です。`;
  const weatherInfo = weatherText
    ? `名古屋市の天気は「${weatherText}」。${temperatureText}`
    : NAGOYA_WEATHER_FALLBACK;

  return {
    weatherInfo,
    weatherText,
    weatherCode: findFirstTextForDate(weatherSeries?.timeDefines, weatherArea?.weatherCodes, today),
    maxTemperature,
    minTemperature: findFirstNumberForDate(weekly?.timeDefines, weeklyArea?.tempsMin, today),
    precipitationProbability: findMaxNumberForDate(
      precipitationSeries?.timeDefines,
      precipitationArea?.pops,
      today,
    ),
    windText: findFirstTextForDate(weatherSeries?.timeDefines, weatherArea?.winds, today),
    wbgtMax,
    ...(externalCareSignals ?? {}),
  } satisfies NagoyaWeatherContext;
}

function findArea(areas: JmaForecastArea[] | undefined, code: string, name: string) {
  return areas?.find((area) => area.area?.code === code) ?? areas?.find((area) => area.area?.name === name);
}

function findMaxNumberForDate(timeDefines: string[] | undefined, values: string[] | undefined, targetDate: Date) {
  const targetDateKey = formatDateKeyInTimeZone(targetDate);
  const numericValues =
    values
      ?.map((value, index) =>
        formatDateKeyInTimeZone(timeDefines?.[index]) === targetDateKey ? parseNumber(value) : null,
      )
      .filter((value): value is number => value !== null) ?? [];

  if (numericValues.length === 0) {
    return null;
  }

  return Math.max(...numericValues);
}

function findFirstNumberForDate(timeDefines: string[] | undefined, values: string[] | undefined, targetDate: Date) {
  const targetDateKey = formatDateKeyInTimeZone(targetDate);

  return (
    values
      ?.map((value, index) =>
        formatDateKeyInTimeZone(timeDefines?.[index]) === targetDateKey ? parseNumber(value) : null,
      )
      .find((value): value is number => value !== null) ?? null
  );
}

function findFirstTextForDate(timeDefines: string[] | undefined, values: string[] | undefined, targetDate: Date) {
  if (!timeDefines?.length) {
    return normalizeForecastText(values?.find(Boolean));
  }

  const targetDateKey = formatDateKeyInTimeZone(targetDate);

  return (
    values
      ?.map((value, index) =>
        formatDateKeyInTimeZone(timeDefines[index]) === targetDateKey ? normalizeForecastText(value) : null,
      )
      .find((value): value is string => value !== null) ?? null
  );
}

function parseNumber(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  const temperature = Number(value);

  return Number.isFinite(temperature) ? temperature : null;
}

function extractWbgtMaxForDate(csv: string, targetDate: Date) {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  const header = lines[0]?.replace(/^\uFEFF/, "").split(",") ?? [];
  const values = lines[1]?.split(",") ?? [];
  const targetDateKey = formatDateKeyInTimeZone(targetDate)?.replace(/-/g, "");
  const wbgtValues = header
    .map((value, index) => (targetDateKey && value.trim().startsWith(targetDateKey) ? parseNumber(values[index]) : null))
    .filter((value): value is number => value !== null)
    .map((value) => value / 10);

  return wbgtValues.length > 0 ? Math.max(...wbgtValues) : null;
}

function formatDateKeyInTimeZone(value: Date | string | undefined) {
  const date = typeof value === "string" ? new Date(value) : value;

  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  const dateParts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: JMA_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  const year = dateParts.find((part) => part.type === "year")?.value;
  const month = dateParts.find((part) => part.type === "month")?.value;
  const day = dateParts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : null;
}

function normalizeForecastText(value: string | undefined) {
  return value?.replace(/\s+/g, " ").trim() || null;
}
