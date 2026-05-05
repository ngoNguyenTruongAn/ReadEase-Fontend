import React, { useEffect, useMemo, useState, useCallback } from "react";
import GuardianAPI from "../../../../service/Guardian/GuardianAPI";
import { humanizeApiError } from "../../../../service/instance";
import "./Patients.scss";

const Patients = () => {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState([]);
  const [error, setError] = useState("");

  const columns = useMemo(
    () => [
      { key: "email", label: "Email" },
      { key: "display_name", label: "Tên hiển thị" },
      { key: "is_active", label: "Kích hoạt" },
      { key: "created_at", label: "Ngày tạo" },
      { key: "date_of_birth", label: "Ngày sinh" },
      { key: "grade_level", label: "Khối lớp" },
      { key: "token_balance", label: "Số dư token" },
      { key: "session_count", label: "Số phiên đọc" },
      { key: "last_session_at", label: "Phiên gần nhất" },
      { key: "guardian_name", label: "Người giám hộ" },
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
    if (
      key === "created_at" ||
      key === "date_of_birth" ||
      key === "last_session_at"
    ) {
      return formatDateTime(value);
    }
    if (key === "token_balance" || key === "session_count") {
      const n = Number(value);
      return Number.isFinite(n) ? String(n) : String(value);
    }
    return String(value);
  };

  const fetchChildren = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await GuardianAPI.getChildren();
      setChildren(normalizeChildren(res));
    } catch (err) {
      setError(
        humanizeApiError(err, "Không lấy được danh sách trẻ."),
      );
      setChildren([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChildren();
  }, [fetchChildren]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return children;
    return children.filter((it) =>
      [it.id, it.email, it.display_name, it.guardian_name, it.grade_level].some(
        (v) =>
          String(v ?? "")
            .toLowerCase()
            .includes(s),
      ),
    );
  }, [children, q]);

  return (
    <div className="clp">
      <div className="clp-header">
        <div>
          <div className="clp-title">Danh sách bệnh nhân</div>
          <div className="clp-subtitle">
            Danh sách trẻ: token, số phiên đọc, phiên gần nhất và người giám hộ
            theo dữ liệu tổng hợp từ máy chủ.
          </div>
        </div>

        <button
          type="button"
          className="clp-refresh"
          onClick={fetchChildren}
          disabled={loading}
        >
          {loading ? "Đang tải..." : "Tải lại"}
        </button>
      </div>

      <div className="clp-card clp-filter">
        <div className="clp-card__title">Tìm kiếm</div>
        <label className="clp-field">
          <span className="clp-field__label">Từ khóa</span>
          <input
            className="clp-field__input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ID, email, tên, người giám hộ, khối lớp..."
            autoComplete="off"
          />
        </label>
      </div>

      <div className="clp-card">
        <div className="clp-card__title">Kết quả</div>

        {error ? <div className="clp-error">{error}</div> : null}

        {loading ? (
          <div className="clp-empty">Đang tải danh sách...</div>
        ) : filtered.length === 0 ? (
          <div className="clp-empty">Không có dữ liệu phù hợp.</div>
        ) : (
          <div className="clp-tableWrap">
            <table className="clp-table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr key={row?.id ?? row?.email ?? JSON.stringify(row)}>
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

export default Patients;
