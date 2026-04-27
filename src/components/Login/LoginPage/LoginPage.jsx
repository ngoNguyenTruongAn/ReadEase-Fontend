import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import AuthAPI from "../../../service/Auth/AuthAPI";
import "./LoginPage.scss";

const EMAIL_REGEX =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?.[a-zA-Z]{2,}$/;

const MIN_PASSWORD_LEN = 8;
const MAX_PASSWORD_LEN = 128;
const MAX_EMAIL_LEN = 254;

const validateEmail = (raw) => {
  const value = String(raw ?? "").trim();
  if (!value) return "Vui lòng nhập email.";
  if (value.length > MAX_EMAIL_LEN)
    return `Email không được vượt quá ${MAX_EMAIL_LEN} ký tự.`;
  if (!EMAIL_REGEX.test(value)) return "Email không đúng định dạng.";
  return null;
};

const validatePassword = (value) => {
  const v = value ?? "";
  if (!v.trim()) return "Vui lòng nhập mật khẩu.";
  if (v.length < MIN_PASSWORD_LEN)
    return `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LEN} ký tự.`;
  if (v.length > MAX_PASSWORD_LEN)
    return `Mật khẩu không được vượt quá ${MAX_PASSWORD_LEN} ký tự.`;
  return null;
};

const pickToken = (data) =>
  data?.access_token ??
  data?.accessToken ??
  data?.token ??
  data?.data?.access_token ??
  data?.data?.accessToken ??
  data?.data?.token;

const pickRefreshToken = (data) =>
  data?.refresh_token ??
  data?.refreshToken ??
  data?.data?.refresh_token ??
  data?.data?.refreshToken;

const pickTrackingToken = (data) =>
  data?.tracking_token ??
  data?.trackingToken ??
  data?.ws_token ??
  data?.wsToken ??
  data?.data?.tracking_token ??
  data?.data?.trackingToken ??
  data?.data?.ws_token ??
  data?.data?.wsToken;

const pickErrorMessage = (err) => {
  const body = err?.response?.data;
  if (!body) return err?.message || "Đăng nhập thất bại.";
  if (typeof body.message === "string") return body.message;
  if (Array.isArray(body.message)) return body.message.join(", ");
  if (typeof body.error === "string") return body.error;
  return "Đăng nhập thất bại.";
};

// 🔥 map role → route
const getRedirectByRole = (role) => {
  switch (role) {
    case "ROLE_CHILD":
      return "/children/profile";
    case "ROLE_GUARDIAN":
      return "/guardian";
    case "ROLE_CLINICIAN":
      return "/clinician";
    default:
      return "/";
  }
};

const LoginPage = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ email: false, password: false });
  const [errors, setErrors] = useState({ email: null, password: null });
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);

  const setFieldError = (field, message) => {
    setErrors((prev) => ({ ...prev, [field]: message }));
  };

  const handleEmailBlur = () => {
    setTouched((t) => ({ ...t, email: true }));
    setFieldError("email", validateEmail(email));
  };

  const handlePasswordBlur = () => {
    setTouched((t) => ({ ...t, password: true }));
    setFieldError("password", validatePassword(password));
  };

  const handleEmailChange = (e) => {
    const v = e.target.value;
    setEmail(v);
    setFormError("");
    if (touched.email) setFieldError("email", validateEmail(v));
  };

  const handlePasswordChange = (e) => {
    const v = e.target.value;
    setPassword(v);
    setFormError("");
    if (touched.password) setFieldError("password", validatePassword(v));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    const emailErr = validateEmail(email);
    const passwordErr = validatePassword(password);
    setTouched({ email: true, password: true });
    setErrors({ email: emailErr, password: passwordErr });

    if (emailErr || passwordErr) return;

    setLoading(true);
    try {
      const data = await AuthAPI.loginAPI(email.trim(), password);

      const token = pickToken(data);
      const refreshToken = pickRefreshToken(data);
      const trackingToken = pickTrackingToken(data);

      if (!token) {
        throw new Error("Không nhận được access token.");
      }

      // 💾 lưu token
      localStorage.setItem("access_token", token);
      if (refreshToken) localStorage.setItem("refresh_token", refreshToken);
      if (trackingToken) localStorage.setItem("tracking_token", trackingToken);

      // 🔥 decode role
      const decoded = jwtDecode(token);
      const role = decoded?.role;

      // 🚀 redirect theo role
      const redirectPath = getRedirectByRole(role);
      navigate(redirectPath);
    } catch (err) {
      setFormError(pickErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const showEmailError = touched.email && errors.email;
  const showPasswordError = touched.password && errors.password;

  return (
    <div className="form-wrapper login-page">
      {" "}
      <h1 className="title">
        <span style={{ color: "#FBBF24" }}>ReadEase</span> chào mừng bạn!{" "}
      </h1>
      <p className="subtitle subtitle--bold">
        Nơi việc học tập diễn ra theo tốc độ của con bạn.
      </p>
      <form className="login-form" onSubmit={handleSubmit} noValidate>
        {formError && (
          <p
            className="login-form__error login-form__error--global"
            role="alert"
          >
            {formError}
          </p>
        )}

        <div
          className={`input-group ${showEmailError ? "input-group--invalid" : ""}`}
        >
          <input
            type="email"
            placeholder="Email đăng nhập"
            value={email}
            onChange={handleEmailChange}
            onBlur={handleEmailBlur}
          />
          {showEmailError && (
            <p className="input-group__error">{errors.email}</p>
          )}
        </div>

        <div
          className={`input-group ${showPasswordError ? "input-group--invalid" : ""}`}
        >
          <input
            type="password"
            placeholder="Mật khẩu"
            value={password}
            onChange={handlePasswordChange}
            onBlur={handlePasswordBlur}
          />
          {showPasswordError && (
            <p className="input-group__error">{errors.password}</p>
          )}
        </div>

        <div className="forgot-password">
          <Link to="/forgot-password">Quên mật khẩu?</Link>
        </div>

        <button
          type="submit"
          className="btn-login"
          disabled={loading}
          style={{ background: "#FBBF24" }}
        >
          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
        </button>
      </form>
      <p className="signup-link">
        Bạn chưa có tài khoản? <Link to="/register">Đăng ký</Link>
      </p>
    </div>
  );
};

export default LoginPage;
