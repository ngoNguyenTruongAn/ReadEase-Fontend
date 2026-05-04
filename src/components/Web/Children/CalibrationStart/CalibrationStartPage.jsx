import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./CalibrationStartPage.scss";
import flyingBee from "../../../../assets/image/flying bee.png";
import gameBee from "../../../../assets/image/output-onlinegiftools.gif";
import sparklesIcon from "../../../../assets/image/sparkles 1.png";
import CalibrationAPI from "../../../../service/Calibration/CalibrationAPI";
import AuthAPI from "../../../../service/Auth/AuthAPI";
import { getSelectedStory } from "../Reading/readingUtils";

const GAME_DURATION = 30;
const BEE_RESPAWN_DELAY = 500;
const BEE_WIDTH = 138;
const BEE_HEIGHT = 96;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getRandomBeePosition = (container) => {
  const sidePadding = 80;
  const topPadding = 90;
  const bottomPadding = 70;
  const maxX = Math.max(sidePadding, container.width - sidePadding - BEE_WIDTH);
  const maxY = Math.max(topPadding, container.height - bottomPadding - BEE_HEIGHT);

  return {
    x: sidePadding + Math.random() * (maxX - sidePadding),
    y: topPadding + Math.random() * (maxY - topPadding),
  };
};

const formatTime = (secondsLeft) => `00:${String(secondsLeft).padStart(2, "0")}`;

const CalibrationStartPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const containerRef = useRef(null);
  const movementStateRef = useRef({
    dx: 2.2,
    dy: 1.4,
    pauseTicks: 0,
    tickCount: 0,
  });
  const hoverCooldownRef = useRef(false);
  const capturedEventsRef = useRef([]);
  const calibrationSubmittingRef = useRef(false);

  const [phase, setPhase] = useState("start");
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [score, setScore] = useState(0);
  const [beePosition, setBeePosition] = useState({
    x: 280,
    y: 260,
    angle: 0,
    facing: 1,
  });
  const [beeVisible, setBeeVisible] = useState(true);
  const [feedback, setFeedback] = useState({
    visible: false,
    x: 0,
    y: 0,
    pulse: 0,
  });
  const [childId, setChildId] = useState(null);
  const selectedStory = location.state?.story ?? getSelectedStory();

  const handleStart = async () => {
    setScore(0);
    setTimeLeft(GAME_DURATION);
    capturedEventsRef.current = [];
    hoverCooldownRef.current = false;
    calibrationSubmittingRef.current = false;
    setBeeVisible(true);

    // Lấy childId từ profile
    try {
      const profilePayload = await AuthAPI.getProfileAPI();
      const profile = profilePayload?.data || profilePayload?.user || profilePayload || {};
      setChildId(profile.id || profile._id || profile.user_id || null);
    } catch (e) {
      setChildId(null);
    }

    const container = containerRef.current?.getBoundingClientRect();
    if (container) {
      const randomPosition = getRandomBeePosition(container);
      setBeePosition((previous) => ({
        ...previous,
        x: randomPosition.x,
        y: randomPosition.y,
      }));
    }

    setPhase("playing");
  };

  const submitCalibration = async () => {
    if (calibrationSubmittingRef.current) return;

    calibrationSubmittingRef.current = true;

    try {
      await CalibrationAPI.calibrateSessionAPI({
        events: capturedEventsRef.current,
        duration: GAME_DURATION * 1000,
        gameType: "target_tracking",
        childId: childId,
        score: score,
      });
    } catch (error) {
      console.error("Calibration submit failed:", error);
    }
  };

  const handleMouseMove = (event) => {
    if (phase !== "playing") return;

    const target = containerRef.current;
    if (!target) return;

    const bounds = target.getBoundingClientRect();
    capturedEventsRef.current.push({
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
      timestamp: Date.now(),
    });

    if (capturedEventsRef.current.length > 3000) {
      capturedEventsRef.current.shift();
    }
  };

  const handleBeeHover = () => {
    if (phase !== "playing" || hoverCooldownRef.current || !beeVisible) return;

    hoverCooldownRef.current = true;
    setBeeVisible(false);
    setScore((previous) => previous + 1);

    setFeedback({
      visible: true,
      x: Math.max(28, beePosition.x - 80),
      y: Math.max(100, beePosition.y - 56),
      pulse: Date.now(),
    });

    setTimeout(() => {
      setFeedback((previous) => ({ ...previous, visible: false }));
    }, 760);

    setTimeout(() => {
      const container = containerRef.current?.getBoundingClientRect();
      if (container) {
        const randomPosition = getRandomBeePosition(container);
        setBeePosition((previous) => ({
          ...previous,
          x: randomPosition.x,
          y: randomPosition.y,
        }));
      }

      setBeeVisible(true);
      hoverCooldownRef.current = false;
    }, BEE_RESPAWN_DELAY);
  };

  useEffect(() => {
    if (phase !== "playing") return undefined;

    const countDownInterval = setInterval(() => {
      setTimeLeft((previous) => {
        if (previous <= 1) {
          clearInterval(countDownInterval);
          return 0;
        }
        return previous - 1;
      });
    }, 1000);

    return () => {
      clearInterval(countDownInterval);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== "playing") return undefined;

    let animationFrameId = null;
    let lastTimestamp = performance.now();

    const animateBee = (timestamp) => {
      const container = containerRef.current?.getBoundingClientRect();
      if (!container) {
        animationFrameId = window.requestAnimationFrame(animateBee);
        return;
      }

      const delta = Math.min((timestamp - lastTimestamp) / 16.67, 1.8);
      lastTimestamp = timestamp;

      if (!beeVisible) {
        animationFrameId = window.requestAnimationFrame(animateBee);
        return;
      }

      const state = movementStateRef.current;
      state.tickCount += delta;

      if (state.pauseTicks > 0) {
        state.pauseTicks -= delta;
        animationFrameId = window.requestAnimationFrame(animateBee);
        return;
      }

      if (state.tickCount % 95 < 1.8 && Math.random() > 0.58) {
        state.pauseTicks = 20 + Math.floor(Math.random() * 24);
        animationFrameId = window.requestAnimationFrame(animateBee);
        return;
      }

      if (Math.random() > 0.965) {
        state.dx += (Math.random() - 0.5) * 0.55;
        state.dy += (Math.random() - 0.5) * 0.55;
      }

      state.dx = Math.max(Math.min(state.dx, 2.8), -2.8);
      state.dy = Math.max(Math.min(state.dy, 2.2), -2.2);

      setBeePosition((previous) => {
        let nextX = previous.x + state.dx * delta;
        let nextY =
          previous.y + state.dy * delta + Math.sin(state.tickCount / 10) * 0.7;
        // Sprite default faces RIGHT, so moving LEFT must flip horizontally.
        const facing = state.dx >= 0 ? 1 : -1;
        const nextAngle = clamp(
          Math.atan2(state.dy, Math.max(Math.abs(state.dx), 0.01)) * (180 / Math.PI),
          -18,
          18,
        );

        const minX = 30;
        const minY = 90;
        const maxX = container.width - BEE_WIDTH - 24;
        const maxY = container.height - BEE_HEIGHT - 18;

        if (nextX <= minX || nextX >= maxX) {
          state.dx *= -1;
          nextX = Math.min(Math.max(nextX, minX), maxX);
        }

        if (nextY <= minY || nextY >= maxY) {
          state.dy *= -1;
          nextY = Math.min(Math.max(nextY, minY), maxY);
        }

        return {
          x: nextX,
          y: nextY,
          // Head should lead direction changes quickly but still stay smooth.
          angle: previous.angle * 0.3 + nextAngle * 0.7,
          facing,
        };
      });

      animationFrameId = window.requestAnimationFrame(animateBee);
    };

    animationFrameId = window.requestAnimationFrame(animateBee);

    return () => {
      if (animationFrameId) {
        window.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [phase, beeVisible]);

  useEffect(() => {
    if (phase !== "playing" || timeLeft > 0) return;

    let isActive = true;

    const finalizeCalibration = async () => {
      await submitCalibration();
      if (isActive) {
        setPhase("success");
      }
    };

    finalizeCalibration();

    return () => {
      isActive = false;
    };
  }, [phase, timeLeft]);

  useEffect(() => {
    if (phase !== "success") return undefined;

    const redirectTimeout = window.setTimeout(() => {
      navigate("/children/reading", {
        state: { story: selectedStory },
      });
    }, 2500);

    return () => {
      window.clearTimeout(redirectTimeout);
    };
  }, [phase, navigate, selectedStory]);

  const handleStartReading = () => {
    navigate("/children/reading", {
      state: { story: selectedStory },
    });
  };

  return (
    <div
      className={`calibration-start-page calibration-phase-${phase}`}
      ref={containerRef}
      onMouseMove={handleMouseMove}
    >
      {(phase === "playing" || phase === "success") && (
        <div className={`calibration-timer ${phase === "success" ? "is-blur" : ""}`}>
          {formatTime(timeLeft)}
        </div>
      )}

      {phase === "start" && (
        <div className="calibration-start-card">
          <img
            src={flyingBee}
            alt="Flying bee"
            className="calibration-start-hero"
          />

          <h1 className="calibration-start-title">Chúng ta cùng khởi động nhé!</h1>

          <p className="calibration-start-subtitle">
            Hãy dùng chuột đuổi theo bạn Ong trong 30 giây
          </p>

          <button
            type="button"
            className="calibration-start-button"
            onClick={handleStart}
          >
            Chơi ngay!
          </button>
        </div>
      )}

      {phase === "playing" && (
        <>
          <div
            className={`game-bee-wrapper ${beeVisible ? "is-visible" : "is-hidden"}`}
            style={{
              left: `${beePosition.x}px`,
              top: `${beePosition.y}px`,
              transform: `rotate(${beePosition.angle * beePosition.facing}deg) scaleX(${beePosition.facing})`,
            }}
            onMouseEnter={handleBeeHover}
          >
            <img src={gameBee} alt="Target bee" className="game-bee" />
          </div>

          <div
            className={`hover-feedback ${feedback.visible ? "is-visible" : ""}`}
            style={{
              left: `${feedback.x}px`,
              top: `${feedback.y}px`,
            }}
          >
            <svg
              width="98"
              height="70"
              viewBox="0 0 170 114"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="hover-feedback-burst"
            >
              <line
                x1="62.9976"
                y1="104.971"
                x2="10.9257"
                y2="82.512"
                stroke="#FBBF24"
                strokeWidth="6"
                strokeLinecap="round"
              />
              <line
                x1="3"
                y1="-3"
                x2="59.709"
                y2="-3"
                transform="matrix(0.700157 -0.713989 -0.713989 -0.700157 119.174 93.2612)"
                stroke="#FBBF24"
                strokeWidth="6"
                strokeLinecap="round"
              />
              <line
                x1="72.8294"
                y1="95.8943"
                x2="46.6408"
                y2="56.7758"
                stroke="#FBBF24"
                strokeWidth="6"
                strokeLinecap="round"
              />
              <line
                x1="3"
                y1="-3"
                x2="50.0754"
                y2="-3"
                transform="matrix(0.200596 -0.979674 -0.979674 -0.200596 107.341 90.874)"
                stroke="#FBBF24"
                strokeWidth="6"
                strokeLinecap="round"
              />
              <line
                x1="85.1006"
                y1="91.2813"
                x2="63.1948"
                y2="20.598"
                stroke="#FBBF24"
                strokeWidth="6"
                strokeLinecap="round"
              />
              <line
                x1="3"
                y1="-3"
                x2="77"
                y2="-3"
                transform="matrix(-0.0873344 -0.996179 -0.996179 0.0873344 95.0508 92.1601)"
                stroke="#FBBF24"
                strokeWidth="6"
                strokeLinecap="round"
              />
            </svg>
            <div className="hover-feedback-content" key={feedback.pulse}>
              <span className="hover-feedback-text">Làm tốt lắm!</span>
              <div className="hover-feedback-score">
                +1
                <img
                  src={sparklesIcon}
                  alt="Sparkles"
                  className="hover-feedback-score-icon"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {phase === "success" && (
        <>
          <img
            src={gameBee}
            alt="Decorative bee"
            className="background-blur-bee"
          />

          <div className="calibration-start-card success-card">
            <img
              src={flyingBee}
              alt="Flying bee"
              className="calibration-start-hero"
            />

            <h1 className="calibration-start-title">Bạn đã khởi động rất tốt!</h1>

            <p className="calibration-start-subtitle">Đây là phần thưởng của bạn</p>

            <div className="reward-points">
              +{score}
              <img src={sparklesIcon} alt="Sparkles" className="reward-icon" />
            </div>

            <button
              type="button"
              className="calibration-start-button calibration-finish-button"
              onClick={handleStartReading}
            >
              Bắt đầu đọc sách thôi!
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default CalibrationStartPage;
