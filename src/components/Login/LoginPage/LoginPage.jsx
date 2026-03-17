import React from "react";
import { Link, useNavigate } from "react-router-dom";
import "./LoginPage.scss";

const LoginPage = () => {
  const navigate = useNavigate();
  return (
    <div className="form-wrapper login-page">
      <h1 className="title">ReadEase chào mừng bạn!</h1>

      <p className="subtitle">
        Nơi việc học tập diễn ra theo tốc độ của con bạn.
      </p>

      <form className="login-form">
        <div className="input-group">
          <input type="email" placeholder="Email đăng nhập" required />
        </div>

        <div className="input-group">
          <input type="password" placeholder="Mật khẩu" required />
        </div>

        <div className="forgot-password">
          <a href="#forgot">Quên mật khẩu?</a>
        </div>

        <button
          type="submit"
          className="btn-login"
          onClick={() => navigate("/children")}
        >
          Đăng nhập
        </button>
      </form>

      <p className="signup-link">
        Bạn chưa có tài khoản? <Link to="/register">Đăng ký</Link>
      </p>
    </div>
  );
};

export default LoginPage;
