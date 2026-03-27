import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import "./ChildrenLayout.scss";
import redMonster from "../../../assets/image/reading book and sitting on the grass 1.png";
import childrenTokenIcon from "../../../assets/image/sparkles 1.png";
import { FaFilter } from "react-icons/fa";
import AuthAPI from "../../../service/Auth/AuthAPI";

const ChildrenLayout = () => {
  const defaultSideStory = useMemo(
    () => ({ kind: "default", src: redMonster, alt: "ReadEase" }),
    [],
  );
  const [sideStory, setSideStory] = useState(defaultSideStory);
  const location = useLocation();
  const navigate = useNavigate();
  const isStoreRoute = location.pathname.startsWith("/children/store");
  const isProfileRoute = location.pathname.startsWith("/children/profile");
  const [storeFilter, setStoreFilter] = useState("profession");
  const [storeFilterOpen, setStoreFilterOpen] = useState(false);
  const storeFilterWrapRef = useRef(null);
  const [profileGreetingName, setProfileGreetingName] = useState("");

  const STORE_FILTERS = [
    { id: "profession", label: "Nghề nghiệp" },
    { id: "activity", label: "Hoạt động" },
    { id: "animal", label: "Động vật" },
  ];

  useEffect(() => {
    if (!isStoreRoute || !storeFilterOpen) return;

    const onDocMouseDown = (e) => {
      const el = storeFilterWrapRef.current;
      if (!el) return;
      if (el.contains(e.target)) return;
      setStoreFilterOpen(false);
    };

    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [isStoreRoute, storeFilterOpen]);

  useEffect(() => {
    // Chỉ check khi đang ở luồng /children (vào thẳng từ URL cũng áp dụng).
    if (!location.pathname.startsWith("/children")) return;

    const storedToken =
      localStorage.getItem("access_token") ||
      localStorage.getItem("token") ||
      localStorage.getItem("accessToken");

    if (!storedToken) {
      navigate("/login", { replace: true });
      return;
    }

    // Kiểm tra exp của JWT (nếu token là JWT). Nếu parse thất bại thì bỏ qua.
    const isExpired = (() => {
      try {
        const parts = String(storedToken).split(".");
        if (parts.length < 2) return false;

        const payload = parts[1];
        const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
        const padded = base64.padEnd(
          base64.length + ((4 - (base64.length % 4)) % 4),
          "=",
        );
        const json = decodeURIComponent(
          atob(padded)
            .split("")
            .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
            .join(""),
        );
        const parsed = JSON.parse(json);
        const exp = parsed?.exp;
        if (!exp) return false;
        return Date.now() >= exp * 1000;
      } catch {
        return false;
      }
    })();

    if (isExpired) {
      localStorage.removeItem("access_token");
      localStorage.removeItem("token");
      localStorage.removeItem("accessToken");
      navigate("/login", { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (!isProfileRoute) return;

    let cancelled = false;
    //lấy tên từ hồ sơ
    const loadProfileName = async () => {
      try {
        const data = await AuthAPI.getProfileAPI();
        const root = data?.data ?? data?.user ?? data;
        const name =
          root?.displayName ??
          root?.fullName ??
          root?.userName ??
          root?.username ??
          root?.name ??
          root?.email ??
          "";
        if (!cancelled) setProfileGreetingName(name);
      } catch {
        if (!cancelled) setProfileGreetingName("");
      }
    };

    loadProfileName();
    return () => {
      cancelled = true;
    };
  }, [isProfileRoute]);

  const handleLogout = () => {
    // Dọn sạch token để axios interceptor không gắn Authorization nữa.
    localStorage.removeItem("access_token");
    localStorage.removeItem("token");
    localStorage.removeItem("accessToken");

    setStoreFilterOpen(false);
    navigate("/login", { replace: true });
  };

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
                {isProfileRoute ? (
                  <div className="children-side-greeting">
                    <p className="children-side-text children-side-greeting-title">
                      Chào
                    </p>
                    <p className="children-side-text children-side-greeting-name">
                      {profileGreetingName || "bạn"}!
                    </p>
                  </div>
                ) : isStoreRoute ? (
                  <div className="children-side-store">
                    <p className="children-side-text children-side-store-title">
                      Cửa hàng nhân vật
                    </p>
                    <p className="children-side-store-subtitle">
                      Chọn nhóm bạn muốn xem
                    </p>
                  </div>
                ) : (
                  <p className="children-side-text">
                    Hôm nay bạn muốn đọc gì nào?
                  </p>
                )}
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
                <div
                  ref={storeFilterWrapRef}
                  className="children-store-filter-wrap"
                >
                  <div
                    className={`children-store-nav-trigger ${isStoreRoute ? "is-active" : ""}`}
                    onClick={() => {
                      if (isStoreRoute) {
                        setStoreFilterOpen(!storeFilterOpen);
                      }
                    }}
                  >
                    <NavLink
                      to="/children/store"
                      className={({ isActive }) =>
                        `children-nav-link ${isActive ? "is-active" : ""}`
                      }
                    >
                      Cửa hàng
                      <FaFilter className="children-filter-icon" />
                    </NavLink>
                  </div>

                  {isStoreRoute && storeFilterOpen && (
                    <div className="children-store-filter-dropdown">
                      <div className="children-store-filter-list">
                        {STORE_FILTERS.map((filter) => (
                          <button
                            key={filter.id}
                            className={`children-store-filter-item ${
                              storeFilter === filter.id ? "is-active" : ""
                            }`}
                            onClick={() => setStoreFilter(filter.id)}
                          >
                            {filter.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </nav>
            </div>

            <div className="children-navbar-right children-token">
              <span className="children-coin-amount">120</span>
              <img
                src={childrenTokenIcon}
                alt="Children Token Icon"
                className="children-coin-icon"
              />

              <button
                type="button"
                className="children-logout-btn"
                onClick={handleLogout}
              >
                Đăng xuất
              </button>
            </div>
          </header>

          <section className="children-content">
            <Outlet
              context={{
                setSideStory,
                resetSideStory: () => setSideStory(defaultSideStory),
                storeFilter,
                setStoreFilter,
              }}
            />
          </section>
        </main>
      </div>
    </div>
  );
};

export default ChildrenLayout;
