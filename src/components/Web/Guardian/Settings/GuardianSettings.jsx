import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { toast } from "react-toastify";
import {
  FaCheckCircle,
  FaExclamationTriangle,
  FaLock,
  FaTrashAlt,
} from "react-icons/fa";
import GuardianAPI from "../../../../service/Guardian/GuardianAPI";
import { humanizeApiError } from "../../../../service/instance";
import "./GuardianSettings.scss";

const OTP_LENGTH = 6;
const CONFIRM_DELAY_SECONDS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

const textOrEmpty = (value) => String(value ?? "").trim();

const pickChildId = (child) =>
  textOrEmpty(child?.id) ||
  textOrEmpty(child?._id) ||
  textOrEmpty(child?.childId) ||
  textOrEmpty(child?.child_id) ||
  textOrEmpty(child?.userId) ||
  textOrEmpty(child?.user_id);

const normalizeChild = (child, index) => {
  const id = pickChildId(child);
  const name =
    textOrEmpty(child?.display_name) ||
    textOrEmpty(child?.displayName) ||
    textOrEmpty(child?.full_name) ||
    textOrEmpty(child?.fullName) ||
    textOrEmpty(child?.name) ||
    textOrEmpty(child?.username) ||
    textOrEmpty(child?.email) ||
    `Trẻ ${index + 1}`;

  return {
    id,
    name,
    email: textOrEmpty(child?.email),
  };
};

const isMissingEraseOtpRoute = (error) => {
  const status = error?.response?.status;
  const data = error?.response?.data;
  const raw = typeof data === "string" ? data : JSON.stringify(data ?? {});

  return (
    status === 404 &&
    raw.includes("Cannot POST") &&
    raw.includes("/erase/otp")
  );
};

