import React, { useEffect, useMemo, useState, useCallback } from "react";
import GuardianAPI from "../../../../service/Guardian/GuardianAPI";
import { humanizeApiError } from "../../../../service/instance";
import "./Patients.scss";

const guardianSourceKeys = [
  "guardians",
  "guardian",
  "guardianList",
  "guardian_list",
  "linkedGuardians",
  "linked_guardians",
  "childGuardians",
  "child_guardians",
  "childGuardian",
  "child_guardian",
  "parents",
  "parent",
  "parentList",
  "parent_list",
  "linkedParents",
  "linked_parents",
  "caregivers",
  "caregiver",
];

const guardianNestedKeys = [
  "guardian",
  "parent",
  "caregiver",
  "user",
  "account",
  "profile",
  "guardianUser",
  "guardian_user",
  "parentUser",
  "parent_user",
];

const textOrEmpty = (value) => String(value ?? "").trim();

const compactName = (...values) =>
  values.map(textOrEmpty).filter(Boolean).join(" ").trim();

const toList = (value) => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const guardianNameFrom = (value, seen = new Set()) => {
  if (!value) return "";
  if (typeof value === "string") return textOrEmpty(value);
  if (typeof value !== "object") return "";
  if (seen.has(value)) return "";
  seen.add(value);

  const name =
    textOrEmpty(value.guardian_name) ||
    textOrEmpty(value.guardianName) ||
    textOrEmpty(value.guardian_full_name) ||
    textOrEmpty(value.guardianFullName) ||
    textOrEmpty(value.parent_name) ||
    textOrEmpty(value.parentName) ||
    textOrEmpty(value.caregiver_name) ||
    textOrEmpty(value.caregiverName) ||
    textOrEmpty(value.display_name) ||
    textOrEmpty(value.displayName) ||
    textOrEmpty(value.full_name) ||
    textOrEmpty(value.fullName) ||
    compactName(value.first_name, value.last_name) ||
    compactName(value.firstName, value.lastName) ||
    textOrEmpty(value.name) ||
    textOrEmpty(value.username) ||
    textOrEmpty(value.userName) ||
    textOrEmpty(value.email) ||
    textOrEmpty(value.guardian_email) ||
    textOrEmpty(value.guardianEmail) ||
    textOrEmpty(value.parent_email) ||
    textOrEmpty(value.parentEmail);

  if (name) return name;

  for (const key of guardianNestedKeys) {
    const nestedName = guardianNameFrom(value?.[key], seen);
    if (nestedName) return nestedName;
  }

  return "";
};

const collectGuardianSources = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return [value];
  if (typeof value !== "object") return [value];

  const sources = [];
  for (const key of guardianSourceKeys) {
    if (value?.[key]) sources.push(value[key]);
  }
  return sources;
};

const resolveGuardianName = (row) => {
  const seen = new Set();
  const directName =
    textOrEmpty(row?.guardian_name) ||
    textOrEmpty(row?.guardianName) ||
    textOrEmpty(row?.guardian_full_name) ||
    textOrEmpty(row?.guardianFullName) ||
    textOrEmpty(row?.parent_name) ||
    textOrEmpty(row?.parentName) ||
    textOrEmpty(row?.caregiver_name) ||
    textOrEmpty(row?.caregiverName) ||
    textOrEmpty(row?.guardian_email) ||
    textOrEmpty(row?.guardianEmail) ||
    textOrEmpty(row?.parent_email) ||
    textOrEmpty(row?.parentEmail);

  return [directName, ...collectGuardianSources(row)]
    .flatMap(toList)
    .map((item) => guardianNameFrom(item))
    .map(textOrEmpty)
    .filter(Boolean)
    .filter((name) => {
      const key = name.toLocaleLowerCase("vi-VN");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 2)
    .join(", ");
};

const Patients = () => {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [children, setChildren] = useState([]);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const columns = useMemo(
    () => [
      { key: "email", label: "Email" },
      { key: "display_name", label: "Tên hiển thị" },
      { key: "is_active", label: "Kích hoạt" },
      { key: "created_at", label: "Ngày tạo" },
      { key: "token_balance", label: "Số dư token" },
      { key: "session_count", label: "Số phiên đọc" },
      { key: "last_session_at", label: "Phiên gần nhất" },
      { key: "guardian_name", label: "Người giám hộ" },
    ],
    [],
  );

  const normalizeChildren = (res) => {
    const data = res?.data ?? res;
    const rows = Array.isArray(data)
      ? data
      : Array.isArray(data?.children)
        ? data.children
        : Array.isArray(data?.items)
          ? data.items
          : [];

    return rows.map((row) => ({
      ...row,
      guardian_name: resolveGuardianName(row),
    }));
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
      [it.id, it.email, it.display_name, it.guardian_name].some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(s),
      ),
    );
  }, [children, q]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = filtered.length ? (safePage - 1) * pageSize : 0;
  const pageEnd = Math.min(pageStart + pageSize, filtered.length);
  const visibleRows = filtered.slice(pageStart, pageEnd);

  useEffect(() => {
    setPage(1);
  }, [q]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="clp">
      <div className="clp-header">
        <div>
          <div className="clp-title">Danh sách bệnh nhân</div>
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
            placeholder="ID, email, tên, người giám hộ..."
            autoComplete="off"
          />
        </label>
      </div>

      <div className="clp-card clp-results">
        <div className="clp-card__title clp-results__title">Kết quả</div>

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
                {visibleRows.map((row) => (
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

        {!loading && !error && filtered.length > 0 ? (
          <div className="clp-pagination">
            <div className="clp-pagination__meta">
              Hiển thị {pageStart + 1}-{pageEnd} / {filtered.length}
            </div>
            <div className="clp-pagination__controls">
              <button
                type="button"
                className="clp-pageBtn"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage === 1}
              >
                Trước
              </button>
              <span className="clp-pagination__page">
                Trang {safePage} / {totalPages}
              </span>
              <button
                type="button"
                className="clp-pageBtn"
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                disabled={safePage === totalPages}
              >
                Sau
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default Patients;
