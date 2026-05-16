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

const EMPTY_CHILDREN = [];
const REPORT_PREVIEW_LIMIT = 2;

const STAT_LABELS = {
  sessions: "Số phiên đọc tuần này",
  points: "Điểm nỗ lực đạt được",
  reading: "Tổng thời gian đọc",
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

const REPORT_TEXT_KEYS = [
  "content",
  "summary",
  "description",
  "text",
  "report_content",
  "markdown",
  "body",
  "report_body",
  "full_text",
];

const normalizeReportsList = (res) => {
  const data = res?.data ?? res;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.reports)) return data.reports;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const normalizeSessionsList = (res) => {
  const data = res?.data ?? res;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.sessions)) return data.sessions;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.results)) return data.results;
  return [];
};

const childRowId = (row) =>
  String(row?.id ?? row?.child_id ?? row?.user_id ?? "").trim();

const childDisplayName = (row) =>
  String(
    row?.name ??
      row?.display_name ??
      row?.displayName ??
      row?.full_name ??
      row?.fullName ??
      row?.username ??
      row?.email ??
      "Trẻ",
  ).trim();

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

const collectReportText = (row) => {
  const sources = collectMetricSources(row);
  const parts = [];

  sources.forEach((source) => {
    REPORT_TEXT_KEYS.forEach((key) => {
      const value = source?.[key];
      if (typeof value === "string" && value.trim()) {
        parts.push(value.trim());
      }
    });
  });

  return parts.join("\n");
};

const parseSessionCountFromText = (text) => {
  const raw = String(text ?? "").trim();
  if (!raw) return null;

  const patterns = [
    /(?:hoàn\s+thành|hoan\s+thanh|ghi\s+nhận|ghi\s+nhan)\D{0,60}(\d+)\s*(?:phiên|phien|buổi|buoi|lần|lan)\s*(?:đọc|doc)/i,
    /(\d+)\s*(?:phiên|phien|buổi|buoi|lần|lan)\s*(?:đọc|doc)/i,
    /(?:ghi\s+nhận|so\s+phien\s+doc|số\s+phiên\s+đọc|phiên\s+đọc)\D{0,30}(\d+)/i,
    /(\d+)\s*phiên\s*đọc/i,
    /(\d+)\s*phien\s*doc/i,
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    const number = match ? Number(match[1]) : NaN;
    if (Number.isFinite(number)) return number;
  }

  return null;
};

const pickSessionCount = (row) =>
  pickFirstNumber(row, SESSION_KEYS, { countArrays: true }) ??
  parseSessionCountFromText(collectReportText(row));

