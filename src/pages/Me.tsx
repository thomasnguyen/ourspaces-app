import { useQuery } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "../../convex/_generated/api";
import { SettingsBody } from "../components/SettingsSheet";
import { JoinForm } from "../components/JoinForm";
import { useAccount } from "../live/useJoin";
import { useAvatarUpload } from "../live/useAvatarUpload";
import { resetIdentity, useIdentity } from "../live/identity";
import { getDataMode } from "../live/dataMode";
import { blobToDataUrl } from "../lib/avatarPhoto";
import { lastSpaceSlug, normalSpaceHash } from "../lib/routes";
import { MemberFace } from "../components/MemberFace";

/**
 * `#/me` — your page. The settings body with room to breathe, plus every
 * space you made or were let into. Live wiring lives in MeLive; the mock
 * page shows the same layout with the photo kept in-tab and no account.
 */
export function MePage() {
  const back = normalSpaceHash(lastSpaceSlug());
  return (
    <main className="paper-bg me-page">
      <a className="me-back" href={back}>
        <span aria-hidden="true">←</span> back to the room
      </a>
      {getDataMode() === "live" ? <MeLive /> : <MeBody uploadPhoto={blobToDataUrl} />}
    </main>
  );
}

function MeLive() {
  const account = useAccount();
  const upload = useAvatarUpload();
  const { signOut } = useAuthActions();
  const mine = useQuery(api.spaces.listMine, {}) ?? [];
  const leave = () => {
    void signOut().finally(() => {
      resetIdentity();
      window.location.hash = normalSpaceHash(lastSpaceSlug());
      window.location.reload();
    });
  };
  return (
    <MeBody
      uploadPhoto={upload}
      account={account}
      onSignOut={leave}
      joinForm={(done) => (
        <JoinForm
          reason="your name, your look, the spaces you're in — kept, so you're the same person on your phone."
          onJoined={done}
          onCancel={done}
        />
      )}
      spaces={mine}
    />
  );
}

function MeBody({
  spaces = [],
  ...body
}: Parameters<typeof SettingsBody>[0] & {
  spaces?: { _id: string; name: string; slug?: string; icon: string; color: string; isOwner: boolean }[];
}) {
  const identity = useIdentity();
  return (
    <div className="me-wrap">
      <section className="me-card">
        <div className="claim-card-heading settings-heading">
          <div>
            <span className="claim-card-kicker">your page</span>
            <strong>you&apos;re {identity.name}</strong>
            <span>{body.account?.joined ? "kept on every device" : "just in this browser, for now"}</span>
          </div>
          <MemberFace name={identity.name} avatarUrl={identity.avatarUrl} size="md" />
        </div>
        <SettingsBody {...body} />
      </section>

      <section className="me-spaces">
        <span className="claim-picker-label">your spaces</span>
        {spaces.length === 0 ? (
          <p className="me-spaces-empty">
            {body.account?.joined
              ? "nothing of yours yet — make a space from the + on the rail."
              : "join, and the spaces you make show up here on every device."}
          </p>
        ) : (
          <div className="me-space-grid">
            {spaces.map((space) => (
              <a
                key={space._id}
                className="me-space"
                href={space.slug ? normalSpaceHash(space.slug) : "#/"}
                style={{ backgroundColor: space.color }}
              >
                <span className="me-space-icon">{`${space.icon}︎`}</span>
                <strong>{space.name}</strong>
                {space.isOwner && <small>yours</small>}
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
