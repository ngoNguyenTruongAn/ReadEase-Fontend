import React, { useState, useEffect } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  FaBookOpen,
  FaChevronRight,
  FaClock,
  FaRegFileAlt,
  FaTrophy,
} from "react-icons/fa";
import GuardianAPI from "../../../../service/Guardian/GuardianAPI";
import "./DashboardGuardian.scss";

const DESIGN_REPORTS = [
  {
    title: "Báo cáo Đánh giá Tuần 3 - Tháng 3",
    sub: "Ghi nhận 5 phiên đọc",
    status: "Báo cáo tự động tạo bởi AI ✨",
  },
  {
    title: "Báo cáo Đánh giá Tuần 2 - Tháng 3",
    sub: "Ghi nhận 5 phiên đọc",
    status: "Đã được Bác sĩ [Tên Bác sĩ] xem xét",
  },
];

const EMPTY_CHILDREN = [];

const STAT_LABELS = {
  sessions: "Số phiên đọc tuần này",
  points: "Điểm nỗ lực đạt được",
  focus: "Tổng thời gian tập trung",
};

const METRIC_CONTAINER_KEYS = [
  "data",
  "stats",
  "metrics",
  "summary",
  "analytics",
  "totals",
  "weekly",
  "weekly_stats",
  "weeklyStats",
  "current_week",
  "currentWeek",
  "reading",
  "reading_stats",
  "readingStats",
  "progress",
  "focus",
  "report",
  "child",
  "payload",
];

const WEEKLY_SESSION_KEYS = [
  "reading_sessions_this_week",
  "readingSessionsThisWeek",
  "sessions_this_week",
  "sessionsThisWeek",
  "weekly_session_count",
  "weeklySessionCount",
  "weekly_sessions",
  "weeklySessions",
  "current_week_session_count",
  "currentWeekSessionCount",
  "current_week_sessions",
  "currentWeekSessions",
  "week_session_count",
  "weekSessionCount",
  "session_count_week",
  "sessionCountWeek",
];

const SESSION_KEYS = [
  ...WEEKLY_SESSION_KEYS,
  "reading_session_count",
  "readingSessionCount",
  "reading_sessions_count",
  "readingSessionsCount",
  "reading_sessions",
  "readingSessions",
  "session_count",
  "sessionCount",
  "sessions_count",
  "sessionsCount",
  "total_sessions",
  "totalSessions",
  "sessions",
];

const POINT_KEYS = [
  "effort_points",
  "effortPoints",
  "effort_point",
  "effortPoint",
  "points_earned",
  "pointsEarned",
  "earned_points",
  "earnedPoints",
  "starPoint",
  "star_point",
  "tokenBalance",
  "token_balance",
  "score",
  "points",
  "point",
  "balance",
];

const FOCUS_DURATION_KEYS = [
  "focus_time_seconds",
  "focusTimeSeconds",
  "total_focus_time_seconds",
  "totalFocusTimeSeconds",
  "focused_seconds",
  "focusedSeconds",
  "focused_time_seconds",
  "focusedTimeSeconds",
  "focus_duration_seconds",
  "focusDurationSeconds",
  "focus_time_ms",
  "focusTimeMs",
  "total_focus_time_ms",
  "totalFocusTimeMs",
  "focused_ms",
  "focusedMs",
  "focus_duration_ms",
  "focusDurationMs",
  "focus_time_minutes",
  "focusTimeMinutes",
  "total_focus_minutes",
  "totalFocusMinutes",
  "focused_minutes",
  "focusedMinutes",
  "focus_time",
  "focusTime",
  "total_focus_time",
  "totalFocusTime",
  "focused_time",
  "focusedTime",
  "focus_duration",
  "focusDuration",
];

const READING_DURATION_KEYS = [
  "reading_time_seconds",
  "readingTimeSeconds",
  "total_reading_time_seconds",
  "totalReadingTimeSeconds",
  "reading_duration_seconds",
  "readingDurationSeconds",
  "reading_time_ms",
  "readingTimeMs",
  "total_reading_time_ms",
  "totalReadingTimeMs",
  "reading_duration_ms",
  "readingDurationMs",
  "reading_time_minutes",
  "readingTimeMinutes",
  "readingMinutes",
  "total_reading_minutes",
  "totalReadingMinutes",
  "reading_time",
  "readingTime",
  "total_reading_time",
  "totalReadingTime",
  "reading_duration",
  "readingDuration",
  "duration_seconds",
  "durationSeconds",
  "duration_ms",
  "durationMs",
  "duration_minutes",
  "durationMinutes",
  "duration",
];

