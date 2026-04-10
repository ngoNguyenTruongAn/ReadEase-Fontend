import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import instance from "../../../../app/instance";
import ContenAPI from "../../../../service/Contents/ContenAPI";
import UsersAPI from "../../../../service/Users/UsersAPI";
import ReadingAssistControls from "./components/ReadingAssistControls";
import ReadingBookView from "./components/ReadingBookView";
import ReadingPagination from "./components/ReadingPagination";
import ReadingScorePanel from "./components/ReadingScorePanel";
import useReadingDualInterventionSession from "./dualIntervention/hooks/useReadingDualInterventionSession";
import { extractHybridVietnameseWordEntries } from "./dualIntervention/tokenization/hybridVietnameseSegmentation";
import useHoverSpeech from "./hooks/useHoverSpeech";
import {
  extractStoryId,
  getSelectedStory,
  normalizeStoryPayload,
  pickStoryFromCollection,
  STORY_FALLBACK,
} from "./readingUtils";
import "./ReadingPage.scss";

const ReadingPage = () => {
  const location = useLocation();
  const selectedStory = useMemo(
    () => location.state?.story ?? getSelectedStory(),
    [location.state],
  );

  const [isLoading, setIsLoading] = useState(true);
  const [story, setStory] = useState(STORY_FALLBACK);
  const [currentPage, setCurrentPage] = useState(0);
  const [isBionicEnabled, setIsBionicEnabled] = useState(false);
  const [isHoverSpeechEnabled, setIsHoverSpeechEnabled] = useState(false);
  const [score, setScore] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState("");

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

    const toStoryCollection = (payload) => {
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload?.stories)) return payload.stories;
      if (Array.isArray(payload?.items)) return payload.items;
      if (Array.isArray(payload?.data)) return payload.data;
      return [];
    };

    const fetchStoryDetailById = async (contentId) => {
      if (contentId === null || contentId === undefined || contentId === "") {
        return null;
      }

      try {
        return await ContenAPI.getReadingStoryDetail(contentId);
      } catch {
        return null;
      }
    };

    const fetchReadingData = async () => {
      if (selectedStory) {
        setStory(normalizeStoryPayload(null, selectedStory));
      } else {
        setStory(STORY_FALLBACK);
      }

      setIsLoading(true);

      try {
        const [storiesResponse, profileResponse] = await Promise.allSettled([
          ContenAPI.getReadingStories(),
          UsersAPI.getProfile(),
        ]);

        if (!isMounted) return;

        let pickedStory = null;
        if (storiesResponse.status === "fulfilled") {
          const stories = toStoryCollection(storiesResponse.value);
          pickedStory = pickStoryFromCollection(stories, selectedStory);
        }

        const detailCandidateIds = [
          extractStoryId(pickedStory),
          extractStoryId(selectedStory),
        ].filter((id, index, ids) => id !== null && id !== undefined && ids.indexOf(id) === index);

        let detailStory = null;
        for (const detailId of detailCandidateIds) {
          detailStory = await fetchStoryDetailById(detailId);
          if (detailStory) break;
        }

        if (!isMounted) return;

        const normalizedStory = normalizeStoryPayload(detailStory || pickedStory, selectedStory);
        setStory(normalizedStory);

        if (!detailStory && !pickedStory && !selectedStory) {
          setStory(STORY_FALLBACK);
        }

        if (profileResponse.status === "fulfilled") {
          const profilePayload = profileResponse.value;
          const profile = profilePayload?.data ?? profilePayload ?? {};
          setAvatarUrl(
            profile?.avatarUrl ||
              profile?.avatar ||
              profile?.profileImage ||
              profile?.image ||
              "",
          );
          setScore(Number(profile?.starPoint ?? profile?.score ?? 0) || 0);
        }
      } catch (error) {
        console.error("Failed to load reading data:", error);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    fetchReadingData();

    return () => {
      isMounted = false;
      stopHoverSpeech();
    };
  }, [selectedStory, stopHoverSpeech]);

  useEffect(() => {
    setCurrentPage(0);
  }, [story.title]);

  const totalPages = story.pages.length;
  const pageText = story.pages[currentPage] ?? "";
  const pageSegmentedText = story?.segmentedPages?.[currentPage] ?? pageText;
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
    handleStoryPointerMove,
    handleTooltipRendered,
  } = useReadingDualInterventionSession({
    enabled: !isLoading && Boolean(pageText),
    contentId:
      story?.contentId ?? selectedStory?.id ?? selectedStory?._id ?? selectedStory?.storyId,
    apiBaseUrl: instance?.defaults?.baseURL,
    resolveTooltipByWordIndex,
  });

  return (
    <div className="reading-page-shell">
      <div className="reading-page">
        <header className="reading-header">
          <h1 className="reading-title">{story.title}</h1>
        </header>

        {isLoading && <p className="reading-loading">Đang tải nội dung truyện...</p>}

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
            onTooltipRendered={handleTooltipRendered}
          />

          <ReadingScorePanel avatarUrl={avatarUrl} score={score} />
        </div>

        <ReadingPagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPrevPage={() => setCurrentPage((prev) => Math.max(prev - 1, 0))}
          onNextPage={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages - 1))}
        />
      </div>
    </div>
  );
};

export default ReadingPage;
