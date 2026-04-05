import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import ContenAPI from "../../../../service/Contents/ContenAPI";
import UsersAPI from "../../../../service/Users/UsersAPI";
import ReadingAssistControls from "./components/ReadingAssistControls";
import ReadingBookView from "./components/ReadingBookView";
import ReadingPagination from "./components/ReadingPagination";
import ReadingScorePanel from "./components/ReadingScorePanel";
import useHoverSpeech from "./hooks/useHoverSpeech";
import {
  getSelectedStory,
  normalizeStoryPayload,
  pickStoryFromCollection,
  STORY_FALLBACK,
} from "./readingUtils";
import "./ReadingPage.scss";

/*
 * UI TEST DATA (TEMP)
 * -----------------------------------------------------------------
 * Muc dich: Hien thi Reading Page doc lap de test UI/UX khi chua co
 * flow library -> game -> reading o local.
 *
 * Khi bat dau tich hop backend/flow that, dat USE_UI_MOCK_READING = false.
 */
const USE_UI_MOCK_READING = true;

/*
 * UI TEST DATA (TEMP) - Lorem Ipsum sample for page navigation testing.
 */
const UI_MOCK_STORY = {
  title: "Lorem Ipsum Story Demo",
  pages: [
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Quisque mollis, nibh sit amet tempor aliquet, arcu massa pellentesque orci, sed placerat nunc dui nec nisl. Suspendisse potenti. Curabitur ac mauris at erat tempus pulvinar.",
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer tristique luctus elit, sed tincidunt elit condimentum eget. Proin et est nulla. Vivamus at lectus eu sapien ultrices posuere nec non sem.",
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Donec id accumsan tortor. In vel urna in nulla porttitor rutrum. Nunc ullamcorper, turpis non aliquet lacinia, velit ipsum pellentesque lacus, ut viverra lacus tortor id mauris.",
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nam posuere fringilla enim, sed rutrum purus. Ut in pulvinar arcu. Sed sagittis, sapien quis malesuada pharetra, magna arcu malesuada lectus, eget interdum dolor risus eget ipsum.",
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Pellentesque id fermentum justo. Nulla facilisi. Aenean rhoncus vulputate justo, vel porttitor lorem consequat ut. Donec faucibus consectetur nibh ac tincidunt.",
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aliquam varius, lectus id fermentum dapibus, erat lacus posuere tortor, non posuere lectus lectus vel metus. Cras eu mi sapien. In feugiat iaculis mi, a efficitur nibh.",
  ],
};

const ReadingPage = () => {
  const location = useLocation();
  const selectedStory = useMemo(
    () => location.state?.story ?? getSelectedStory(),
    [location.state],
  );

  const [isLoading, setIsLoading] = useState(true);
  const [story, setStory] = useState(
    USE_UI_MOCK_READING ? UI_MOCK_STORY : STORY_FALLBACK,
  );
  const [currentPage, setCurrentPage] = useState(0);
  const [isBionicEnabled, setIsBionicEnabled] = useState(false);
  const [isHoverSpeechEnabled, setIsHoverSpeechEnabled] = useState(false);
  const [score, setScore] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState("");

  const {
    handleHoverStart: handleHoverSpeechStart,
    handleHoverEnd: handleHoverSpeechEnd,
    stop: stopHoverSpeech,
  } = useHoverSpeech({
    enabled: isHoverSpeechEnabled,
    language: "vi-VN",
  });

  useEffect(() => {
    let isMounted = true;

    if (USE_UI_MOCK_READING) {
      setStory(UI_MOCK_STORY);
      setScore(120);
      setIsLoading(false);

      return () => {
        isMounted = false;
        stopHoverSpeech();
      };
    }

    const fetchReadingData = async () => {
      setIsLoading(true);

      try {
        const [storiesResponse, profileResponse] = await Promise.allSettled([
          ContenAPI.getReadingStories(),
          UsersAPI.getProfile(),
        ]);

        if (!isMounted) return;

        if (storiesResponse.status === "fulfilled") {
          const payload = storiesResponse.value;
          const stories = Array.isArray(payload)
            ? payload
            : payload?.data ?? payload?.stories ?? [];
          const pickedStory = pickStoryFromCollection(stories, selectedStory);
          if (pickedStory) {
            setStory(normalizeStoryPayload(pickedStory, selectedStory));
          }
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
  const pageHoverUnits = story?.hoverSpeechUnits?.[currentPage] ?? null;

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
            onToggleHoverSpeech={() => setIsHoverSpeechEnabled((prev) => !prev)}
          />

          <ReadingBookView
            pageText={pageText}
            useBionic={isBionicEnabled}
            isHoverSpeechEnabled={isHoverSpeechEnabled}
            backendHoverUnits={pageHoverUnits}
            onWordHoverStart={handleHoverSpeechStart}
            onWordHoverEnd={handleHoverSpeechEnd}
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