const normalizeReportsList = (res) => {
  const data = res?.data ?? res;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.reports)) return data.reports;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const childRowId = (row) =>
  String(row?.id ?? row?.child_id ?? row?.user_id ?? "").trim();

const reportRowId = (row) => row?.id ?? row?.report_id ?? row?._id;

const toFiniteNumber = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;

  const normalized = value.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;

  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
};

const collectMetricSources = (value, seen = new Set()) => {
  if (!value || typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);

  if (Array.isArray(value)) return [];

  const sources = [value];
  METRIC_CONTAINER_KEYS.forEach((key) => {
    const nested = value?.[key];
    if (nested && typeof nested === "object") {
      sources.push(...collectMetricSources(nested, seen));
    }
  });

  return sources;
};

const pickFirstNumber = (row, keys, { countArrays = false } = {}) => {
  const sources = collectMetricSources(row);

  for (const source of sources) {
    for (const key of keys) {
      const value = source?.[key];
      if (countArrays && Array.isArray(value)) return value.length;

      const number = toFiniteNumber(value);
      if (number !== null) return number;
    }
  }

  return null;
};

const aggregateFirstNumber = (rows, keys, options) =>
  rows.reduce(
    (acc, row) => {
      const value = pickFirstNumber(row, keys, options);
      if (value === null) return acc;

      return {
        total: acc.total + value,
        found: true,
      };
    },
    { total: 0, found: false },
  );

const parseDurationString = (value) => {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;

  const colon = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (colon) {
    const first = Number(colon[1]);
    const second = Number(colon[2]);
    const third = colon[3] ? Number(colon[3]) : null;

    if ([first, second, third ?? 0].every(Number.isFinite)) {
      return third === null ? first * 60 + second : first * 3600 + second * 60 + third;
    }
  }

  const units = [
    {
      regex: /(\d+(?:[.,]\d+)?)\s*(?:giờ|gio|hour|hours|hr|h)(?=\s|$)/g,
      multiplier: 3600,
    },
    {
      regex: /(\d+(?:[.,]\d+)?)\s*(?:phút|phut|minute|minutes|min|m)(?=\s|$)/g,
      multiplier: 60,
    },
    {
      regex: /(\d+(?:[.,]\d+)?)\s*(?:giây|giay|second|seconds|sec|s)(?=\s|$)/g,
      multiplier: 1,
    },
  ];

  let total = 0;
  let matched = false;

  units.forEach(({ regex, multiplier }) => {
    for (const match of text.matchAll(regex)) {
      const number = Number(match[1].replace(",", "."));
      if (Number.isFinite(number)) {
        total += number * multiplier;
        matched = true;
      }
    }
  });

  return matched ? total : null;
};

const durationSecondsFromValue = (value, key) => {
  const keyText = String(key).toLowerCase();
  const number = toFiniteNumber(value);

  if (number !== null) {
    if (keyText.includes("ms") || keyText.includes("millisecond")) {
      return number / 1000;
    }
    if (
      keyText.includes("minute") ||
      keyText.includes("_min") ||
      keyText.endsWith("min")
    ) {
      return number * 60;
    }
    if (keyText.includes("hour")) return number * 3600;
    return number;
  }

  return typeof value === "string" ? parseDurationString(value) : null;
};

const pickFirstDurationSeconds = (row, keys) => {
  const sources = collectMetricSources(row);

  for (const source of sources) {
    for (const key of keys) {
      const seconds = durationSecondsFromValue(source?.[key], key);
      if (seconds !== null) return seconds;
    }
  }

  return null;
};

const aggregateDurationSeconds = (rows, keys) =>
  rows.reduce(
    (acc, row) => {
      const value = pickFirstDurationSeconds(row, keys);
      if (value === null) return acc;

      return {
        total: acc.total + value,
        found: true,
      };
    },
    { total: 0, found: false },
  );

