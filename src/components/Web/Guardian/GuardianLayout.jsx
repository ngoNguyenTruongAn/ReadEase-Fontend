import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import "./GuardianLayout.scss";
import logo from "../../../assets/image/reading book and sitting on the grass 1.png";
const GuardianLayout = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login", { replace: true });
  };

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
                to="/guardian/analytics"
                className={({ isActive }) =>
                  `guardian-nav-link ${isActive ? "is-active" : ""}`
                }
              >
                Chi tiết
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
