import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import ClinicianAPI from "../../../../service/Clinician/ClinicianAPI";
import { humanizeApiError } from "../../../../service/instance";
import "./DashboardClinician.scss";
import readingBook from "../../../../assets/image/Vector.png";

const normalizeDashboard = (res) => {
  const data = res?.data ?? res ?? {};
  return {
    stats: data.stats ?? {},
    recentReports: Array.isArray(data.recentReports) ? data.recentReports : [],
  };
};

const formatNumber = (value) => {
  const number = Number(value);
  return new Intl.NumberFormat("vi-VN").format(
    Number.isFinite(number) ? Math.max(0, number) : 0,
  );
};

const statusLabel = (status) => {
  const normalized = String(status ?? "")
    .trim()
    .toUpperCase();
  if (normalized === "APPROVED") return "Đã duyệt";
  if (normalized === "DRAFT") return "Bản nháp";
  return normalized || "Chưa rõ trạng thái";
};

const reportDetailPath = (report) => {
  const params = new URLSearchParams();
  if (report?.childId) params.set("child", String(report.childId));
  if (report?.id) params.set("report", String(report.id));
  const query = params.toString();
  return query ? `/clinician/reports?${query}` : "/clinician/reports";
};

const DashboardClinician = () => {
  const [dashboard, setDashboard] = useState(() => normalizeDashboard());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await ClinicianAPI.getDashboard();
      setDashboard(normalizeDashboard(res));
    } catch (err) {
      setError(
        humanizeApiError(err, "Không tải được dữ liệu tổng quan bác sĩ."),
      );
      setDashboard(normalizeDashboard());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const stats = useMemo(
    () => [
      {
        key: "monitoredPatients",
        label: "Số bệnh nhân đang theo dõi",
        value: dashboard.stats.monitoredPatients,
        icon: readingBook,
      },
      {
        key: "pendingReports",
        label: "Báo cáo cần duyệt",
        value: dashboard.stats.pendingReports,
        icon: readingBook,
      },
      {
        key: "abnormalSessions",
        label: "Phiên đọc bất thường",
        value: dashboard.stats.abnormalSessions,
        icon: readingBook,
      },
    ],
    [dashboard.stats],
  );

  return (
    <div className="cdc">
      {error ? <div className="cdc-error">{error}</div> : null}

      <div className="cdc-stats">
        {stats.map((s) => (
          <div key={s.key} className="cdc-stat">
            <div className="cdc-stat__icon">
              <img src={s.icon} alt="" className="cdc-ico" />
            </div>
            <div className="cdc-stat__main">
              <div className="cdc-stat__label">{s.label}</div>
              <div className="cdc-stat__value">
                {loading ? "Đang tải..." : formatNumber(s.value)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="cdc-section">
        <div className="cdc-section__title">Báo cáo gần đây</div>
        <div className="cdc-list">
          {loading ? (
            <div className="cdc-empty">Đang tải báo cáo...</div>
          ) : dashboard.recentReports.length === 0 ? (
            <div className="cdc-empty">Không có báo cáo gần đây.</div>
          ) : (
            dashboard.recentReports.map((r) => (
              <div
                key={r.id ?? `${r.childId}-${r.createdAt}`}
                className="cdc-item"
              >
                <div className="cdc-item__left">
                  <div className="cdc-item__title">{r.title || "Báo cáo"}</div>
                  <div className="cdc-item__sub">
                    {r.subtitle || r.childName || "Chưa có thông tin bệnh nhân"}
                  </div>
                </div>
                <div className="cdc-item__right">
                  <div className="cdc-item__status">
                    {statusLabel(r.status)}
                  </div>
                  <Link className="cdc-item__link" to={reportDetailPath(r)}>
                    Xem chi tiết
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default DashboardClinician;