const hasReportId = (row) => {
  const id = reportRowId(row);
  return id !== null && id !== undefined && String(id).trim() !== "";
};

const reportTimestamp = (row) => {
  const raw =
    row?.created_at ??
    row?.createdAt ??
    row?.generated_at ??
    row?.generatedAt ??
    row?.week_end ??
    row?.period_end;
  const time = raw ? new Date(raw).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
};

const reportDateRange = (row) => {
  const startRaw =
    row?.period_start ?? row?.periodStart ?? row?.week_start ?? row?.weekStart;
  const endRaw =
    row?.period_end ??
    row?.periodEnd ??
    row?.week_end ??
    row?.weekEnd ??
    row?.created_at ??
    row?.createdAt ??
    row?.generated_at ??
    row?.generatedAt;

  const start = startRaw ? new Date(startRaw) : null;
  const end = endRaw ? new Date(endRaw) : null;

  return {
    start: start && !Number.isNaN(start.getTime()) ? start : null,
    end: end && !Number.isNaN(end.getTime()) ? end : null,
  };
};

const currentWeekBounds = () => {
  const start = new Date();
  const day = start.getDay();
  const diffToMonday = (day + 6) % 7;
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - diffToMonday);

  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  return { start, end };
};

const isCurrentWeekReport = (row) => {
  const { start: weekStart, end: weekEnd } = currentWeekBounds();
  const { start, end } = reportDateRange(row);

  if (start && end) return start < weekEnd && end >= weekStart;
  const singleDate = end ?? start;
  return singleDate ? singleDate >= weekStart && singleDate < weekEnd : false;
};

const selectStatsReportEntries = (reportEntries) => {
  const currentWeek = reportEntries.filter(({ report }) =>
    isCurrentWeekReport(report),
  );
  if (currentWeek.length) return currentWeek;

  const latestByChild = new Map();
  [...reportEntries]
    .filter(({ report }) => hasReportId(report))
    .sort((a, b) => reportTimestamp(b.report) - reportTimestamp(a.report))
    .forEach((entry) => {
      if (!latestByChild.has(entry.childId)) latestByChild.set(entry.childId, entry);
    });

  return [...latestByChild.values()];
};

const formatInteger = (value) =>
  new Intl.NumberFormat("vi-VN").format(Math.max(0, Math.round(value)));

