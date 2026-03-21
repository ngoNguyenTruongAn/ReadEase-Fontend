import React, { useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import "./ChildrenLayout.scss";
import redMonster from "../../../assets/image/reading book and sitting on the grass 1.png";
import childrenTokenIcon from "../../../assets/image/sparkles 1.png";

const ChildrenLayout = () => {
  const defaultSideStory = useMemo(
    () => ({ kind: "default", src: redMonster, alt: "ReadEase" }),
    [],
  );
  const [sideStory, setSideStory] = useState(defaultSideStory);

  return (
    <div className="children-page">
      <div className="children-home-page">
        <aside className="children-side">
          <div className="children-side-hero">
            {sideStory?.kind === "story" ? (
              <div className="children-side-story">
                <div className="children-side-story-cover">
                  <img
                    src={sideStory.src}
                    alt={sideStory.alt}
                    className="children-side-story-cover-img"
                  />
                </div>

                <h3 className="children-side-story-title">{sideStory.title}</h3>

                <div className="children-side-story-tags">
                  <span className="children-side-story-tag">
                    Truyện cổ tích
                  </span>
                  <span className="children-side-story-tag">Dân gian</span>
                </div>

                <p className="children-side-story-desc">
                  {sideStory.description}
                </p>

                <button type="button" className="children-side-story-cta">
                  Đọc ngay
                </button>
              </div>
            ) : (
              <>
                <div className="children-side-illustration">
                  <img
                    src={defaultSideStory.src}
                    alt={defaultSideStory.alt}
                    className="children-side-illustration-img"
                  />
                </div>
                <p className="children-side-text">
                  Hôm nay bạn muốn đọc gì nào?
                </p>
              </>
            )}
          </div>
        </aside>

        <main className="children-main">
          <header className="children-navbar">
            <div className="children-navbar-left">
              <div className="children-avatar">
                <img
                  src={redMonster}
                  alt="Red Monster Reading Book"
                  className="children-avatar-img"
                />
              </div>
            </div>

            <div className="children-navbar-center">
              <nav className="children-nav-tabs">
                <NavLink
                  to="/children/profile"
                  className={({ isActive }) =>
                    `children-nav-link ${isActive ? "is-active" : ""}`
                  }
                >
                  Hồ sơ
                </NavLink>
                <NavLink
                  to="/children/library"
                  className={({ isActive }) =>
                    `children-nav-link ${isActive ? "is-active" : ""}`
                  }
                >
                  Thư viện
                </NavLink>
                <NavLink
                  to="/children/store"
                  className={({ isActive }) =>
                    `children-nav-link ${isActive ? "is-active" : ""}`
                  }
                >
                  Cửa hàng
                </NavLink>
              </nav>
            </div>

            <div className="children-navbar-right children-token">
              <span className="children-coin-amount">120</span>
              <img
                src={childrenTokenIcon}
                alt="Children Token Icon"
                className="children-coin-icon"
              />
            </div>
          </header>

          <section className="children-content">
            <Outlet
              context={{
                setSideStory,
                resetSideStory: () => setSideStory(defaultSideStory),
              }}
            />
          </section>
        </main>
      </div>
    </div>
  );
};

export default ChildrenLayout;
