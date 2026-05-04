import instance from "../instance";

const getBalance = async (childId) => {
  try {
    const response = await instance.get(`tokens/${childId}/balance`);
    return response.data;
  } catch (error) {
    console.error("Error getting balance:", error);
    throw error;
  }
};

//lich su tieu dung
const getConsumptionHistory = async (childId) => {
  try {
    const response = await instance.get(`tokens/${childId}/history`);
    return response.data;
  } catch (error) {
    console.error("Error getting consumption history:", error);
    throw error;
  }
};

//danh sach phan thuong
const getRewardList = async () => {
  try {
    const response = await instance.get(`rewards`);
    return response.data;
  } catch (error) {
    console.error("Error getting reward list:", error);
    throw error;
  }
};

///doi phan thuong
const redeemReward = async (rewardId, childId, expectedVersion) => {
  const payload = {
    childId,
    expectedVersion,
  };
  try {
    const response = await instance.post(`rewards/${rewardId}/redeem`, payload);
    return response.data;
  } catch (error) {
    console.error("Error redeeming reward:", error);
    throw error;
  }
};

export default {
  getBalance,
  getConsumptionHistory,
  getRewardList,
  redeemReward,
};
