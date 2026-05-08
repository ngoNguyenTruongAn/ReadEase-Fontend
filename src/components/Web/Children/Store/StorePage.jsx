import React, { useEffect, useMemo, useState } from "react";
import "./StorePage.scss";
import { useOutletContext } from "react-router-dom";
import ChildrenAPI from "../../../../service/Children/ChildrenAPI";
import AuthAPI from "../../../../service/Auth/AuthAPI";

const TINTS = ["mint", "lavender", "peach", "coral", "sky"];

const StorePage = () => {
  const outletContext = useOutletContext();
  const activeFilter = outletContext?.storeFilter ?? "all";
  // Dùng balance + setBalance từ ChildrenLayout để header tự cập nhật
  const balance = outletContext?.balance ?? null;
  const parentSetBalance = outletContext?.setBalance;
  const setBalance = (v) => { if (parentSetBalance) parentSetBalance(v); };
  const [selectedId, setSelectedId] = useState("");
  const [rewards, setRewards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [redeemingId, setRedeemingId] = useState("");
  const [toast, setToast] = useState({ msg: "", type: "success" });
  const [confirmReward, setConfirmReward] = useState(null);
  const [childId, setChildId] = useState(
    () => localStorage.getItem("childId") || "",
  );

  const loadRewards = async (signal) => {
    setLoading(true);
    setError("");
    try {
      const res = await ChildrenAPI.getRewardList();
      const list = res?.data;
      if (signal?.aborted) return;
      setRewards(Array.isArray(list) ? list : []);
    } catch (e) {
      if (signal?.aborted) return;
      setError(
        e?.response?.data?.message ||
          e?.message ||
          "Không tải được danh sách phần thưởng.",
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    loadRewards(controller.signal);
    return () => controller.abort();
  }, []);

  // Lấy childId từ profile nếu chưa có
  useEffect(() => {
    if (childId) return;
    let mounted = true;
    const run = async () => {
      try {
        const payload = await AuthAPI.getProfileAPI();
        const root = payload?.data ?? payload?.user ?? payload ?? {};
        const picked =
          root?.id ||
          root?.childId ||
          root?.child_id ||
          root?.child?.id ||
          "";
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

  // Balance đã được ChildrenLayout fetch sẵn qua outlet context
  // Không cần fetch lại ở đây

  useEffect(() => {
    if (!selectedId && rewards.length > 0) setSelectedId(rewards[0]?.id || "");
  }, [rewards, selectedId]);

  const visible = useMemo(() => {
    if (!Array.isArray(rewards)) return [];
    if (!activeFilter || activeFilter === "all") return rewards;
    return rewards;
  }, [activeFilter, rewards]);

  // Auto-dismiss toast sau 2.5s
  useEffect(() => {
    if (!toast.msg) return;
    const t = window.setTimeout(
      () => setToast({ msg: "", type: "success" }),
      2500,
    );
    return () => window.clearTimeout(t);
  }, [toast]);

  const showToast = (msg, type = "success") => setToast({ msg, type });

  const handleRedeem = async (rewardId) => {
    if (!rewardId || redeemingId) return;
    const reward = rewards.find((r) => r?.id === rewardId);
    const expectedVersion =
      typeof reward?.version === "number" ? reward.version : undefined;
    if (!childId) {
      showToast(
        "Không tìm thấy thông tin tài khoản. Vui lòng đăng nhập lại.",
        "error",
      );
      return;
    }
    try {
      setRedeemingId(rewardId);
      const result = await ChildrenAPI.redeemReward(
        rewardId,
        childId,
        expectedVersion,
      );
      // Cập nhật balance từ balanceAfter backend trả về
      const newBalance = result?.balanceAfter ?? result?.data?.balanceAfter;
      if (typeof newBalance === "number") {
        setBalance(newBalance);
      } else {
        // Fallback: refetch balance
        ChildrenAPI.getBalance(childId)
          .then((res) => setBalance(res?.data?.balance ?? res?.balance ?? 0))
          .catch(() => {});
      }
      showToast(
        `🎉 Đổi thành công "${reward?.name}"! Còn lại: ${newBalance ?? "?"} xu`,
        "success",
      );
      await loadRewards();
    } catch (e) {
      const body = e?.response?.data;
      const apiErr = body?.error;
      const detail =
        (Array.isArray(apiErr?.details) && apiErr.details[0]) ||
        (Array.isArray(body?.details) && body.details[0]) ||
        null;
      const msg =
        detail ||
        apiErr?.message ||
        body?.message ||
        e?.message ||
        "Đổi thưởng thất bại.";
      showToast(msg, "error");
    } finally {
      setRedeemingId("");
    }
  };

  return (
    <div className="store-page">
      {/* Confirm Dialog */}
      {confirmReward && (
        <div
          className="store-confirm-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setConfirmReward(null);
          }}
        >
          <div className="store-confirm-dialog" role="dialog" aria-modal="true">
            <div className="store-confirm-art">
              <img
                src={confirmReward.image_url}
                alt={confirmReward.name}
                className="store-confirm-img"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>
            <h3 className="store-confirm-title">Đổi phần thưởng?</h3>
            <p className="store-confirm-name">"{confirmReward.name}"</p>
            <p className="store-confirm-cost">
              Tốn <strong>{confirmReward.cost} xu</strong>
            </p>
            {balance !== null && (
              <p className="store-confirm-after">
                Sau khi đổi còn:{" "}
                <strong
                  style={{
                    color:
                      balance - confirmReward.cost < 0 ? "#e53e3e" : "#38a169",
                  }}
                >
                  {balance - confirmReward.cost} xu
                </strong>
              </p>
            )}
            <div className="store-confirm-actions">
              <button
                type="button"
                className="store-confirm-cancel"
                onClick={() => setConfirmReward(null)}
              >
                Thôi
              </button>
              <button
                type="button"
                className="store-confirm-ok"
                disabled={!!redeemingId}
                onClick={() => {
                  const id = confirmReward.id;
                  setConfirmReward(null);
                  handleRedeem(id);
                }}
              >
                Đổi ngay! 🎁
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="store-main">
        {/* Toast notification */}
        {toast.msg ? (
          <div className={`store-toast store-toast--${toast.type}`}>
            {toast.msg}
          </div>
        ) : null}

        {/* Balance bar */}
        <div className="store-balance-bar">
          <span className="store-balance-label">💰 Số xu của bạn:</span>
          <strong className="store-balance-amount">
            {balance === null ? "..." : `${balance} xu`}
          </strong>
        </div>

        {loading ? <div className="store-state">Đang tải...</div> : null}
        {!loading && error ? (
          <div className="store-state store-state--error">{error}</div>
        ) : null}
        {!loading && !error && visible.length === 0 ? (
          <div className="store-state">Chưa có phần thưởng nào.</div>
        ) : null}

        <div className="store-grid">
          {visible.map((item, idx) => {
            const tint = TINTS[idx % TINTS.length];
            const outOfStock =
              typeof item?.stock === "number" && item.stock <= 0;
            const inactive = item?.is_active === false;
            const cantAfford = balance !== null && item.cost > balance;
            const disabled = inactive || outOfStock;
            const buying = redeemingId === item?.id;

            return (
              <div key={item.id} className="store-card-wrap">
                <button
                  type="button"
                  className={`store-card store-card--${tint} ${
                    selectedId === item.id ? "store-card--selected" : ""
                  } ${cantAfford ? "store-card--cant-afford" : ""}`}
                  onClick={() => setSelectedId(item.id)}
                  disabled={disabled}
                >
                  <div className="store-card-art">
                    <img
                      src={item.image_url}
                      alt={item.name}
                      className="store-card-img"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                    />
                  </div>
                  <span className="store-card-label">{item.name}</span>
                  {item.description ? (
                    <div className="store-card-desc">{item.description}</div>
                  ) : null}
                  <div className="store-card-meta">
                    <span className="store-card-cost">{item.cost} xu</span>
                    {typeof item.stock === "number" ? (
                      <span className="store-card-stock">
                        Còn: {item.stock}
                      </span>
                    ) : null}
                    {inactive ? (
                      <span className="store-card-inactive">Tạm ngưng</span>
                    ) : null}
                    {outOfStock ? (
                      <span className="store-card-inactive">Hết hàng</span>
                    ) : null}
                    {!inactive && !outOfStock && cantAfford ? (
                      <span className="store-card-no-balance">
                        Không đủ xu
                      </span>
                    ) : null}
                  </div>
                </button>

                <button
                  type="button"
                  className={`store-buy-btn ${cantAfford || disabled ? "store-buy-btn--disabled" : ""}`}
                  onClick={() => setConfirmReward(item)}
                  disabled={disabled || cantAfford || buying}
                  title={cantAfford ? `Cần thêm ${item.cost - balance} xu` : ""}
                >
                  {buying
                    ? "Đang đổi..."
                    : cantAfford
                      ? `Thiếu ${item.cost - balance} xu`
                      : "Đổi thưởng 🎁"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default StorePage;
