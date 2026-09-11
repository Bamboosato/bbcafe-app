const JMA_AICHI_FORECAST_URL = "https://www.jma.go.jp/bosai/forecast/data/forecast/230000.json";
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

export async function getNagoyaWeatherInfo(today = new Date()) {
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

    return `名古屋市の天気は「${weatherText}」。${extractNagoyaTemperatureText(data, today)}`;
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

function extractNagoyaTemperatureText(data: JmaForecastResponse, today: Date) {
  const shortRange = data[0]?.timeSeries?.[2];
  const weekly = data[1]?.timeSeries?.[1];
  const shortRangeArea = findArea(shortRange?.areas, "51106", "名古屋");
  const weeklyArea = findArea(weekly?.areas, "51106", "名古屋");
  const maxTemp =
    findMaxTemperatureForDate(shortRange?.timeDefines, shortRangeArea?.temps, today) ??
    findMaxTemperatureForDate(weekly?.timeDefines, weeklyArea?.tempsMax, today);

  if (!maxTemp) {
    return NAGOYA_TEMPERATURE_FALLBACK;
  }

  return `予想最高気温は ${maxTemp}度 です。`;
}

function findArea(areas: JmaForecastArea[] | undefined, code: string, name: string) {
  return areas?.find((area) => area.area?.code === code) ?? areas?.find((area) => area.area?.name === name);
}

function findMaxTemperatureForDate(timeDefines: string[] | undefined, temps: string[] | undefined, targetDate: Date) {
  const targetDateKey = formatDateKeyInTimeZone(targetDate);
  const numericTemps =
    temps
      ?.map((value, index) =>
        formatDateKeyInTimeZone(timeDefines?.[index]) === targetDateKey ? parseTemperature(value) : null,
      )
      .filter((temp): temp is number => temp !== null) ?? [];

  if (numericTemps.length === 0) {
    return null;
  }

  return String(Math.max(...numericTemps));
}

function parseTemperature(value: string | undefined) {
  if (!value?.trim()) {
    return null;
  }

  const temperature = Number(value);

  return Number.isFinite(temperature) ? temperature : null;
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
