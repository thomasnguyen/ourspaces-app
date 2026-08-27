export type CanvasGestureKind = "move" | "resize";

export type CanvasLayout = {
  x: number;
  y: number;
  w: number;
  h: number;
  z: number;
};

export type LocalGesture = CanvasLayout & {
  sessionId: string;
  widgetId: string;
  kind: CanvasGestureKind;
};

export type LiveGesture = LocalGesture & {
  updatedAt: number;
};

export type LivePeer = {
  userId: string;
  name: string;
  color: string;
  emoji?: string;
  avatarUrl?: string;
  x: number;
  y: number;
  updatedAt: number;
  gesture?: LiveGesture;
};

export type GestureClaim =
  | { accepted: true }
  | {
      accepted: false;
      reason: "locked" | "missing";
      owner?: Pick<LivePeer, "userId" | "name" | "color">;
    };
