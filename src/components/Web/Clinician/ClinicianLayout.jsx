import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import "./ClinicianLayout.scss";
import logo from "../../../assets/image/reading book and sitting on the grass 1.png";

const ClinicianLayout = () => {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.clear();
    navigate("/login", { replace: true });
  };

  return (
    <div className="clinician-page">
      <div className="clinician-home-page">
        <header className="clinician-navbar">
          <div className="clinician-navbar-left">
            <div className="clinician-avatar" aria-hidden="true">
              <img src={logo} alt="logo" className="clinician-avatar-img" />
            </div>
          </div>

          <div className="clinician-navbar-center">
            <nav className="clinician-nav-tabs">
              <NavLink
                to="/clinician"
                className={({ isActive }) =>
                  `clinician-nav-link ${isActive ? "is-active" : ""}`
                }
                end
              >
                Tổng quan
              </NavLink>

              <NavLink
                to="/clinician/contents"
                className={({ isActive }) =>
                  `clinician-nav-link ${isActive ? "is-active" : ""}`
                }
              >
                Nội dung
              </NavLink>

              <NavLink
                to="/clinician/patients"
                className={({ isActive }) =>
                  `clinician-nav-link ${isActive ? "is-active" : ""}`
                }
              >
                Bệnh nhân
              </NavLink>

              <NavLink
                to="/clinician/reports"
                className={({ isActive }) =>
                  `clinician-nav-link ${isActive ? "is-active" : ""}`
                }
              >
                Báo cáo
              </NavLink>

              <NavLink
                to="/clinician/profile"
                className={({ isActive }) =>
                  `clinician-nav-link ${isActive ? "is-active" : ""}`
                }
              >
                Hồ sơ
              </NavLink>
            </nav>
          </div>

          <div className="clinician-navbar-right">
            <button className="clinician-logout-btn" onClick={handleLogout}>
              Đăng xuất
            </button>
          </div>
        </header>

        <main className="clinician-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default ClinicianLayout;
