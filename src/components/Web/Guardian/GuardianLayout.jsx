import React, { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import "./GuardianLayout.scss";
import logo from "../../../assets/image/reading book and sitting on the grass 1.png";
import tokenIcon from "../../../assets/image/sparkles 1.png";
import AuthAPI from "../../../service/Auth/AuthAPI";
import GuardianAPI from "../../../service/Guardian/GuardianAPI";

const textOrEmpty = (value) => String(value ?? "").trim();

const formatJoinedAt = (raw) => {
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "";

  try {
    const monthYear = new Intl.DateTimeFormat("vi-VN", {
      month: "long",
      year: "numeric",
    }).format(date);
    return `Đã tham gia vào ${monthYear}`;
  } catch {
    return "";
  }
};

const pickProfileRoot = (payload) =>
  payload?.data ?? payload?.user ?? payload?.profile ?? payload ?? {};

const getStoredAccessToken = () => {
  if (typeof window === "undefined") return "";

  return (
    textOrEmpty(window.localStorage.getItem("access_token")) ||
    textOrEmpty(window.localStorage.getItem("accessToken")) ||
    textOrEmpty(window.localStorage.getItem("token"))
  );
};

const normalizeChildren = (payload) => {
  const root = payload?.data ?? payload;
  const list = Array.isArray(root)
    ? root
    : Array.isArray(root?.children)
      ? root.children
      : Array.isArray(root?.items)
        ? root.items
        : [];

  return list.map((child, index) => ({
    ...child,
    id:
      child?.id ??
      child?._id ??
      child?.childId ??
      child?.child_id ??
      child?.userId ??
      child?.user_id ??
      child?.email ??
      index,
    name:
      textOrEmpty(child?.display_name) ||
      textOrEmpty(child?.displayName) ||
      textOrEmpty(child?.full_name) ||
      textOrEmpty(child?.fullName) ||
      textOrEmpty(child?.name) ||
      textOrEmpty(child?.username) ||
      textOrEmpty(child?.email) ||
      "Họ và tên Trẻ",
    score:
      child?.starPoint ??
      child?.star_point ??
      child?.score ??
      child?.points ??
      child?.tokenBalance ??
      child?.token_balance ??
      0,
    email: textOrEmpty(child?.email),
  }));
};

const GuardianLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isSettingsRoute = location.pathname.startsWith("/guardian/settings");
  const usesProfileShell = location.pathname.startsWith("/guardian");
  const usesOverviewTreatment = usesProfileShell && !isSettingsRoute;
  const [profileInfo, setProfileInfo] = useState({
    displayName: "",
    username: "",
    joinedAt: "",
  });
  const [children, setChildren] = useState([]);
  const [loadingChildren, setLoadingChildren] = useState(false);

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login", { replace: true });
  };

  const refreshChildren = useCallback(async () => {
    if (!getStoredAccessToken()) {
      setChildren([]);
      return [];
    }

    setLoadingChildren(true);
    try {
      const childrenPayload = await GuardianAPI.getChildren();
      const nextChildren = normalizeChildren(childrenPayload);
      setChildren(nextChildren);
      return nextChildren;
    } catch {
      setChildren([]);
      return [];
    } finally {
      setLoadingChildren(false);
    }
  }, []);

  useEffect(() => {
    if (!usesProfileShell) return;

    let cancelled = false;

    const loadProfileShell = async () => {
      if (!getStoredAccessToken()) {
        if (!cancelled) {
          setProfileInfo({ displayName: "", username: "", joinedAt: "" });
          setChildren([]);
          setLoadingChildren(false);
        }
        return;
      }

      try {
        const profilePayload = await AuthAPI.getProfileAPI();
        const root = pickProfileRoot(profilePayload);

        if (!cancelled) {
          setProfileInfo({
            displayName:
              textOrEmpty(root?.display_name) ||
              textOrEmpty(root?.displayName) ||
              textOrEmpty(root?.full_name) ||
              textOrEmpty(root?.fullName) ||
              textOrEmpty(root?.name),
            username:
              textOrEmpty(root?.username) ||
              textOrEmpty(root?.userName) ||
              textOrEmpty(root?.email),
            joinedAt: formatJoinedAt(
              root?.createdAt ??
                root?.created_at ??
                root?.joinedAt ??
                root?.joinDate ??
                root?.created,
            ),
          });
        }
      } catch {
        if (!cancelled) {
          setProfileInfo({ displayName: "", username: "", joinedAt: "" });
        }
      }

      try {
        setLoadingChildren(true);
        const childrenPayload = await GuardianAPI.getChildren();
        if (!cancelled) setChildren(normalizeChildren(childrenPayload));
      } catch {
        if (!cancelled) setChildren([]);
      } finally {
        if (!cancelled) setLoadingChildren(false);
      }
    };

    loadProfileShell();

    return () => {
      cancelled = true;
    };
  }, [usesProfileShell]);

  const navTabs = (
    <nav className="guardian-nav-tabs">
      <NavLink
        to="/guardian"
        className={({ isActive }) =>
          `guardian-nav-link ${isActive ? "is-active" : ""}`
        }
        end
      >
        Tổng quan
      </NavLink>

      <NavLink
        to="/guardian/children"
        className={({ isActive }) =>
          `guardian-nav-link ${isActive ? "is-active" : ""}`
        }
      >
        Trẻ em
      </NavLink>

      <NavLink
        to="/guardian/reports"
        className={({ isActive }) =>
          `guardian-nav-link ${isActive ? "is-active" : ""}`
        }
      >
        Báo cáo tuần
      </NavLink>

      <NavLink
        to="/guardian/settings"
        className={({ isActive }) =>
          `guardian-nav-link ${isActive ? "is-active" : ""}`
        }
      >
        Hồ sơ
      </NavLink>
    </nav>
  );

  if (usesProfileShell) {
    const displayChildren = children.length
      ? children.slice(0, 3)
      : [
          { id: "empty-1", name: "Chưa có thông tin trẻ", score: 0 },
        ];

    return (
      <div
        className={`guardian-page guardian-page--settings ${
          usesOverviewTreatment ? "guardian-page--overview" : ""
        }`}
      >
        <div
          className={`guardian-settings-shell ${
            usesOverviewTreatment ? "guardian-overview-shell" : ""
          }`}
        >
          <aside
            className={`guardian-settings-side ${
              usesOverviewTreatment ? "guardian-overview-side" : ""
            }`}
          >
            <div className="guardian-settings-side__inner">
              <div className="guardian-settings-hero" aria-hidden="true">
                <img
                  src={logo}
                  alt=""
                  className="guardian-settings-hero__img"
                />
              </div>

              <div className="guardian-settings-profile">
                <h1 className="guardian-settings-name">
                  {profileInfo.displayName || "Họ và Tên"}
                </h1>
                {isSettingsRoute ? (
                  <>
                    <p className="guardian-settings-username">
                      {profileInfo.username || "Username"}
                    </p>
                    <p className="guardian-settings-joined">
                      {profileInfo.joinedAt || "Ngày tham gia chưa cập nhật"}
                    </p>
                  </>
                ) : (
                  <div
                    className="guardian-overview-divider"
                    aria-hidden="true"
                  />
                )}
              </div>

              <div className="guardian-settings-children">
                <p className="guardian-settings-side-title">Các bé</p>
                <ul className="guardian-settings-child-list">
                  {displayChildren.map((child) => (
                    <li
                      key={child.id}
                      className="guardian-settings-child-item"
                    >
                      <span className="guardian-settings-child-avatar">
                        <img src={logo} alt="" />
                      </span>
                      <span className="guardian-settings-child-name">
                        {child.name}
                      </span>
                      <span className="guardian-settings-child-score">
                        {child.score}
                        <img src={tokenIcon} alt="" />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              {isSettingsRoute ? (
                <button
                  type="button"
                  className="guardian-settings-logout"
                  onClick={handleLogout}
                >
                  Đăng xuất
                </button>
              ) : null}
            </div>
          </aside>

          <main
            className={`guardian-settings-main ${
              usesOverviewTreatment ? "guardian-overview-main" : ""
            }`}
          >
            <header className="guardian-navbar guardian-navbar--settings">
              <div className="guardian-navbar-left">
                <div className="guardian-avatar" aria-hidden="true">
                  <img src={logo} alt="" className="guardian-avatar-img" />
                </div>
              </div>

              <div className="guardian-navbar-center">{navTabs}</div>
            </header>

            <section
              className={`guardian-settings-content ${
                usesOverviewTreatment ? "guardian-overview-content" : ""
              }`}
            >
              <Outlet
                context={{
                  children,
                  loadingChildren,
                  refreshChildren,
                }}
              />
            </section>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="guardian-page">
      <div className="guardian-home-page">
        {/* NAVBAR */}
        <header className="guardian-navbar">
          <div className="guardian-navbar-left">
            <div className="guardian-avatar" aria-hidden="true">
              <img src={logo} alt="logo" className="guardian-avatar-img" />
            </div>
          </div>

          <div className="guardian-navbar-center">
            {navTabs}
          </div>

          <div className="guardian-navbar-right">
            <button className="guardian-logout-btn" onClick={handleLogout}>
              Đăng xuất
            </button>
          </div>
        </header>

        {/* CONTENT */}
        <main className="guardian-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default GuardianLayout;
