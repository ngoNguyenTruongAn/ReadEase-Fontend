import React from "react";
import { Outlet } from "react-router-dom";
import "./LoginLayout.scss";
import monster from "../../assets/image/Friendly monster waving a flag 1.png";

const LoginLayout = () => {
  return (
    <div className="login-page">
      <div className="login-container">
        {/* LEFT SIDE - VISUAL */}
        <div className="login-visual">
          <div className="mascot-wrapper">
            <img src={monster} alt="ReadEase Mascot" className="mascot-img" />
          </div>
        </div>

        {/* RIGHT SIDE - FORM */}
        <div className="login-form-section">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default LoginLayout;
