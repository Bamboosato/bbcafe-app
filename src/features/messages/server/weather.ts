const JMA_AICHI_FORECAST_URL = "https://www.jma.go.jp/bosai/forecast/data/forecast/230000.json";
const JMA_FORECAST_TIMEOUT_MS = 10000;
const NAGOYA_WEATHER_FALLBACK = "名古屋市の今日の気候に合わせた穏やかな日です。";
const NAGOYA_TEMPERATURE_FALLBACK = "気温の変化に気をつけてお過ごしください。";

type JmaForecastArea = {
  area?: {
    code?: string;
    name?: string;
  };
  temps?: string[];
  tempsMax?: string[];
  weathers?: string[];
};

type JmaForecastTimeSeries = {
  areas?: JmaForecastArea[];
};

type JmaForecastEntry = {
  timeSeries?: JmaForecastTimeSeries[];
};

type JmaForecastResponse = JmaForecastEntry[];

export async function getNagoyaWeatherInfo() {
  try {
    const response = await fetchJmaForecast();

    if (!response.ok) {
      return NAGOYA_WEATHER_FALLBACK;
    }

    const data = (await response.json()) as JmaForecastResponse;
    const weatherText = extractNagoyaWeather(data);

    if (!weatherText) {
      return NAGOYA_WEATHER_FALLBACK;
    }

    return `名古屋市の天気は「${weatherText}」。${extractNagoyaTemperatureText(data)}`;
  } catch {
    return NAGOYA_WEATHER_FALLBACK;
  }
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

function extractNagoyaWeather(data: JmaForecastResponse) {
  const weatherArea = findArea(data[0]?.timeSeries?.[0]?.areas, "230010", "西部");

  return normalizeForecastText(weatherArea?.weathers?.find(Boolean));
}

function extractNagoyaTemperatureText(data: JmaForecastResponse) {
  const shortRangeArea = findArea(data[0]?.timeSeries?.[2]?.areas, "51106", "名古屋");
  const weeklyArea = findArea(data[1]?.timeSeries?.[1]?.areas, "51106", "名古屋");
  const maxTemp = findMaxTemperature(shortRangeArea?.temps) ?? findFirstTemperature(weeklyArea?.tempsMax);

  if (!maxTemp) {
    return NAGOYA_TEMPERATURE_FALLBACK;
  }

  return `予想最高気温は ${maxTemp}度 です。`;
}

function findArea(areas: JmaForecastArea[] | undefined, code: string, name: string) {
  return areas?.find((area) => area.area?.code === code) ?? areas?.find((area) => area.area?.name === name);
}

function findMaxTemperature(temps: string[] | undefined) {
  const numericTemps = temps?.map(parseTemperature).filter((temp): temp is number => temp !== null) ?? [];

  if (numericTemps.length === 0) {
    return null;
  }

  return String(Math.max(...numericTemps));
}

function findFirstTemperature(temps: string[] | undefined) {
  return temps?.map(parseTemperature).find((temp): temp is number => temp !== null)?.toString() ?? null;
}

function parseTemperature(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  const temperature = Number(value);

  return Number.isFinite(temperature) ? temperature : null;
}

function normalizeForecastText(value: string | undefined) {
  return value?.replace(/\s+/g, " ").trim() || null;
}
