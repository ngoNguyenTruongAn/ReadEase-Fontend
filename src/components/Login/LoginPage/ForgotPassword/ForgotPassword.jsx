import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthAPI from "../../../../service/Auth/AuthAPI";
import { toast } from "react-toastify";
import "./ForgotPassword.scss";

const EMAIL_REGEX =
  /^[a-zA-Z0-9](?:[a-zA-Z0-9._%+-]*[a-zA-Z0-9])?@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/;

const MAX_EMAIL_LEN = 254;

const validateEmail = (raw) => {
  const value = String(raw ?? "").trim();
  if (!value) return "Vui lòng nhập email.";
  if (value.length > MAX_EMAIL_LEN)
    return `Email không được vượt quá ${MAX_EMAIL_LEN} ký tự.`;
  if (!EMAIL_REGEX.test(value)) return "Email không đúng định dạng.";
  return null;
};

const pickErrorMessage = (err) => {
  const body = err?.response?.data;
  if (!body) return err?.message || "Gửi yêu cầu đặt lại mật khẩu thất bại.";
  if (typeof body.message === "string") return body.message;
  if (Array.isArray(body.message)) return body.message.join(", ");
  if (typeof body.error === "string") return body.error;
  return "Gửi yêu cầu đặt lại mật khẩu thất bại.";
};

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [emailError, setEmailError] = useState(null);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const emailId = "forgot-email";
  const emailErrId = "forgot-email-error";

  const normalizedEmail = useMemo(() => String(email ?? "").trim(), [email]);
  const showEmailError = touched && emailError;

  const handleEmailBlur = () => {
    setTouched(true);
    setEmailError(validateEmail(email));
  };

  const handleEmailChange = (e) => {
    const v = e.target.value;
    setEmail(v);
    setFormError("");
    setSuccess("");
    if (touched) setEmailError(validateEmail(v));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");
    setSuccess("");

    const err = validateEmail(email);
    setTouched(true);
    setEmailError(err);
    if (err) return;

    setLoading(true);
    try {
      await AuthAPI.forgotPasswordAPI(normalizedEmail);
      const message = "Mã xác nhận đã được gửi tới email của bạn.";
      setSuccess(message);
      toast.success(message);
      navigate("/forgot-password/confirm", {
        replace: false,
        state: { email: normalizedEmail },
      });
    } catch (error) {
      const msg = pickErrorMessage(error);
      setFormError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="form-wrapper forgot-password-page">
      <h1 className="title">Quên mật khẩu</h1>
      <p className="subtitle">
        Nhập email tài khoản. Chúng tôi sẽ gửi mã xác nhận để đặt lại mật khẩu.
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

        {success ? (
          <p className="forgot-form__success" role="status">
            {success}
          </p>
        ) : null}

        <div
          className={`input-group ${showEmailError ? "input-group--invalid" : ""}`}
        >
          <input
            id={emailId}
            type="email"
            name="email"
            placeholder="Email của bạn"
            value={email}
            onChange={handleEmailChange}
            onBlur={handleEmailBlur}
            autoComplete="email"
            aria-invalid={showEmailError ? "true" : "false"}
            aria-describedby={showEmailError ? emailErrId : undefined}
            disabled={loading}
          />
          {showEmailError ? (
            <p id={emailErrId} className="input-group__error" role="alert">
              {emailError}
            </p>
          ) : null}
        </div>

        <button type="submit" className="btn-primary" disabled={loading}>
          {loading ? "Đang gửi..." : "Gửi mã xác nhận"}
        </button>

        <div className="forgot-form__footer">
          <Link to="/login">Quay lại đăng nhập</Link>
        </div>
      </form>
    </div>
  );
};

export default ForgotPassword;
