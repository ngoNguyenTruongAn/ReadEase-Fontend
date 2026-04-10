import instance from "../instance";
const getProfile = async () => {
  try {
    const response = await instance.get("users/me");
    return response.data;
  } catch (error) {
    const status = error?.response?.status;
    if (status === 404) {
      try {
        const fallbackResponse = await instance.get("auth/profile");
        return fallbackResponse.data;
      } catch (fallbackError) {
        console.error("Error getting profile:", fallbackError);
        throw fallbackError;
      }
    }

    console.error("Error getting profile:", error);
    throw error;
  }
};

export default { getProfile };
