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

export default {
  createWeeklyReport,
  getChildren,
  postLinkChild,
  getReportChildById,
  getReportById,
};
