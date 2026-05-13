import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "react-toastify";
import GuardianAPI from "../../../../service/Guardian/GuardianAPI";
import { humanizeApiError } from "../../../../service/instance";
import "./GuardianReports.scss";

const normalizeChildren = (res) => {
  const data = res?.data ?? res;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.children)) return data.children;
  if (Array.isArray(data?.items)) return data.items;
  return [];
};

const normalizeReportsList = (res) => {
  const data = res?.data ?? res;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.reports)) return data.reports;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const childRowId = (row) =>
  String(row?.id ?? row?.child_id ?? row?.user_id ?? "").trim();

const reportRowId = (row) => row?.id ?? row?.report_id ?? row?._id;

const reportTitle = (row) =>
  row?.title ??
  row?.week_label ??
  row?.name ??
  (reportRowId(row) != null ? `Báo cáo #${reportRowId(row)}` : "Báo cáo");

const reportSubtitle = (row) =>
  row?.summary ??
  row?.description ??
  row?.status ??
  row?.sub ??
  "";

const GuardianReports = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const childFromUrl = searchParams.get("child") || "";

  const [loadingChildren, setLoadingChildren] = useState(true);
  const [children, setChildren] = useState([]);
  const [childrenError, setChildrenError] = useState("");

  const [selectedChildId, setSelectedChildId] = useState(childFromUrl);

  const [loadingReports, setLoadingReports] = useState(false);
  const [reports, setReports] = useState([]);
  const [reportsError, setReportsError] = useState("");

  const [generating, setGenerating] = useState(false);

  const fetchChildren = useCallback(async () => {
    setLoadingChildren(true);
    setChildrenError("");
    try {
      const res = await GuardianAPI.getChildren();
      setChildren(normalizeChildren(res));
    } catch (err) {
      setChildrenError(
        humanizeApiError(err, "Không tải được danh sách trẻ đã liên kết."),
      );
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
      setReports(normalizeReportsList(res));
    } catch (err) {
      setReportsError(
        humanizeApiError(err, "Không tải được danh sách báo cáo của trẻ."),
      );
      setReports([]);
    } finally {
      setLoadingReports(false);
    }
  }, []);

  useEffect(() => {
    fetchChildren();
  }, [fetchChildren]);

  const childIds = useMemo(
    () => children.map((c) => childRowId(c)).filter(Boolean),
    [children],
  );

  useEffect(() => {
    if (loadingChildren) return;
    if (childIds.length === 0) {
      setSelectedChildId("");
      return;
    }
    const fromUrl = childFromUrl && childIds.includes(childFromUrl);
    if (fromUrl) {
      setSelectedChildId(childFromUrl);
      return;
    }
    if (selectedChildId && childIds.includes(selectedChildId)) return;
    const first = childIds[0];
    setSelectedChildId(first);
    setSearchParams({ child: first }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingChildren, children, childFromUrl, childIds.join("|")]);

  useEffect(() => {
    if (!selectedChildId) return;
    fetchReports(selectedChildId);
  }, [selectedChildId, fetchReports]);

  const selectChild = (id) => {
    setSelectedChildId(id);
    setSearchParams({ child: id }, { replace: true });
  };

  const childLabel = (row) =>
    row?.display_name?.trim() ||
    row?.email?.trim() ||
    childRowId(row) ||
    "Trẻ";

  const formatDateTime = (input) => {
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

  const handleGenerate = async () => {
    if (!selectedChildId || generating) return;
    setGenerating(true);
    try {
      const res = await GuardianAPI.createWeeklyReport(selectedChildId);
      toast.success(
        typeof res?.message === "string"
          ? res.message
          : "Đã tạo báo cáo tuần. Danh sách sẽ được làm mới.",
      );
      await fetchReports(selectedChildId);
    } catch (err) {
      toast.error(
        humanizeApiError(err, "Tạo báo cáo thất bại. Vui lòng thử lại."),
      );
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="gwr">
      <div className="gwr-header">
        <div>
          <h1 className="gwr-title">Báo cáo tuần</h1>
          <p className="gwr-subtitle">
            Chọn một trẻ đã liên kết để xem lịch sử báo cáo, mở chi tiết hoặc
            yêu cầu tạo báo cáo mới (nếu backend cho phép).
          </p>
        </div>
        <button
          type="button"
          className="gwr-refresh"
          onClick={() => {
            fetchChildren();
            if (selectedChildId) fetchReports(selectedChildId);
          }}
          disabled={loadingChildren || loadingReports}
        >
          {loadingChildren || loadingReports ? "Đang tải..." : "Tải lại"}
        </button>
      </div>

      {childrenError ? (
        <div className="gwr-alert" role="alert">
          {childrenError}
        </div>
      ) : null}

      {loadingChildren ? (
        <div className="gwr-muted">Đang tải danh sách trẻ...</div>
      ) : children.length === 0 ? (
        <div className="gwr-card gwr-empty">
          <p>Chưa có trẻ nào được liên kết.</p>
          <Link className="gwr-link" to="/guardian/children">
            Đi tới trang liên kết trẻ
          </Link>
        </div>
      ) : (
        <>
          <div className="gwr-card">
            <div className="gwr-card__title">Chọn trẻ</div>
            <div className="gwr-tabs" role="tablist" aria-label="Chọn trẻ">
              {children.map((row) => {
                const id = childRowId(row);
                if (!id) return null;
                const active = id === selectedChildId;
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`gwr-tab ${active ? "is-active" : ""}`}
                    onClick={() => selectChild(id)}
                  >
                    {childLabel(row)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="gwr-toolbar">
            <button
              type="button"
              className="gwr-primary"
              onClick={handleGenerate}
              disabled={!selectedChildId || generating}
            >
              {generating ? "Đang tạo báo cáo..." : "Tạo báo cáo tuần"}
            </button>
          </div>

          <div className="gwr-card">
            <div className="gwr-card__title">Danh sách báo cáo</div>

            {reportsError ? (
              <div className="gwr-alert" role="alert">
                {reportsError}
              </div>
            ) : null}

            {loadingReports ? (
              <div className="gwr-muted">Đang tải báo cáo...</div>
            ) : reports.length === 0 ? (
              <div className="gwr-muted">
                Chưa có báo cáo nào cho trẻ này. Bạn có thể thử nút &quot;Tạo
                báo cáo tuần&quot; nếu dịch vụ đã bật.
              </div>
            ) : (
              <ul className="gwr-list">
                {reports.map((row) => {
                  const rid = reportRowId(row);
                  const key = rid != null ? String(rid) : JSON.stringify(row);
                  const to =
                    rid != null
                      ? `/guardian/reports/${encodeURIComponent(String(rid))}?child=${encodeURIComponent(selectedChildId)}`
                      : "#";
                  return (
                    <li key={key} className="gwr-item">
                      <div className="gwr-item__main">
                        <div className="gwr-item__title">{reportTitle(row)}</div>
                        {reportSubtitle(row) ? (
                          <div className="gwr-item__sub">
                            {reportSubtitle(row)}
                          </div>
                        ) : null}
                        <div className="gwr-item__meta">
                          {formatDateTime(
                            row?.created_at ??
                              row?.generated_at ??
                              row?.week_end,
                          )}
                        </div>
                      </div>
                      {rid != null ? (
                        <Link className="gwr-item__cta" to={to}>
                          Xem chi tiết
                        </Link>
                      ) : (
                        <span className="gwr-item__cta gwr-item__cta--disabled">
                          Thiếu mã báo cáo
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default GuardianReports;
