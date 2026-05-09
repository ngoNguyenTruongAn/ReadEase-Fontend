import React, { useEffect, useState } from "react";
import "./CollectionPage.scss";
import { useOutletContext, useNavigate } from "react-router-dom";
import ChildrenAPI from "../../../../service/Children/ChildrenAPI";
import AuthAPI from "../../../../service/Auth/AuthAPI";

const TINTS = ["mint", "lavender", "peach", "coral", "sky"];

const CollectionPage = () => {
  const outletContext = useOutletContext();
  const navigate = useNavigate();
  const [collection, setCollection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [childId, setChildId] = useState(
    () => localStorage.getItem("childId") || "",
  );

  // Lấy childId từ profile nếu chưa có
  useEffect(() => {
    if (childId) return;
    let mounted = true;
    const run = async () => {
      try {
        const payload = await AuthAPI.getProfileAPI();
        const root = payload?.data ?? payload?.user ?? payload ?? {};
        const picked = root?.id || root?.childId || root?.child_id || "";
        const normalized = String(picked || "").trim();
        if (!mounted || !normalized) return;
        setChildId(normalized);
        localStorage.setItem("childId", normalized);
      } catch {
        // ignore
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [childId]);

  // Fetch collection
  useEffect(() => {
    if (!childId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await ChildrenAPI.getCollection(childId);
        if (cancelled) return;
        setCollection(res?.data ?? res ?? null);
      } catch (e) {
        if (cancelled) return;
        setError(
          e?.response?.data?.message ||
            e?.message ||
            "Không tải được bộ sưu tập.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [childId]);

  const items = collection?.items ?? [];
  const totalItems = collection?.totalItems ?? 0;
  const uniqueItems = collection?.uniqueItems ?? 0;

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return "";
    }
  };

  return (
    <div className="collection-page">
      {/* Header stats */}
      <div className="collection-header">
        <h2 className="collection-title">🏆 Bộ sưu tập</h2>
        {!loading && !error && (
          <div className="collection-stats">
            <span className="collection-stat">
              <strong>{totalItems}</strong> vật phẩm
            </span>
            <span className="collection-stat-sep">·</span>
            <span className="collection-stat">
              <strong>{uniqueItems}</strong> loại
            </span>
          </div>
        )}
      </div>

      {/* Loading */}
      {loading ? <div className="collection-state">Đang tải...</div> : null}

      {/* Error */}
      {!loading && error ? (
        <div className="collection-state collection-state--error">{error}</div>
      ) : null}

      {/* Empty state */}
      {!loading && !error && items.length === 0 ? (
        <div className="collection-empty">
          <div className="collection-empty-icon">📦</div>
          <h3 className="collection-empty-title">Chưa có vật phẩm nào</h3>
          <p className="collection-empty-desc">
            Đổi thưởng tại Cửa hàng để bắt đầu sưu tập!
          </p>
          <button
            type="button"
            className="collection-empty-cta"
            onClick={() => navigate("/children/store")}
          >
            Đến Cửa hàng 🎁
          </button>
        </div>
      ) : null}

      {/* Collection Grid */}
      {!loading && !error && items.length > 0 ? (
        <div className="collection-grid">
          {items.map((item, idx) => {
            const tint = TINTS[idx % TINTS.length];
            return (
              <div
                key={item.reward_id}
                className={`collection-card collection-card--${tint}`}
              >
                {/* Quantity badge */}
                {item.quantity > 1 && (
                  <span className="collection-badge">x{item.quantity}</span>
                )}

                <div className="collection-card-art">
                  <img
                    src={item.image_url}
                    alt={item.name}
                    className="collection-card-img"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                </div>

                <span className="collection-card-name">{item.name}</span>

                {item.description ? (
                  <p className="collection-card-desc">{item.description}</p>
                ) : null}

                <div className="collection-card-meta">
                  <span className="collection-card-cost">
                    {item.cost} xu
                  </span>
                  <span className="collection-card-date">
                    {formatDate(item.last_redeemed_at)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

export default CollectionPage;
