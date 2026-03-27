import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "./RegisterPage.scss";
import AuthAPI from "../../../service/Auth/AuthAPI";

const RegisterPage = () => {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("ROLE_GUARDIAN");
  const [loading, setLoading] = useState(false);

  const EMAIL_REGEX =
    /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    if (!displayName.trim()) return window.alert("Vui lòng nhập họ và tên.");
    if (!email.trim() || !EMAIL_REGEX.test(email.trim())) {
      return window.alert("Email không đúng định dạng.");
    }
    if (!password || password.length < 8) {
      return window.alert("Mật khẩu phải có ít nhất 8 ký tự.");
    }

    setLoading(true);
    try {
      await AuthAPI.registerAPI(
        email.trim(),
        password,
        displayName.trim(),
        role,
      );
      localStorage.setItem("registerEmail", email.trim());
      localStorage.setItem("registerUserName", displayName.trim());
      localStorage.setItem("registerRole", role);
      navigate("/validate");
    } catch (error) {
      const body = error?.response?.data;
      console.error("[REGISTER_API_ERROR]", {
        endpoint: "POST /auth/register",
        status: error?.response?.status,
        statusText: error?.response?.statusText,
        response: body,
        request: {
          email: email.trim(),
          displayName: displayName.trim(),
          role,
        },
        message: error?.message,
      });
      const message =
        (Array.isArray(body?.error?.details) && body.error.details[0]) ||
        (typeof body?.error?.message === "string" && body.error.message) ||
        (typeof body?.message === "string" && body.message) ||
        (Array.isArray(body?.message) && body.message.join(", ")) ||
        (typeof body?.error === "string" && body.error) ||
        error?.message ||
        "Đăng ký thất bại.";
      window.alert(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-wrapper register-page">
      <h1 className="title">Tạo tài khoản</h1>

      <p className="subtitle">
        Cùng ReadEase trong hành trình cải thiện khả năng đọc
      </p>

      <form className="register-form" onSubmit={handleSubmit} noValidate>
        <div className="input-group">
          <input
            type="text"
            placeholder="Họ và tên"
            required
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>

        <div className="input-group">
          <input
            type="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="input-group">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            aria-label="Chọn vai trò"
          >
            <option value="ROLE_GUARDIAN">Người bảo hộ</option>
            <option value="ROLE_CHILD">Bạn đọc</option>
            <option value="ROLE_CLINICIAN">Bác sĩ</option>
          </select>
        </div>

        <div className="input-group">
          <input
            type="password"
            placeholder="Mật khẩu"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button type="submit" className="btn-login" disabled={loading}>
          {loading ? "Đang đăng ký..." : "Đăng ký"}
        </button>
      </form>

      <p className="signup-link">
        Bạn đã có tài khoản? <Link to="/login">Đăng nhập</Link>
      </p>
    </div>
  );
};

export default RegisterPage;
