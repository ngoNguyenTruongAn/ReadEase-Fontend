import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import instance from "../../../../app/instance";
import ContenAPI from "../../../../service/Contents/ContenAPI";
import AuthAPI from "../../../../service/Auth/AuthAPI";
import ReadingAssistControls from "./components/ReadingAssistControls";
import ReadingBookView from "./components/ReadingBookView";
import ReadingPagination from "./components/ReadingPagination";
import ReadingScorePanel from "./components/ReadingScorePanel";
import useReadingDualInterventionSession from "./dualIntervention/hooks/useReadingDualInterventionSession";
import {
  countHybridVietnameseWords,
  extractHybridVietnameseWordEntries,
} from "./dualIntervention/tokenization/hybridVietnameseSegmentation";
import useHoverSpeech from "./hooks/useHoverSpeech";
import {
  buildUnavailableStoryPayload,
  extractStoryId,
  getSelectedStory,
  normalizeStoryPayload,
  pickStoryFromCollection,
  splitIntoPages,
  STORY_CONTENT_UNAVAILABLE_MESSAGE,
  STORY_FALLBACK,
} from "./readingUtils";
import "./ReadingPage.scss";
import { toast } from "react-toastify";

const CONTENT_AVAILABILITY_DEFAULT = {
  isUnavailable: false,
  message: "",
  errorCode: "",
  details: [],
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isLikelyBackendContentId = (value) => UUID_PATTERN.test(String(value ?? "").trim());

const toWordIndexOrNull = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Number.isInteger(parsed) ? parsed : Math.round(parsed);
  return rounded >= 0 ? rounded : null;
};

const getStoredAccessToken = () =>
  localStorage.getItem("access_token") ||
  localStorage.getItem("accessToken") ||
  localStorage.getItem("token") ||
  "";

const normalizeProfilePayload = (payload) => payload?.data ?? payload?.user ?? payload ?? {};

const toDebugTime = (timestamp) => {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "--";
  try {
    return new Date(timestamp).toLocaleTimeString("vi-VN", { hour12: false });
  } catch {
    return "--";
  }
};

const maskSocketUrlToken = (rawUrl) => {
  if (!rawUrl) return "";

  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.forEach((value, key) => {
      const normalizedKey = String(key).toLowerCase();
      if (normalizedKey.includes("token") || normalizedKey.includes("authorization")) {
        parsed.searchParams.set(key, "***");
      }
    });
    return parsed.toString();
  } catch {
    return rawUrl;
  }
};

const resolveAdaptivePageCharLimit = (viewportWidth) => {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return 300;
  if (viewportWidth <= 640) return 180;
  if (viewportWidth <= 980) return 240;
  return 300;
};

const createInitialReadingSessionMetrics = () => ({
  startedAt: null,
  endedAt: null,
  trackingSessionId: "",
  adaptationCounts: {
    FLUENT: 0,
    DISTRACTION: 0,
    REGRESSION: 0,
    OTHER: 0,
    TOTAL: 0,
  },
  interventionWordHits: new Map(),
});

const computeSessionSummary = ({
  metrics,
  wordOffsetByPage,
  totalWords,
}) => {
  const startedAt = Number.isFinite(metrics?.startedAt) ? metrics.startedAt : null;
  const endedAt = Number.isFinite(metrics?.endedAt) ? metrics.endedAt : null;
  const durationMs =
    startedAt !== null && endedAt !== null ? Math.max(0, endedAt - startedAt) : 0;

  const counts = metrics?.adaptationCounts || {};
  const distractionCount = Number(counts.DISTRACTION || 0) || 0;
  const regressionCount = Number(counts.REGRESSION || 0) || 0;
  const fluentCount = Number(counts.FLUENT || 0) || 0;

  const safeTotalWords = Number.isFinite(totalWords) && totalWords > 0 ? totalWords : 0;
  const durationMinutes = durationMs / 60000;
  const safeMinutes = durationMinutes > 0 ? durationMinutes : 0;

  const distractionPerMinute = safeMinutes > 0 ? distractionCount / safeMinutes : 0;
  const regressionPerMinute = safeMinutes > 0 ? regressionCount / safeMinutes : 0;
  const distractionPer100Words =
    safeTotalWords > 0 ? (distractionCount / safeTotalWords) * 100 : 0;
  const regressionPer100Words =
    safeTotalWords > 0 ? (regressionCount / safeTotalWords) * 100 : 0;

  let repeatedInterventionWords = 0;
  let repeatedInterventionExtraHits = 0;
  const hitMap = metrics?.interventionWordHits;
  if (hitMap && typeof hitMap.forEach === "function") {
    hitMap.forEach((count) => {
      const n = Number(count) || 0;
      if (n > 1) {
        repeatedInterventionWords += 1;
        repeatedInterventionExtraHits += n - 1;
      }
    });
  }

  return {
    startedAt,
    endedAt,
    durationMs,
    durationMinutes,
    trackingSessionId: metrics?.trackingSessionId || "",
    totalWords: safeTotalWords,
    counts: {
      fluent: fluentCount,
      distraction: distractionCount,
      regression: regressionCount,
      total: Number(counts.TOTAL || 0) || 0,
    },
    rates: {
      distractionPerMinute,
      regressionPerMinute,
      distractionPer100Words,
      regressionPer100Words,
    },
    interventions: {
      repeatedInterventionWords,
      repeatedInterventionExtraHits,
    },
    debug: {
      wordOffsetByPageCount: Array.isArray(wordOffsetByPage) ? wordOffsetByPage.length : 0,
    },
  };
};

const ReadingPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const selectedStory = useMemo(
    () => location.state?.story ?? getSelectedStory(),
    [location.state],
  );

  const [childId, setChildId] = useState("");
  const [isFinishingSession, setIsFinishingSession] = useState(false);

  const [authStatus, setAuthStatus] = useState("checking");
  const [authDebug, setAuthDebug] = useState({
    tokenPresent: false,
    profileEndpoint: "auth/profile",
    profileStatus: "idle",
    profileHttpStatus: null,
    checkedAt: null,
    lastError: "",
  });

  const [isLoading, setIsLoading] = useState(true);
  const [story, setStory] = useState(STORY_FALLBACK);
  const [currentPage, setCurrentPage] = useState(0);
  const [isBionicEnabled, setIsBionicEnabled] = useState(false);
  const [isHoverSpeechEnabled, setIsHoverSpeechEnabled] = useState(false);
  const [score, setScore] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isDebugPanelExpanded, setIsDebugPanelExpanded] = useState(false);
  const [contentAvailability, setContentAvailability] = useState(CONTENT_AVAILABILITY_DEFAULT);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1200,
  );

  const visitedPagesRef = useRef(new Set([0]));
  const [visitedPagesCount, setVisitedPagesCount] = useState(1);
  const [completedPageIndexes, setCompletedPageIndexes] = useState(() => new Set());
  const [hasReachedStoryEndCursor, setHasReachedStoryEndCursor] = useState(false);
  const currentPageRef = useRef(0);
  const sessionMetricsRef = useRef(createInitialReadingSessionMetrics());
  const finishInFlightRef = useRef(false);
  const canExitSessionRef = useRef(false);
  const storyEndCursorReachedRef = useRef(false);

  /**
   * Tracks sequential reading progress per page.
   *
   * maxWordIndexSeen  – highest word index the cursor has visited on this page
   *                     (never decreases; regression doesn’t lose progress).
   * expectedNextIndex – the minimum word index the cursor must reach next to
   *                     count as a continuous forward sweep. Resets on page change.
   *
   * A page is “completed” only when the cursor has swept words 0 → lastWord
   * without skipping any word — every word must be hovered in order.
   */
  const pageReadProgressRef = useRef({ maxWordIndexSeen: -1, expectedNextIndex: 0 });



  // Zero tolerance: the cursor must pass over every word in sequence.

  const {
    handleHoverStart: handleHoverSpeechStart,
    handleHoverEnd: handleHoverSpeechEnd,
    primeFromGesture: primeHoverSpeech,
    stop: stopHoverSpeech,
  } = useHoverSpeech({
    enabled: isHoverSpeechEnabled,
    language: "vi-VN",
  });

  useEffect(() => {
    let isMounted = true;

    const bootstrapAuth = async () => {
      const token = getStoredAccessToken();

      if (!token) {
        if (!isMounted) return;

        setAuthStatus("unauthenticated");
        setAuthDebug((previous) => ({
          ...previous,
          tokenPresent: false,
          profileStatus: "skipped:no-token",
          profileHttpStatus: null,
          checkedAt: Date.now(),
          lastError: "missing_access_token",
        }));
        setIsLoading(false);
        navigate("/login", { replace: true });
        return;
      }

      setAuthStatus("checking");
      setAuthDebug((previous) => ({
        ...previous,
        tokenPresent: true,
        profileStatus: "loading",
        profileHttpStatus: null,
        checkedAt: Date.now(),
        lastError: "",
      }));

      try {
        const profilePayload = await AuthAPI.getProfileAPI();
        if (!isMounted) return;

        const profile = normalizeProfilePayload(profilePayload);
        const resolvedChildId = String(
          profile?.id || profile?._id || profile?.user_id || "",
        ).trim();
        setChildId(resolvedChildId);
        setAvatarUrl(
          profile?.avatarUrl ||
            profile?.avatar ||
            profile?.profileImage ||
            profile?.image ||
            "",
        );
        setScore(Number(profile?.starPoint ?? profile?.score ?? 0) || 0);

        setAuthStatus("authenticated");
        setAuthDebug((previous) => ({
          ...previous,
          profileStatus: "ok",
          profileHttpStatus: 200,
          checkedAt: Date.now(),
          lastError: "",
        }));
      } catch (error) {
        if (!isMounted) return;

        const status = error?.response?.status ?? null;
        const message =
          error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          "auth_profile_failed";

        setAuthStatus("unauthenticated");
        setAuthDebug((previous) => ({
          ...previous,
          profileStatus: "error",
          profileHttpStatus: status,
          checkedAt: Date.now(),
          lastError: String(message),
        }));
        setIsLoading(false);
        navigate("/login", { replace: true });
      }
    };

    bootstrapAuth();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  useEffect(() => {
    if (authStatus !== "authenticated") return undefined;

    let isMounted = true;

    const toStoryCollection = (payload) => {
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload?.stories)) return payload.stories;
      if (Array.isArray(payload?.items)) return payload.items;
      if (Array.isArray(payload?.data)) return payload.data;
      return [];
    };

    const fetchStoryDetailById = async (contentId) => {
      if (contentId === null || contentId === undefined || contentId === "") {
        return { detail: null, error: null };
      }

      if (!isLikelyBackendContentId(contentId)) {
        return { detail: null, error: null };
      }

      try {
        const detail = await ContenAPI.getReadingStoryDetail(contentId);
        return { detail, error: null };
      } catch (error) {
        return { detail: null, error };
      }
    };

    const fetchReadingData = async () => {
      if (selectedStory) {
        setStory(normalizeStoryPayload(null, selectedStory));
      } else {
        setStory(STORY_FALLBACK);
      }

      setContentAvailability({ ...CONTENT_AVAILABILITY_DEFAULT });
      setIsLoading(true);

      try {
        const storiesResponse = await Promise.allSettled([ContenAPI.getReadingStories()]);

        if (!isMounted) return;

        let pickedStory = null;
        if (storiesResponse[0]?.status === "fulfilled") {
          const stories = toStoryCollection(storiesResponse[0].value);
          pickedStory = pickStoryFromCollection(stories, selectedStory);
        }

        const detailCandidateIds = [
          extractStoryId(pickedStory),
          extractStoryId(selectedStory),
        ].filter((id, index, ids) => id !== null && id !== undefined && ids.indexOf(id) === index);

        let detailStory = null;
        let detailError = null;
        for (const detailId of detailCandidateIds) {
          const detailResult = await fetchStoryDetailById(detailId);
          if (detailResult?.detail) {
            detailStory = detailResult.detail;
            detailError = null;
            break;
          }

          if (detailResult?.error) {
            detailError = detailResult.error;
          }
        }

        let resolvedRemoteContent = null;
        if (detailStory) {
          resolvedRemoteContent = await ContenAPI.resolveReadingStoryContent(detailStory);
        }

        if (!isMounted) return;

        if (detailStory && resolvedRemoteContent?.isAvailable) {
          const storyWithDownloadedContent = {
            ...detailStory,
            body: resolvedRemoteContent.bodyText,
            body_segmented: resolvedRemoteContent.segmentedText,
          };

          setStory(normalizeStoryPayload(storyWithDownloadedContent, selectedStory));
          setContentAvailability({ ...CONTENT_AVAILABILITY_DEFAULT });
          return;
        }

        if (detailStory && resolvedRemoteContent && !resolvedRemoteContent.isAvailable) {
          setStory(buildUnavailableStoryPayload(detailStory, selectedStory));
          setContentAvailability({
            isUnavailable: true,
            message: STORY_CONTENT_UNAVAILABLE_MESSAGE,
            errorCode: resolvedRemoteContent.errorCode || "CONTENT_UNAVAILABLE",
            details: Array.isArray(resolvedRemoteContent.errorDetails)
              ? resolvedRemoteContent.errorDetails
              : [],
          });
          return;
        }

        if (!detailStory && detailCandidateIds.some((id) => isLikelyBackendContentId(id))) {
          setStory(buildUnavailableStoryPayload(pickedStory || selectedStory, selectedStory));
          setContentAvailability({
            isUnavailable: true,
            message: STORY_CONTENT_UNAVAILABLE_MESSAGE,
            errorCode: detailError?.code || "CONTENT_DETAIL_UNAVAILABLE",
            details:
              (Array.isArray(detailError?.details) && detailError.details.length > 0
                ? detailError.details
                : null) || ["Unable to load content metadata from /api/v1/content/:id"],
          });
          return;
        }

        const normalizedStory = normalizeStoryPayload(pickedStory, selectedStory);
        setStory(normalizedStory);
        setContentAvailability({ ...CONTENT_AVAILABILITY_DEFAULT });

        if (!detailStory && !pickedStory && !selectedStory) {
          setStory(STORY_FALLBACK);
        }
      } catch (error) {
        console.error("Failed to load reading data:", error);

        if (isMounted) {
          setStory(buildUnavailableStoryPayload(selectedStory, selectedStory));
          setContentAvailability({
            isUnavailable: true,
            message: STORY_CONTENT_UNAVAILABLE_MESSAGE,
            errorCode: String(error?.code || "CONTENT_LOAD_FAILED"),
            details: Array.isArray(error?.details) ? error.details : [],
          });
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchReadingData();

    return () => {
      isMounted = false;
      stopHoverSpeech();
    };
  }, [authStatus, selectedStory, stopHoverSpeech]);

  useEffect(() => {
    setCurrentPage(0);
  }, [story.title]);

  useEffect(() => {
    // Reset session tracking when the story changes.
    visitedPagesRef.current = new Set([0]);
    setVisitedPagesCount(1);
    setCompletedPageIndexes(new Set());
    storyEndCursorReachedRef.current = false;
    setHasReachedStoryEndCursor(false);
    sessionMetricsRef.current = createInitialReadingSessionMetrics();
    finishInFlightRef.current = false;
  }, [story.title]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const adaptivePageCharLimit = useMemo(
    () => resolveAdaptivePageCharLimit(viewportWidth),
    [viewportWidth],
  );

  const renderedStoryPages = useMemo(() => {
    const fallbackRawBody = Array.isArray(story?.pages)
      ? story.pages.filter(Boolean).join("\n\n")
      : "";
    const fallbackRawSegmentedBody = Array.isArray(story?.segmentedPages)
      ? story.segmentedPages.filter(Boolean).join("\n\n")
      : fallbackRawBody;

    const rawBodyText = String(story?.rawBodyText || fallbackRawBody || "");
    const rawSegmentedBodyText = String(
      story?.rawSegmentedBodyText || fallbackRawSegmentedBody || rawBodyText,
    );

    return {
      pages: splitIntoPages(rawBodyText, adaptivePageCharLimit),
      segmentedPages: splitIntoPages(rawSegmentedBodyText, adaptivePageCharLimit),
    };
  }, [adaptivePageCharLimit, story]);

  const isContentUnavailable = contentAvailability.isUnavailable;
  const totalPages = Math.max(renderedStoryPages.pages.length, 1);
  const safeCurrentPage = Math.min(currentPage, totalPages - 1);
  const pageText = renderedStoryPages.pages[safeCurrentPage] ?? "";
  const pageSegmentedText = renderedStoryPages.segmentedPages?.[safeCurrentPage] ?? pageText;
  const pageWordEntries = useMemo(
    () => extractHybridVietnameseWordEntries(pageSegmentedText),
    [pageSegmentedText],
  );

  const resolveTooltipByWordIndex = useCallback(
    (wordIndex) => {
      if (!Number.isInteger(wordIndex) || wordIndex < 0) return null;
      const wordEntry = pageWordEntries[wordIndex];
      if (!wordEntry) return null;

      return {
        original: wordEntry.value,
        simplified: wordEntry.value,
        word: wordEntry.value,
      };
    },
    [pageWordEntries],
  );

  const pageWordCounts = useMemo(() => {
    const pages = Array.isArray(renderedStoryPages?.segmentedPages)
      ? renderedStoryPages.segmentedPages
      : [];
    return pages.map((page) => countHybridVietnameseWords(page));
  }, [renderedStoryPages?.segmentedPages]);

  const wordOffsetByPage = useMemo(() => {
    const offsets = [];
    let running = 0;
    pageWordCounts.forEach((count) => {
      offsets.push(running);
      running += Number(count) || 0;
    });
    return offsets;
  }, [pageWordCounts]);

  const totalWords = useMemo(
    () => pageWordCounts.reduce((acc, value) => acc + (Number(value) || 0), 0),
    [pageWordCounts],
  );
  const pageLastWordIndexByPage = useMemo(
    () =>
      pageWordCounts.map((count) => {
        const normalizedCount = Number(count) || 0;
        return normalizedCount > 0 ? normalizedCount - 1 : -1;
      }),
    [pageWordCounts],
  );
  const currentPageLastWordIndex = pageLastWordIndexByPage[safeCurrentPage] ?? -1;
  const lastPageIndex = Math.max(totalPages - 1, 0);
  const lastPageLastWordIndex = pageLastWordIndexByPage[lastPageIndex] ?? -1;
  const requiresCursorCompletion = !isContentUnavailable && lastPageLastWordIndex >= 0;

  const {
    visualFlags,
    wordIntervention,
    activeTooltip,
    trackingDebug,
    handleStoryPointerMove,
    handleStoryPointerLeave,
    handleTooltipRendered,
    endSession,
  } = useReadingDualInterventionSession({
    enabled:
      authStatus === "authenticated" && !isLoading && !isContentUnavailable && Boolean(pageText),
    contentId:
      story?.contentId ?? selectedStory?.id ?? selectedStory?._id ?? selectedStory?.storyId,
    apiBaseUrl: instance?.defaults?.baseURL,
    resolveTooltipByWordIndex,
    onAdaptationState: useCallback(
      (event) => {
        if (!event) return;

        const metrics = sessionMetricsRef.current;
        if (metrics.startedAt === null) {
          metrics.startedAt = Date.now();
        }

        if (event?.sessionId && !metrics.trackingSessionId) {
          metrics.trackingSessionId = String(event.sessionId || "");
        }

        const state = String(event?.state || "").toUpperCase();
        metrics.adaptationCounts.TOTAL += 1;
        if (state === "FLUENT") metrics.adaptationCounts.FLUENT += 1;
        else if (state === "DISTRACTION") metrics.adaptationCounts.DISTRACTION += 1;
        else if (state === "REGRESSION") metrics.adaptationCounts.REGRESSION += 1;
        else metrics.adaptationCounts.OTHER += 1;

        // Track repeated word interventions for non-FLUENT states.
        if (state !== "FLUENT") {
          const wordIndex = event?.wordIndex;
          const pageIndex = currentPageRef.current;
          const offset = Number.isInteger(wordOffsetByPage?.[pageIndex])
            ? wordOffsetByPage[pageIndex]
            : null;

          if (Number.isInteger(wordIndex) && wordIndex >= 0) {
            const key = offset !== null ? String(offset + wordIndex) : `${pageIndex}:${wordIndex}`;
            const previous = metrics.interventionWordHits.get(key) || 0;
            metrics.interventionWordHits.set(key, previous + 1);
          }
        }
      },
      [wordOffsetByPage],
    ),
  });

  const isSessionActive =
    authStatus === "authenticated" && !isLoading && !isContentUnavailable && Boolean(pageText);

  useEffect(() => {
    if (!isSessionActive) return;
    const metrics = sessionMetricsRef.current;
    if (metrics.startedAt === null) {
      metrics.startedAt = Date.now();
    }
  }, [isSessionActive]);

  useEffect(() => {
    const sessionId = String(trackingDebug?.sessionId || "").trim();
    if (!sessionId) return;
    const metrics = sessionMetricsRef.current;
    if (!metrics.trackingSessionId) {
      metrics.trackingSessionId = sessionId;
    }
  }, [trackingDebug?.sessionId]);

  useEffect(() => {
    currentPageRef.current = safeCurrentPage;
    // Reset sequential-read progress whenever the reader moves to a different page.
    pageReadProgressRef.current = { maxWordIndexSeen: -1, expectedNextIndex: 0 };
  }, [safeCurrentPage]);

  useEffect(() => {
    // Track page coverage for “must finish story before exit”.
    const set = visitedPagesRef.current;
    const beforeSize = set.size;
    set.add(safeCurrentPage);
    if (set.size !== beforeSize) {
      setVisitedPagesCount(set.size);
    }
  }, [safeCurrentPage]);

  useEffect(() => {
    if (isContentUnavailable) return;
    if (storyEndCursorReachedRef.current) return;

    const isOnLastPage = safeCurrentPage >= totalPages - 1;
    if (!isOnLastPage) return;
    if (lastPageLastWordIndex >= 0) return;

    storyEndCursorReachedRef.current = true;
    setHasReachedStoryEndCursor(true);
  }, [isContentUnavailable, lastPageLastWordIndex, safeCurrentPage, totalPages]);

  const handleReadingPointerMove = useCallback(
    (event) => {
      const wordElement = event?.target?.closest?.("[data-word-index]");
      const resolvedWordIndex = toWordIndexOrNull(
        wordElement?.getAttribute?.("data-word-index"),
      );

      if (resolvedWordIndex !== null && currentPageLastWordIndex >= 0) {
        const progress = pageReadProgressRef.current;

        // Strict sequential rule: only the exact next expected word advances
        // the frontier. Hovering the same word twice or moving backward is
        // ignored (no credit lost, no credit gained).
        if (resolvedWordIndex === progress.expectedNextIndex) {
          progress.maxWordIndexSeen = resolvedWordIndex;
          progress.expectedNextIndex = resolvedWordIndex + 1;
        }
        // Any forward jump larger than 1 word leaves expectedNextIndex in place.
        // The child must come back and hover each skipped word before progressing.

        // Page is complete once every word up to the last has been hovered.
        const hasSweptToEnd = progress.maxWordIndexSeen >= currentPageLastWordIndex;
        if (hasSweptToEnd) {
          setCompletedPageIndexes((prev) => {
            if (prev.has(safeCurrentPage)) return prev;
            const next = new Set(prev);
            next.add(safeCurrentPage);
            return next;
          });
        }

        // Track story-end cursor for the session exit gate (last page only).
        if (!storyEndCursorReachedRef.current && safeCurrentPage >= totalPages - 1) {
          if (hasSweptToEnd && progress.maxWordIndexSeen >= lastPageLastWordIndex) {
            storyEndCursorReachedRef.current = true;
            setHasReachedStoryEndCursor(true);
          }
        }
      }

      handleStoryPointerMove?.(event);
    },
    [
      currentPageLastWordIndex,
      handleStoryPointerMove,
      lastPageLastWordIndex,
      safeCurrentPage,
      totalPages,
    ],
  );

  // A page is "read" once the cursor has hovered every word in order,
  // without skipping any. Backward movement is ignored (no progress lost).
  const isCurrentPageCompleted = completedPageIndexes.has(safeCurrentPage);
  const canGoNextPage =
    isContentUnavailable ||
    safeCurrentPage >= totalPages - 1 ||
    isCurrentPageCompleted ||
    currentPageLastWordIndex < 0; // page has no trackable words — allow freely
  const nextPageBlockedMessage = canGoNextPage
    ? ""
    : "Hãy đọc hết trang trước khi sang trang tiếp theo.";

  const canExitSession = useMemo(() => {
    if (isLoading) return false;
    if (isContentUnavailable) return true;
    const visitedAllPages = visitedPagesCount >= totalPages;
    const isOnLastPage = safeCurrentPage >= totalPages - 1;
    const hasReachedLastWord = !requiresCursorCompletion || hasReachedStoryEndCursor;
    return visitedAllPages && isOnLastPage && hasReachedLastWord;
  }, [
    hasReachedStoryEndCursor,
    isContentUnavailable,
    isLoading,
    requiresCursorCompletion,
    safeCurrentPage,
    totalPages,
    visitedPagesCount,
  ]);

  const exitBlockedMessage = useMemo(() => {
    const visitedAllPages = visitedPagesCount >= totalPages;
    const isOnLastPage = safeCurrentPage >= totalPages - 1;

    if (!visitedAllPages || !isOnLastPage) {
      return "Bạn cần đọc hết truyện trước khi hoàn thành phiên đọc.";
    }

    if (requiresCursorCompletion && !hasReachedStoryEndCursor) {
      return "Hãy di chuyển con trỏ tới chữ cuối cùng ở trang cuối để xác nhận đã đọc xong.";
    }

    return "Bạn cần đọc hết truyện trước khi hoàn thành phiên đọc.";
  }, [
    hasReachedStoryEndCursor,
    requiresCursorCompletion,
    safeCurrentPage,
    totalPages,
    visitedPagesCount,
  ]);

  useEffect(() => {
    canExitSessionRef.current = canExitSession;
  }, [canExitSession]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleBeforeUnload = (event) => {
      if (canExitSessionRef.current) return;

      event.preventDefault();
      // Most browsers ignore custom text, but returnValue is still required.
      event.returnValue = "";
      return "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const pushGuardState = () => {
      try {
        window.history.pushState({ readeaseReadingGuard: true }, "", window.location.href);
      } catch {
        // ignore
      }
    };

    // Add an extra entry so the Back button doesn't leave immediately.
    pushGuardState();

    const handlePopState = () => {
      if (canExitSessionRef.current) return;
      pushGuardState();
      toast.info(exitBlockedMessage);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [exitBlockedMessage]);

  const handleExitSession = useCallback(async () => {
    if (isContentUnavailable) {
      try {
        endSession?.();
      } catch {
        // ignore
      }

      navigate("/children/library", { replace: true });
      return;
    }

    if (!canExitSession) {
      toast.info(exitBlockedMessage);
      return;
    }

    if (finishInFlightRef.current) return;
    finishInFlightRef.current = true;
    setIsFinishingSession(true);

    const metrics = sessionMetricsRef.current;
    metrics.endedAt = Date.now();

    const summary = computeSessionSummary({
      metrics,
      wordOffsetByPage,
      totalWords,
    });

    try {
      if (typeof window !== "undefined" && window.sessionStorage) {
        window.sessionStorage.setItem(
          "readease:reading:lastSession",
          JSON.stringify({
            kind: "reading-session",
            childId,
            contentId:
              story?.contentId ?? selectedStory?.id ?? selectedStory?._id ?? selectedStory?.storyId,
            summary,
            savedAt: Date.now(),
          }),
        );
      }
    } catch {
      // ignore storage errors
    }

    toast.success("Hoàn thành phiên đọc!");

    try {
      endSession?.();
    } catch {
      // ignore
    }

    setIsFinishingSession(false);
    navigate("/children/library", { replace: true });
  }, [
    canExitSession,
    childId,
    endSession,
    isContentUnavailable,
    navigate,
    selectedStory,
    story?.contentId,
    totalWords,
    wordOffsetByPage,
    exitBlockedMessage,
  ]);

  const shouldShowDebugPanel = useMemo(() => {
    const queryValue = new URLSearchParams(location.search).get("debugTracking");
    const storageValue =
      typeof window !== "undefined" ? localStorage.getItem("readease:debugTracking") : "";
    return import.meta.env.DEV || queryValue === "1" || storageValue === "1";
  }, [location.search]);

  const maskedWsUrl = useMemo(() => maskSocketUrlToken(trackingDebug?.wsUrl), [trackingDebug?.wsUrl]);

  const uiDebug = useMemo(
    () => ({
      isVisualActive: Boolean(visualFlags?.isVisualActive),
      visualMode: visualFlags?.mode || "NONE",
      adaptationState: visualFlags?.state || "FLUENT",
      tooltipVisible: Boolean(activeTooltip?.visible),
      tooltipAnchor: activeTooltip?.anchorType || "none",
      tooltipWordIndex: Number.isInteger(activeTooltip?.wordIndex)
        ? activeTooltip.wordIndex
        : null,
      distractionWordIndex: wordIntervention?.distractionWordIndex ?? null,
      regressionWordIndex: wordIntervention?.regressionWordIndex ?? null,
      semanticWordIndex: wordIntervention?.semanticWordIndex ?? null,
    }),
    [activeTooltip, visualFlags, wordIntervention],
  );

  return (
    <div className="reading-page-shell">
      <div className="reading-page">
        <header className="reading-header">
          <div className="reading-header-row">
            <h1 className="reading-title">{story.title}</h1>

            <button
              type="button"
              className="reading-exit-btn"
              onClick={handleExitSession}
              disabled={!canExitSession || isFinishingSession}
              title={
                !canExitSession && !isFinishingSession ? exitBlockedMessage : "Hoàn thành phiên đọc"
              }
            >
              {isFinishingSession ? "Đang lưu..." : "Hoàn thành"}
            </button>
          </div>
        </header>

        {isLoading && <p className="reading-loading">Đang tải nội dung truyện...</p>}
        {!isLoading && authStatus !== "authenticated" && (
          <p className="reading-loading">Đang xác thực phiên đăng nhập...</p>
        )}

        {isContentUnavailable ? (
          <section className="reading-unavailable" role="status" aria-live="polite">
            <p className="reading-unavailable-title">Nội dung truyện tạm thời không khả dụng.</p>
            <p className="reading-unavailable-message">
              {contentAvailability.message || STORY_CONTENT_UNAVAILABLE_MESSAGE}
            </p>
            {shouldShowDebugPanel && contentAvailability.errorCode && (
              <p className="reading-unavailable-debug">
                Error: {contentAvailability.errorCode}
              </p>
            )}
          </section>
        ) : (
          <>
            <div className="reading-body">
              <ReadingAssistControls
                isBionicEnabled={isBionicEnabled}
                isHoverSpeechEnabled={isHoverSpeechEnabled}
                onToggleBionic={() => setIsBionicEnabled((prev) => !prev)}
                onToggleHoverSpeech={() => {
                  primeHoverSpeech();
                  setIsHoverSpeechEnabled((prev) => !prev);
                }}
              />

              <ReadingBookView
                pageText={pageText}
                pageSegmentedText={pageSegmentedText}
                useBionic={isBionicEnabled}
                isHoverSpeechEnabled={isHoverSpeechEnabled}
                visualFlags={visualFlags}
                wordIntervention={wordIntervention}
                activeTooltip={activeTooltip}
                onWordHoverStart={handleHoverSpeechStart}
                onWordHoverEnd={handleHoverSpeechEnd}
                onStoryPointerMove={handleReadingPointerMove}
                onStoryPointerLeave={handleStoryPointerLeave}
                onTooltipRendered={handleTooltipRendered}
              />

              <ReadingScorePanel avatarUrl={avatarUrl} score={score} />
            </div>

            <ReadingPagination
              currentPage={safeCurrentPage}
              totalPages={totalPages}
              onPrevPage={() => setCurrentPage((prev) => Math.max(prev - 1, 0))}
              onNextPage={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages - 1))}
              canGoNextOverride={canGoNextPage}
              nextDisabledTitle={nextPageBlockedMessage}
            />
          </>
        )}

        {shouldShowDebugPanel && (
          <aside className={`reading-tracking-debug ${isDebugPanelExpanded ? "is-expanded" : ""}`}>
            <button
              type="button"
              className="reading-tracking-debug__toggle"
              onClick={() => setIsDebugPanelExpanded((previous) => !previous)}
            >
              Tracking Debug {isDebugPanelExpanded ? "-" : "+"}
            </button>

            {isDebugPanelExpanded && (
              <div className="reading-tracking-debug__panel">
                <p>authStatus: {authStatus}</p>
                <p>auth/profile: {authDebug.profileStatus}</p>
                <p>auth/profile http: {authDebug.profileHttpStatus ?? "--"}</p>
                <p>tokenPresent: {authDebug.tokenPresent ? "yes" : "no"}</p>
                <p>authCheckedAt: {toDebugTime(authDebug.checkedAt)}</p>
                <p>authError: {authDebug.lastError || "--"}</p>

                <p>wsStatus: {trackingDebug?.wsStatus || "idle"}</p>
                <p>wsUrl: {maskedWsUrl || "--"}</p>
                <p>tokenSourceKey: {trackingDebug?.tokenSourceKey || "--"}</p>
                <p>tokenClaimsReady: {trackingDebug?.tokenClaimsReady ? "true" : "false"}</p>
                <p>wsCloseCode: {trackingDebug?.wsCloseCode ?? "--"}</p>
                <p>wsCloseReason: {trackingDebug?.wsCloseReason || "--"}</p>
                <p>wsReconnectAttempts: {trackingDebug?.reconnectAttempts ?? 0}</p>
                <p>handshakeVariant: {trackingDebug?.handshakeVariant || "--"}</p>
                <p>sessionStartStrategy: {trackingDebug?.sessionStartStrategy || "--"}</p>
                <p>sessionId: {trackingDebug?.sessionId || "--"}</p>
                <p>trackingContentId: {trackingDebug?.trackingContentId ?? "--"}</p>

                <p>out.session:start: {trackingDebug?.outbound?.sessionStart ?? 0}</p>
                <p>out.mouse:batch: {trackingDebug?.outbound?.mouseBatch ?? 0}</p>
                <p>out.tooltip:show: {trackingDebug?.outbound?.tooltipShow ?? 0}</p>
                <p>out.session:end: {trackingDebug?.outbound?.sessionEnd ?? 0}</p>
                <p>pointsBuffered: {trackingDebug?.bufferedPoints ?? 0}</p>
                <p>lastBatchSize: {trackingDebug?.lastBatchSize ?? 0}</p>
                <p>totalPointsSent: {trackingDebug?.totalPointsSent ?? 0}</p>
                <p>pointsWithWordIndex: {trackingDebug?.pointsWithWordIndex ?? 0}</p>
                <p>pointsWithoutWordIndex: {trackingDebug?.pointsWithoutWordIndex ?? 0}</p>
                <p>syntheticPoints: {trackingDebug?.syntheticPoints ?? 0}</p>
                <p>lastSocketUptimeMs: {trackingDebug?.lastSocketUptimeMs ?? 0}</p>

                <p>in.adaptation: {trackingDebug?.inbound?.adaptation ?? 0}</p>
                <p>in.tooltip: {trackingDebug?.inbound?.tooltip ?? 0}</p>
                <p>in.reset: {trackingDebug?.inbound?.reset ?? 0}</p>
                <p>in.ignored: {trackingDebug?.inbound?.ignored ?? 0}</p>
                <p>in.parseError: {trackingDebug?.inbound?.parseError ?? 0}</p>
                <p>lastInbound: {trackingDebug?.lastInboundEvent || "--"}</p>
                <p>lastOutbound: {trackingDebug?.lastOutboundEvent || "--"}</p>
                <p>fallback.localActive: {trackingDebug?.localFallbackActive ? "true" : "false"}</p>
                <p>fallback.localCount: {trackingDebug?.localFallbackInterventions ?? 0}</p>
                <p>fallback.localReason: {trackingDebug?.localFallbackReason || "--"}</p>
                <p>fallback.localWordIndex: {trackingDebug?.localFallbackWordIndex ?? "--"}</p>
                <p>debugUpdatedAt: {toDebugTime(trackingDebug?.lastUpdateAt)}</p>

                <p>ui.visualActive: {uiDebug.isVisualActive ? "true" : "false"}</p>
                <p>ui.visualMode: {uiDebug.visualMode}</p>
                <p>ui.adaptationState: {uiDebug.adaptationState}</p>
                <p>ui.tooltipVisible: {uiDebug.tooltipVisible ? "true" : "false"}</p>
                <p>ui.tooltipAnchor: {uiDebug.tooltipAnchor}</p>
                <p>ui.tooltipWordIndex: {uiDebug.tooltipWordIndex ?? "--"}</p>
                <p>ui.distractionWordIndex: {uiDebug.distractionWordIndex ?? "--"}</p>
                <p>ui.regressionWordIndex: {uiDebug.regressionWordIndex ?? "--"}</p>
                <p>ui.semanticWordIndex: {uiDebug.semanticWordIndex ?? "--"}</p>
              </div>
            )}
          </aside>
        )}
      </div>
    </div>
  );
};

export default ReadingPage;