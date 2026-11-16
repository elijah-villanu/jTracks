import { useEffect, useState, type FormEvent, type ReactNode, type RefObject } from "react"
import { Bell, Database, Download, Ghost, LogOut, Monitor, User, X } from "lucide-react"
import { RECAP_DESIGNS } from "@/components/dashboard/chart-summaries"
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useApplicationsContext } from "@/hooks/useApplicationsContext"
import { useAuth } from "@/hooks/useAuth"
import { useMediaQuery } from "@/hooks/useMediaQuery"
import { useRecapSkin } from "@/hooks/useRecapSkin"
import { useTheme } from "@/hooks/useTheme"
import { useViewMode } from "@/hooks/useViewMode"
import { apiErrorMessage } from "@/lib/api-client"
import { dayOf, plural, shortDate, todayDay } from "@/lib/days"

const SETTINGS_TABS = [
  { id: "account", label: "Account", Icon: User },
  { id: "ghosting", label: "Ghosting", Icon: Ghost },
  { id: "appearance", label: "Appearance", Icon: Monitor },
  { id: "notifications", label: "Notifications", Icon: Bell },
  { id: "data", label: "Your data", Icon: Database },
] as const
type SettingsTab = (typeof SETTINGS_TABS)[number]["id"]

/**
 * Settings, as a modal over whichever page you're on (the URL carries
 * `?settings=<tab>`). Ghosting is the one setting the backend stores today;
 * Appearance is saved in this browser. Everything marked Soon is shown so the
 * shape of the page is clear, and is disabled.
 */
