import React from "react";
import { Outlet } from "react-router-dom";

const GuardianLayout = () => {
  return (
    <div>
      {/* <main className="children-main">
        <header className="children-navbar">
          <div className="children-navbar-left">
            <div className="children-avatar">
              <img
                // src={redMonster}
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
            </nav>
          </div>
        </header>

        <section className="children-content">
          <Outlet />
        </section>
      </main> */}
      hi
    </div>
  );
};

export default GuardianLayout;
