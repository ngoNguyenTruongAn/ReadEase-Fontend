import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./SelectRolePage.scss";
import ChildrenAPI from "../../../../service/Children/ChildrenAPI";

const SelectRolePage = () => {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [inviteMeta, setInviteMeta] = useState({
    inviteCode: "",
    expiresAt: "",
    isExpired: false,
    isLinked: false,
  });

  const email = useMemo(() => localStorage.getItem("registerEmail") || "", []);
  const localInviteCode = useMemo(
    () => localStorage.getItem("inviteCode") || "",
    [],
  );
  const inviteCode = inviteMeta.inviteCode || localInviteCode;

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setLoadingInvite(true);
      setInviteError("");
      try {
        const res = await ChildrenAPI.getInviteCode();
        const data = res?.data ?? res ?? {};
        const code = String(data?.inviteCode || "").trim();
        if (!mounted) return;
        setInviteMeta({
          inviteCode: code,
          expiresAt: data?.expiresAt || "",
          isExpired: Boolean(data?.isExpired),
          isLinked: Boolean(data?.isLinked),
        });
        if (code) localStorage.setItem("inviteCode", code);
      } catch (e) {
        if (!mounted) return;
        const body = e?.response?.data;
        const apiErr = body?.error;
        const detail =
          (Array.isArray(apiErr?.details) && apiErr.details[0]) ||
          (Array.isArray(body?.details) && body.details[0]) ||
          null;
        setInviteError(
          detail ||
            apiErr?.message ||
            body?.message ||
            e?.message ||
            "Không lấy được mã mời. Vui lòng thử lại.",
        );
      } finally {
        if (mounted) setLoadingInvite(false);
      }
    };

    // Luôn thử gọi để lấy lại mã mời (dựa vào JWT), kể cả khi localStorage đã có.
    run();
    return () => {
      mounted = false;
    };
  }, []);

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
            disabled={!inviteCode || loadingInvite}
          >
            {copied ? "Đã copy" : "Copy mã"}
          </button>
        </div>

        <div className="invite-code" aria-live="polite">
          {loadingInvite ? "Đang tải..." : inviteCode || "Không tìm thấy mã mời"}
        </div>

        {inviteError ? <p className="invite-error">{inviteError}</p> : null}
        {!inviteError && inviteMeta.expiresAt ? (
          <p className="invite-meta">
            Hết hạn: <strong>{String(inviteMeta.expiresAt)}</strong>
            {inviteMeta.isExpired ? " (Đã hết hạn)" : ""}
            {inviteMeta.isLinked ? " • Đã liên kết" : ""}
          </p>
        ) : null}

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
