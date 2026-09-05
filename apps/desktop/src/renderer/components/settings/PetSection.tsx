/**
 * Settings → 宠物 (first-class nav, ported from zeno-update).
 *
 * zeno-update drove this surface from its SettingsModelContext (activeTab /
 * sectionNav / rowHighlight / title). pix has none of that, so this component
 * is self-contained: prefs come straight from the `window.zeno.pet` bridge,
 * the two tabs (look / bubbles) are local `Tabs` state, and the shared
 * settings chrome is pix's own SettingsPrimitives.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { PetMark } from "@/components/pet/PetMark";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listen } from "@/lib/api/host";
import type { MessageKey } from "@/lib/i18n";
import {
  PET_BUBBLE_DISMISS_MAX,
  PET_BUBBLE_DISMISS_MIN,
  PET_BUBBLE_SHAPES,
  PET_BUBBLE_STYLES,
  PET_COLORS,
  PET_COLOR_SWATCH,
  PET_EXPRESSIONS,
  PET_PICKER_SHAPES,
  PET_SIZES,
  isPetColor,
  isPetShape,
  normalizePetBubbleDismissSec,
  normalizePetBubbleShape,
  normalizePetBubbleStyle,
  normalizePetExpression,
  normalizePetEyeColor,
  normalizePetSize,
  type PetColor,
  type PetEyeColor,
  type PetShape,
} from "@/lib/pet";
import {
  PET_PREFS_FALLBACK,
  getPetPrefsCache,
  petHide,
  petPrefsGet,
  petPrefsSet,
  petShow,
  type PetPrefs,
} from "@/lib/api/pet";
import {
  SettingsHelpTip,
  SettingsPageShell,
  SettingsRow,
  SettingsSelect,
  SettingsToggle,
} from "./SettingsPrimitives.tsx";

const DEFAULT_PREFS: PetPrefs = { ...PET_PREFS_FALLBACK };

function petWindowOn(p: PetPrefs): boolean {
  return p.enabled && p.visible;
}

export function PetSection(props: {
  tr: (key: MessageKey, vars?: Record<string, string>) => string;
}) {
  const { tr } = props;
  // Start from the last known prefs so re-entering the section doesn't flash
  // the fallback (green) color before the async `petPrefsGet` resolves.
  const [prefs, setPrefs] = useState<PetPrefs>(() => getPetPrefsCache() ?? DEFAULT_PREFS);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("look");
  const toggleGen = useRef(0);

  useEffect(() => {
    let gone = false;
    let unlisten: (() => void) | undefined;
    void petPrefsGet().then((p) => {
      if (!gone) setPrefs(p);
    });
    void listen<PetPrefs>("pet://prefs", (p) => {
      if (!gone && p) setPrefs(p);
    }).then((u) => {
      if (gone) u();
      else unlisten = u;
    });
    return () => {
      gone = true;
      unlisten?.();
    };
  }, []);

  const commit = useCallback(async (next: PetPrefs) => {
    setPrefs(next);
    setBusy(true);
    try {
      const saved = await petPrefsSet(next);
      setPrefs(saved);
    } finally {
      setBusy(false);
    }
  }, []);

  const onToggleWindow = useCallback(async (next: boolean) => {
    const gen = ++toggleGen.current;
    setPrefs((p) => ({ ...p, enabled: next ? true : p.enabled, visible: next }));
    setBusy(true);
    try {
      const saved = next ? await petShow() : await petHide();
      if (gen !== toggleGen.current) return;
      setPrefs(saved);
    } catch {
      if (gen !== toggleGen.current) return;
      try {
        setPrefs(await petPrefsGet());
      } catch {
        /* keep optimistic state */
      }
    } finally {
      if (gen === toggleGen.current) setBusy(false);
    }
  }, []);

  const shown = petWindowOn(prefs);
  const shape: PetShape = isPetShape(prefs.shape) ? prefs.shape : "hex";
  const color: PetColor = isPetColor(prefs.color) ? prefs.color : "black";
  const eyeColor: PetEyeColor = normalizePetEyeColor(prefs.eyeColor);
  const expression = normalizePetExpression(prefs.expression);
  const sizePx = normalizePetSize(prefs.sizePx);
  const bubbleShape = normalizePetBubbleShape(prefs.bubbleShape);
  const bubbleStyle = normalizePetBubbleStyle(prefs.bubbleStyle);

  return (
    <SettingsPageShell title={tr("section.pet")} testId="settings-pet">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="mb-2">
          <TabsTrigger value="look" data-testid="pet-tab-look">
            {tr("settings.tab.petLook")}
          </TabsTrigger>
          <TabsTrigger value="bubbles" data-testid="pet-tab-bubbles">
            {tr("settings.tab.petBubbles")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="look">
          <div className="settings-card pet-look">
            <div className="pet-look__toolbar">
              <div className="pet-look__toolbar-item" id="settings-anchor-pet">
                <span className="pet-look__field-label inline-flex items-center gap-1">
                  {tr("settings.pet.enabled")}
                  <SettingsHelpTip ariaLabel={tr("settings.pet.enabledDesc")}>
                    {tr("settings.pet.enabledDesc")}
                  </SettingsHelpTip>
                </span>
                <SettingsToggle
                  checked={shown}
                  aria-label={tr("settings.pet.enabled")}
                  onChange={(next) => void onToggleWindow(next)}
                />
              </div>
              <div className="pet-look__toolbar-item" id="settings-anchor-pet-size">
                <span className="pet-look__field-label inline-flex items-center gap-1">
                  {tr("settings.pet.size")}
                  <SettingsHelpTip ariaLabel={tr("settings.pet.sizeDesc")}>
                    {tr("settings.pet.sizeDesc")}
                  </SettingsHelpTip>
                </span>
                <SettingsSelect
                  value={String(sizePx)}
                  onChange={(v) => void commit({ ...prefs, sizePx: normalizePetSize(Number(v)) })}
                  options={PET_SIZES.map((n) => ({
                    value: String(n),
                    label:
                      n === 96
                        ? tr("settings.pet.size.sm")
                        : n === 160
                          ? tr("settings.pet.size.lg")
                          : tr("settings.pet.size.md"),
                  }))}
                  size="sm"
                  testId="pet-size"
                  disabled={busy}
                />
              </div>
            </div>

            <div className="pet-look__body" id="settings-anchor-pet-identity">
              <div className="pet-look__preview">
                <PetMark
                  shape={shape}
                  color={color}
                  eyeColor={eyeColor}
                  expression={expression}
                  verb="idle"
                  sizePx={96}
                  restOnly
                />
              </div>
              <div className="pet-look__fields">
                <div className="pet-look__field">
                  <div className="pet-look__field-label">{tr("settings.pet.shape")}</div>
                  <div
                    className="pet-settings-grid"
                    role="group"
                    aria-label={tr("settings.pet.shape")}
                  >
                    {PET_PICKER_SHAPES.map((sh) => (
                      <button
                        key={sh}
                        type="button"
                        className={"pet-settings-grid__btn" + (shape === sh ? " is-on" : "")}
                        aria-pressed={shape === sh}
                        aria-label={tr(`settings.pet.shape.${sh}`)}
                        disabled={busy}
                        onClick={() => void commit({ ...prefs, shape: sh })}
                      >
                        <PetMark
                          shape={sh}
                          color={color}
                          eyeColor={eyeColor}
                          expression={expression}
                          verb="idle"
                          sizePx={26}
                          paused
                          restOnly
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pet-look__field" id="settings-anchor-pet-expression">
                  <div className="pet-look__field-label inline-flex items-center gap-1">
                    {tr("settings.pet.expression")}
                    <SettingsHelpTip ariaLabel={tr("settings.pet.expressionDesc")}>
                      {tr("settings.pet.expressionDesc")}
                    </SettingsHelpTip>
                  </div>
                  <div
                    className="pet-settings-grid"
                    role="group"
                    aria-label={tr("settings.pet.expression")}
                  >
                    {PET_EXPRESSIONS.map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        className={"pet-settings-grid__btn" + (expression === ex ? " is-on" : "")}
                        aria-pressed={expression === ex}
                        aria-label={tr(`settings.pet.expression.${ex}`)}
                        disabled={busy}
                        onClick={() => void commit({ ...prefs, expression: ex })}
                      >
                        <PetMark
                          shape={shape}
                          color={color}
                          eyeColor={eyeColor}
                          expression={ex}
                          verb="idle"
                          sizePx={26}
                          paused
                          restOnly
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pet-look__field">
                  <div className="pet-look__field-label">{tr("settings.pet.color")}</div>
                  <div
                    className="pet-settings-grid"
                    role="group"
                    aria-label={tr("settings.pet.color")}
                  >
                    {PET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={"pet-settings-grid__btn" + (color === c ? " is-on" : "")}
                        aria-pressed={color === c}
                        aria-label={PET_COLOR_SWATCH[c].label}
                        disabled={busy}
                        onClick={() => void commit({ ...prefs, color: c })}
                      >
                        <span
                          className={
                            "pet-settings-swatch" +
                            (c === "white" ? " pet-settings-swatch--light" : "")
                          }
                          style={{ background: PET_COLOR_SWATCH[c].value }}
                        />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pet-look__field" id="settings-anchor-pet-eye">
                  <div className="pet-look__field-label inline-flex items-center gap-1">
                    {tr("settings.pet.eyeColor")}
                    <SettingsHelpTip ariaLabel={tr("settings.pet.eyeColorDesc")}>
                      {tr("settings.pet.eyeColorDesc")}
                    </SettingsHelpTip>
                  </div>
                  <div
                    className="pet-settings-grid"
                    role="group"
                    aria-label={tr("settings.pet.eyeColor")}
                  >
                    <button
                      type="button"
                      className={"pet-settings-grid__btn" + (eyeColor === "auto" ? " is-on" : "")}
                      aria-pressed={eyeColor === "auto"}
                      aria-label={tr("settings.pet.eyeColor.auto")}
                      disabled={busy}
                      onClick={() => void commit({ ...prefs, eyeColor: "auto" })}
                    >
                      <span className="pet-settings-swatch pet-settings-swatch--auto" />
                    </button>
                    {PET_COLORS.map((c) => (
                      <button
                        key={`eye-${c}`}
                        type="button"
                        className={"pet-settings-grid__btn" + (eyeColor === c ? " is-on" : "")}
                        aria-pressed={eyeColor === c}
                        aria-label={PET_COLOR_SWATCH[c].label}
                        disabled={busy}
                        onClick={() => void commit({ ...prefs, eyeColor: c })}
                      >
                        <span
                          className={
                            "pet-settings-swatch" +
                            (c === "white" ? " pet-settings-swatch--light" : "")
                          }
                          style={{ background: PET_COLOR_SWATCH[c].value }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="bubbles">
          <div className="settings-card" id="settings-anchor-pet-bubbles">
            <SettingsRow
              title={tr("settings.pet.bubbles")}
              description={tr("settings.pet.bubblesDesc")}
              control={
                <SettingsToggle
                  checked={prefs.bubblesEnabled !== false}
                  disabled={busy}
                  aria-label={tr("settings.pet.bubbles")}
                  onChange={(next) => void commit({ ...prefs, bubblesEnabled: next })}
                />
              }
            />
            <SettingsRow
              title={tr("settings.pet.progressBar")}
              description={tr("settings.pet.progressBarDesc")}
              control={
                <SettingsToggle
                  checked={prefs.progressBarEnabled === true}
                  disabled={busy}
                  aria-label={tr("settings.pet.progressBar")}
                  onChange={(next) => void commit({ ...prefs, progressBarEnabled: next })}
                />
              }
            />
            <SettingsRow
              title={tr("settings.pet.bubbleDismiss")}
              description={tr("settings.pet.bubbleDismissDesc")}
              control={
                <SettingsSelect
                  value={String(normalizePetBubbleDismissSec(prefs.bubbleDismissSec))}
                  onChange={(v) =>
                    void commit({
                      ...prefs,
                      bubbleDismissSec: normalizePetBubbleDismissSec(Number(v)),
                    })
                  }
                  options={[5, 10, 15, 20, 30, 45, 60, 90]
                    .filter((n) => n >= PET_BUBBLE_DISMISS_MIN && n <= PET_BUBBLE_DISMISS_MAX)
                    .map((n) => ({
                      value: String(n),
                      label: tr("settings.pet.bubbleDismiss.seconds", { n: String(n) }),
                    }))}
                  size="sm"
                  testId="pet-bubble-dismiss"
                  disabled={busy}
                />
              }
              last
            />
          </div>

          <div className="settings-card" id="settings-anchor-pet-bubble-look">
            <div className="settings-row !flex-col !items-stretch gap-2.5">
              <div>
                <div className="settings-row-title">{tr("settings.pet.bubbleLook")}</div>
                <div className="settings-row-desc">{tr("settings.pet.bubbleLookDesc")}</div>
              </div>
            </div>
            <div className="settings-row !flex-col !items-stretch gap-2.5">
              <div className="settings-row-title">{tr("settings.pet.bubbleShape")}</div>
              <div
                className="pet-settings-grid"
                role="group"
                aria-label={tr("settings.pet.bubbleShape")}
              >
                {PET_BUBBLE_SHAPES.map((sh) => (
                  <button
                    key={sh}
                    type="button"
                    className={"pet-settings-grid__btn" + (bubbleShape === sh ? " is-on" : "")}
                    aria-pressed={bubbleShape === sh}
                    aria-label={tr(`settings.pet.bubbleShape.${sh}`)}
                    disabled={busy}
                    onClick={() => void commit({ ...prefs, bubbleShape: sh })}
                  >
                    <span
                      className={`pet-bubble pet-bubble--${sh} pet-bubble--${bubbleStyle} pet-bubble-preview`}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div className="settings-row settings-row-last !flex-col !items-stretch gap-2.5">
              <div className="settings-row-title">{tr("settings.pet.bubbleStyle")}</div>
              <div
                className="pet-settings-grid"
                role="group"
                aria-label={tr("settings.pet.bubbleStyle")}
              >
                {PET_BUBBLE_STYLES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={"pet-settings-grid__btn" + (bubbleStyle === st ? " is-on" : "")}
                    aria-pressed={bubbleStyle === st}
                    aria-label={tr(`settings.pet.bubbleStyle.${st}`)}
                    disabled={busy}
                    onClick={() => void commit({ ...prefs, bubbleStyle: st })}
                  >
                    <span
                      className={`pet-bubble pet-bubble--${bubbleShape} pet-bubble--${st} pet-bubble-preview`}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </SettingsPageShell>
  );
}
