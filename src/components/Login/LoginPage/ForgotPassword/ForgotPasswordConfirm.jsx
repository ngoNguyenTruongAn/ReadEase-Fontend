import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import AuthAPI from "../../../../service/Auth/AuthAPI";
import { toast } from "react-toastify";
import "./ForgotPassword.scss";

const EMAIL_REGEX =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/;

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

const validateCode = (raw) => {
  const value = String(raw ?? "").trim();
  if (!value) return "Vui lòng nhập mã xác nhận.";
  if (value.length > 64) return "Mã xác nhận không hợp lệ.";
  return null;
};

const validatePassword = (raw) => {
  const v = String(raw ?? "");
  if (!v.trim()) return "Vui lòng nhập mật khẩu mới.";
  if (v.length < MIN_PASSWORD_LEN)
    return `Mật khẩu phải có ít nhất ${MIN_PASSWORD_LEN} ký tự.`;
  if (v.length > MAX_PASSWORD_LEN)
    return `Mật khẩu không được vượt quá ${MAX_PASSWORD_LEN} ký tự.`;
  return null;
};

const pickErrorMessage = (err) => {
  const body = err?.response?.data;
  if (!body) return err?.message || "Đặt lại mật khẩu thất bại.";
  if (typeof body.message === "string") return body.message;
  if (Array.isArray(body.message)) return body.message.join(", ");
  if (typeof body.error === "string") return body.error;
  return "Mã xác nhận không hợp lệ. Vui lòng thử lại.";
};

