import React, { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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

const reportRowId = (row) => row?.id ?? row?.report_id ?? row?._id;

const isApprovedReport = (row) => {
  if (!row) return false;
  if (
    row.approved === true ||
    row.is_approved === true ||
    row.visible_to_guardian === true
  ) {
    return true;
  }

  const status = String(
    row.approval_status ?? row.review_status ?? row.status ?? "",
  ).toLowerCase();

  return ["approved", "published", "visible", "reviewed", "da_duyet"].some(
    (token) => status.includes(token),
  );
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
  const [detailReportId, setDetailReportId] = useState("");
  const [approvingReportId, setApprovingReportId] = useState("");

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
    setDetailReportId(String(reportId));
    try {
      const res = await GuardianAPI.getReportById(reportId);
      setDetail(normalizeReportDetail(res));
    } catch (err) {
      toast.error(
        humanizeApiError(err, "Không tải được chi tiết báo cáo."),
      );
      setDetailOpen(false);
      setDetailReportId("");
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetailOpen(false);
    setDetail(null);
    setDetailReportId("");
  };

  const detailIsApproved = useMemo(() => {
    const row = reports.find(
      (r) => String(reportRowId(r)) === String(detailReportId),
    );
    return isApprovedReport(detail) || isApprovedReport(row);
  }, [detail, detailReportId, reports]);

  const detailIsApproving =
    approvingReportId && String(approvingReportId) === String(detailReportId);

  const detailBodyText = useMemo(() => {
    const raw = detail?.content;
    return typeof raw === "string" && raw.trim() ? raw : null;
  }, [detail]);

  const mdComponents = useMemo(
    () => ({
      h1: (props) => <h1 className="clr-md-h1" {...props} />,
      h2: (props) => <h2 className="clr-md-h2" {...props} />,
      h3: (props) => <h3 className="clr-md-h3" {...props} />,
      p: (props) => <p className="clr-md-p" {...props} />,
      ul: (props) => <ul className="clr-md-ul" {...props} />,
      ol: (props) => <ol className="clr-md-ol" {...props} />,
      li: (props) => <li className="clr-md-li" {...props} />,
      strong: (props) => <strong className="clr-md-strong" {...props} />,
      em: (props) => <em className="clr-md-em" {...props} />,
      hr: (props) => <hr className="clr-md-hr" {...props} />,
      blockquote: (props) => (
        <blockquote className="clr-md-quote" {...props} />
      ),
      table: ({ children, ...rest }) => (
        <div className="clr-table-wrap">
          <table className="clr-md-table" {...rest}>
            {children}
          </table>
        </div>
      ),
      thead: (props) => <thead className="clr-md-thead" {...props} />,
      tbody: (props) => <tbody className="clr-md-tbody" {...props} />,
      tr: (props) => <tr className="clr-md-tr" {...props} />,
      th: (props) => <th className="clr-md-th" {...props} />,
      td: (props) => <td className="clr-md-td" {...props} />,
    }),
    [],
  );

  const persistApprovedReport = (reportId, apiPayload = null) => {
    const row = reports.find((r) => String(reportRowId(r)) === String(reportId));
    const approvedAt = new Date().toISOString();
    const approvedReport = {
      ...row,
      ...detail,
      ...(apiPayload || {}),
      id: reportRowId(apiPayload) ?? reportRowId(detail) ?? reportRowId(row) ?? reportId,
      child_id:
        apiPayload?.child_id ??
        apiPayload?.childId ??
        detail?.child_id ??
        detail?.childId ??
        row?.child_id ??
        row?.childId ??
        selectedChildId,
      approved: true,
      is_approved: true,
      visible_to_guardian: true,
      approval_status: "APPROVED",
      status: "APPROVED",
      approved_at: apiPayload?.approved_at ?? detail?.approved_at ?? approvedAt,
    };

    setDetail(approvedReport);
    setReports((prev) =>
      prev.map((r) =>
        String(reportRowId(r)) === String(reportId)
          ? { ...r, ...approvedReport, content: r.content ?? approvedReport.content }
          : r,
      ),
    );

    return approvedReport;
  };

  const handleApproveDetail = async () => {
    const reportId = detailReportId || reportRowId(detail);
    if (!reportId || detailIsApproving) return;

    setApprovingReportId(String(reportId));
    try {
      const res = await GuardianAPI.approveReport(reportId, selectedChildId);
      const apiPayload = normalizeReportDetail(res);
      persistApprovedReport(reportId, apiPayload);
      toast.success("Đã duyệt báo cáo. Phụ huynh có thể xem trong Báo cáo tuần.");
      if (selectedChildId) await fetchReports(selectedChildId);
    } catch (err) {
      toast.error(humanizeApiError(err, "Duyệt báo cáo thất bại."));
    } finally {
      setApprovingReportId("");
    }
  };

  return (
    <div className="clr">
      <div className="clr-header">
        <div>
          <div className="clr-title">Báo cáo</div>
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
                  </div>
                </div>
                <div className="clr-item__right">
                  {isApprovedReport(r) ? (
                    <div className="clr-item__status">Đã duyệt</div>
                  ) : null}
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
              <div className="clr-modal__actions">
                <button
                  type="button"
                  className="clr-modal__approve"
                  onClick={handleApproveDetail}
                  disabled={detailLoading || detailIsApproved || detailIsApproving}
                >
                  {detailIsApproved
                    ? "Đã duyệt"
                    : detailIsApproving
                      ? "Đang duyệt..."
                      : "Duyệt"}
                </button>
                <button
                  type="button"
                  className="clr-modal__close"
                  onClick={closeDetail}
                >
                  Đóng
                </button>
              </div>
            </div>
            {detailLoading ? (
              <div className="clr-detail clr-detail--loading">
                <div className="clr-hint">Đang tải nội dung báo cáo...</div>
              </div>
            ) : detail ? (
              <div className="clr-detail">
                <div className="clr-detail__meta">
                  <span className="clr-detail__meta-item">
                    <span className="clr-detail__meta-label">Kỳ báo cáo</span>
                    {formatDate(detail.period_start)} —{" "}
                    {formatDate(detail.period_end)}
                  </span>
                  {detail.created_at ? (
                    <span className="clr-detail__meta-item">
                      <span className="clr-detail__meta-label">Tạo lúc</span>
                      {formatDateTime(detail.created_at)}
                    </span>
                  ) : null}
                  {detailIsApproved ? (
                    <span className="clr-detail__badge clr-detail__badge--approved">
                      Đã duyệt
                    </span>
                  ) : (
                    <span className="clr-detail__badge clr-detail__badge--pending">
                      Chờ duyệt
                    </span>
                  )}
                </div>
                {detail.ai_disclaimer ? (
                  <div className="clr-disclaimer" role="note">
                    <span className="clr-disclaimer__icon" aria-hidden="true">
                      ℹ
                    </span>
                    <p>{detail.ai_disclaimer}</p>
                  </div>
                ) : null}
                {detailBodyText ? (
                  <article className="clr-prose">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={mdComponents}
                    >
                      {detailBodyText}
                    </ReactMarkdown>
                  </article>
                ) : (
                  <div className="clr-hint">Báo cáo chưa có nội dung.</div>
                )}
              </div>
            ) : (
              <div className="clr-detail clr-detail--loading">
                <div className="clr-hint">Không có dữ liệu.</div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Reports;
