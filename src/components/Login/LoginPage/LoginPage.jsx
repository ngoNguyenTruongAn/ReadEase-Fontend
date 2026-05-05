import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import AuthAPI from "../../../service/Auth/AuthAPI";
import ChildrenAPI from "../../../service/Children/ChildrenAPI";
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

const pickApiDetail = (err) => {
  const body = err?.response?.data;
  const apiErr = body?.error;
  return (
    (Array.isArray(apiErr?.details) && apiErr.details[0]) ||
    (Array.isArray(body?.details) && body.details[0]) ||
    null
  );
};

const shouldFetchInviteOnLoginError = (err) => {
  const status = err?.response?.status;
  const body = err?.response?.data;
  const apiErr = body?.error;
  const detail = pickApiDetail(err);
  const msg = String(
    detail || apiErr?.message || body?.message || err?.message || "",
  ).toLowerCase();

  // Heuristic: các case thường gặp khi tài khoản trẻ chưa được xác nhận/liên kết.
  return (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    String(apiErr?.code || "").includes("LINK") ||
    msg.includes("link") ||
    msg.includes("liên kết") ||
    msg.includes("guardian") ||
    msg.includes("phụ huynh") ||
    msg.includes("confirm") ||
    msg.includes("xác nhận")
  );
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
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteInfo, setInviteInfo] = useState(null);

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
      const message = pickApiDetail(err) || pickErrorMessage(err);
      setFormError(message);

      // Nếu backend trả token (dù login bị chặn vì chưa liên kết), lưu token để gọi my-invite-code.
      const tokenFromError = pickToken(err?.response?.data);
      if (tokenFromError) localStorage.setItem("access_token", tokenFromError);

      setInviteInfo(null);
      setInviteError("");

      if (shouldFetchInviteOnLoginError(err)) {
        try {
          setInviteLoading(true);
          const res = await ChildrenAPI.getInviteCode();
          const payload = res?.data ?? res ?? {};
          const code = String(payload?.inviteCode || "").trim();
          setInviteInfo({
            inviteCode: code,
            expiresAt: payload?.expiresAt || "",
            isExpired: Boolean(payload?.isExpired),
            isLinked: Boolean(payload?.isLinked),
          });
          if (code) localStorage.setItem("inviteCode", code);
        } catch (e2) {
          const detail2 = pickApiDetail(e2);
          const body2 = e2?.response?.data;
          const apiErr2 = body2?.error;
          setInviteError(
            detail2 ||
              apiErr2?.message ||
              body2?.message ||
              e2?.message ||
              "Không lấy được mã mời.",
          );
        } finally {
          setInviteLoading(false);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const copyInvite = async () => {
    const code = inviteInfo?.inviteCode;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
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

        {inviteLoading ? (
          <p className="login-form__error" role="status">
            Đang lấy mã mời...
          </p>
        ) : null}

        {!inviteLoading && inviteInfo?.inviteCode ? (
          <div className="login-invite">
            <div className="login-invite__row">
              <span className="login-invite__label">Mã mời phụ huynh</span>
              <button
                type="button"
                className="login-invite__copy"
                onClick={copyInvite}
              >
                Copy mã
              </button>
            </div>
            <div className="login-invite__code" aria-live="polite">
              {inviteInfo.inviteCode}
            </div>
            {inviteInfo.expiresAt ? (
              <p className="login-invite__meta">
                Hết hạn: <strong>{String(inviteInfo.expiresAt)}</strong>
                {inviteInfo.isExpired ? " (Đã hết hạn)" : ""}
                {inviteInfo.isLinked ? " • Đã liên kết" : ""}
              </p>
            ) : null}
          </div>
        ) : null}

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