const ForgotPasswordConfirm = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const initialEmail = location?.state?.email || "";

  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [touched, setTouched] = useState({
    email: false,
    code: false,
    newPassword: false,
    confirmPassword: false,
  });

  const [errors, setErrors] = useState({
    email: null,
    code: null,
    newPassword: null,
    confirmPassword: null,
  });

  const [formError, setFormError] = useState("");
  const [, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const normalizedEmail = useMemo(() => String(email ?? "").trim(), [email]);

  useEffect(() => {
    if (!initialEmail) {
      navigate("/forgot-password", { replace: true });
      return;
    }
    setEmail(initialEmail);
  }, [initialEmail, navigate]);

  const setFieldError = (field, message) => {
    setErrors((prev) => ({ ...prev, [field]: message }));
  };

  const validateConfirmPassword = (raw) => {
    const v = String(raw ?? "");
    if (!v.trim()) return "Vui lòng xác nhận mật khẩu mới.";
    if (v !== newPassword) return "Mật khẩu xác nhận không khớp.";
    return null;
  };

  const showEmailError = touched.email && errors.email;
  const showCodeError = touched.code && errors.code;
  const showNewPasswordError = touched.newPassword && errors.newPassword;
  const showConfirmPasswordError =
    touched.confirmPassword && errors.confirmPassword;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    setSuccess("");

    const emailErr = validateEmail(email);
    const codeErr = validateCode(code);
    const passErr = validatePassword(newPassword);
    const confirmErr = (() => {
      const base = validateConfirmPassword(confirmPassword);
      if (base) return base;
      const passBase = validatePassword(newPassword);
      return passBase ? "Mật khẩu mới chưa hợp lệ." : null;
    })();

    setTouched({
      email: true,
      code: true,
      newPassword: true,
      confirmPassword: true,
    });
    setErrors({
      email: emailErr,
      code: codeErr,
      newPassword: passErr,
      confirmPassword: confirmErr,
    });

    if (emailErr || codeErr || passErr || confirmErr) return;

    setLoading(true);
    try {
      await AuthAPI.resetPasswordAPI(
        normalizedEmail,
        String(code).trim(),
        newPassword,
      );
      const message = "Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.";
      setSuccess(message);
      toast.success(message);
      setTimeout(() => navigate("/login", { replace: true }), 2100);
    } catch (err) {
      const msg = pickErrorMessage(err);
      setFormError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setFormError("");
    setSuccess("");

    const emailErr = validateEmail(email);
    setTouched((t) => ({ ...t, email: true }));
    setFieldError("email", emailErr);
    if (emailErr) return;

    setResending(true);
    try {
      await AuthAPI.forgotPasswordAPI(normalizedEmail);
      const message = "Mã xác nhận đã được gửi lại tới email của bạn.";
      setSuccess(message);
      toast.success(message);
    } catch (err) {
      const msg = pickErrorMessage(err);
      setFormError(msg);
      toast.error(msg);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="form-wrapper forgot-password-page">
      <h1 className="title">Xác nhận đặt lại mật khẩu</h1>
      <p className="subtitle">
        Nhập mã xác nhận trong email và mật khẩu mới bạn muốn đặt lại.
      </p>

      <form className="forgot-form" onSubmit={handleSubmit} noValidate>
        {formError ? (
          <p
            className="forgot-form__error forgot-form__error--global"
            role="alert"
          >
            {formError}
          </p>
        ) : null}

        <div
          className={`input-group ${showEmailError ? "input-group--invalid" : ""}`}
        >
          <input
            id="reset-email"
            type="email"
            name="email"
            placeholder="Email"
            value={email}
            readOnly
            disabled
            autoComplete="email"
            aria-invalid={showEmailError ? "true" : "false"}
          />
          {showEmailError ? (
            <p className="input-group__error" role="alert">
              {errors.email}
            </p>
          ) : null}
        </div>

        <div
          className={`input-group ${showCodeError ? "input-group--invalid" : ""}`}
        >
          <input
            id="reset-code"
            type="text"
            name="code"
            placeholder="Mã xác nhận"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setFormError("");
              setSuccess("");
              if (touched.code)
                setFieldError("code", validateCode(e.target.value));
            }}
            onBlur={() => {
              setTouched((t) => ({ ...t, code: true }));
              setFieldError("code", validateCode(code));
            }}
            autoComplete="one-time-code"
            aria-invalid={showCodeError ? "true" : "false"}
            disabled={loading}
          />
          {showCodeError ? (
            <p className="input-group__error" role="alert">
              {errors.code}
            </p>
          ) : null}
        </div>

        <div
          className={`input-group ${showNewPasswordError ? "input-group--invalid" : ""}`}
        >
          <input
            id="reset-new-password"
            type="password"
            name="newPassword"
            placeholder="Mật khẩu mới"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setFormError("");
              setSuccess("");
              if (touched.newPassword)
                setFieldError("newPassword", validatePassword(e.target.value));
              if (touched.confirmPassword)
                setFieldError(
                  "confirmPassword",
                  validateConfirmPassword(confirmPassword),
                );
            }}
            onBlur={() => {
              setTouched((t) => ({ ...t, newPassword: true }));
              setFieldError("newPassword", validatePassword(newPassword));
            }}
            autoComplete="new-password"
            aria-invalid={showNewPasswordError ? "true" : "false"}
            disabled={loading}
          />
          {showNewPasswordError ? (
            <p className="input-group__error" role="alert">
              {errors.newPassword}
            </p>
          ) : null}
        </div>

        <div
          className={`input-group ${
            showConfirmPasswordError ? "input-group--invalid" : ""
          }`}
        >
          <input
            id="reset-confirm-password"
            type="password"
            name="confirmPassword"
            placeholder="Nhập lại mật khẩu mới"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setFormError("");
              setSuccess("");
              if (touched.confirmPassword)
                setFieldError(
                  "confirmPassword",
                  validateConfirmPassword(e.target.value),
                );
            }}
            onBlur={() => {
              setTouched((t) => ({ ...t, confirmPassword: true }));
              setFieldError(
                "confirmPassword",
                validateConfirmPassword(confirmPassword),
              );
            }}
            autoComplete="new-password"
            aria-invalid={showConfirmPasswordError ? "true" : "false"}
            disabled={loading}
          />
          {showConfirmPasswordError ? (
            <p className="input-group__error" role="alert">
              {errors.confirmPassword}
            </p>
          ) : null}
        </div>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Đang xác nhận..." : "Đặt lại mật khẩu"}
        </button>

        <div className="forgot-form__footer forgot-form__footer--split">
          <button
            type="button"
            className="forgot-link-button"
            onClick={handleResendCode}
            disabled={loading || resending}
          >
            {resending ? "Đang gửi lại..." : "Gửi lại mã"}
          </button>
          <Link to="/login">Đăng nhập</Link>
        </div>
      </form>
    </div>
  );
};

export default ForgotPasswordConfirm;
