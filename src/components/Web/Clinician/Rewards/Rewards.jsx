import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "react-toastify";
import ClinicianAPI from "../../../../service/Clinician/ClinicianAPI";
import { humanizeApiError } from "../../../../service/instance";
import "./Rewards.scss";

const TINTS = ["mint", "lavender", "peach", "coral", "sky"];

const pickRewardImageUrl = (item) => {
  if (!item || typeof item !== "object") return "";
  return String(
    item.image_url ?? item.imageUrl ?? item.image ?? item.icon_url ?? "",
  ).trim();
};

const normalizeRewardItem = (item) => ({
  ...item,
  image_url: pickRewardImageUrl(item),
});

const normalizeRewards = (res) => {
  const data = res?.data ?? res;
  let list = [];
  if (Array.isArray(data)) list = data;
  else if (Array.isArray(data?.items)) list = data.items;
  else if (Array.isArray(data?.rewards)) list = data.rewards;
  return list.map(normalizeRewardItem);
};

const emptyCreateForm = () => ({
  name: "",
  description: "",
  cost: "",
  stock: "",
  imageUrl: "",
});

const RewardArt = ({ reward, imgClassName, emptyClassName = "" }) => {
  const url = pickRewardImageUrl(reward);
  const [failedUrl, setFailedUrl] = useState(null);
  const imageFailed = Boolean(url) && failedUrl === url;

  if (!url || imageFailed) {
    return (
      <div
        className={`clrw-art-empty${emptyClassName ? ` ${emptyClassName}` : ""}`}
        aria-hidden="true"
      />
    );
  }

  return (
    <img
      src={url}
      alt={reward?.name || "Phần thưởng"}
      className={imgClassName}
      loading="lazy"
      onError={() => setFailedUrl(url)}
    />
  );
};