export function SettingsDialog({
  tab,
  onTabChange,
  onClose,
  onLogout,
  returnFocusRef,
}: {
  /** The `?settings=` value: null when closed; anything unknown opens Account. */
  tab: string | null
  onTabChange: (tab: string) => void
  onClose: () => void
  onLogout: () => void
  returnFocusRef: RefObject<HTMLElement | null>
}) {
  const phone = useMediaQuery("(max-width: 639px)")
  const active: SettingsTab = SETTINGS_TABS.find((t) => t.id === tab)?.id ?? "account"

  return (
    <Dialog open={tab !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="app dlg settings"
        showCloseButton={false}
        initialFocus={() => document.querySelector<HTMLElement>('.settings [role="tab"][aria-selected="true"]')}
        finalFocus={returnFocusRef}
      >
        <Tabs className="contents" orientation={phone ? "horizontal" : "vertical"} value={active} onValueChange={(v: SettingsTab) => onTabChange(v)}>
          <div className="set-nav">
            <DialogTitle>Settings</DialogTitle>
            <TabsList className="set-tabs" aria-label="Settings sections">
              {SETTINGS_TABS.map(({ id, label, Icon }) => (
                <TabsTrigger key={id} value={id}>
                  <Icon className="i" aria-hidden="true" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <DialogClose render={<button className="btn btn-ghost x set-x" type="button" aria-label="Close settings" />}>
            <X className="i" aria-hidden="true" />
          </DialogClose>
          <TabsContent value="account" className="set-main"><AccountPanel onLogout={onLogout} /></TabsContent>
          <TabsContent value="ghosting" className="set-main"><GhostingPanel /></TabsContent>
          <TabsContent value="appearance" className="set-main"><AppearancePanel /></TabsContent>
          <TabsContent value="notifications" className="set-main"><NotificationsPanel /></TabsContent>
          <TabsContent value="data" className="set-main"><DataPanel /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function Row({ title, desc, soon, children }: { title: string; desc: ReactNode; soon?: boolean; children?: ReactNode }) {
  return (
    <div className="row-s">
      <div className="txt">
        <b>
          {title}
          {soon && <span className="soon">Soon</span>}
        </b>
        <span>{desc}</span>
      </div>
      {children && <div className="ctl end">{children}</div>}
    </div>
  )
}

function AccountPanel({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth()
  const { applications } = useApplicationsContext()
  return (
    <>
      <h3>Account</h3>
      <p className="lead">How you sign in to JourneyJob.</p>
      <section className="set-sec" aria-label="Profile">
        <Row title="Email" desc={user?.email ?? ""} soon>
          <button className="btn btn-line" type="button" disabled>Change</button>
        </Row>
        <Row title="Password" desc="We'll email you a link to choose a new one." soon>
          <button className="btn btn-line" type="button" disabled>Reset password</button>
        </Row>
        {user?.google_id ? (
          <Row title="Google" desc="Connected. You can sign in with Google." />
        ) : (
          <Row title="Google" desc="Not connected. Connect it to sign in with one click." soon>
            <button className="btn btn-line" type="button" disabled>Connect</button>
          </Row>
        )}
      </section>
      <section className="set-sec" aria-label="Sessions">
        <h4>Sessions</h4>
        <Row title="This browser" desc="You're signed in here.">
          <button className="btn btn-line" type="button" onClick={onLogout}>
            <LogOut className="i" aria-hidden="true" />
            Log out
          </button>
        </Row>
        <Row title="Log out everywhere" desc="Ends every session on other devices." soon>
          <button className="btn btn-line" type="button" disabled>Log out all</button>
        </Row>
      </section>
      <section className="set-sec danger-sec" aria-label="Delete account">
        <h4>Delete account</h4>
        <Row title="Delete your account" desc={`Deletes your board, all ${plural(applications.length, "application")} and your recaps. This can't be undone.`} soon>
          <button className="btn btn-danger-line" type="button" disabled>Delete account</button>
        </Row>
      </section>
    </>
  )
}

function GhostingPanel() {
  const { user, updateSettings } = useAuth()
  const { applications } = useApplicationsContext()
  const current = user?.ghost_days_default ?? null
  const [value, setValue] = useState(current === null ? "" : String(current))
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Keep the field in step with the stored value (e.g. hydration finishing after this opened).
  useEffect(() => {
    if (current !== null) setValue(String(current))
  }, [current])

  const days = Number(value)
  const valid = Number.isInteger(days) && days >= 1 && days <= 365
  const today = todayDay()
  const waiting = applications.filter((a) => a.status === "applied" && a.date_applied && a.ghost_days_override === null)
  const pastIt = valid ? waiting.filter((a) => today - dayOf(a.date_applied!) >= days).length : 0
  const overrides = applications.filter((a) => a.ghost_days_override !== null).length

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaving) return
    if (!valid) {
      setFieldError("Enter a whole number of days from 1 to 365.")
      document.getElementById("ghost-days")?.focus()
      return
    }
    setFieldError(null)
    setSubmitError(null)
    setIsSaving(true)
    try {
      await updateSettings(days)
      setSaved(true)
    } catch (err) {
      setSubmitError(apiErrorMessage(err, "Couldn't save. Please try again."))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <h3>Ghosting</h3>
      <p className="lead">When a job you applied to goes quiet, JourneyJob marks it Ghosted for you.</p>
      <form className="ghost-form set-sec" noValidate onSubmit={handleSubmit}>
        {submitError && <p role="alert" className="alert" style={{ margin: 0 }}>{submitError}</p>}
        <div>
          <label htmlFor="ghost-days">
            <b style={{ fontWeight: 500 }}>Mark as Ghosted after</b>
          </label>
          <div className="ghost-input">
            <input
              className="field"
              id="ghost-days"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              step={1}
              value={value}
              onChange={(event) => {
                setValue(event.target.value)
                setSaved(false)
                setFieldError(null)
              }}
              aria-invalid={Boolean(fieldError) || undefined}
              aria-describedby="ghost-help ghost-preview"
            />
            <span>days with no update</span>
          </div>
          <p className="help" id="ghost-help">
            Only applies to Applied. Interviews, offers and rejections are never changed for you.
          </p>
        </div>
        <div className="preview" id="ghost-preview" aria-live="polite">
          {valid ? (
            <>
              <div className="tl">
                <span>Apply today</span>
                <span className="line" />
                <span>
                  <b>Ghosted {shortDate(today + days)}</b>
                </span>
              </div>
              <span className="muted" style={{ fontSize: 13 }}>
                {days === current
                  ? `Current setting. ${plural(waiting.length, "application uses", "applications use")} it.`
                  : pastIt
                    ? `${plural(pastIt, "application is", "applications are")} already past this. The daily check marks them Ghosted.`
                    : "No application is past this yet."}
              </span>
            </>
          ) : (
            <span className="bad">{fieldError ?? "Enter a whole number of days from 1 to 365."}</span>
          )}
        </div>
        <div className="form-end">
          <span className="stamp" role="status">{isSaving ? "Saving..." : saved ? "Saved" : ""}</span>
          <button className="btn btn-ink" type="submit" aria-disabled={isSaving}>
            Save
          </button>
        </div>
      </form>
      <section className="set-sec" aria-label="Per-application limits">
        <Row
          title="Per-application limits"
          desc={`${plural(overrides, "application uses its", "applications use their")} own limit. Set one from an application's edit form.`}
        />
      </section>
    </>
  )
}

const THEMES = [
  { value: "light", label: "Light", a: "#fafafa", b: "#ffffff" },
  { value: "dark", label: "Dark", a: "#171717", b: "#2a2a2a" },
  {
    value: "system",
    label: "Match system",
    a: "linear-gradient(90deg,#fafafa 50%,#171717 50%)",
    b: "linear-gradient(90deg,#ffffff 50%,#2a2a2a 50%)",
  },
] as const
const CARD_SWATCH = { ink: "#18181b", field: "#e6e6e9", paper: "#ffffff" } as const

function AppearancePanel() {
  const { theme, setTheme } = useTheme()
  const [viewMode, setViewMode] = useViewMode()
  const [design, setDesign] = useRecapSkin()
  return (
    <>
      <h3>Appearance</h3>
      <p className="lead">Changes save as you make them, on this browser.</p>
      <section className="set-sec" aria-label="Theme">
        <h4>Theme</h4>
        <div className="choices" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <label className="choice" key={t.value}>
              <input type="radio" name="theme" value={t.value} checked={theme === t.value} onChange={() => setTheme(t.value)} />
              <span className="sample" aria-hidden="true">
                <i style={{ background: t.a }} />
                <i style={{ background: t.b }} />
              </span>
              <span>{t.label}</span>
            </label>
          ))}
        </div>
      </section>
      <section className="set-sec" aria-label="Tracker">
        <Row title="Tracker opens in" desc="You can still switch any time from the Tracker.">
          <div className="seg" role="group" aria-label="Default view">
            <button type="button" aria-pressed={viewMode === "board"} onClick={() => setViewMode("board")}>Board</button>
            <button type="button" aria-pressed={viewMode === "table"} onClick={() => setViewMode("table")}>Table</button>
          </div>
        </Row>
      </section>
      <section className="set-sec" aria-label="Recap design">
        <h4>Recap design</h4>
        <span className="muted" style={{ fontSize: 13 }}>The design the recap opens on.</span>
        <div className="choices" role="radiogroup" aria-label="Recap design">
          {RECAP_DESIGNS.map((d) => (
            <label className="choice" key={d.id}>
              <input type="radio" name="recap-design-default" value={d.id} checked={design === d.id} onChange={() => setDesign(d.id)} />
              <span className="mini-cards" aria-hidden="true">
                <i style={{ background: CARD_SWATCH[d.id] }} />
              </span>
              <span>{d.label}</span>
            </label>
          ))}
        </div>
      </section>
    </>
  )
}

function SoonSwitch({ label }: { label: string }) {
  return <button className="toggle" type="button" role="switch" aria-checked="false" disabled aria-label={label} />
}

function NotificationsPanel() {
  return (
    <>
      <h3>Notifications</h3>
      <p className="lead">Email notifications are on the way. Nothing is sent yet.</p>
      <section className="set-sec" aria-label="Email">
        <Row title="An application was ghosted" desc="One email the day JourneyJob marks something Ghosted." soon>
          <SoonSwitch label="Ghosted emails" />
        </Row>
        <Row title="Weekly summary" desc="Monday morning: what you sent, what came back, what is going quiet." soon>
          <SoonSwitch label="Weekly summary" />
        </Row>
        <Row title="Nudge after a quiet week" desc="A reminder when nothing has been logged for 7 days." soon>
          <SoonSwitch label="Quiet week nudge" />
        </Row>
      </section>
    </>
  )
}

function DataPanel() {
  const { applications } = useApplicationsContext()
  return (
    <>
      <h3>Your data</h3>
      <p className="lead">Your board is private. Nobody else can see an application, a company or a note.</p>
      <section className="set-sec" aria-label="Export and import">
        <Row title="Export applications" desc={`Download all ${plural(applications.length, "application")} as a CSV file.`} soon>
          <button className="btn btn-line" type="button" disabled>
            <Download className="i" aria-hidden="true" />
            Export CSV
          </button>
        </Row>
        <Row title="Import from a spreadsheet" desc="Bring in a search you tracked somewhere else." soon>
          <button className="btn btn-line" type="button" disabled>Import</button>
        </Row>
      </section>
    </>
  )
}
