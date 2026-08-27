import { useEffect, useId } from "react";
import {
  SPACE_ACCENTS,
  SPACE_THEME_PRESETS,
  type SpaceCustomization,
  type SpaceThemeId,
} from "../data/spaceThemes";

export function SpaceEditorPanel({
  value,
  onChange,
  onClose,
  onSave,
}: {
  value: SpaceCustomization | null;
  onChange: (value: SpaceCustomization) => void;
  onClose: () => void;
  onSave: (value: SpaceCustomization) => void;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!value) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, value]);

  if (!value) return null;

  const update = (patch: Partial<SpaceCustomization>) => {
    onChange({ ...value, ...patch });
  };

  return (
    <aside className="widget-editor-panel space-editor-panel" aria-labelledby={titleId}>
      <header className="widget-editor-header">
        <div>
          <span className="widget-editor-type">room mode</span>
          <h2 id={titleId}>edit this space</h2>
        </div>
        <button
          type="button"
          className="widget-editor-close"
          onClick={onClose}
          aria-label="Close space editor"
        >
          ×
        </button>
      </header>

      <form
        className="widget-editor-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (value.name.trim()) onSave({ ...value, name: value.name.trim() });
        }}
      >
        <div className="widget-editor-fields">
          <section className="space-editor-section">
            <h3>Identity</h3>
            <div className="space-editor-identity-row">
              <label className="widget-editor-field space-editor-icon-field">
                <span>Icon</span>
                <input
                  type="text"
                  value={value.icon}
                  maxLength={2}
                  onChange={(event) => update({ icon: event.target.value })}
                  aria-label="Space icon"
                />
              </label>
              <label className="widget-editor-field">
                <span>Space name</span>
                <input
                  type="text"
                  value={value.name}
                  onChange={(event) => update({ name: event.target.value })}
                  autoFocus
                />
              </label>
            </div>
            <label className="widget-editor-field">
              <span>Short description</span>
              <input
                type="text"
                value={value.tagline}
                onChange={(event) => update({ tagline: event.target.value })}
              />
            </label>
            <fieldset className="space-kind-picker">
              <legend>Space type</legend>
              <div>
                {(["ongoing", "event"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    className={value.kind === kind ? "is-selected" : ""}
                    onClick={() => update({ kind })}
                    aria-pressed={value.kind === kind}
                  >
                    {kind}
                  </button>
                ))}
              </div>
            </fieldset>
          </section>

          <section className="space-editor-section">
            <div className="space-editor-section-heading">
              <h3>Wallpaper</h3>
              <span>previewing live</span>
            </div>
            <div className="space-wallpaper-grid">
              {SPACE_THEME_PRESETS.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={value.theme === theme.id ? "is-selected" : ""}
                  onClick={() => update({ theme: theme.id })}
                  aria-pressed={value.theme === theme.id}
                >
                  <span
                    className={`space-wallpaper-preview space-wallpaper-preview-${theme.id}`}
                    aria-hidden="true"
                  >
                    <i />
                    <i />
                    <i />
                  </span>
                  <strong>{theme.name}</strong>
                </button>
              ))}
            </div>
            <label className="space-custom-color">
              <span>
                <strong>Custom color</strong>
                <small>We’ll keep the title readable.</small>
              </span>
              <input
                type="color"
                value={value.customBackground}
                onChange={(event) =>
                  update({
                    theme: "custom" as SpaceThemeId,
                    customBackground: event.target.value,
                  })
                }
                aria-label="Custom background color"
              />
            </label>
          </section>

          <section className="space-editor-section">
            <h3>Room accent</h3>
            <div className="space-accent-picker">
              {SPACE_ACCENTS.map((accent) => (
                <button
                  key={accent.value}
                  type="button"
                  className={value.accent === accent.value ? "is-selected" : ""}
                  style={{ backgroundColor: accent.value }}
                  onClick={() => update({ accent: accent.value })}
                  aria-label={`${accent.name} accent`}
                  aria-pressed={value.accent === accent.value}
                />
              ))}
            </div>
            <p className="space-editor-help">
              Accent color marks this room in the rail and highlights selected objects.
            </p>
          </section>
        </div>

        <footer className="widget-editor-actions">
          <button type="button" className="widget-editor-cancel" onClick={onClose}>
            keep as-is
          </button>
          <button type="submit" className="widget-editor-save" disabled={!value.name.trim()}>
            save room
          </button>
        </footer>
      </form>
    </aside>
  );
}