const aggregateSessionCount = (rows) =>
  rows.reduce(
    (acc, row) => {
      const value = pickSessionCount(row);
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

const parseFirstDurationString = (value) => {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;

  const match = text.match(
    /(\d+(?:[.,]\d+)?)\s*(?:giờ|gio|hour|hours|hr|h|phút|phut|minute|minutes|min|m|giây|giay|second|seconds|sec|s)(?=\s|$|[.,;:])/i,
  );
  return match ? parseDurationString(match[0]) : null;
};

const parseReportReadingDurationFromText = (text) => {
  const raw = String(text ?? "").trim();
  if (!raw) return null;

  const totalMatch = raw.match(
    /(?:tổng\s+thời\s+gian(?:\s+đọc)?|tong\s+thoi\s+gian(?:\s+doc)?|thời\s+lượng|thoi\s+luong)[^.\n]{0,100}?(\d+(?:[.,]\d+)?\s*(?:giờ|gio|hour|hours|hr|h|phút|phut|minute|minutes|min|m|giây|giay|second|seconds|sec|s))/i,
  );

  return totalMatch
    ? parseDurationString(totalMatch[1])
    : parseFirstDurationString(raw);
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
    if ((keyText === "duration" || keyText.endsWith("_duration")) && number > 21600) {
      return number / 1000;
    }
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

const toValidDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

const sessionStartDate = (row) =>
  toValidDate(
    row?.started_at ??
      row?.startedAt ??
      row?.start_time ??
      row?.startTime ??
      row?.created_at ??
      row?.createdAt,
  );

const sessionEndDate = (row) =>
  toValidDate(
    row?.ended_at ??
      row?.endedAt ??
      row?.end_time ??
      row?.endTime ??
      row?.completed_at ??
      row?.completedAt ??
      row?.finished_at ??
      row?.finishedAt,
  );

const sessionDurationSeconds = (row) => {
  const start = sessionStartDate(row);
  const end = sessionEndDate(row);
  if (!start || !end || end < start) return null;

  return (end.getTime() - start.getTime()) / 1000;
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

const pickReadingDurationSeconds = (row) =>
  pickFirstDurationSeconds(row, READING_DURATION_KEYS) ??
  sessionDurationSeconds(row) ??
  parseReportReadingDurationFromText(collectReportText(row));

const aggregateReadingDurationSeconds = (rows) =>
  rows.reduce(
    (acc, row) => {
      const value = pickReadingDurationSeconds(row);
      if (value === null) return acc;

      return {
        total: acc.total + value,
        found: true,
      };
    },
    { total: 0, found: false },
  );

const parseMaybeJsonObject = (value) => {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
};

const sessionEffortScore = (row) => {
  const direct = toFiniteNumber(row?.effort_score ?? row?.effortScore);
  if (direct !== null) return direct;

  const summary = parseMaybeJsonObject(
    row?.cognitive_state_summary ?? row?.cognitiveStateSummary,
  );
  return toFiniteNumber(summary?.effort_score ?? summary?.effortScore);
};

const aggregateEffortScorePoints = (sessions) =>
  sessions.reduce(
    (acc, session) => {
      const score = sessionEffortScore(session);
      if (score === null) return acc;

      return {
        total: acc.total + score * 100,
        found: true,
      };
    },
    { total: 0, found: false },
  );

const sessionDate = (row) => {
  return (
    sessionEndDate(row) ??
    toValidDate(row?.updated_at ?? row?.updatedAt) ??
    sessionStartDate(row)
  );
};

const sessionStatusText = (row) =>
  String(
    row?.status ??
      row?.state ??
      row?.session_status ??
      row?.sessionStatus ??
      row?.reading_status ??
      row?.readingStatus ??
      row?.completion_status ??
      row?.completionStatus ??
      "",
  )
    .trim()
    .toLowerCase();

const isCompletedSession = (row) => {
  if (!row) return false;

  const status = sessionStatusText(row);
  return status === "completed";
};

const isCurrentWeekSession = (row) => {
  const { start: weekStart, end: weekEnd } = currentWeekBounds();
  const date = sessionDate(row);
  return date ? date >= weekStart && date < weekEnd : true;
};

const completedCurrentWeekSessionEntries = (sessionEntries) =>
  sessionEntries.filter(
    ({ session }) => isCompletedSession(session) && isCurrentWeekSession(session),
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

  return `${Math.floor(totalSeconds / 60)} phút`;
};

const reportDisplayDate = (row) => {
  const raw =
    row?.period_end ??
    row?.periodEnd ??
    row?.week_end ??
    row?.weekEnd ??
    row?.created_at ??
    row?.createdAt ??
    row?.generated_at ??
    row?.generatedAt ??
    row?.period_start ??
    row?.periodStart ??
    row?.week_start ??
    row?.weekStart;

  const date = raw ? new Date(raw) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

const weekOfMonth = (date) => Math.max(1, Math.ceil(date.getDate() / 7));

const reportTitle = (row) => {
  const date = reportDisplayDate(row);
  if (date) {
    return `Báo cáo Đánh giá Tuần ${weekOfMonth(date)} - Tháng ${
      date.getMonth() + 1
    }`;
  }

  return (
    String(row?.title ?? row?.week_label ?? row?.name ?? "").trim() ||
    (reportRowId(row) != null ? `Báo cáo #${reportRowId(row)}` : "Báo cáo")
  );
};

const reportSessionText = (row) => {
  const count = pickSessionCount(row);
  if (count === null) return "Chưa có dữ liệu phiên đọc";

  return `Ghi nhận ${formatInteger(count)} phiên đọc`;
};

const reportSubtitle = (row, child) =>
  `${childDisplayName(child)}: ${reportSessionText(row)}`;

const reviewedByName = (row) =>
  String(
    row?.reviewed_by_name ??
      row?.reviewedByName ??
      row?.approved_by_name ??
      row?.approvedByName ??
      row?.clinician_name ??
      row?.clinicianName ??
      row?.doctor_name ??
      row?.doctorName ??
      "",
  ).trim();

const isReviewedReport = (row) => {
  if (!row) return false;
  if (row.approved === true || row.is_approved === true) return true;

  const status = String(
    row.approval_status ?? row.review_status ?? row.status ?? "",
  ).toLowerCase();

  return ["approved", "published", "visible", "reviewed", "da_duyet"].some(
    (token) => status.includes(token),
  );
};

const reportStatus = (row) => {
  if (isReviewedReport(row)) {
    const reviewer = reviewedByName(row);
    return reviewer
      ? `Đã được ${reviewer} xem xét`
      : "Đã được chuyên gia xem xét";
  }

  return "Báo cáo tự động tạo bởi AI ✨";
};

const buildReportPreview = ({ childId, child, report }) => {
  const reportId = reportRowId(report);

  return {
    id: `${childId}-${reportId}`,
    title: reportTitle(report),
    sub: reportSubtitle(report, child),
    status: reportStatus(report),
    to: `/guardian/reports/${encodeURIComponent(
      String(reportId),
    )}?child=${encodeURIComponent(childId)}`,
  };
};

const buildStats = (children = [], reportEntries = [], sessionEntries = []) => {
  const statsReportEntries = selectStatsReportEntries(reportEntries);
  const statsReportRows = statsReportEntries.map(({ report }) => report);
  const completedSessionEntries =
    completedCurrentWeekSessionEntries(sessionEntries);

  const childIds = new Set([
    ...children.map((child) => childRowId(child)).filter(Boolean),
    ...statsReportEntries.map(({ childId }) => childId).filter(Boolean),
    ...completedSessionEntries.map(({ childId }) => childId).filter(Boolean),
  ]);

  const completionStats = [...childIds].reduce(
    (acc, childId) => {
      const childSessions = completedSessionEntries
        .filter((entry) => entry.childId === childId)
        .map(({ session }) => session);

      if (childSessions.length) {
        const duration = aggregateReadingDurationSeconds(childSessions);
        const effort = aggregateEffortScorePoints(childSessions);
        return {
          sessions: acc.sessions + childSessions.length,
          readingSeconds:
            acc.readingSeconds + (duration.found ? duration.total : 0),
          foundReading: acc.foundReading || duration.found,
          points: acc.points + (effort.found ? effort.total : 0),
          foundPoints: acc.foundPoints || effort.found,
        };
      }

      const childReportRows = statsReportEntries
        .filter((entry) => entry.childId === childId)
        .map(({ report }) => report);
      const reportSessionCount = aggregateSessionCount(childReportRows);
      const reportDuration = aggregateReadingDurationSeconds(childReportRows);
      if (reportSessionCount.found || reportDuration.found) {
        return {
          sessions:
            acc.sessions + (reportSessionCount.found ? reportSessionCount.total : 0),
          readingSeconds:
            acc.readingSeconds + (reportDuration.found ? reportDuration.total : 0),
          foundReading: acc.foundReading || reportDuration.found,
          points: acc.points,
          foundPoints: acc.foundPoints,
        };
      }

      return {
        ...acc,
      };
    },
    {
      sessions: 0,
      readingSeconds: 0,
      foundReading: false,
      points: 0,
      foundPoints: false,
    },
  );

  const childPoints = aggregateFirstNumber(children, POINT_KEYS);
  const reportPoints = aggregateFirstNumber(statsReportRows, POINT_KEYS);
  const points = completionStats.foundPoints
    ? completionStats.points
    : childPoints.found && (childPoints.total > 0 || !reportPoints.found)
      ? childPoints.total
      : reportPoints.found
        ? reportPoints.total
        : 0;

  const readingSeconds = completionStats.foundReading
    ? completionStats.readingSeconds
    : 0;

  return [
    {
      key: "sessions",
      label: STAT_LABELS.sessions,
      value: formatInteger(completionStats.sessions),
    },
    {
      key: "points",
      label: STAT_LABELS.points,
      value: formatInteger(points),
    },
    {
      key: "reading",
      label: STAT_LABELS.reading,
      value: formatDuration(readingSeconds),
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

      const childDataGroups = await Promise.all(
        outletChildren.map(async (child) => {
          const childId = childRowId(child);
          if (!childId) return { reports: [], sessions: [] };

          const [reports, sessions] = await Promise.all([
            GuardianAPI.getReportChildById(childId)
              .then((res) =>
                normalizeReportsList(res).map((report) => ({
                  childId,
                  child,
                  report,
                })),
              )
              .catch(() => []),
            GuardianAPI.getChildSessions(childId)
              .then((res) =>
                normalizeSessionsList(res).map((session) => ({
                  childId,
                  child,
                  session,
                })),
              )
              .catch(() => []),
          ]);

          return { reports, sessions };
        }),
      );

      if (cancelled) return;

      const reportEntries = childDataGroups.flatMap((group) => group.reports);
      const sessionEntries = childDataGroups.flatMap((group) => group.sessions);
      const latestReports = reportEntries
        .filter(({ report }) => hasReportId(report))
        .sort((a, b) => reportTimestamp(b.report) - reportTimestamp(a.report))
        .slice(0, REPORT_PREVIEW_LIMIT)
        .map(buildReportPreview);

      setStats(buildStats(outletChildren, reportEntries, sessionEntries));
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
    { key: "reading", icon: FaClock, tone: "clock" },
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
