const DAILY_GREETING_TIME_ZONE = "Asia/Tokyo";

export type DailyCareWeatherSignals = {
  weatherText?: string | null;
  weatherCode?: string | null;
  maxTemperature?: number | null;
  minTemperature?: number | null;
  precipitationProbability?: number | null;
  windText?: string | null;
  wbgtMax?: number | null;
};

export type DailyCareNotice = {
  priority: number;
  text: string;
  type: "heat" | "rain" | "wind" | "freeze";
};

const MAX_DAILY_CARE_NOTICES = 2;

export function buildDailyCareNotices(
  signals: DailyCareWeatherSignals,
  today: Date,
): DailyCareNotice[] {
  const notices: DailyCareNotice[] = [];
  const weatherText = signals.weatherText ?? "";
  const windText = signals.windText ?? "";
  const hasRainOrSnow = /雨|雪|みぞれ/.test(weatherText) || (signals.precipitationProbability ?? 0) >= 50;
  const hasSnow = /雪|みぞれ/.test(weatherText);
  const hasStrongWind = /やや強く|強い風|非常に強い風|強風|暴風|風雪/.test(`${weatherText} ${windText}`);

  const heatNotice = buildHeatNotice(signals, today);
  if (heatNotice) {
    notices.push(heatNotice);
  }

  if (hasSnow && signals.minTemperature !== null && signals.minTemperature !== undefined && signals.minTemperature <= 0) {
    notices.push({
      priority: 100,
      text: "【路面注意】雪や冷え込みで路面が凍るおそれがあるため、足元にご注意ください。",
      type: "freeze",
    });
  } else if (hasRainOrSnow) {
    notices.push({
      priority: 80,
      text: "【足元注意】雨や雪で滑りやすいため、外出時はゆっくり歩いてください。",
      type: "rain",
    });
  }

  if (hasStrongWind) {
    notices.push({
      priority: 75,
      text: "【強風注意】風が強い時間帯は、無理な外出を控えてください。",
      type: "wind",
    });
  }

  return notices.sort((left, right) => right.priority - left.priority).slice(0, MAX_DAILY_CARE_NOTICES);
}

function buildHeatNotice(signals: DailyCareWeatherSignals, today: Date): DailyCareNotice | null {
  if (signals.wbgtMax !== null && signals.wbgtMax !== undefined) {
    if (signals.wbgtMax >= 31) {
      return {
        priority: 90,
        text: "【熱中症対策】暑さ指数が高いため、涼しい場所で過ごし、こまめに水分をとってください。",
        type: "heat",
      };
    }

    if (signals.wbgtMax >= 28) {
      return {
        priority: 60,
        text: "【暑さ対策】暑さ指数が高めです。無理をせず、こまめに水分をとってください。",
        type: "heat",
      };
    }

    if (signals.wbgtMax >= 25) {
      return {
        priority: 50,
        text: "【暑さ対策】こまめに水分をとり、無理をしないでください。",
        type: "heat",
      };
    }

    return null;
  }

  const { month } = getDatePartsInTimeZone(today);
  const maxTemperature = signals.maxTemperature ?? null;

  if (maxTemperature !== null && ((month >= 5 && month <= 9 && maxTemperature >= 30) || maxTemperature >= 33)) {
    return {
      priority: 45,
      text: "【暑さ対策】暑くなるため、こまめに水分をとり、無理をしないでください。",
      type: "heat",
    };
  }

  return null;
}

function getDatePartsInTimeZone(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "numeric",
    timeZone: DAILY_GREETING_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const year = Number(parts.find((part) => part.type === "year")?.value);

  return { day, month, year };
}
