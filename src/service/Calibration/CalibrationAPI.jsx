import instance from "../instance";

const calibrateSessionAPI = async ({ events, duration = 30000, gameType = "target_tracking", childId }) => {
  const payload = {
    events,
    duration,
    gameType,
  };

  if (childId) {
    payload.childId = childId;
  }

  const response = await instance.post("calibrate", payload);
  return response.data;
};

export default { calibrateSessionAPI };
