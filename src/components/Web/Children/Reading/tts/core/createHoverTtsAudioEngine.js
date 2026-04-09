const SILENT_WAV_DATA_URI =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

const safePlay = async (audio) => {
  try {
    await audio.play();
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error };
  }
};

const resetAudioElement = (audio) => {
  if (!audio) return;

  try {
    audio.pause();
    audio.currentTime = 0;
    audio.removeAttribute("src");
    audio.load();
  } catch {
    // no-op
  }
};

const createAudioElement = ({ playbackRate }) => {
  const audio = new Audio();
  audio.preload = "auto";
  audio.playbackRate = playbackRate;
  return audio;
};

const resolveAudioUrlsForSegment = (provider, segment) => {
  if (typeof provider?.buildAudioUrls === "function") {
    const urls = provider.buildAudioUrls(segment);
    return Array.isArray(urls) ? urls.filter(Boolean) : [];
  }

  if (typeof provider?.buildAudioUrl === "function") {
    const url = provider.buildAudioUrl(segment);
    return url ? [url] : [];
  }

  return [];
};

export const createHoverTtsAudioEngine = ({
  provider,
  stopDelayMs,
  playbackRate,
  onPlaybackError,
}) => {
  let audio = null;
  let stopTimer = null;
  let requestId = 0;
  let activeText = "";
  let segmentQueue = [];
  let disposed = false;

  const clearStopTimer = () => {
    if (!stopTimer) return;
    window.clearTimeout(stopTimer);
    stopTimer = null;
  };

  const ensureAudio = () => {
    if (!audio) {
      audio = createAudioElement({ playbackRate });
    }
    return audio;
  };

  const stopPlayback = () => {
    requestId += 1;
    segmentQueue = [];
    activeText = "";
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      resetAudioElement(audio);
    }
  };

  const playNextSegment = async (currentRequestId) => {
    if (disposed) return;
    if (currentRequestId !== requestId) return;

    const segment = segmentQueue.shift();
    if (!segment) return;

    const currentAudio = ensureAudio();
    currentAudio.onended = () => {
      playNextSegment(currentRequestId);
    };
    currentAudio.onerror = () => {
      playNextSegment(currentRequestId);
    };

    const candidateUrls = resolveAudioUrlsForSegment(provider, segment);
    if (candidateUrls.length === 0) {
      playNextSegment(currentRequestId);
      return;
    }

    let lastError = null;
    let lastAttemptedUrl = "";

    for (const candidateUrl of candidateUrls) {
      if (disposed) return;
      if (currentRequestId !== requestId) return;

      currentAudio.src = candidateUrl;
      const result = await safePlay(currentAudio);

      if (disposed) return;
      if (currentRequestId !== requestId) return;

      if (result.ok) {
        return;
      }

      const errorName = String(result.error?.name || "");

      // Common when a newer hover request interrupts current playback.
      if (errorName === "AbortError") {
        return;
      }

      if (errorName === "NotAllowedError") {
        onPlaybackError?.({
          error: result.error,
          providerId: provider?.id || "unknown",
          url: candidateUrl,
          attemptedUrls: candidateUrls,
          sourceText: activeText,
        });
        segmentQueue = [];
        return;
      }

      lastError = result.error;
      lastAttemptedUrl = candidateUrl;
    }

    if (lastError) {
      const lastErrorName = String(lastError?.name || "");
      onPlaybackError?.({
        error: lastError,
        providerId: provider?.id || "unknown",
        url: lastAttemptedUrl,
        attemptedUrls: candidateUrls,
        sourceText: activeText,
      });

      if (lastErrorName === "NotSupportedError") {
        segmentQueue = [];
        return;
      }
    }

    playNextSegment(currentRequestId);
  };

  const primeFromUserGesture = async () => {
    if (disposed) return false;

    const currentAudio = ensureAudio();
    const previousMuted = currentAudio.muted;
    const previousVolume = currentAudio.volume;

    try {
      currentAudio.muted = true;
      currentAudio.volume = 0;
      currentAudio.src = SILENT_WAV_DATA_URI;

      const result = await safePlay(currentAudio);
      if (!result.ok) {
        const errorName = String(result.error?.name || "");

        if (errorName === "AbortError") {
          return true;
        }

        onPlaybackError?.({
          error: result.error,
          providerId: provider?.id || "unknown",
          url: currentAudio.src,
        });
        return false;
      }

      currentAudio.pause();
      currentAudio.currentTime = 0;
      currentAudio.removeAttribute("src");
      currentAudio.load();

      return true;
    } finally {
      currentAudio.muted = previousMuted;
      currentAudio.volume = previousVolume;
    }
  };

  const speak = (rawText) => {
    if (disposed) return;

    const text = provider.normalizeText(rawText);
    if (!text) return;

    if (text === activeText) {
      return;
    }

    clearStopTimer();
    requestId += 1;
    activeText = text;
    segmentQueue = provider.createSegments(text);

    if (segmentQueue.length === 0) return;

    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      resetAudioElement(audio);
    }

    playNextSegment(requestId);
  };

  const scheduleStop = () => {
    if (disposed) return;

    clearStopTimer();
    stopTimer = window.setTimeout(() => {
      stopPlayback();
    }, stopDelayMs);
  };

  const stop = () => {
    if (disposed) return;

    clearStopTimer();
    stopPlayback();
  };

  const dispose = () => {
    if (disposed) return;

    disposed = true;
    clearStopTimer();
    stopPlayback();

    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      resetAudioElement(audio);
      audio = null;
    }
  };

  return {
    speak,
    scheduleStop,
    stop,
    primeFromUserGesture,
    dispose,
  };
};
