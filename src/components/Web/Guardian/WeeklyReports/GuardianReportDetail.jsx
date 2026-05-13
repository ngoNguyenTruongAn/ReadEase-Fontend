import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import GuardianAPI from "../../../../service/Guardian/GuardianAPI";
import { humanizeApiError } from "../../../../service/instance";
import "./GuardianReportDetail.scss";

const pickPayload = (res) => res?.data ?? res;

const GuardianReportDetail = () => {
  const { reportId } = useParams();
  const [searchParams] = useSearchParams();
  const childId = searchParams.get("child") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState(null);

  const backHref = childId
    ? `/guardian/reports?child=${encodeURIComponent(childId)}`
    : "/guardian/reports";

  useEffect(() => {
    if (!reportId) {
      setLoading(false);
      setError("Thiếu mã báo cáo trong đường dẫn.");
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await GuardianAPI.getReportById(reportId);
        if (!cancelled) setPayload(pickPayload(res));
      } catch (err) {
        if (!cancelled) {
          setError(
            humanizeApiError(err, "Không tải được chi tiết báo cáo."),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  const title =
    payload?.title ??
    payload?.week_label ??
    payload?.name ??
    `Báo cáo #${reportId}`;

  const bodyText =
    typeof payload?.content === "string"
      ? payload.content
      : typeof payload?.summary === "string"
        ? payload.summary
        : typeof payload?.text === "string"
          ? payload.text
          : null;

  return (
    <div className="gwrd">
      <div className="gwrd-top">
        <Link className="gwrd-back" to={backHref}>
          ← Quay lại danh sách
        </Link>
      </div>

      {loading ? (
        <div className="gwrd-muted">Đang tải chi tiết...</div>
      ) : error ? (
        <div className="gwrd-alert" role="alert">
          {error}
        </div>
      ) : (
        <div className="gwrd-card">
          <h1 className="gwrd-title">{title}</h1>

          {payload?.created_at || payload?.generated_at ? (
            <p className="gwrd-meta">
              {(() => {
                const raw = payload?.created_at ?? payload?.generated_at;
                const d = new Date(raw);
                if (Number.isNaN(d.getTime())) return String(raw);
                return new Intl.DateTimeFormat("vi-VN", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                }).format(d);
              })()}
            </p>
          ) : null}

          {bodyText ? (
            <div className="gwrd-body">{bodyText}</div>
          ) : (
            <pre className="gwrd-json" tabIndex={0}>
              {JSON.stringify(payload, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

export default GuardianReportDetail;
