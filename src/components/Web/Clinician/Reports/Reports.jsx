import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import GuardianAPI from "../../../../service/Guardian/GuardianAPI";
import { humanizeApiError } from "../../../../service/instance";
import "./Reports.scss";

const normalizeChildren = (res) => {
  const data = res?.data ?? res;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.children)) return data.children;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

const normalizeReports = (res) => {
  const data = res?.data ?? res;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.reports)) return data.reports;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

const normalizeReportDetail = (res) => {
  const data = res?.data ?? res;
  if (data && typeof data === "object" && !Array.isArray(data)) return data;
  return null;
};

const formatDate = (input) => {
  if (!input) return "—";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return String(input);
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
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

const Reports = () => {
  const [children, setChildren] = useState([]);
  const [loadingChildren, setLoadingChildren] = useState(true);
  const [childError, setChildError] = useState("");

  const [selectedChildId, setSelectedChildId] = useState("");

  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [reportsError, setReportsError] = useState("");

  const [generating, setGenerating] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState(null);

  const fetchChildren = useCallback(async () => {
    setLoadingChildren(true);
    setChildError("");
    try {
      const res = await GuardianAPI.getChildren();
      const list = normalizeChildren(res);
      setChildren(list);
      setSelectedChildId((prev) => {
        if (prev && list.some((c) => String(c.id) === String(prev))) return prev;
        return list[0]?.id != null ? String(list[0].id) : "";
      });
    } catch (err) {
      setChildError(humanizeApiError(err, "Không tải được danh sách trẻ."));
      setChildren([]);
      setSelectedChildId("");
    } finally {
      setLoadingChildren(false);
    }
  }, []);

  const fetchReports = useCallback(async (childId) => {
    if (!childId) {
      setReports([]);
      return;
    }
    setLoadingReports(true);
    setReportsError("");
    try {
      const res = await GuardianAPI.getReportChildById(childId);
      setReports(normalizeReports(res));
    } catch (err) {
      setReportsError(
        humanizeApiError(err, "Không tải được danh sách báo cáo."),
      );
      setReports([]);
    } finally {
      setLoadingReports(false);
    }
  }, []);

  useEffect(() => {
    fetchChildren();
  }, [fetchChildren]);

  useEffect(() => {
    if (selectedChildId) fetchReports(selectedChildId);
    else setReports([]);
  }, [selectedChildId, fetchReports]);

  const selectedChildLabel = useMemo(() => {
    const c = children.find((x) => String(x.id) === String(selectedChildId));
    if (!c) return "";
    return c.display_name || c.email || String(c.id);
  }, [children, selectedChildId]);

  const handleGenerate = async () => {
    if (!selectedChildId || generating) return;
    setGenerating(true);
    try {
      const res = await GuardianAPI.createWeeklyReport(selectedChildId);
      toast.success(res?.message || "Đã tạo báo cáo tuần.");
      await fetchReports(selectedChildId);
    } catch (err) {
      toast.error(humanizeApiError(err, "Tạo báo cáo thất bại."));
    } finally {
      setGenerating(false);
    }
  };

  const openDetail = async (reportId) => {
    if (!reportId) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetail(null);
    try {
      const res = await GuardianAPI.getReportById(reportId);
      setDetail(normalizeReportDetail(res));
    } catch (err) {
      toast.error(
        humanizeApiError(err, "Không tải được chi tiết báo cáo."),
      );
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetail(null);
  };

  return (
    <div className="clr">
      <div className="clr-header">
        <div>
          <div className="clr-title">Báo cáo</div>
          <div className="clr-subtitle">
            Chọn trẻ, xem báo cáo đọc tuần đã tạo, tạo báo cáo mới hoặc mở chi
            tiết (nội dung Markdown từ AI).
          </div>
        </div>
        <button
          type="button"
          className="clr-refresh"
          onClick={fetchChildren}
          disabled={loadingChildren}
        >
          {loadingChildren ? "Đang tải..." : "Tải lại danh sách trẻ"}
        </button>
      </div>

      <div className="clr-card">
        <div className="clr-card__title">Chọn bệnh nhân (trẻ)</div>
        {childError ? <div className="clr-error">{childError}</div> : null}
        {loadingChildren ? (
          <div className="clr-hint">Đang tải danh sách trẻ...</div>
        ) : (
          <label className="clr-field">
            <span className="clr-field__label">Trẻ</span>
            <select
              className="clr-field__select"
              value={selectedChildId}
              onChange={(e) => setSelectedChildId(e.target.value)}
              disabled={!children.length}
            >
              {children.length === 0 ? (
                <option value="">Không có trẻ trong danh sách</option>
              ) : (
                children.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.display_name || c.email || `ID ${c.id}`}
                  </option>
                ))
              )}
            </select>
          </label>
        )}

        <div className="clr-actions">
          <button
            type="button"
            className="clr-primary"
            onClick={handleGenerate}
            disabled={!selectedChildId || generating || loadingChildren}
          >
            {generating ? "Đang tạo báo cáo..." : "Tạo báo cáo tuần"}
          </button>
          <button
            type="button"
            className="clr-secondary"
            onClick={() => selectedChildId && fetchReports(selectedChildId)}
            disabled={!selectedChildId || loadingReports}
          >
            {loadingReports ? "Đang tải..." : "Làm mới danh sách"}
          </button>
        </div>
      </div>

      <div className="clr-card">
        <div className="clr-card__title">
          Báo cáo theo tuần
          {selectedChildLabel ? (
            <span className="clr-card__hint"> — {selectedChildLabel}</span>
          ) : null}
        </div>
        {reportsError ? <div className="clr-error">{reportsError}</div> : null}
        {!selectedChildId ? (
          <div className="clr-hint">Chọn một trẻ để xem báo cáo.</div>
        ) : loadingReports ? (
          <div className="clr-hint">Đang tải danh sách báo cáo...</div>
        ) : reports.length === 0 ? (
          <div className="clr-hint">Chưa có báo cáo nào cho trẻ này.</div>
        ) : (
          <div className="clr-list">
            {reports.map((r) => (
              <div className="clr-item" key={r.id || JSON.stringify(r)}>
                <div className="clr-item__left">
                  <div className="clr-item__title">
                    {r.report_type === "WEEKLY"
                      ? "Báo cáo tuần"
                      : r.report_type || "Báo cáo"}
                  </div>
                  <div className="clr-item__sub">
                    Kỳ: {formatDate(r.period_start)} — {formatDate(r.period_end)}
                    {r.created_at ? (
                      <> · Tạo lúc {formatDateTime(r.created_at)}</>
                    ) : null}
                    {r.ai_model ? <> · {r.ai_model}</> : null}
                  </div>
                </div>
                <div className="clr-item__right">
                  <button
                    className="clr-item__link"
                    type="button"
                    onClick={() => openDetail(r.id)}
                  >
                    Xem chi tiết
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {detailOpen ? (
        <div
          className="clr-overlay"
          role="presentation"
          onClick={closeDetail}
        >
          <div
            className="clr-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clr-detail-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="clr-modal__head">
              <h2 id="clr-detail-title" className="clr-modal__title">
                Chi tiết báo cáo
              </h2>
              <button
                type="button"
                className="clr-modal__close"
                onClick={closeDetail}
              >
                Đóng
              </button>
            </div>
            {detailLoading ? (
              <div className="clr-hint">Đang tải...</div>
            ) : detail ? (
              <div className="clr-detail">
                <div className="clr-detail__meta">
                  <span>
                    Kỳ: {formatDate(detail.period_start)} —{" "}
                    {formatDate(detail.period_end)}
                  </span>
                  {detail.created_at ? (
                    <span>Tạo: {formatDateTime(detail.created_at)}</span>
                  ) : null}
                  {detail.ai_model ? <span>Model: {detail.ai_model}</span> : null}
                </div>
                {detail.ai_disclaimer ? (
                  <div className="clr-disclaimer">{detail.ai_disclaimer}</div>
                ) : null}
                <div className="clr-mdWrap">
                  <pre className="clr-mdContent">
                    {detail.content ?? "—"}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="clr-hint">Không có dữ liệu.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Reports;
