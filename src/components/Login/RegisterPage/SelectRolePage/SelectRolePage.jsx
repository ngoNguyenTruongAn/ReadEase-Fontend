import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./SelectRolePage.scss";

const SelectRolePage = () => {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const email = useMemo(() => localStorage.getItem("registerEmail") || "", []);
  const inviteCode = useMemo(
    () => localStorage.getItem("inviteCode") || "",
    [],
  );

  const copyInviteCode = async () => {
    if (!inviteCode) return;
    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = inviteCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  };

  return (
    <div className="select-role-wrapper waiting-view">
      <h1 className="title success-title">Tài khoản của bạn đã được tạo!</h1>

      <p className="subtitle">
        {email ? (
          <>
            Email <strong>{email}</strong> đã xác thực. Hãy gửi mã mời dưới đây
            cho phụ huynh để liên kết tài khoản.
          </>
        ) : (
          <>Hãy gửi mã mời dưới đây cho phụ huynh để liên kết tài khoản.</>
        )}
      </p>

      <div className="invite-box" role="group" aria-label="Mã mời phụ huynh">
        <div className="invite-row">
          <span className="invite-label">Mã mời</span>
          <button
            type="button"
            className="invite-copy-btn"
            onClick={copyInviteCode}
            disabled={!inviteCode}
          >
            {copied ? "Đã copy" : "Copy mã"}
          </button>
        </div>

        <div className="invite-code" aria-live="polite">
          {inviteCode || "Không tìm thấy mã mời"}
        </div>

        <p className="invite-hint">
          Phụ huynh nhập mã này ở màn hình liên kết tài khoản.
        </p>
      </div>

      <button
        type="button"
        className="btn-confirm"
        onClick={() => navigate("/login")}
      >
        Quay lại Đăng nhập
      </button>
    </div>
  );
};

export default SelectRolePage;
