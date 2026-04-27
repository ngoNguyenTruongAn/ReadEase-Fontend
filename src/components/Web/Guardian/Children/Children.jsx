import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import GuardianAPI from "../../../../service/Guardian/GuardianAPI";
import "./Children.scss";

const Children = () => {
  const [inviteCode, setInviteCode] = useState("");
  const [linking, setLinking] = useState(false);

  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState([]);
  const [error, setError] = useState("");

  const columns = useMemo(
    () => [
      { key: "email", label: "Email" },
      { key: "display_name", label: "Tên hiển thị" },
      { key: "is_active", label: "Kích hoạt" },
      { key: "created_at", label: "Ngày tạo" },
      { key: "consent_given_at", label: "Xác nhận lúc" },
      { key: "consent_type", label: "Kiểu xác nhận" },
      { key: "date_of_birth", label: "Ngày sinh" },
      { key: "grade_level", label: "Khối lớp" },
    ],
    [],
  );

  const normalizeChildren = (res) => {
    const data = res?.data ?? res;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.children)) return data.children;
    if (Array.isArray(data?.items)) return data.items;
    return [];
  };

  const formatDateTime = (input) => {
    if (!input) return "—";

    const d = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(d.getTime())) return String(input);

    // dd/MM/yyyy HH:mm (24h) theo locale vi-VN
    const datePart = new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(d);

    const timePart = new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);

    return `${datePart} ${timePart}`;
  };

  const formatCell = (key, value) => {
    if (value === null || value === undefined || value === "") return "—";
    if (key === "is_active") return value ? "Có" : "Không";
    if (key === "created_at" || key === "consent_given_at") {
      return formatDateTime(value);
    }
    return String(value);
  };

  const fetchChildren = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await GuardianAPI.getChildren();
      setChildren(normalizeChildren(res));
      console.log(normalizeChildren(res));
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Không lấy được danh sách tài khoản của con.";
      setError(Array.isArray(msg) ? msg.join(", ") : msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChildren();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLinkChild = async (e) => {
    e.preventDefault();
    const code = inviteCode.trim();
    if (!code || linking) return;

    setLinking(true);
    try {
      const res = await GuardianAPI.postLinkChild(code);
      toast.success(res?.message || "Liên kết tài khoản con thành công.");
      setInviteCode("");
      await fetchChildren();
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Liên kết thất bại. Vui lòng thử lại.";
      toast.error(Array.isArray(msg) ? msg.join(", ") : msg);
    } finally {
      setLinking(false);
    }
  };

  return (
    <div className="gch">
      <div className="gch-header">
        <div>
          <div className="gch-title">Tài khoản của con</div>
          <div className="gch-subtitle">
            Nhập mã mời để xác nhận/liên kết tài khoản cho con, và xem danh sách
            tất cả tài khoản đã liên kết.
          </div>
        </div>

        <button
          type="button"
          className="gch-refresh"
          onClick={fetchChildren}
          disabled={loading}
        >
          {loading ? "Đang tải..." : "Tải lại"}
        </button>
      </div>

      <form className="gch-card gch-link" onSubmit={handleLinkChild}>
        <div className="gch-card__title">Xác nhận tài khoản cho con</div>
        <div className="gch-link__row">
          <label className="gch-field">
            <span className="gch-field__label">Mã mời (inviteCode)</span>
            <input
              className="gch-field__input"
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
              placeholder="VD: 65A851F3"
              autoComplete="off"
            />
          </label>
          <button
            type="submit"
            className="gch-primary"
            disabled={!inviteCode.trim() || linking}
          >
            {linking ? "Đang xác nhận..." : "Xác nhận"}
          </button>
        </div>
      </form>

      <div className="gch-card">
        <div className="gch-card__title">Danh sách tài khoản đã liên kết</div>

        {error ? <div className="gch-error">{error}</div> : null}

        {loading ? (
          <div className="gch-empty">Đang tải danh sách...</div>
        ) : children.length === 0 ? (
          <div className="gch-empty">
            Chưa có tài khoản con nào được liên kết.
          </div>
        ) : (
          <div className="gch-tableWrap">
            <table className="gch-table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {children.map((row) => (
                  <tr key={row?.id || row?.email || JSON.stringify(row)}>
                    {columns.map((c) => (
                      <td key={c.key} title={formatCell(c.key, row?.[c.key])}>
                        {formatCell(c.key, row?.[c.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Children;