const formatDuration = (secondsValue) => {
  const totalSeconds = Math.max(0, Math.round(secondsValue));
  if (totalSeconds <= 0) return "0 phút";

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours} giờ`);
  if (minutes > 0) parts.push(`${minutes} phút`);
  if (seconds > 0 && hours === 0) parts.push(`${seconds} giây`);

  return parts.join(" ") || "0 phút";
};

const buildStats = (children = [], reportEntries = []) => {
  const statsReportRows = selectStatsReportEntries(reportEntries).map(
    ({ report }) => report,
  );

  const weeklyChildSessions = aggregateFirstNumber(
    children,
    WEEKLY_SESSION_KEYS,
    { countArrays: true },
  );
  const reportSessions = aggregateFirstNumber(statsReportRows, SESSION_KEYS, {
    countArrays: true,
  });
  const childSessions = aggregateFirstNumber(children, SESSION_KEYS, {
    countArrays: true,
  });
  const sessions = weeklyChildSessions.found
    ? weeklyChildSessions.total
    : reportSessions.found
      ? reportSessions.total
      : childSessions.found
        ? childSessions.total
        : 0;

  const childPoints = aggregateFirstNumber(children, POINT_KEYS);
  const reportPoints = aggregateFirstNumber(statsReportRows, POINT_KEYS);
  const points = childPoints.found && (childPoints.total > 0 || !reportPoints.found)
    ? childPoints.total
    : reportPoints.found
      ? reportPoints.total
      : 0;

  const childFocus = aggregateDurationSeconds(children, FOCUS_DURATION_KEYS);
  const reportFocus = aggregateDurationSeconds(statsReportRows, FOCUS_DURATION_KEYS);
  const childReading = aggregateDurationSeconds(children, READING_DURATION_KEYS);
  const reportReading = aggregateDurationSeconds(
    statsReportRows,
    READING_DURATION_KEYS,
  );
  const focusSeconds = childFocus.found
    ? childFocus.total
    : reportFocus.found
      ? reportFocus.total
      : childReading.found
        ? childReading.total
        : reportReading.found
          ? reportReading.total
          : 0;

  return [
    {
      key: "sessions",
      label: STAT_LABELS.sessions,
      value: formatInteger(sessions),
    },
    {
      key: "points",
      label: STAT_LABELS.points,
      value: formatInteger(points),
    },
    {
      key: "focus",
      label: STAT_LABELS.focus,
      value: formatDuration(focusSeconds),
    },
  ];
};

const DashboardGuardian = () => {
  const outletContext = useOutletContext();
  const outletChildren = Array.isArray(outletContext?.children)
    ? outletContext.children
    : EMPTY_CHILDREN;
  const loadingChildren = Boolean(outletContext?.loadingChildren);

  const [stats, setStats] = useState(() => buildStats());
  const [reports, setReports] = useState([]);

  useEffect(() => {
    if (loadingChildren) return undefined;

    let cancelled = false;

    const fetchWeeklyReports = async () => {
      setStats(buildStats(outletChildren, []));

      if (outletChildren.length === 0) {
        setReports([]);
        setStats(buildStats([], []));
        return;
      }

      const reportGroups = await Promise.all(
        outletChildren.map(async (child) => {
          const childId = childRowId(child);
          if (!childId) return [];

          try {
            const res = await GuardianAPI.getReportChildById(childId);
            return normalizeReportsList(res).map((report) => ({
              childId,
              report,
            }));
          } catch {
            return [];
          }
        }),
      );

      if (cancelled) return;

      const reportEntries = reportGroups.flat();
      const latestReports = reportEntries
        .filter(({ report }) => hasReportId(report))
        .sort((a, b) => reportTimestamp(b.report) - reportTimestamp(a.report))
        .slice(0, DESIGN_REPORTS.length)
        .map(({ childId, report }, index) => {
          const reportId = reportRowId(report);
          const design = DESIGN_REPORTS[index];

          return {
            ...design,
            id: `${childId}-${reportId}`,
            to: `/guardian/reports/${encodeURIComponent(
              String(reportId),
            )}?child=${encodeURIComponent(childId)}`,
          };
        });

      setStats(buildStats(outletChildren, reportEntries));
      setReports(latestReports);
    };

    fetchWeeklyReports();

    return () => {
      cancelled = true;
    };
  }, [loadingChildren, outletChildren]);

  const statConfig = [
    { key: "sessions", icon: FaBookOpen, tone: "book" },
    { key: "points", icon: FaTrophy, tone: "trophy" },
    { key: "focus", icon: FaClock, tone: "clock" },
  ];

  return (
    <div className="gdg">
      {/* STATS */}
      <div className="gdg-stats">
        {stats.map((s) => {
          const config = statConfig.find((c) => c.key === s.key);
          const Icon = config?.icon ?? FaBookOpen;

          return (
            <div
              key={s.key}
              className={`gdg-stat gdg-stat--${config?.tone ?? "book"}`}
            >
              <div
                className={`gdg-stat__icon gdg-stat__icon--${
                  config?.tone ?? "book"
                }`}
              >
                <Icon aria-hidden="true" className="gdg-ico" />
              </div>

              <div className="gdg-stat__main">
                <div className="gdg-stat__label">{s.label}</div>
                <div className="gdg-stat__value">{s.value}</div>
              </div>
            </div>
          );
        })}
      </div>

      {reports.length > 0 ? (
        <div className="gdg-section">
          <div className="gdg-section__title">Báo cáo Hàng tuần</div>

          <div className="gdg-list">
            {reports.map((r) => (
              <div key={r.id} className="gdg-item">
                <div className="gdg-item__left">
                  <div className="gdg-item__icon" aria-hidden="true">
                    <FaRegFileAlt />
                  </div>
                  <div className="gdg-item__copy">
                    <div className="gdg-item__title">{r.title}</div>
                    <div className="gdg-item__sub">{r.sub}</div>
                  </div>
                </div>

                <div className="gdg-item__right">
                  <div className="gdg-item__status">{r.status}</div>
                  <Link className="gdg-item__link" to={r.to}>
                    <span>Xem chi tiết</span>
                    <FaChevronRight aria-hidden="true" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DashboardGuardian;