const Rewards = () => {
  const imageInputRef = useRef(null);
  const [rewards, setRewards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [form, setForm] = useState(emptyCreateForm);

  const fetchRewards = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await ClinicianAPI.getRewards();
      const list = normalizeRewards(res);
      setRewards(list);
      setSelectedId((prev) => {
        if (prev && list.some((r) => String(r.id) === String(prev)))
          return prev;
        return list[0]?.id != null ? String(list[0].id) : "";
      });
    } catch (err) {
      setError(humanizeApiError(err, "Không tải được danh sách phần thưởng."));
      setRewards([]);
      setSelectedId("");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRewards();
  }, [fetchRewards]);

  const selectedReward = useMemo(
    () => rewards.find((r) => String(r.id) === String(selectedId)) ?? null,
    [rewards, selectedId],
  );

  const openCreateModal = () => {
    setForm(emptyCreateForm());
    setCreateOpen(true);
  };

  const closeCreateModal = () => {
    if (submitting || uploadingImage) return;
    setCreateOpen(false);
    setForm(emptyCreateForm());
  };

  const applyPickedImage = async (file) => {
    if (!file) return;
    setUploadingImage(true);
    try {
      toast.info("Đang tải ảnh lên...");
      const url = await ClinicianAPI.uploadCoverImage(file);
      setForm((f) => ({ ...f, imageUrl: url }));
      toast.success("Đã tải ảnh lên.");
    } catch (err) {
      toast.error(humanizeApiError(err, "Không tải được ảnh lên."));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    const description = form.description.trim();
    const cost = Number(form.cost);
    const stock = Number(form.stock);
    const imageUrl = form.imageUrl.trim();

    if (!name) {
      toast.error("Vui lòng nhập tên phần thưởng.");
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      toast.error("Giá xu phải là số không âm.");
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      toast.error("Số lượng phải là số nguyên không âm.");
      return;
    }

    setSubmitting(true);
    try {
      await ClinicianAPI.postReward(name, description, cost, stock, imageUrl);
      toast.success("Đã tạo phần thưởng mới.");
      setCreateOpen(false);
      setForm(emptyCreateForm());
      await fetchRewards();
    } catch (err) {
      toast.error(humanizeApiError(err, "Tạo phần thưởng thất bại."));
    } finally {
      setSubmitting(false);
    }
  };

  const formBusy = submitting || uploadingImage;

  return (
    <div className="clrw">
      <header className="clrw-header">
        <div>
          <h1 className="clrw-title">Phần thưởng</h1>
          <p className="clrw-subtitle">
            Quản lý phần thưởng hiển thị tại cửa hàng của trẻ.
          </p>
        </div>
        <div className="clrw-header__actions">
          <button
            type="button"
            className="clrw-secondary"
            onClick={fetchRewards}
            disabled={loading}
          >
            {loading ? "Đang tải..." : "Làm mới"}
          </button>
          <button
            type="button"
            className="clrw-primary"
            onClick={openCreateModal}
          >
            + Tạo phần thưởng
          </button>
        </div>
      </header>

      {error ? <div className="clrw-error">{error}</div> : null}

      <div className="clrw-body">
        <section className="clrw-main" aria-label="Danh sách phần thưởng">
          {loading ? (
            <div className="clrw-state">Đang tải danh sách...</div>
          ) : rewards.length === 0 ? (
            <div className="clrw-state">
              Chưa có phần thưởng nào. Bấm &quot;Tạo phần thưởng&quot; để thêm
              mới.
            </div>
          ) : (
            <div className="clrw-grid">
              {rewards.map((item, idx) => {
                const tint = TINTS[idx % TINTS.length];
                const outOfStock =
                  typeof item?.stock === "number" && item.stock <= 0;
                const inactive = item?.is_active === false;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`clrw-card clrw-card--${tint} ${
                      String(selectedId) === String(item.id)
                        ? "clrw-card--selected"
                        : ""
                    }`}
                    onClick={() => setSelectedId(String(item.id))}
                  >
                    <div className="clrw-card-art">
                      <RewardArt reward={item} imgClassName="clrw-card-img" />
                    </div>
                    <span className="clrw-card-label">{item.name}</span>
                    {item.description ? (
                      <p className="clrw-card-desc">{item.description}</p>
                    ) : null}
                    <div className="clrw-card-meta">
                      <span className="clrw-card-cost">{item.cost} xu</span>
                      {typeof item.stock === "number" ? (
                        <span className="clrw-card-stock">
                          Còn: {item.stock}
                        </span>
                      ) : null}
                      {inactive ? (
                        <span className="clrw-card-tag clrw-card-tag--muted">
                          Tạm ngưng
                        </span>
                      ) : null}
                      {outOfStock ? (
                        <span className="clrw-card-tag clrw-card-tag--warn">
                          Hết hàng
                        </span>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="clrw-aside" aria-label="Chi tiết phần thưởng">
          {selectedReward ? (
            <div className="clrw-preview">
              <div className="clrw-preview-art">
                <RewardArt
                  reward={selectedReward}
                  imgClassName="clrw-preview-img"
                />
              </div>
              <h2 className="clrw-preview-title">{selectedReward.name}</h2>
              {selectedReward.description ? (
                <p className="clrw-preview-desc">
                  {selectedReward.description}
                </p>
              ) : (
                <p className="clrw-preview-desc clrw-preview-desc--muted">
                  Chưa có mô tả.
                </p>
              )}
              <dl className="clrw-preview-stats">
                <div className="clrw-preview-stat">
                  <dt>Giá</dt>
                  <dd>{selectedReward.cost} xu</dd>
                </div>
                {typeof selectedReward.stock === "number" ? (
                  <div className="clrw-preview-stat">
                    <dt>Tồn kho</dt>
                    <dd>{selectedReward.stock}</dd>
                  </div>
                ) : null}
                <div className="clrw-preview-stat">
                  <dt>Trạng thái</dt>
                  <dd>
                    {selectedReward.is_active === false
                      ? "Tạm ngưng"
                      : typeof selectedReward.stock === "number" &&
                          selectedReward.stock <= 0
                        ? "Hết hàng"
                        : "Đang bán"}
                  </dd>
                </div>
              </dl>
            </div>
          ) : (
            <div className="clrw-preview clrw-preview--empty">
              <RewardArt reward={null} emptyClassName="clrw-art-empty--large" />
              <p>Chọn một phần thưởng để xem chi tiết.</p>
            </div>
          )}
        </aside>
      </div>

      {createOpen ? (
        <div
          className="clrw-modal-overlay"
          role="presentation"
          onMouseDown={(e) => {
            if (formBusy) return;
            if (e.target === e.currentTarget) closeCreateModal();
          }}
        >
          <div
            className="clrw-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clrw-create-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="clrw-create-title" className="clrw-modal__title">
              Tạo phần thưởng mới
            </h2>
            <p className="clrw-modal__subtitle">
              Phần thưởng sẽ hiển thị trong cửa hàng của trẻ sau khi tạo.
            </p>

            <form className="clrw-form" onSubmit={handleCreate}>
              <label className="clrw-field">
                <span className="clrw-field__label">Tên phần thưởng *</span>
                <input
                  className="clrw-field__input"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Ví dụ: Mũ siêu nhân"
                  autoComplete="off"
                  disabled={formBusy}
                  required
                />
              </label>

              <label className="clrw-field clrw-field--full">
                <span className="clrw-field__label">Ảnh phần thưởng</span>
                <div className="clrw-cover-row">
                  <input
                    className="clrw-field__input clrw-field__input--flex"
                    value={form.imageUrl}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, imageUrl: e.target.value }))
                    }
                    placeholder="https://... hoặc chọn ảnh từ máy"
                    autoComplete="off"
                    disabled={formBusy}
                  />
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    className="clrw-file-input-hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) applyPickedImage(file);
                      e.target.value = "";
                    }}
                  />
                  <button
                    type="button"
                    className="clrw-file-pick"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={formBusy}
                  >
                    {uploadingImage ? "Đang tải..." : "Chọn ảnh"}
                  </button>
                </div>
                {form.imageUrl.trim() ? (
                  <div className="clrw-form-preview">
                    <img
                      src={form.imageUrl.trim()}
                      alt="Xem trước"
                      className="clrw-form-preview-img"
                    />
                  </div>
                ) : null}
              </label>

              <label className="clrw-field clrw-field--full">
                <span className="clrw-field__label">Mô tả</span>
                <textarea
                  className="clrw-field__textarea"
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  placeholder="Mô tả ngắn về phần thưởng..."
                  rows={3}
                  disabled={formBusy}
                />
              </label>

              <div className="clrw-form-row">
                <label className="clrw-field">
                  <span className="clrw-field__label">Giá (xu) *</span>
                  <input
                    className="clrw-field__input"
                    type="number"
                    min={0}
                    step={1}
                    value={form.cost}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, cost: e.target.value }))
                    }
                    placeholder="100"
                    disabled={formBusy}
                    required
                  />
                </label>

                <label className="clrw-field">
                  <span className="clrw-field__label">Số lượng *</span>
                  <input
                    className="clrw-field__input"
                    type="number"
                    min={0}
                    step={1}
                    value={form.stock}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, stock: e.target.value }))
                    }
                    placeholder="10"
                    disabled={formBusy}
                    required
                  />
                </label>
              </div>

              <div className="clrw-modal__actions">
                <button
                  type="button"
                  className="clrw-secondary"
                  onClick={closeCreateModal}
                  disabled={formBusy}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="clrw-primary"
                  disabled={formBusy || !form.name.trim()}
                >
                  {submitting ? "Đang tạo..." : "Tạo phần thưởng"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Rewards;
