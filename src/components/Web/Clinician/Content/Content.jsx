import React, { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import ClinicianAPI from "../../../../service/Clinician/ClinicianAPI";
import "./Content.scss";

const difficultyOptions = [
  { value: "EASY", label: "EASY" },
  { value: "MEDIUM", label: "MEDIUM" },
  { value: "HARD", label: "HARD" },
];

const normalizeList = (res) => {
  const data = res?.data ?? res;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.contents)) return data.contents;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const getErrorMessage = (err, fallback) => {
  const data = err?.response?.data;

  const msgCandidates = [
    data?.message,
    data?.error,
    data?.errors,
    data?.detail,
    err?.message,
  ];

  for (const m of msgCandidates) {
    if (!m) continue;
    if (typeof m === "string") return m;
    if (Array.isArray(m)) return m.filter(Boolean).join(", ");
    if (typeof m === "object") {
      if (typeof m.message === "string") return m.message;
      if (Array.isArray(m.message)) return m.message.filter(Boolean).join(", ");
      if (Array.isArray(m.errors)) return m.errors.filter(Boolean).join(", ");
      const vals = Object.values(m).flat().filter(Boolean);
      if (vals.length) return vals.map(String).join(", ");
    }
  }

  return fallback;
};

const Content = () => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  // create form
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [difficulty, setDifficulty] = useState("EASY");
  const [ageGroup, setAgeGroup] = useState("");
  const [coverUrl, setCoverUrl] = useState("");

  // edit state
  const [editingId, setEditingId] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editDifficulty, setEditDifficulty] = useState("EASY");
  const [editAgeGroup, setEditAgeGroup] = useState("");
  const [editCoverUrl, setEditCoverUrl] = useState("");

  const columns = useMemo(
    () => [
      { key: "title", label: "Tiêu đề" },
      { key: "difficulty", label: "Độ khó" },
      { key: "age_group", label: "Nhóm tuổi" },
      { key: "created_at", label: "Ngày tạo" },
      { key: "_actions", label: "Thao tác" },
    ],
    [],
  );

  const fetchContents = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await ClinicianAPI.getContents();
      console.log(res);
      setItems(normalizeList(res));
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Không lấy được danh sách nội dung.";
      setError(Array.isArray(msg) ? msg.join(", ") : msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchContents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) =>
      [it?.title, it?.difficulty, it?.age_group]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(s)),
    );
  }, [items, q]);

  const formatDate = (input) => {
    if (!input) return "—";
    const d = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(d.getTime())) return String(input);
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (submitting) return;

    const t = title.trim();
    const b = body.trim();
    if (!t || !b) {
      toast.error("Vui lòng nhập tiêu đề và nội dung.");
      return;
    }
    if (b.length < 50) {
      toast.error('"body" length must be at least 50 characters long');
      return;
    }

    setSubmitting(true);
    try {
      const res = await ClinicianAPI.createContent(
        t,
        b,
        difficulty,
        ageGroup.trim() || undefined,
        coverUrl.trim() || undefined,
      );
      toast.success(res?.message || "Tạo nội dung thành công.");
      setTitle("");
      setBody("");
      setDifficulty("EASY");
      setAgeGroup("");
      setCoverUrl("");
      await fetchContents();
    } catch (err) {
      toast.error(getErrorMessage(err, "Tạo nội dung thất bại."));
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = async (row) => {
    const id = row?.id;
    if (!id) return;

    setEditingId(String(id));
    setEditTitle(String(row?.title ?? ""));
    setEditBody(String(row?.body ?? ""));
    setEditDifficulty(String(row?.difficulty ?? "EASY"));
    setEditAgeGroup(String(row?.age_group ?? ""));
    setEditCoverUrl(String(row?.cover_image_url ?? ""));

    // nếu list không có body/fields đầy đủ thì lấy chi tiết
    try {
      const detail = await ClinicianAPI.getContentById(id);
      const data = detail?.data ?? detail;
      if (data) {
        setEditTitle(String(data?.title ?? row?.title ?? ""));
        setEditBody(String(data?.body ?? row?.body ?? ""));
        setEditDifficulty(
          String(data?.difficulty ?? row?.difficulty ?? "EASY"),
        );
        setEditAgeGroup(String(data?.age_group ?? row?.age_group ?? ""));
        setEditCoverUrl(
          String(data?.cover_image_url ?? row?.cover_image_url ?? ""),
        );
      }
    } catch {
      // ignore: vẫn cho edit bằng data hiện có
    }
  };

  const cancelEdit = () => {
    setEditingId("");
    setEditTitle("");
    setEditBody("");
    setEditDifficulty("EASY");
    setEditAgeGroup("");
    setEditCoverUrl("");
  };

  const submitEdit = async () => {
    if (!editingId || submitting) return;
    const id = editingId;

    const t = editTitle.trim();
    const b = editBody.trim();
    if (!t || !b) {
      toast.error("Vui lòng nhập tiêu đề và nội dung.");
      return;
    }
    if (b.length < 50) {
      toast.error('"body" length must be at least 50 characters long');
      return;
    }

    setSubmitting(true);
    try {
      const res = await ClinicianAPI.updateContent(
        id,
        t,
        b,
        editDifficulty,
        editAgeGroup.trim() || undefined,
        editCoverUrl.trim() || undefined,
      );
      toast.success(res?.message || "Cập nhật nội dung thành công.");
      cancelEdit();
      await fetchContents();
    } catch (err) {
      toast.error(getErrorMessage(err, "Cập nhật nội dung thất bại."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!id || submitting) return;
    const ok = window.confirm("Bạn chắc chắn muốn xóa nội dung này?");
    if (!ok) return;

    setSubmitting(true);
    try {
      const res = await ClinicianAPI.deleteContent(id);
      toast.success(res?.message || "Xóa nội dung thành công.");
      if (String(editingId) === String(id)) cancelEdit();
      await fetchContents();
    } catch (err) {
      toast.error(getErrorMessage(err, "Xóa nội dung thất bại."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="clc">
      <div className="clc-header">
        <div>
          <div className="clc-title">Quản lý nội dung đọc</div>
        </div>

        <button
          type="button"
          className="clc-refresh"
          onClick={fetchContents}
          disabled={loading || submitting}
        >
          {loading ? "Đang tải..." : "Tải lại"}
        </button>
      </div>

      <form className="clc-card" onSubmit={handleCreate}>
        <div className="clc-card__title">Tạo nội dung mới</div>

        <div className="clc-grid">
          <label className="clc-field">
            <span className="clc-field__label">Tiêu đề</span>
            <input
              className="clc-field__input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Câu chuyện về chú ong chăm chỉ"
              autoComplete="off"
            />
          </label>

          <label className="clc-field">
            <span className="clc-field__label">Độ khó</span>
            <select
              className="clc-field__input"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              {difficultyOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="clc-field">
            <span className="clc-field__label">Nhóm tuổi</span>
            <input
              className="clc-field__input"
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value)}
              placeholder="VD: 5-7"
              autoComplete="off"
            />
          </label>

          <label className="clc-field">
            <span className="clc-field__label">Cover image URL (tuỳ chọn)</span>
            <input
              className="clc-field__input"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://..."
              autoComplete="off"
            />
          </label>
        </div>

        <label className="clc-field clc-field--full">
          <span className="clc-field__label">Nội dung</span>
          <textarea
            className="clc-field__textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Nhập nội dung (>= 50 ký tự theo backend)..."
          />
        </label>

        <div className="clc-actions">
          <button
            type="submit"
            className="clc-primary"
            disabled={submitting || !title.trim() || !body.trim()}
          >
            {submitting ? "Đang tạo..." : "Tạo"}
          </button>
        </div>
      </form>

      <div className="clc-card">
        <div className="clc-card__title">Danh sách nội dung</div>

        <div className="clc-tools">
          <label className="clc-field clc-field--search">
            <span className="clc-field__label">Tìm kiếm</span>
            <input
              className="clc-field__input"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm theo tiêu đề / độ khó / nhóm tuổi"
              autoComplete="off"
            />
          </label>
        </div>

        {error ? <div className="clc-error">{error}</div> : null}

        {loading ? (
          <div className="clc-empty">Đang tải danh sách...</div>
        ) : filtered.length === 0 ? (
          <div className="clc-empty">Chưa có nội dung nào.</div>
        ) : (
          <div className="clc-tableWrap">
            <table className="clc-table">
              <thead>
                <tr>
                  {columns.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => {
                  const id = row?.id;
                  return (
                    <tr key={id || row?.title || JSON.stringify(row)}>
                      <td title={row?.title || "—"}>{row?.title || "—"}</td>
                      <td title={row?.difficulty || "—"}>
                        {row?.difficulty || "—"}
                      </td>
                      <td title={row?.age_group || "—"}>
                        {row?.age_group || "—"}
                      </td>
                      <td title={formatDate(row?.created_at)}>
                        {formatDate(row?.created_at)}
                      </td>
                      <td className="clc-tdActions">
                        <button
                          type="button"
                          className="clc-link"
                          onClick={() => startEdit(row)}
                          disabled={submitting}
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          className="clc-link clc-link--danger"
                          onClick={() => handleDelete(id)}
                          disabled={submitting}
                        >
                          Xóa
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingId ? (
        <div className="clc-modalOverlay" role="dialog" aria-modal="true">
          <div className="clc-modal">
            <div className="clc-modal__title">Cập nhật nội dung</div>

            <div className="clc-grid">
              <label className="clc-field">
                <span className="clc-field__label">Tiêu đề</span>
                <input
                  className="clc-field__input"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  autoComplete="off"
                />
              </label>

              <label className="clc-field">
                <span className="clc-field__label">Độ khó</span>
                <select
                  className="clc-field__input"
                  value={editDifficulty}
                  onChange={(e) => setEditDifficulty(e.target.value)}
                >
                  {difficultyOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="clc-field">
                <span className="clc-field__label">Nhóm tuổi</span>
                <input
                  className="clc-field__input"
                  value={editAgeGroup}
                  onChange={(e) => setEditAgeGroup(e.target.value)}
                  autoComplete="off"
                />
              </label>

              <label className="clc-field">
                <span className="clc-field__label">Cover image URL</span>
                <input
                  className="clc-field__input"
                  value={editCoverUrl}
                  onChange={(e) => setEditCoverUrl(e.target.value)}
                  autoComplete="off"
                />
              </label>
            </div>

            <label className="clc-field clc-field--full">
              <span className="clc-field__label">Nội dung</span>
              <textarea
                className="clc-field__textarea"
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
              />
            </label>

            <div className="clc-modalActions">
              <button
                type="button"
                className="clc-secondary"
                onClick={cancelEdit}
                disabled={submitting}
              >
                Hủy
              </button>
              <button
                type="button"
                className="clc-primary"
                onClick={submitEdit}
                disabled={submitting || !editTitle.trim() || !editBody.trim()}
              >
                {submitting ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Content;
