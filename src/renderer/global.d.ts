import type { KaitenScreenApi } from "../shared/ipc-contract";
import type { CaptureOverlayRegionPayload } from "../shared/capture-overlay-protocol";
import type {
  RecordingFinishedPayload,
  RecordingIndicatorInitPayload,
} from "../shared/recording-indicator-protocol";

declare global {
  interface Window {
    kaitenScreen: KaitenScreenApi;
    captureOverlay: {
      reportRegionSelected: (payload: CaptureOverlayRegionPayload) => void;
      reportCancelled: () => void;
    };
    recordingControl: {
      onInit: (callback: (payload: RecordingIndicatorInitPayload) => void) => void;
      onStopRequested: (callback: () => void) => void;
      reportStarted: () => void;
      reportStopClicked: () => void;
      reportFinished: (payload: RecordingFinishedPayload) => void;
      reportFailed: (message: string) => void;
    };
  }
}

export {};
