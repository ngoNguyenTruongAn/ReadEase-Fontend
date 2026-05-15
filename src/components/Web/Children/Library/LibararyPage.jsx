import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import ClinicianAPI from "../../../../service/Clinician/ClinicianAPI";
import redMonster from "../../../../assets/image/reading book and sitting on the grass 1.png";
import "./LibararyPage.scss";

const normalizeList = (res) => {
  const data = res?.data ?? res;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.contents)) return data.contents;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const LibararyPage = () => {
  const { setSideStory, resetSideStory } = useOutletContext() ?? {};

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);
  const [selectedStoryId, setSelectedStoryId] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await ClinicianAPI.getContents();
        if (!alive) return;
        setItems(normalizeList(res));
      } catch (err) {
        if (!alive) return;
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          "Không lấy được danh sách nội dung.";
        setError(Array.isArray(msg) ? msg.join(", ") : msg);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const stories = useMemo(() => {
    return items.map((it) => ({
      id: it?.id,
      title: it?.title ?? "—",
      coverUrl: it?.cover_image_url || it?.coverUrl || "",
      description: it?.body || "",
    }));
  }, [items]);

  const storyDescription = (story) => story.description?.trim() ?? "";

  const sideStoryFromLibraryItem = (story) => ({
    kind: "story",
    src: story.coverUrl?.trim() ? story.coverUrl : redMonster,
    alt: story.title,
    title: story.title,
    description: storyDescription(story),
    storyId: story.id,
    coverUrl: story.coverUrl ?? "",
  });

  const handleSelectStory = (story) => {
    setSelectedStoryId((prev) => {
      const next = prev === story.id ? null : story.id;
      if (next === null) {
        resetSideStory?.();
      } else {
        setSideStory?.(sideStoryFromLibraryItem(story));
      }
      return next;
    });
  };

  return (
    <div className="library-page">
      {error ? <div className="library-error">{error}</div> : null}
      {loading ? <div className="library-loading">Đang tải...</div> : null}
      <div className="library-grid">
        {stories.map((story) => {
          const isSelected = selectedStoryId === story.id;
          return (
            <div
              key={story.id}
              role="button"
              tabIndex={0}
              className={`library-card${isSelected ? " library-card--selected" : ""}`}
              onClick={() => handleSelectStory(story)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelectStory(story);
                }
              }}
            >
              <div className="library-card-cover-wrap">
                <div
                  className="library-card-cover"
                  style={
                    story.coverUrl
                      ? { backgroundImage: `url(${story.coverUrl})` }
                      : {}
                  }
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LibararyPage;
