import React, { useMemo, useRef, useState } from "react";
import "./VerifyEmailPage.scss";
import { useNavigate } from "react-router-dom";

const VerifyEmailPage = () => {
  const codeLength = 6;
  const [digits, setDigits] = useState(() => Array(codeLength).fill(""));
  const inputsRef = useRef([]);
  const navigate = useNavigate();
  const email = useMemo(() => "email@gmail.com", []);

  const focusIndex = (idx) => {
    const el = inputsRef.current[idx];
    if (!el) return;
    el.focus();
    el.select?.();
  };

  const setDigitAt = (idx, value) => {
    setDigits((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  };

  const handleChange = (idx) => (e) => {
    const raw = e.target.value ?? "";
    const onlyDigits = String(raw).replace(/\D/g, "");

    if (!onlyDigits) {
      setDigitAt(idx, "");
      return;
    }

    // Nếu user paste nhiều số vào 1 ô, tự rải qua các ô tiếp theo
    const chars = onlyDigits.slice(0, codeLength - idx).split("");
    setDigits((prev) => {
      const next = [...prev];
      chars.forEach((c, i) => {
        next[idx + i] = c;
      });
      return next;
    });

    const nextIndex = Math.min(idx + chars.length, codeLength - 1);
    focusIndex(nextIndex);
  };

  const handleKeyDown = (idx) => (e) => {
    if (e.key === "Backspace") {
      if (digits[idx]) {
        setDigitAt(idx, "");
        return;
      }
      if (idx > 0) focusIndex(idx - 1);
    }

    if (e.key === "ArrowLeft" && idx > 0) focusIndex(idx - 1);
    if (e.key === "ArrowRight" && idx < codeLength - 1) focusIndex(idx + 1);
  };

  const handlePaste = (idx) => (e) => {
    const text = e.clipboardData?.getData("text") ?? "";
    const onlyDigits = text.replace(/\D/g, "");
    if (!onlyDigits) return;
    e.preventDefault();

    const chars = onlyDigits.slice(0, codeLength - idx).split("");
    setDigits((prev) => {
      const next = [...prev];
      chars.forEach((c, i) => {
        next[idx + i] = c;
      });
      return next;
    });

    const nextIndex = Math.min(idx + chars.length, codeLength - 1);
    focusIndex(nextIndex);
  };

  const code = digits.join("");
  const canSubmit = code.length === codeLength && digits.every(Boolean);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    // TODO: gọi API verify OTP tại đây
    console.log("Verify code:", code);
  };

  return (
    <div className="validate-page">
      <div className="validate-wrapper">
        <h1 className="validate-title">Chờ một chút nhé,</h1>
        <p className="validate-subtitle">
          Một đoạn code đã gửi về <span className="email">{email}</span> của
          bạn, vui lòng nhập vào dưới đây!
        </p>

        <form className="validate-form" onSubmit={handleSubmit}>
          <div className="otp-row" aria-label="Mã xác thực gồm 6 chữ số">
            {digits.map((d, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  inputsRef.current[idx] = el;
                }}
                className="otp-input"
                inputMode="numeric"
                autoComplete={idx === 0 ? "one-time-code" : "off"}
                aria-label={`Chữ số thứ ${idx + 1}`}
                maxLength={codeLength}
                value={d}
                onChange={handleChange(idx)}
                onKeyDown={handleKeyDown(idx)}
                onPaste={handlePaste(idx)}
              />
            ))}
          </div>

          <button
            className="btn-validate"
            type="submit"
            disabled={!canSubmit}
            onClick={() => navigate("/select-role")}
          >
            Xác thực
          </button>
        </form>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
