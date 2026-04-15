import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import instance from "../../../../app/instance";
import ContenAPI from "../../../../service/Contents/ContenAPI";
import AuthAPI from "../../../../service/Auth/AuthAPI";
import ReadingAssistControls from "./components/ReadingAssistControls";
import ReadingBookView from "./components/ReadingBookView";
import ReadingPagination from "./components/ReadingPagination";
import ReadingScorePanel from "./components/ReadingScorePanel";
import useReadingDualInterventionSession from "./dualIntervention/hooks/useReadingDualInterventionSession";
import { extractHybridVietnameseWordEntries } from "./dualIntervention/tokenization/hybridVietnameseSegmentation";
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

const CONTENT_AVAILABILITY_DEFAULT = {
  isUnavailable: false,
  message: "",
  errorCode: "",
  details: [],
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isLikelyBackendContentId = (value) => UUID_PATTERN.test(String(value ?? "").trim());

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

const ReadingPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const selectedStory = useMemo(
    () => location.state?.story ?? getSelectedStory(),
    [location.state],
  );

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

  const {
    visualFlags,
    wordIntervention,
    activeTooltip,
    trackingDebug,
    handleStoryPointerMove,
    handleStoryPointerLeave,
    handleTooltipRendered,
  } = useReadingDualInterventionSession({
    enabled:
      authStatus === "authenticated" && !isLoading && !isContentUnavailable && Boolean(pageText),
    contentId:
      story?.contentId ?? selectedStory?.id ?? selectedStory?._id ?? selectedStory?.storyId,
    apiBaseUrl: instance?.defaults?.baseURL,
    resolveTooltipByWordIndex,
  });

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
          <h1 className="reading-title">{story.title}</h1>
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
                onStoryPointerMove={handleStoryPointerMove}
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
