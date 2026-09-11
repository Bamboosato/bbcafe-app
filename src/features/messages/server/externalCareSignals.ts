import type {
  DailyCareInfectionTrend,
  DailyCareJmaWarning,
  DailyCareWeatherSignals,
} from "./dailyCare";

const DAILY_CARE_TIME_ZONE = "Asia/Tokyo";
const JMA_WARNING_URL = "https://www.jma.go.jp/bosai/warning/data/warning/230000.json";
const JIHS_SURVEILLANCE_INDEX_URL = "https://id-info.jihs.go.jp/surveillance/idwr/index.html";
const JIHS_BASE_URL = "https://id-info.jihs.go.jp";
const WBGT_ALERT_BASE_URL = "https://www.wbgt.env.go.jp/alert/dl";
const AICHI_WARNING_AREA_CODE = "230010";
const AICHI_NAME = "愛知県";
const FETCH_TIMEOUT_MS = 10000;
const MAX_WARNING_AGE_MS = 36 * 60 * 60 * 1000;
const MAX_INFECTION_DATA_AGE_DAYS = 14;

type JmaWarningResponse = {
  areaTypes?: Array<{
    areas?: Array<{
      code?: string;
      warnings?: Array<{
        code?: string;
        status?: string;
      }>;
    }>;
  }>;
  reportDatetime?: string;
};

type JmaWarningDefinition = Omit<DailyCareJmaWarning, "code" | "severity"> & {
  severity: DailyCareJmaWarning["severity"];
};

const JMA_WARNING_DEFINITIONS: Record<string, JmaWarningDefinition> = {
  "02": { kind: "snow", name: "暴風雪警報", severity: "warning" },
  "03": { kind: "rain", name: "大雨警報", severity: "warning" },
  "04": { kind: "rain", name: "洪水警報", severity: "warning" },
  "05": { kind: "wind", name: "暴風警報", severity: "warning" },
  "06": { kind: "snow", name: "大雪警報", severity: "warning" },
  "10": { kind: "rain", name: "大雨注意報", severity: "advisory" },
  "12": { kind: "snow", name: "大雪注意報", severity: "advisory" },
  "13": { kind: "snow", name: "風雪注意報", severity: "advisory" },
  "14": { kind: "thunder", name: "雷注意報", severity: "advisory" },
  "15": { kind: "wind", name: "強風注意報", severity: "advisory" },
  "18": { kind: "rain", name: "洪水注意報", severity: "advisory" },
  "23": { kind: "cold", name: "低温注意報", severity: "advisory" },
  "32": { kind: "snow", name: "暴風雪特別警報", severity: "special" },
  "33": { kind: "rain", name: "大雨特別警報", severity: "special" },
  "35": { kind: "wind", name: "暴風特別警報", severity: "special" },
  "36": { kind: "snow", name: "大雪特別警報", severity: "special" },
};

export async function getExternalCareSignals(today: Date): Promise<DailyCareWeatherSignals> {
  const [jmaResult, wbgtResult, infectionResult] = await Promise.allSettled([
    fetchJmaWarnings(today),
    fetchWbgtAlert(today),
    fetchInfectionTrend(today),
  ]);

  return {
    jmaWarnings: jmaResult.status === "fulfilled" ? jmaResult.value : [],
    wbgtAlert: wbgtResult.status === "fulfilled" ? wbgtResult.value : null,
    infectionTrend: infectionResult.status === "fulfilled" ? infectionResult.value : null,
  };
}

async function fetchJmaWarnings(today: Date): Promise<DailyCareJmaWarning[]> {
  try {
    const response = await fetchWithTimeout(JMA_WARNING_URL);
    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as JmaWarningResponse;
    const reportTime = data.reportDatetime ? new Date(data.reportDatetime).getTime() : Number.NaN;
    if (!Number.isFinite(reportTime) || Math.abs(today.getTime() - reportTime) > MAX_WARNING_AGE_MS) {
      return [];
    }

    const area = data.areaTypes
      ?.flatMap((areaType) => areaType.areas ?? [])
      .find((candidate) => candidate.code === AICHI_WARNING_AREA_CODE);

    return (area?.warnings ?? [])
      .filter((warning) => warning.status === "発表" || warning.status === "継続")
      .map((warning) => {
        const definition = warning.code ? JMA_WARNING_DEFINITIONS[warning.code] : undefined;
        return definition && warning.code
          ? { ...definition, code: warning.code }
          : null;
      })
      .filter((warning): warning is DailyCareJmaWarning => warning !== null);
  } catch {
    return [];
  }
}

async function fetchWbgtAlert(today: Date): Promise<"special" | "warning" | null> {
  const { year, dateKey } = getDatePartsInTimeZone(today);

  try {
    const response = await fetchWithTimeout(`${WBGT_ALERT_BASE_URL}/${year}/alert_${dateKey}_05.csv`);
    if (!response.ok) {
      return null;
    }

    const rows = parseCsv(await response.text());
    const row = rows.find((candidate) => candidate[0] === AICHI_NAME);
    const flag = row ? Number(row[6]) : Number.NaN;

    if (flag === 3) {
      return "special";
    }

    if (flag === 1) {
      return "warning";
    }

    return null;
  } catch {
    return null;
  }
}

