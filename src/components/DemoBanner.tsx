import { useEffect, useRef, useState } from "react";

export function DemoBanner() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [view, setView] = useState<"notice" | "waitlist">("notice");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!sessionStorage.getItem("ourspaces-demo-notice-seen")) {
      dialog.current?.showModal();
    }
  }, []);

  function openNotice() {
    setView("notice");
    setSubmitted(false);
    dialog.current?.showModal();
  }

  function openWaitlist() {
    setView("waitlist");
    setSubmitted(false);
    dialog.current?.showModal();
  }

  return (
    <>
      <aside className="demo-banner" data-testid="demo-banner">
        <button className="demo-banner-label" onClick={openNotice} data-testid="demo-notice-open">
          <span className="demo-mini-spark">✳</span> Demo version
        </button>
        <p>You're exploring a demo. <span>Your own space is coming.</span></p>
        <button className="demo-banner-cta" onClick={openWaitlist} data-testid="demo-waitlist-open">
          Join the waitlist <span>↗</span>
        </button>
      </aside>

      <dialog className="demo-waitlist" ref={dialog} data-testid="demo-waitlist-dialog"
        onClose={() => sessionStorage.setItem("ourspaces-demo-notice-seen", "1")}
        onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
        <div className="demo-waitlist-layout">
          <div className="demo-poster" aria-hidden="true">
            <div className="demo-poster-brand"><img src="/assets/ourspace-mark.png" alt="" /><span>ourspaces</span></div>
            <div className="demo-poster-collage">
              <div className="demo-poster-paper" />
              <figure className="demo-poster-photo">
                <img src="/assets/the-crew-snapshot.jpg" alt="" />
                <figcaption>friday at maya's <span>♡</span></figcaption>
              </figure>
              <img className="demo-poster-sticker" src="/assets/stickers/glad-ur-here.png" alt="" />
            </div>
            <div className="demo-poster-caption"><strong>Your people.<br />All here.</strong><span>A little corner of the internet, together.</span></div>
          </div>

          <div className="demo-waitlist-content">
            <div className="demo-waitlist-topline">
              {view === "waitlist" && !submitted ? (
                <button className="demo-waitlist-back" onClick={() => setView("notice")} data-testid="demo-waitlist-back">← The demo</button>
              ) : <span className="demo-eyebrow"><i /> {view === "notice" ? "A work in progress" : "Waitlist preview"}</span>}
              <button className="demo-waitlist-close" onClick={() => dialog.current?.close()} data-testid="demo-waitlist-close" aria-label="Close">×</button>
            </div>

            {view === "notice" ? (
              <div className="demo-waitlist-body" data-testid="demo-welcome-notice">
                <h2>You're in<br /><em>the demo.</em></h2>
                <p>Built for a hackathon. Open for a look around.</p>
                <p className="demo-notice-detail">This is a test version of OurSpaces, so it isn't ready for everyday use yet.</p>
                <button className="demo-waitlist-submit" onClick={() => dialog.current?.close()} data-testid="demo-notice-explore">Explore the demo <span>↗</span></button>
                <div className="demo-notice-waitlist">
                  <span>Want a space for your own group?</span>
                  <button onClick={openWaitlist} data-testid="demo-notice-waitlist">Join the waitlist <span>↗</span></button>
                </div>
              </div>
            ) : submitted ? (
              <div className="demo-waitlist-body demo-waitlist-confirmation" key="confirmation">
                <h2>That's<br /><em>the idea.</em></h2>
                <p>A little preview of what's next.</p>
                <p className="demo-notice-detail">The waitlist is still a mock-up. Your email hasn't been saved.</p>
                <button className="demo-waitlist-submit" onClick={() => dialog.current?.close()} data-testid="demo-waitlist-done">Back to exploring <span>↗</span></button>
              </div>
            ) : (
              <div className="demo-waitlist-body" key="waitlist">
                <h2>Your people.<br /><em>Your space.</em></h2>
                <p>We're making room for your group. Join the waitlist to hear when it's ready.</p>
                <form onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}>
                  <label htmlFor="demo-waitlist-email">Your email</label>
                  <input id="demo-waitlist-email" type="email" placeholder="you@example.com" required data-testid="demo-waitlist-email" />
                  <button className="demo-waitlist-submit" type="submit" data-testid="demo-waitlist-submit">Keep me in the loop <span>↗</span></button>
                </form>
                <small className="demo-waitlist-preview">Just a preview. Emails aren't collected yet.</small>
              </div>
            )}
            <div className="demo-waitlist-footnote"><span>Made for the group chat.</span><span>And everything after.</span></div>
          </div>
        </div>
      </dialog>
    </>
  );
}
