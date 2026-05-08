import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { saveSelectedStory } from "../Reading/readingUtils";
import ClinicianAPI from "../../../../service/Clinician/ClinicianAPI";
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
  const navigate = useNavigate();
  const { setSideStory } = useOutletContext() ?? {};

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]);

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

  const handleClickStory = (story) => {
    const selectedStory = {
      id: story.id,
      title: story.title,
      coverUrl: story.coverUrl,
      description:
        story.description || "Ngày xưa, ở một làng nọ, có một anh nông phu nghèo.",
    };

    setSideStory?.({
      kind: "story",
      src: story.coverUrl,
      alt: story.title,
      title: story.title,
      description:
        "“Ngày xưa, ở một làng nọ, có một anh nông phu nghèo...Ngày xưa, ở một làng nọ, có một anh nông phu nghèo...Ngày xưa, ở một làng nọ, có một anh nông phu nghèo...Ngày xưa, ở một làng nọ, có một anh nông phu nghèo...”",
    });

    saveSelectedStory(selectedStory);
    navigate("/children/calibration/start", {
      state: { story: selectedStory },
    });
  };

  return (
    <div className="library-page">
      {error ? <div className="library-error">{error}</div> : null}
      {loading ? <div className="library-loading">Đang tải...</div> : null}
      <div className="library-grid">
        {stories.map((story) => (
          <button
            key={story.id}
            type="button"
            className="library-card"
            onClick={() => handleClickStory(story)}
          >
            <div
              className="library-card-cover"
              style={
                story.coverUrl ? { backgroundImage: `url(${story.coverUrl})` } : {}
              }
            />
          </button>
        ))}
      </div>
    </div>
  );
};

export default LibararyPage;