const GuardianSettings = () => {
  const outletContext = useOutletContext();
  const outletChildren = outletContext?.children;
  const loadingChildren = Boolean(outletContext?.loadingChildren);
  const refreshChildren = outletContext?.refreshChildren;

  const [selectedChildId, setSelectedChildId] = useState("");
  const [eraseModalOpen, setEraseModalOpen] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [requestingOtp, setRequestingOtp] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [confirmDelay, setConfirmDelay] = useState(CONFIRM_DELAY_SECONDS);
  const [resendDelay, setResendDelay] = useState(0);

  const childOptions = useMemo(() => {
    const source = Array.isArray(outletChildren) ? outletChildren : [];

    return source
      .map((child, index) => normalizeChild(child, index))
      .filter((child) => child.id);
  }, [outletChildren]);

  const selectedChild = useMemo(
    () => childOptions.find((child) => child.id === selectedChildId) ?? null,
    [childOptions, selectedChildId],
  );

  const isOtpComplete = new RegExp(`^\\d{${OTP_LENGTH}}$`).test(otpCode);
  const canStartErase = Boolean(selectedChild) && !requestingOtp && !erasing;
  const canConfirmErase =
    Boolean(selectedChild) &&
    eraseModalOpen &&
    otpSent &&
    isOtpComplete &&
    confirmDelay === 0 &&
    !erasing &&
    !requestingOtp;

  useEffect(() => {
    setSelectedChildId((current) => {
      if (current && childOptions.some((child) => child.id === current)) {
        return current;
      }

      return childOptions.length === 1 ? childOptions[0].id : "";
    });
  }, [childOptions]);

  useEffect(() => {
    setEraseModalOpen(false);
    setOtpSent(false);
    setOtpEmail("");
    setOtpCode("");
    setConfirmDelay(CONFIRM_DELAY_SECONDS);
    setResendDelay(0);
  }, [selectedChildId]);

  useEffect(() => {
    if (!eraseModalOpen || erasing) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setEraseModalOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [eraseModalOpen, erasing]);

  useEffect(() => {
    if (resendDelay <= 0) return undefined;

    const timer = window.setTimeout(() => {
      setResendDelay((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [resendDelay]);

  useEffect(() => {
    if (!eraseModalOpen || !otpSent || !isOtpComplete) {
      setConfirmDelay(CONFIRM_DELAY_SECONDS);
      return undefined;
    }

    setConfirmDelay(CONFIRM_DELAY_SECONDS);

    const timer = window.setInterval(() => {
      setConfirmDelay((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [eraseModalOpen, isOtpComplete, otpCode, otpSent]);

  const handleChildChange = (event) => {
    setSelectedChildId(event.target.value);
  };

  const handleOtpChange = (event) => {
    setOtpCode(event.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH));
  };

  const requestEraseOtp = async () => {
    if (!selectedChild || requestingOtp || erasing || resendDelay > 0) {
      return false;
    }

    setRequestingOtp(true);
    try {
      const response = await GuardianAPI.requestEraseOtp(selectedChild.id);
      const email = textOrEmpty(response?.data?.email);

      setOtpSent(true);
      setOtpEmail(email);
      setOtpCode("");
      setConfirmDelay(CONFIRM_DELAY_SECONDS);
      setResendDelay(RESEND_COOLDOWN_SECONDS);
      setEraseModalOpen(true);

      toast.success(
        response?.message ||
          "Mã OTP xóa dữ liệu đã được gửi tới email của phụ huynh.",
      );
      return true;
    } catch (error) {
      if (isMissingEraseOtpRoute(error)) {
        toast.error(
          "Backend hiện tại chưa có API gửi OTP xóa dữ liệu. Vui lòng kiểm tra server đã chạy đúng commit có POST /guardian/:childId/erase/otp.",
        );
        return false;
      }

      toast.error(
        humanizeApiError(error, "Không gửi được mã OTP. Vui lòng thử lại."),
      );
      return false;
    } finally {
      setRequestingOtp(false);
    }
  };

  const handleStartErase = async () => {
    if (!selectedChild || requestingOtp || erasing) return;

    if (otpSent) {
      setEraseModalOpen(true);
      return;
    }

    await requestEraseOtp();
  };

  const handleResendOtp = async () => {
    if (resendDelay > 0 || requestingOtp || erasing) return;
    await requestEraseOtp();
  };

  const handleCancelErase = () => {
    if (erasing) return;
    setEraseModalOpen(false);
  };

  const handleErase = async () => {
    if (!canConfirmErase) return;

    setErasing(true);
    try {
      const response = await GuardianAPI.eraseChildData(
        selectedChild.id,
        otpCode,
      );

      toast.success(
        response?.message || "Đã xóa vĩnh viễn dữ liệu của trẻ đã chọn.",
      );

      setEraseModalOpen(false);
      setSelectedChildId("");
      setOtpSent(false);
      setOtpEmail("");
      setOtpCode("");
      setConfirmDelay(CONFIRM_DELAY_SECONDS);
      setResendDelay(0);

      await refreshChildren?.();
    } catch (error) {
      toast.error(
        humanizeApiError(error, "Không xóa được dữ liệu. Vui lòng thử lại."),
      );
    } finally {
      setErasing(false);
    }
  };

  return (
    <div className="gst">
      <section className="gst-card gst-coppa" aria-labelledby="guardian-coppa">
        <div className="gst-coppa__status">
          <FaCheckCircle aria-hidden="true" />
          <span>Đã phê duyệt kích hoạt cho bé</span>
        </div>

        <div className="gst-card__body">
          <h2 id="guardian-coppa" className="gst-title">
            Quản lý tuân thủ COPPA
          </h2>
          <p className="gst-copy">
            ReadEase cam kết bảo mật dữ liệu theo yêu cầu của dự án. Hệ thống
            chỉ theo dõi dữ liệu hành vi ẩn danh thông qua Session ID và tuyệt
            đối không gắn kết với bất kỳ thông tin định danh cá nhân (PII) nào
            của trẻ.
          </p>
        </div>
      </section>

      <section className="gst-card gst-danger" aria-labelledby="guardian-delete">
        <div className="gst-card__body">
          <h2 id="guardian-delete" className="gst-title gst-title--danger">
            Xóa toàn bộ dữ liệu của trẻ
          </h2>
          <p className="gst-copy">
            Hành động này không thể hoàn tác. Báo cáo tuần, Token nỗ lực, lịch
            sử đổi thưởng, hồ sơ hiệu chuẩn, lịch sử đọc và liên kết tài khoản
            của trẻ sẽ bị xóa vĩnh viễn khỏi máy chủ.
          </p>

          <div className="gst-delete-flow">
            <label className="gst-field">
              <span className="gst-field__label">Chọn trẻ cần xóa dữ liệu</span>
              <select
                className="gst-field__control"
                value={selectedChildId}
                onChange={handleChildChange}
                disabled={loadingChildren || requestingOtp || erasing}
              >
                <option value="">
                  {loadingChildren
                    ? "Đang tải danh sách trẻ..."
                    : "Chọn một trẻ"}
                </option>
                {childOptions.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.email ? `${child.name} - ${child.email}` : child.name}
                  </option>
                ))}
              </select>
            </label>

            {childOptions.length === 0 && !loadingChildren ? (
              <div className="gst-alert" role="status">
                <FaExclamationTriangle aria-hidden="true" />
                <span>Chưa có trẻ nào được liên kết để xóa dữ liệu.</span>
              </div>
            ) : null}

            <button
              type="button"
              className="gst-delete"
              onClick={handleStartErase}
              disabled={!canStartErase}
            >
              <FaTrashAlt aria-hidden="true" />
              <span>
                {requestingOtp ? "Đang gửi OTP..." : "Xóa dữ liệu vĩnh viễn"}
              </span>
            </button>
          </div>
        </div>
      </section>

      {eraseModalOpen ? (
        <div className="gst-modal-backdrop" role="presentation">
          <div
            className="gst-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guardian-erase-modal-title"
          >
            <div className="gst-modal__icon" aria-hidden="true">
              <FaTrashAlt />
            </div>

            <h3 id="guardian-erase-modal-title" className="gst-modal__title">
              Xác nhận xóa dữ liệu
            </h3>
            <p className="gst-modal__copy">
              Hành động này sẽ xóa vĩnh viễn dữ liệu của {selectedChild?.name}.
              Nhập OTP đã nhận qua email để xác nhận.
            </p>

            <label className="gst-field gst-modal__field">
              <span className="gst-field__label">Mã OTP gồm 6 chữ số</span>
              <input
                className="gst-field__control gst-field__control--otp"
                value={otpCode}
                onChange={handleOtpChange}
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={OTP_LENGTH}
                placeholder="Nhập mã OTP"
                autoComplete="one-time-code"
                disabled={erasing}
                autoFocus
              />
            </label>

            <div className="gst-modal__notice" role="status">
              <FaLock aria-hidden="true" />
              <span>
                {isOtpComplete
                  ? confirmDelay > 0
                    ? `Nút xác nhận sẽ được mở khóa sau ${confirmDelay} giây.`
                    : "Bạn có thể xác nhận xóa dữ liệu."
                  : otpEmail
                    ? `OTP đã được gửi tới ${otpEmail}.`
                    : "OTP đã được gửi tới email phụ huynh."}
              </span>
            </div>

            <button
              type="button"
              className="gst-modal__resend"
              onClick={handleResendOtp}
              disabled={resendDelay > 0 || requestingOtp || erasing}
            >
              {requestingOtp
                ? "Đang gửi lại OTP..."
                : resendDelay > 0
                  ? `Gửi lại OTP sau ${resendDelay}s`
                  : "Gửi lại OTP"}
            </button>

            <div className="gst-modal__actions">
              <button
                type="button"
                className="gst-modal__cancel"
                onClick={handleCancelErase}
                disabled={erasing}
              >
                Hủy
              </button>
              <button
                type="button"
                className="gst-modal__confirm"
                onClick={handleErase}
                disabled={!canConfirmErase}
              >
                <FaLock aria-hidden="true" />
                <span>
                  {erasing
                    ? "Đang xóa..."
                    : isOtpComplete && confirmDelay > 0
                      ? `Xác nhận xóa (${confirmDelay}s)`
                      : "Xác nhận xóa"}
                </span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default GuardianSettings;
