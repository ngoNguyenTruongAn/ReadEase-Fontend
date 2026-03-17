import React from "react";
import { Link, useNavigate } from "react-router-dom";
import "./RegisterPage.scss";

const RegisterPage = () => {
  const navigate = useNavigate();
  return (
    <div className="form-wrapper register-page">
      <h1 className="title">Tạo tài khoản</h1>

      <p className="subtitle">
        Cùng ReadEase trong hành trình cải thiện khả năng đọc
      </p>

      <form className="register-form">
        <div className="input-group">
          <input type="text" placeholder="Họ và tên" required />
        </div>

        <div className="input-group">
          <input type="email" placeholder="Email" required />
        </div>

        <div className="input-group">
          <input type="text" placeholder="Tên đăng nhập" required />
        </div>

        <div className="input-group">
          <input type="password" placeholder="Mật khẩu" required />
        </div>

        <button
          type="submit"
          className="btn-login"
          onClick={() => navigate("/validate")}
        >
          Đăng ký
        </button>
      </form>

      <p className="signup-link">
        Bạn đã có tài khoản? <Link to="/login">Đăng nhập</Link>
      </p>
    </div>
  );
};

export default RegisterPage;
