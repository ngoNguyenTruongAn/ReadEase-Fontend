import instance, { logApiError } from "../instance";

const postLinkChild = async (inviteCode) => {
  try {
    const response = await instance.post(`guardian/link-child`, { inviteCode });
    return response.data;
  } catch (error) {
    logApiError(error, "GuardianAPI.postLinkChild");
    console.error("Error linking child:", error);
    throw error;
  }
};

const getChildren = async () => {
  try {
    const response = await instance.get(`guardian/all-children`);
    return response.data;
  } catch (error) {
    logApiError(error, "GuardianAPI.getChildren");
    console.error("Error getting children:", error);
    throw error;
  }
};

const requestEraseOtp = async (childId) => {
  try {
    const response = await instance.post(
      `guardian/${encodeURIComponent(childId)}/erase/otp`,
    );
    return response.data;
  } catch (error) {
    logApiError(error, "GuardianAPI.requestEraseOtp");
    console.error("Error requesting erase OTP:", error);
    throw error;
  }
};

const eraseChildData = async (childId, otpCode) => {
  try {
    const response = await instance.delete(
      `guardian/${encodeURIComponent(childId)}/erase`,
      {
        data: { otpCode },
      },
    );
    return response.data;
  } catch (error) {
    logApiError(error, "GuardianAPI.eraseChildData");
    console.error("Error erasing child data:", error);
    throw error;
  }
};

//tao bao cao tuan cho tre
const createWeeklyReport = async (childId) => {
  try {
    const response = await instance.post(`reports/generate/${childId}`);
    return response.data;
  } catch (error) {
    logApiError(error, "GuardianAPI.createWeeklyReport");
    console.error("Error generating weekly report:", error);
    throw error;
  }
};

//lay bao cua cu the
const getReportChildById = async (childId) => {
  try {
    const response = await instance.get(`reports/${childId}`);
    console.log("[GuardianAPI.getReportChildById]", { childId, data: response.data });
    return response.data;
  } catch (error) {
    logApiError(error, "GuardianAPI.getReportChildById");
    console.error("Error getting report child by id:", error);
    throw error;
  }
};

//lay chi tiet 1 bao cao
const getReportById = async (reportId) => {
  try {
    const response = await instance.get(`reports/detail/${reportId}`);
    return response.data;
  } catch (error) {
    logApiError(error, "GuardianAPI.getReportById");
    console.error("Error getting report by id:", error);
    throw error;
  }
};

const isMissingApproveRoute = (error) => {
  const status = error?.response?.status;
  return status === 404 || status === 405;
};

const approveReport = async (reportId, childId) => {
  const payload = childId ? { childId } : undefined;
  const requests = [
    () => instance.patch(`reports/${reportId}/approve`, payload),
    () => instance.post(`reports/${reportId}/approve`, payload),
    () => instance.patch(`reports/approve/${reportId}`, payload),
    () => instance.post(`reports/approve/${reportId}`, payload),
  ];

  let lastError = null;
  for (const run of requests) {
    try {
      const response = await run();
      return response.data;
    } catch (error) {
      lastError = error;
      if (!isMissingApproveRoute(error)) break;
    }
  }

  logApiError(lastError, "GuardianAPI.approveReport");
  console.error("Error approving report:", lastError);
  throw lastError;
};

export default {
  approveReport,
  createWeeklyReport,
  eraseChildData,
  getChildren,
  postLinkChild,
  requestEraseOtp,
  getReportChildById,
  getReportById,
};
