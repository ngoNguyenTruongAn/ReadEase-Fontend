import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import GuardianAPI from "../../../../service/Guardian/GuardianAPI";
import { humanizeApiError } from "../../../../service/instance";
import "./GuardianReportDetail.scss";

const pickPayload = (res) => res?.data ?? res;

const MARKDOWN_KEYS = [
  "content",
  "summary",
  "text",
  "report_content",
  "markdown",
  "body",
  "report_body",
  "full_text",
];

const pickMarkdownString = (payload) => {
  if (!payload || typeof payload !== "object") return null;
  for (const key of MARKDOWN_KEYS) {
    const v = payload[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
};

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
    (payload?.report_type === "WEEKLY" ? "Báo cáo tuần" : null) ??
    `Báo cáo #${reportId}`;

  const bodyText = useMemo(() => pickMarkdownString(payload), [payload]);

  const mdComponents = useMemo(
    () => ({
      h1: (props) => <h1 className="gwrd-md-h1" {...props} />,
      h2: (props) => <h2 className="gwrd-md-h2" {...props} />,
      h3: (props) => <h3 className="gwrd-md-h3" {...props} />,
      p: (props) => <p className="gwrd-md-p" {...props} />,
      ul: (props) => <ul className="gwrd-md-ul" {...props} />,
      ol: (props) => <ol className="gwrd-md-ol" {...props} />,
      li: (props) => <li className="gwrd-md-li" {...props} />,
      strong: (props) => <strong className="gwrd-md-strong" {...props} />,
      em: (props) => <em className="gwrd-md-em" {...props} />,
      hr: (props) => <hr className="gwrd-md-hr" {...props} />,
      blockquote: (props) => (
        <blockquote className="gwrd-md-quote" {...props} />
      ),
      table: ({ children, ...rest }) => (
        <div className="gwrd-table-wrap">
          <table className="gwrd-md-table" {...rest}>
            {children}
          </table>
        </div>
      ),
      thead: (props) => <thead className="gwrd-md-thead" {...props} />,
      tbody: (props) => <tbody className="gwrd-md-tbody" {...props} />,
      tr: (props) => <tr className="gwrd-md-tr" {...props} />,
      th: (props) => <th className="gwrd-md-th" {...props} />,
      td: (props) => <td className="gwrd-md-td" {...props} />,
    }),
    [],
  );

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
        <article className="gwrd-sheet">
          <header className="gwrd-hero">
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
          </header>

          {bodyText ? (
            <div className="gwrd-prose">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {bodyText}
              </ReactMarkdown>
            </div>
          ) : (
            <pre className="gwrd-json" tabIndex={0}>
              {JSON.stringify(payload, null, 2)}
            </pre>
          )}
        </article>
      )}
    </div>
  );
};

export default GuardianReportDetail;
