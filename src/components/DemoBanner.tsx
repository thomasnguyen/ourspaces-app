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

  function openWaitlist() {
    setView("waitlist");
    setSubmitted(false);
    dialog.current?.showModal();
  }

  return (
    <>
      <aside className="demo-banner" data-testid="demo-banner">
        <span className="demo-banner-label"><i /> Demo version</span>
        <p>Have a look around. <span>We're getting OurSpaces ready for your group.</span></p>
        <button className="demo-banner-cta" onClick={openWaitlist} data-testid="demo-waitlist-open">
          Join the waitlist <span>↗</span>
        </button>
      </aside>

      <dialog className="demo-waitlist" ref={dialog} data-testid="demo-waitlist-dialog"
        onClose={() => sessionStorage.setItem("ourspaces-demo-notice-seen", "1")}
        onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
        <div className="demo-waitlist-content">
          <div className="demo-waitlist-topline">
            <span className="demo-banner-label">{view === "notice" ? "OurSpaces · demo version" : "OurSpaces · coming soon"}</span>
            <button className="demo-waitlist-close" onClick={() => dialog.current?.close()} data-testid="demo-waitlist-close" aria-label="Close">×</button>
          </div>
          <span className="demo-waitlist-mark" aria-hidden="true">↗</span>
          {view === "notice" ? (
            <div data-testid="demo-welcome-notice">
              <h2>You're in<br />the demo.</h2>
              <p>This is a test version of OurSpaces, built for a hackathon. Have a look around, but it isn't ready for everyday use yet.</p>
              <button className="demo-waitlist-submit" onClick={() => dialog.current?.close()} data-testid="demo-notice-explore">Explore the demo <span>↗</span></button>
              <div className="demo-notice-waitlist">
                <span>Want a space for your own group?</span>
                <button onClick={openWaitlist} data-testid="demo-notice-waitlist">Join the waitlist ↗</button>
              </div>
            </div>
          ) : submitted ? (
            <>
              <h2>That's the idea.</h2>
              <p>This is a preview of the waitlist. Your email hasn't been saved yet.</p>
              <button className="demo-waitlist-submit" onClick={() => dialog.current?.close()} data-testid="demo-waitlist-done">Back to exploring <span>↗</span></button>
            </>
          ) : (
            <>
              <h2>Your people.<br />Your own space.</h2>
              <p>We're turning this demo into a home for your group. Join the waitlist to hear when it's ready.</p>
              <form onSubmit={(event) => { event.preventDefault(); setSubmitted(true); }}>
                <label htmlFor="demo-waitlist-email">Your email</label>
                <input id="demo-waitlist-email" type="email" placeholder="you@example.com" required data-testid="demo-waitlist-email" />
                <button className="demo-waitlist-submit" type="submit" data-testid="demo-waitlist-submit">Keep me in the loop <span>↗</span></button>
              </form>
              <small className="demo-waitlist-preview">Preview only — emails aren't collected yet.</small>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
