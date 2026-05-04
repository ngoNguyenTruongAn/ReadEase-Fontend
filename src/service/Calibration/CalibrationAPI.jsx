import instance from "../instance";

const calibrateSessionAPI = async ({
  events,
  duration = 30000,
  gameType = "target_tracking",
  childId,
  score = 0,
}) => {
  const payload = {
    events,
    duration,
    gameType,
    score,
  };

  if (childId) {
    payload.childId = childId;
  }

  const response = await instance.post("calibrate", payload);
  return response.data;
};

export default { calibrateSessionAPI };
