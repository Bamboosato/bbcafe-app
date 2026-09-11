const DAILY_GREETING_TIME_ZONE = "Asia/Tokyo";

export type DailyCareJmaWarning = {
  code: string;
  kind: "rain" | "snow" | "thunder" | "wind" | "cold";
  name: string;
  severity: "advisory" | "warning" | "special";
};

export type DailyCareInfectionTrend = {
  diseases: Array<"covid19" | "influenza">;
  publishedAt: string;
  reportingWeek: string;
  sourceUrl: string;
};

export type DailyCareInfectionNoticeState = {
  key: string;
  lastDisplayedAt: null | string;
};

export type DailyCareWeatherSignals = {
  weatherText?: string | null;
  weatherCode?: string | null;
  maxTemperature?: number | null;
  minTemperature?: number | null;
  precipitationProbability?: number | null;
  windText?: string | null;
  wbgtMax?: number | null;
  wbgtAlert?: "special" | "warning" | null;
  jmaWarnings?: DailyCareJmaWarning[];
  infectionTrend?: DailyCareInfectionTrend | null;
};

export type DailyCareNotice = {
  priority: number;
  text: string;
  type: "freeze" | "heat" | "infection" | "rain" | "weather" | "wind";
};

const MAX_DAILY_CARE_NOTICES = 2;
export const INFECTION_NOTICE_REPEAT_INTERVAL_DAYS = 3;

export function buildDailyCareNotices(
  signals: DailyCareWeatherSignals,
  today: Date,
  { infectionNoticeState }: { infectionNoticeState?: DailyCareInfectionNoticeState | null } = {},
): DailyCareNotice[] {
  const notices: DailyCareNotice[] = [];
  const weatherText = signals.weatherText ?? "";
  const windText = signals.windText ?? "";
  const hasRainOrSnow = /雨|雪|みぞれ/.test(weatherText) || (signals.precipitationProbability ?? 0) >= 50;
  const hasSnow = /雪|みぞれ/.test(weatherText);
  const hasStrongWind = /やや強く|強い風|非常に強い風|強風|暴風|風雪/.test(`${weatherText} ${windText}`);
  const officialWeatherNotice = buildOfficialWeatherNotice(signals.jmaWarnings ?? []);

  const heatNotice = buildHeatNotice(signals, today);
  if (heatNotice) {
    notices.push(heatNotice);
  }

  if (
    signals.infectionTrend &&
    shouldIncludeInfectionNotice(signals.infectionTrend, today, infectionNoticeState)
  ) {
    notices.push(buildInfectionNotice(signals.infectionTrend));
  }

  if (officialWeatherNotice) {
    notices.push(officialWeatherNotice);
  }

  if (hasSnow && signals.minTemperature !== null && signals.minTemperature !== undefined && signals.minTemperature <= 0) {
    notices.push({
      priority: 100,
      text: "【路面注意】雪や冷え込みで路面が凍るおそれがあるため、足元にご注意ください。",
      type: "freeze",
    });
  } else if (hasRainOrSnow && !officialWeatherNotice) {
    notices.push({
      priority: 80,
      text: "【足元注意】雨や雪で滑りやすいため、外出時はゆっくり歩いてください。",
      type: "rain",
    });
  }

  if (hasStrongWind && !officialWeatherNotice) {
    notices.push({
      priority: 75,
      text: "【強風注意】風が強い時間帯は、無理な外出を控えてください。",
      type: "wind",
    });
  }

  return notices.sort((left, right) => right.priority - left.priority).slice(0, MAX_DAILY_CARE_NOTICES);
}

export function buildInfectionNoticeKey(trend: DailyCareInfectionTrend) {
  return [
    trend.sourceUrl.trim(),
    trend.reportingWeek.trim(),
    trend.publishedAt.trim(),
    [...trend.diseases].sort().join(","),
  ].join("|");
}

export function shouldIncludeInfectionNotice(
  trend: DailyCareInfectionTrend,
  today: Date,
  state: DailyCareInfectionNoticeState | null | undefined,
) {
  if (!state || state.key !== buildInfectionNoticeKey(trend)) {
    return true;
  }

  if (!state.lastDisplayedAt) {
    return true;
  }

  const lastDisplayedDate = new Date(state.lastDisplayedAt);
  if (Number.isNaN(lastDisplayedDate.getTime())) {
    return true;
  }

  return getDateDifferenceInJapan(today, lastDisplayedDate) >= INFECTION_NOTICE_REPEAT_INTERVAL_DAYS;
}

function buildHeatNotice(signals: DailyCareWeatherSignals, today: Date): DailyCareNotice | null {
  if (signals.wbgtAlert === "special") {
    return {
      priority: 115,
      text: "【熱中症特別警戒】危険な暑さが予想されるため、涼しい場所で過ごし、外出や運動を控えてください。",
      type: "heat",
    };
  }

  if (signals.wbgtAlert === "warning") {
    return {
      priority: 100,
      text: "【熱中症警戒】暑さから身を守るため、涼しい場所で過ごし、こまめに水分をとってください。",
      type: "heat",
    };
  }

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

function buildOfficialWeatherNotice(warnings: DailyCareJmaWarning[]): DailyCareNotice | null {
  const warning = [...warnings]
    .filter((item) => item.severity === "advisory" && ["rain", "snow", "thunder", "wind"].includes(item.kind))
    .sort((left, right) => getWarningPriority(right) - getWarningPriority(left))[0];

  if (!warning) {
    return null;
  }

  const severityText = warning.severity === "special" ? "特別警報" : warning.severity === "warning" ? "警報" : "注意報";
  const priority = warning.severity === "special" ? 125 : warning.severity === "warning" ? 110 : 85;
  const action = warning.kind === "thunder"
    ? "雷や急な強い雨に注意し、安全な場所でお過ごしください。"
    : warning.kind === "snow"
      ? "雪や風による路面状況の悪化に注意し、外出時は足元にご注意ください。"
      : warning.kind === "wind"
        ? "風が強い時間帯は、無理な外出を控えてください。"
        : "大雨による危険に注意し、最新の防災情報をご確認ください。";

  return {
    priority,
    text: `【気象${severityText}】${warning.name}が発表されています。${action}`,
    type: "weather",
  };
}

function getWarningPriority(warning: DailyCareJmaWarning) {
  return warning.severity === "special" ? 3 : warning.severity === "warning" ? 2 : 1;
}

function buildInfectionNotice(trend: DailyCareInfectionTrend): DailyCareNotice {
  const diseaseText = trend.diseases.length > 1
    ? "インフルエンザと新型コロナウイルス感染症"
    : trend.diseases[0] === "influenza"
      ? "インフルエンザ"
      : "新型コロナウイルス感染症";

  return {
    priority: 60,
    text: `【感染症対策】愛知県の最新週報で${diseaseText}が増加傾向です。外出後は手洗いを心がけ、体調がすぐれないときは無理をしないでください。`,
    type: "infection",
  };
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

function getDateDifferenceInJapan(later: Date, earlier: Date) {
  const laterDate = getDatePartsInTimeZone(later);
  const earlierDate = getDatePartsInTimeZone(earlier);
  const laterUtc = Date.UTC(laterDate.year, laterDate.month - 1, laterDate.day);
  const earlierUtc = Date.UTC(earlierDate.year, earlierDate.month - 1, earlierDate.day);

  return Math.floor((laterUtc - earlierUtc) / 86_400_000);
}
