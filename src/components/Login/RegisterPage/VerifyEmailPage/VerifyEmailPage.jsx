import React, { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthAPI from "../../../../service/Auth/AuthAPI";
import "./VerifyEmailPage.scss";

const VerifyEmailPage = () => {
  const codeLength = 6;
  const navigate = useNavigate();
  const inputsRef = useRef([]);

  const [digits, setDigits] = useState(Array(codeLength).fill(""));
  const [loading, setLoading] = useState(false);

  // Lấy thông tin từ localStorage đã lưu lúc Register
  const email = useMemo(() => localStorage.getItem("registerEmail") || "", []);
  const registerRole = useMemo(
    () => localStorage.getItem("registerRole") || "",
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
      await AuthAPI.verifyOTPAPI(email, code);

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
        </form>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
