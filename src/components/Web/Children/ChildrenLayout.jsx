import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import "./ChildrenLayout.scss";
import redMonster from "../../../assets/image/reading book and sitting on the grass 1.png";
import childrenTokenIcon from "../../../assets/image/sparkles 1.png";

const ChildrenLayout = () => {
  return (
    <div className="children-page">
      <div className="children-home-page">
        <aside className="children-side">
          <div className="children-side-hero">
            <div className="children-side-illustration">
              <img
                src={redMonster}
                alt="Red Monster Reading Book"
                className="children-side-illustration-img "
              />
            </div>
            <p className="children-side-text">Hôm nay bạn muốn đọc gì nào?</p>
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
            <Outlet />
          </section>
        </main>
      </div>
    </div>
  );
};

export default ChildrenLayout;
