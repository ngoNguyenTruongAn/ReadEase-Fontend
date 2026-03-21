import React from "react";
import { useOutletContext } from "react-router-dom";
import "./LibararyPage.scss";

// TODO: sau này thay bằng data thật từ API
const MOCK_STORIES = [
  {
    id: 1,
    title: "Cây tre trăm đốt",
    coverUrl:
      "https://images.pexels.com/photos/5904935/pexels-photo-5904935.jpeg?auto=compress&w=600",
  },
  {
    id: 2,
    title: "Sơn Tinh Thủy Tinh",
    coverUrl:
      "https://images.pexels.com/photos/3225517/pexels-photo-3225517.jpeg?auto=compress&w=600",
  },
  {
    id: 3,
    title: "Cây khế trả vàng",
    coverUrl:
      "https://images.pexels.com/photos/2745957/pexels-photo-2745957.jpeg?auto=compress&w=600",
  },
  {
    id: 4,
    title: "Bánh chưng bánh giầy",
    coverUrl:
      "https://images.pexels.com/photos/3732567/pexels-photo-3732567.jpeg?auto=compress&w=600",
  },
  {
    id: 5,
    title: "Thánh Gióng",
    coverUrl:
      "https://images.pexels.com/photos/4619565/pexels-photo-4619565.jpeg?auto=compress&w=600",
  },
  {
    id: 6,
    title: "Sự tích dưa hấu",
    coverUrl:
      "https://images.pexels.com/photos/5945845/pexels-photo-5945845.jpeg?auto=compress&w=600",
  },
  {
    id: 7,
    title: "Sự tích dưa hấu",
    coverUrl:
      "https://images.pexels.com/photos/5945845/pexels-photo-5945845.jpeg?auto=compress&w=600",
  },
  {
    id: 8,
    title: "Sự tích dưa hấu",
    coverUrl:
      "https://images.pexels.com/photos/5945845/pexels-photo-5945845.jpeg?auto=compress&w=600",
  },
  {
    id: 9,
    title: "Sự tích dưa hấu",
    coverUrl:
      "https://images.pexels.com/photos/5945845/pexels-photo-5945845.jpeg?auto=compress&w=600",
  },
  {
    id: 10,
    title: "Sự tích dưa hấu",
    coverUrl:
      "https://images.pexels.com/photos/5945845/pexels-photo-5945845.jpeg?auto=compress&w=600",
  },
];

const LibararyPage = () => {
  const { setSideStory } = useOutletContext() ?? {};

  const handleClickStory = (story) => {
    setSideStory?.({
      kind: "story",
      src: story.coverUrl,
      alt: story.title,
      title: story.title,
      description:
        "“Ngày xưa, ở một làng nọ, có một anh nông phu nghèo...”",
    });
    console.log("Open story:", story);
  };

  return (
    <div className="library-page">
      <div className="library-grid">
        {MOCK_STORIES.map((story) => (
          <button
            key={story.id}
            type="button"
            className="library-card"
            onClick={() => handleClickStory(story)}
          >
            <div
              className="library-card-cover"
              style={{ backgroundImage: `url(${story.coverUrl})` }}
            />
          </button>
        ))}
      </div>
    </div>
  );
};

export default LibararyPage;
