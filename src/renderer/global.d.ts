import type { KaitenScreenApi } from "../shared/ipc-contract";
import type { CaptureOverlayRegionPayload } from "../shared/capture-overlay-protocol";

declare global {
  interface Window {
    kaitenScreen: KaitenScreenApi;
    captureOverlay: {
      reportRegionSelected: (payload: CaptureOverlayRegionPayload) => void;
      reportCancelled: () => void;
    };
  }
}

export {};
