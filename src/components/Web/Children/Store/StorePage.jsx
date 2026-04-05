import React, { useMemo, useState } from "react";
import "./StorePage.scss";
import { useOutletContext } from "react-router-dom";
import monsterAstronaut from "../../../../assets/image/reading book and sitting on the grass 1.png";
import monsterShow from "../../../../assets/image/Friendly monster waving a flag 1.png";

const CHARACTERS = [
  {
    id: "1",
    title: "Phi hành gia",
    category: "profession",
    image: monsterAstronaut,
    tint: "mint",
  },
  {
    id: "2",
    title: "Ca sĩ nổi tiếng (nam)",
    category: "profession",
    image: monsterShow,
    tint: "lavender",
  },
  {
    id: "3",
    title: "Ảo thuật gia",
    category: "profession",
    image: monsterShow,
    tint: "peach",
  },
  {
    id: "4",
    title: "Lính cứu hỏa",
    category: "profession",
    image: monsterAstronaut,
    tint: "coral",
  },
  {
    id: "5",
    title: "Chạy bộ buổi sáng",
    category: "activity",
    image: monsterAstronaut,
    tint: "sky",
  },
  {
    id: "6",
    title: "Vẽ tranh",
    category: "activity",
    image: monsterShow,
    tint: "mint",
  },
  {
    id: "7",
    title: "Thỏ con",
    category: "animal",
    image: monsterAstronaut,
    tint: "lavender",
  },
  {
    id: "8",
    title: "Cún con",
    category: "animal",
    image: monsterShow,
    tint: "peach",
  },
];

const StorePage = () => {
  const outletContext = useOutletContext();
  const activeFilter = outletContext?.storeFilter ?? "profession";
  const [selectedId, setSelectedId] = useState("1");

  const visible = useMemo(
    () => CHARACTERS.filter((c) => c.category === activeFilter),
    [activeFilter],
  );

  return (
    <div className="store-page">
      <div className="store-main">
        <div className="store-grid">
          {visible.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`store-card store-card--${item.tint} ${
                selectedId === item.id ? "store-card--selected" : ""
              }`}
              onClick={() => setSelectedId(item.id)}
            >
              <div className="store-card-art">
                <img
                  src={item.image}
                  alt={item.title}
                  className="store-card-img"
                />
              </div>
              <span className="store-card-label">{item.title}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StorePage;
