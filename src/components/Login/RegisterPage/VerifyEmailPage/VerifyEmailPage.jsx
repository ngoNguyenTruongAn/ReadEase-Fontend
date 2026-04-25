import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthAPI from "../../../../service/Auth/AuthAPI";
import "./VerifyEmailPage.scss";

const VerifyEmailPage = () => {
  const codeLength = 6;
  const navigate = useNavigate();
  const inputsRef = useRef([]);

  const [digits, setDigits] = useState(Array(codeLength).fill(""));
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendMessage, setResendMessage] = useState("");

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => {
      setResendCooldown((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  // Lấy thông tin từ localStorage đã lưu lúc Register
  const email = useMemo(() => localStorage.getItem("registerEmail") || "", []);
  const registerRole = useMemo(
    () => localStorage.getItem("registerRole") || "",
    [],
  );
  const registerDisplayName = useMemo(
    () => localStorage.getItem("registerUserName") || "",
    [],
  );

  const handleInput = (idx, value) => {
    const val = value.replace(/\D/g, "").slice(-1);
    const newDigits = [...digits];
    newDigits[idx] = val;
    setDigits(newDigits);

    if (val && idx < codeLength - 1) inputsRef.current[idx + 1].focus();
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputsRef.current[idx - 1].focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasteData = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, codeLength);
    const newDigits = [...digits];

    pasteData.split("").forEach((char, i) => {
      if (newDigits[i] !== undefined) newDigits[i] = char;
    });

    setDigits(newDigits);
    const nextFocus =
      pasteData.length < codeLength ? pasteData.length : codeLength - 1;
    inputsRef.current[nextFocus].focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const code = digits.join("");
    if (code.length !== codeLength || loading) return;

    try {
      setLoading(true);

      // Gọi API xác thực
      const verifyRes = await AuthAPI.verifyOTPAPI(email, code);
      const data = verifyRes?.data;

      const accessToken = data?.accessToken;
      const refreshToken = data?.refreshToken;
      const inviteCode = data?.inviteCode;
      const roleFromApi = data?.user?.role;

      if (accessToken) localStorage.setItem("access_token", accessToken);
      if (refreshToken) localStorage.setItem("refresh_token", refreshToken);
      if (inviteCode) localStorage.setItem("inviteCode", inviteCode);
      if (roleFromApi) localStorage.setItem("role", roleFromApi);
      sessionStorage.removeItem("registerPendingPassword");

      // --- LOGIC ĐIỀU HƯỚNG ---
      // Nếu role ban đầu chọn là child (ROLE_READER) -> Vào SelectRolePage
      if (registerRole === "ROLE_CHILD") {
        navigate("/select-role");
      }
      // Các trường hợp còn lại (Parent/Lecturer) -> Vào ChildrenLayout
      else {
        navigate("/children");
      }

      // Sau khi điều hướng thành công, có thể xóa email/role tạm để bảo mật
      // localStorage.removeItem("registerEmail");
      // localStorage.removeItem("registerRole");
    } catch (error) {
      const msg =
        error?.response?.data?.message || "Mã xác thực không chính xác.";
      window.alert(Array.isArray(msg) ? msg.join(", ") : msg);
    } finally {
      setLoading(false);
    }
  };

  const pickResendError = (err) => {
    if (typeof err?.message === "string" && err.message) return err.message;
    const body = err?.response?.data;
    const apiErr = body?.error;
    return (
      (Array.isArray(apiErr?.details) && apiErr.details[0]) ||
      (typeof apiErr?.message === "string" && apiErr.message) ||
      (typeof body?.message === "string" && body.message) ||
      (Array.isArray(body?.message) && body.message.join(", ")) ||
      "Không gửi lại được mã. Vui lòng thử sau."
    );
  };

  const handleResend = async () => {
    const trimmed = email.trim();
    if (!trimmed || resendLoading || resendCooldown > 0) return;
    const password = sessionStorage.getItem("registerPendingPassword") || "";
    const displayName = registerDisplayName.trim();
    const role = registerRole;
    if (!password || !displayName || !role) {
      window.alert(
        "Không thể gửi lại mã trong phiên này. Vui lòng quay lại trang đăng ký và đăng ký lại.",
      );
      return;
    }
    setResendMessage("");
    setResendLoading(true);
    try {
      await AuthAPI.registerAPI(trimmed, password, displayName, role);
      setResendMessage("Đã gửi lại mã. Kiểm tra hộp thư (và thư mục spam).");
      setResendCooldown(60);
    } catch (err) {
      window.alert(pickResendError(err));
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="validate-page">
      <div className="validate-wrapper">
        <h1 className="validate-title">Xác thực Email</h1>
        <p className="validate-subtitle">
          Mã xác thực đã được gửi tới <span className="email">{email}</span>
        </p>

        <form className="validate-form" onSubmit={handleSubmit}>
          <div className="otp-row" onPaste={handlePaste}>
            {digits.map((d, idx) => (
              <input
                key={idx}
                ref={(el) => (inputsRef.current[idx] = el)}
                className="otp-input"
                value={d}
                inputMode="numeric"
                maxLength={1}
                onChange={(e) => handleInput(idx, e.target.value)}
                onKeyDown={(e) => handleKeyDown(idx, e)}
              />
            ))}
          </div>

          <button
            className="btn-validate"
            type="submit"
            disabled={digits.some((d) => !d) || loading}
          >
            {loading ? "Đang xử lý..." : "Xác thực ngay"}
          </button>

          <div className="validate-resend">
            <div className="validate-resend-row">
              <span className="validate-resend-hint">Chưa nhận được mã?</span>
              <button
                type="button"
                className="validate-resend-btn"
                disabled={
                  !email.trim() || resendLoading || resendCooldown > 0
                }
                onClick={handleResend}
              >
                {resendLoading
                  ? "Đang gửi..."
                  : resendCooldown > 0
                    ? `Gửi lại sau (${resendCooldown}s)`
                    : "Gửi lại mã"}
              </button>
            </div>
            {resendMessage ? (
              <p className="validate-resend-success" role="status">
                {resendMessage}
              </p>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
