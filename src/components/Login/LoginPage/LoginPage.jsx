import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthAPI from "../../../service/Auth/AuthAPI";
import "./LoginPage.scss";

/** Định dạng email thực tế (không chấp nhận khoảng trắng, cần domain + TLD) */
const EMAIL_REGEX =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/;

const MIN_PASSWORD_LEN = 6;
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
  data?.token ??
  data?.accessToken ??
  data?.data?.token ??
  data?.data?.accessToken;

const pickErrorMessage = (err) => {
  const body = err?.response?.data;
  if (!body) return err?.message || "Đăng nhập thất bại.";
  if (typeof body.message === "string") return body.message;
  if (Array.isArray(body.message)) return body.message.join(", ");
  if (typeof body.error === "string") return body.error;
  return "Đăng nhập thất bại.";
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
      if (token) localStorage.setItem("token", token);
      navigate("/children");
    } catch (err) {
      setFormError(pickErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const showEmailError = touched.email && errors.email;
  const showPasswordError = touched.password && errors.password;
  const emailId = "login-email";
  const passwordId = "login-password";
  const emailErrId = "login-email-error";
  const passwordErrId = "login-password-error";

  return (
    <div className="form-wrapper login-page">
      <h1 className="title">ReadEase chào mừng bạn!</h1>

      <p className="subtitle">
        Nơi việc học tập diễn ra theo tốc độ của con bạn.
      </p>

      <form className="login-form" onSubmit={handleSubmit} noValidate>
        {formError ? (
          <p
            className="login-form__error login-form__error--global"
            role="alert"
          >
            {formError}
          </p>
        ) : null}

        <div
          className={`input-group ${showEmailError ? "input-group--invalid" : ""}`}
        >
          <input
            id={emailId}
            type="email"
            name="email"
            placeholder="Email đăng nhập"
            value={email}
            onChange={handleEmailChange}
            onBlur={handleEmailBlur}
            autoComplete="email"
            aria-invalid={showEmailError ? "true" : "false"}
            aria-describedby={showEmailError ? emailErrId : undefined}
          />
          {showEmailError ? (
            <p id={emailErrId} className="input-group__error" role="alert">
              {errors.email}
            </p>
          ) : null}
        </div>

        <div
          className={`input-group ${showPasswordError ? "input-group--invalid" : ""}`}
        >
          <input
            id={passwordId}
            type="password"
            name="password"
            placeholder="Mật khẩu"
            value={password}
            onChange={handlePasswordChange}
            onBlur={handlePasswordBlur}
            autoComplete="current-password"
            aria-invalid={showPasswordError ? "true" : "false"}
            aria-describedby={showPasswordError ? passwordErrId : undefined}
          />
          {showPasswordError ? (
            <p id={passwordErrId} className="input-group__error" role="alert">
              {errors.password}
            </p>
          ) : null}
        </div>

        <div className="forgot-password">
          <a href="#forgot">Quên mật khẩu?</a>
        </div>

        <button type="submit" className="btn-login" disabled={loading}>
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