async function fetchInfectionTrend(today: Date): Promise<DailyCareInfectionTrend | null> {
  try {
    const indexResponse = await fetchWithTimeout(JIHS_SURVEILLANCE_INDEX_URL);
    if (!indexResponse.ok) {
      return null;
    }

    const indexHtml = await indexResponse.text();
    const report = findLatestReport(indexHtml);
    if (!report) {
      return null;
    }

    const response = await fetchWithTimeout(report.csvUrl);
    if (!response.ok) {
      return null;
    }

    const rows = parseCsv(decodeShiftJis(await response.arrayBuffer()));
    return buildInfectionTrend(rows, report.pageUrl, today);
  } catch {
    return null;
  }
}

function findLatestReport(indexHtml: string) {
  const reports = [...indexHtml.matchAll(/\/surveillance\/idwr\/provisional\/(\d{4})\/(\d{1,2})\/index\.html/g)]
    .map((match) => {
      const year = Number(match[1]);
      const week = Number(match[2]);
      const weekText = String(week).padStart(2, "0");
      const path = `/surveillance/idwr/provisional/${year}/${week}/index.html`;
      return {
        csvUrl: `${JIHS_BASE_URL}/surveillance/idwr/provisional/${year}/${week}/${year}-${weekText}-teiten-tougai.csv`,
        pageUrl: `${JIHS_BASE_URL}${path}`,
        sortKey: year * 100 + week,
      };
    })
    .sort((left, right) => right.sortKey - left.sortKey);

  return reports[0] ?? null;
}

function buildInfectionTrend(rows: string[][], sourceUrl: string, today: Date): DailyCareInfectionTrend | null {
  const reportingWeek = parseReportingWeek(rows[1]?.[0]);
  const publishedAt = parseJapaneseDate(rows[1]?.[1]);
  if (!reportingWeek || !publishedAt || isStale(publishedAt, today)) {
    return null;
  }

  const diseases = [
    { id: "influenza" as const, label: "インフルエンザ" },
    { id: "covid19" as const, label: "COVID-19" },
  ]
    .filter(({ label }) => hasIncreasingTrend(rows, label))
    .map(({ id }) => id);

  return diseases.length > 0
    ? { diseases, publishedAt: publishedAt.toISOString(), reportingWeek, sourceUrl }
    : null;
}

function hasIncreasingTrend(rows: string[][], disease: string) {
  const sectionIndex = rows.findIndex((row) => row[0]?.trim() === disease);
  if (sectionIndex < 0) {
    return false;
  }

  const weekHeaders = rows[sectionIndex + 1] ?? [];
  const measureHeaders = rows[sectionIndex + 2] ?? [];
  const nextSectionIndex = rows.findIndex(
    (row, index) => index > sectionIndex && (row[0]?.trim() === "インフルエンザ" || row[0]?.trim() === "COVID-19"),
  );
  const aichiRow = rows
    .slice(sectionIndex + 3, nextSectionIndex < 0 ? undefined : nextSectionIndex)
    .find((row) => row[0]?.trim() === AICHI_NAME);
  const weeklyColumns = weekHeaders
    .map((header, index) => ({ header: header.trim(), index }))
    .filter(({ header, index }) => /^\d{1,2}週$/.test(header) && measureHeaders[index]?.trim() === "定当")
    .slice(-3);

  if (!aichiRow || weeklyColumns.length < 3) {
    return false;
  }

  const values = weeklyColumns.map(({ index }) => parseCsvNumber(aichiRow[index]));
  return values.every((value): value is number => value !== null) && values[0] < values[1] && values[1] < values[2];
}

function parseReportingWeek(value: string | undefined) {
  const match = value?.match(/(\d{4})年(\d{1,2})週/);
  return match ? `${match[1]}年第${Number(match[2])}週` : null;
}

function parseJapaneseDate(value: string | undefined) {
  const match = value?.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  return match ? new Date(`${match[1]}-${String(Number(match[2])).padStart(2, "0")}-${String(Number(match[3])).padStart(2, "0")}T00:00:00+09:00`) : null;
}

function isStale(publishedAt: Date, today: Date) {
  const todayKey = getDatePartsInTimeZone(today).dateKey;
  const publishedKey = getDatePartsInTimeZone(publishedAt).dateKey;
  const ageDays = Math.floor((Date.parse(`${todayKey}T00:00:00+09:00`) - Date.parse(`${publishedKey}T00:00:00+09:00`)) / 86_400_000);
  return ageDays < -1 || ageDays > MAX_INFECTION_DATA_AGE_DAYS;
}

function decodeShiftJis(buffer: ArrayBuffer) {
  return new TextDecoder("shift_jis").decode(buffer);
}

function parseCsvNumber(value: string | undefined) {
  if (!value || value.trim() === "-") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (character === '"') {
      if (inQuotes && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (character === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && text[index + 1] === "\n") {
        index += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    return await fetch(url, { cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function getDatePartsInTimeZone(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: DAILY_CARE_TIME_ZONE,
    year: "numeric",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";

  return { dateKey: `${year}${month}${day}`, year };
}
