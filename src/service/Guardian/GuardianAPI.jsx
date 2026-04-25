import instance from "../instance";

const postLinkChild = async (inviteCode) => {
  try {
    const response = await instance.post(`guardian/link-child`, { inviteCode });
    return response.data;
  } catch (error) {
    console.error("Error linking child:", error);
    throw error;
  }
};

const getChildren = async () => {
  try {
    const response = await instance.get(`guardian/children`);
    return response.data;
  } catch (error) {
    console.error("Error getting children:", error);
    throw error;
  }
};

export default { postLinkChild, getChildren };
