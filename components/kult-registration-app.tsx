"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  ArrowLeft,
  AtSign,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  IndianRupee,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  MapPin,
  Maximize2,
  Plus,
  QrCode,
  Search,
  Save,
  ShieldCheck,
  Trash2,
  Users,
  X,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Screen = "home" | "register" | "verify" | "organizer";
type Companion = { fullName: string; age: string; phone: string };
type VerifyState = "idle" | "loading" | "verified" | "pending" | "not-found" | "error";

type Registration = {
  id: string;
  full_name: string;
  age: number | null;
  phone: string;
  email: string;
  companion_count: number;
  ticket_price: number;
  total_amount: number;
  verified: boolean;
  arrived: boolean;
  created_at: string;
};

type AdminCompanion = {
  id: string;
  registration_id: string;
  full_name: string;
  age: number | null;
  phone: string | null;
};

type Ticket = {
  id: string;
  holderName: string;
  ticketNumber: number;
  enabled: boolean;
  arrived: boolean;
};

type AdminTicket = {
  id: string;
  registration_id: string;
  holder_name: string;
  ticket_number: number;
  enabled: boolean;
  arrived: boolean;
  organizer_note: string;
};

type RegistrationStatus = {
  participantCount: number;
  capacityLimit: number;
  earlyBirdLimit: number;
  earlyBirdSoldOut: boolean;
  capacityReached: boolean;
  allowOverCapacity: boolean;
  registrationOpen: boolean;
  ticketPrice: number;
};

const EVENT = {
  date: "24 October",
  time: "4 PM – 10 PM",
  place: "Talk of the Town Restaurant, Edappally",
  dress: "Come as your version of the night.",
};

const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const ALLOWED_AGES = Array.from({ length: 9 }, (_, index) => index + 16);

async function fetchRegistrationStatus() {
  const response = await fetch("/api/registration-status", { cache: "no-store" });
  const data = (await response.json()) as RegistrationStatus & { error?: string };
  if (!response.ok) throw new Error(data.error || "Could not check registration availability.");
  return data;
}

function screenFromHash(): Screen {
  if (typeof window === "undefined") return "home";
  const hash = window.location.hash.replace("#", "");
  if (hash === "register" || hash === "verify" || hash === "organizer") return hash;
  return "home";
}

function EventDetails({ compact = false }: { compact?: boolean }) {
  const items = [
    { icon: CalendarDays, label: EVENT.date },
    { icon: Clock3, label: EVENT.time },
    { icon: MapPin, label: EVENT.place },
  ];
  return (
    <div className={compact ? "detail-grid compact" : "detail-grid"}>
      {items.map(({ icon: Icon, label }) => (
        <div className="detail-item" key={label}>
          <Icon aria-hidden="true" />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function InnerHeader({ onHome }: { onHome: () => void }) {
  return (
    <header className="inner-header">
      <button className="mini-brand" onClick={onHome} aria-label="Return to KULT event home">
        <span className="mini-mark">K</span>
        <span>KULT EVENTS</span>
      </button>
      <span className="header-date">24 OCT</span>
    </header>
  );
}

export function KultRegistrationApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [verifyName, setVerifyName] = useState("");
  const [verifyPhone, setVerifyPhone] = useState("");
  const [verifyState, setVerifyState] = useState<VerifyState>("idle");
  const [verifyMessage, setVerifyMessage] = useState("");
  const [verifyTickets, setVerifyTickets] = useState<Ticket[]>([]);

  const openScreen = useCallback((next: Screen) => {
    setScreen(next);
    window.location.hash = next === "home" ? "" : next;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const checkVerification = useCallback(async (fullName: string, phone: string) => {
    if (fullName.trim().length < 2 || phone.replace(/\D/g, "").length < 7) {
      setVerifyState("error");
      setVerifyMessage("Enter the same full name and phone number used during registration.");
      return { found: false, error: "Invalid details" };
    }
    setVerifyState("loading");
    setVerifyMessage("");
    setVerifyTickets([]);
    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, phone }),
      });
      const data = (await response.json()) as {
        found?: boolean;
        verified?: boolean;
        tickets?: Ticket[];
        error?: string;
      };
      if (response.status === 404 || !data.found) {
        setVerifyState("not-found");
        return { found: false };
      }
      if (!response.ok) throw new Error(data.error || "Unable to check registration.");
      setVerifyState(data.verified ? "verified" : "pending");
      setVerifyTickets(data.tickets ?? []);
      return { found: true, verified: Boolean(data.verified), ticketCount: data.tickets?.length ?? 0 };
    } catch (error) {
      setVerifyState("error");
      setVerifyMessage(error instanceof Error ? error.message : "Unable to check registration.");
      return { found: false, error: "Unavailable" };
    }
  }, []);

  useEffect(() => {
    const initialSync = window.setTimeout(() => setScreen(screenFromHash()), 0);
    const onHashChange = () => setScreen(screenFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.clearTimeout(initialSync);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  useEffect(() => {
    const modelContext = (
      document as Document & {
        modelContext?: {
          registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      modelContext.registerTool(
        {
          name: "start_event_registration",
          title: "Start KULT registration",
          description: "Open the registration flow for the KULT event on 24 October.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: async () => {
            openScreen("register");
            return { screen: "registration", eventDate: EVENT.date };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    void Promise.resolve(
      modelContext.registerTool(
        {
          name: "check_registration_status",
          title: "Check KULT registration",
          description: "Check KULT payment verification using the registered full name and phone number.",
          inputSchema: {
            type: "object",
            properties: {
              fullName: { type: "string", minLength: 2 },
              phone: { type: "string", minLength: 7 },
            },
            required: ["fullName", "phone"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute: async (input: unknown) => {
            const details = input as { fullName?: string; phone?: string };
            const fullName = String(details?.fullName ?? "");
            const phone = String(details?.phone ?? "");
            setVerifyName(fullName);
            setVerifyPhone(phone);
            openScreen("verify");
            return checkVerification(fullName, phone);
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, [checkVerification, openScreen]);

  if (screen === "register") return <RegistrationFlow onHome={() => openScreen("home")} onVerify={(fullName, phone) => { setVerifyName(fullName); setVerifyPhone(phone); openScreen("verify"); }} />;
  if (screen === "verify") {
    return (
      <VerifyPage
        fullName={verifyName}
        setFullName={setVerifyName}
        phone={verifyPhone}
        setPhone={setVerifyPhone}
        state={verifyState}
        message={verifyMessage}
        tickets={verifyTickets}
        check={() => checkVerification(verifyName, verifyPhone)}
        onHome={() => openScreen("home")}
      />
    );
  }
  if (screen === "organizer") return <OrganizerPage onHome={() => openScreen("home")} />;
  return <HomePage onOpen={openScreen} />;
}

function HomePage({ onOpen }: { onOpen: (screen: Screen) => void }) {
  return (
    <main className="home-shell">
      <section className="home-copy">
        <div className="home-topline">
          <span>KULT EVENTS</span>
          <span>EDAPPALLY</span>
        </div>
        <div className="home-main">
          <p className="eyebrow">REGISTRATION IS OPEN</p>
          <h1>One night.<br />Your version.</h1>
          <p className="dress-line">Dress code: {EVENT.dress}</p>
          <EventDetails />
          <div className="home-actions">
            <Button size="lg" className="primary-cta" onClick={() => onOpen("register")}>
              Register here
            </Button>
            <Button size="lg" variant="outline" className="secondary-cta" onClick={() => onOpen("verify")}>
              Check verification
            </Button>
            <a className="instagram-home-link" href="https://www.instagram.com/kult.events.in/" target="_blank" rel="noreferrer">
              <AtSign aria-hidden="true" /> Contact organizers
            </a>
          </div>
        </div>
        <button className="organizer-link" onClick={() => onOpen("organizer")}>
          <LockKeyhole aria-hidden="true" /> Organizer access
        </button>
      </section>
      <section className="home-art" aria-label="KULT Events">
        <img src="/kult-logo.jpg" alt="KULT Events logo" />
        <div className="date-stamp" aria-label="24 October">
          <span>24</span>
          <small>OCT</small>
        </div>
      </section>
    </main>
  );
}

function RegistrationGate({
  kind,
  status,
  onHome,
  onContinue,
  onRetry,
}: {
  kind: "loading" | "early-bird" | "closed" | "error";
  status?: RegistrationStatus | null;
  onHome: () => void;
  onContinue?: () => void;
  onRetry?: () => void;
}) {
  return (
    <main className="inner-shell availability-shell">
      <InnerHeader onHome={onHome} />
      <section className={`availability-card ${kind}`}>
        {kind === "loading" && (
          <><LoaderCircle className="spin availability-icon" /><p className="eyebrow">CHECKING AVAILABILITY</p><h1>Just a moment.</h1><p>We’re checking the live participant count.</p></>
        )}
        {kind === "early-bird" && (
          <>
            <div className="availability-icon"><CheckCircle2 /></div>
            <p className="eyebrow">TICKET UPDATE</p>
            <h1>Early birds are sold out.</h1>
            <p>The first {status?.earlyBirdLimit ?? 5} participant spots have been claimed. General admission is still open.</p>
            <div className="gate-price"><span>GENERAL ADMISSION</span><strong>{rupees.format(status?.ticketPrice ?? 599)}</strong><small>per participant</small></div>
            <Button className="next-button gate-button" onClick={onContinue}>Continue with {rupees.format(status?.ticketPrice ?? 599)} ticket</Button>
          </>
        )}
        {kind === "closed" && (
          <>
            <div className="availability-icon"><Users /></div>
            <p className="eyebrow">REGISTRATION PAUSED</p>
            <h1>Early birds are sold out.</h1>
            <p>All {status?.capacityLimit ?? 35} early-bird participant spots are filled, so registration is paused for now. If the organizers release more spots, this page will reopen automatically.</p>
            <div className="capacity-meter"><span>PARTICIPANTS</span><strong>{status?.participantCount ?? 35} / {status?.capacityLimit ?? 35}</strong></div>
          </>
        )}
        {kind === "error" && (
          <>
            <div className="availability-icon"><XCircle /></div>
            <p className="eyebrow">AVAILABILITY CHECK</p>
            <h1>We couldn’t check the list.</h1>
            <p>Please retry before starting payment so your place can be confirmed safely.</p>
            <Button className="next-button gate-button" onClick={onRetry}>Try again</Button>
          </>
        )}
        {kind !== "loading" && <button className="text-back" onClick={onHome}><ArrowLeft /> Back to event page</button>}
      </section>
    </main>
  );
}

function RegistrationFlow({ onHome, onVerify }: { onHome: () => void; onVerify: (fullName: string, phone: string) => void }) {
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [companionCount, setCompanionCount] = useState(0);
  const [companions, setCompanions] = useState<Companion[]>([]);
  const [sentProof, setSentProof] = useState(false);
  const [clientRegistrationId, setClientRegistrationId] = useState("");
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus | null>(null);
  const [checkingAvailability, setCheckingAvailability] = useState(true);
  const [availabilityError, setAvailabilityError] = useState(false);
  const [earlyBirdAcknowledged, setEarlyBirdAcknowledged] = useState(false);

  const loadAvailability = useCallback(async () => {
    setCheckingAvailability(true);
    setAvailabilityError(false);
    try {
      setRegistrationStatus(await fetchRegistrationStatus());
    } catch {
      setAvailabilityError(true);
    } finally {
      setCheckingAvailability(false);
    }
  }, []);

  useEffect(() => {
    const availabilityCheck = window.setTimeout(() => void loadAvailability(), 0);
    return () => window.clearTimeout(availabilityCheck);
  }, [loadAvailability]);

  useEffect(() => {
    const restoreDraft = window.setTimeout(() => {
      setClientRegistrationId(crypto.randomUUID());
      const saved = sessionStorage.getItem("kult-registration-draft");
      if (!saved) return;
      try {
        const draft = JSON.parse(saved) as {
          fullName?: string;
          age?: string | number;
          phone?: string;
          email?: string;
          companionCount?: number;
          companions?: Array<Partial<Companion>>;
          clientRegistrationId?: string;
        };
        setFullName(draft.fullName ?? "");
        setAge(String(draft.age ?? ""));
        setPhone(draft.phone ?? "");
        setEmail(draft.email ?? "");
        setCompanionCount(draft.companionCount ?? 0);
        setCompanions((draft.companions ?? []).map((person) => ({
          fullName: person.fullName ?? "",
          age: String(person.age ?? ""),
          phone: person.phone ?? "",
        })));
        if (draft.clientRegistrationId) setClientRegistrationId(draft.clientRegistrationId);
      } catch {
        sessionStorage.removeItem("kult-registration-draft");
      }
    }, 0);
    return () => window.clearTimeout(restoreDraft);
  }, []);

  useEffect(() => {
    if (!clientRegistrationId || registrationComplete) return;
    sessionStorage.setItem(
      "kult-registration-draft",
      JSON.stringify({ fullName, age, phone, email, companionCount, companions, clientRegistrationId }),
    );
  }, [fullName, age, phone, email, companionCount, companions, clientRegistrationId, registrationComplete]);

  function validateContact() {
    if (fullName.trim().length < 2) return "Please enter your full name.";
    const numericAge = Number(age);
    if (!Number.isInteger(numericAge) || numericAge < 16 || numericAge > 24) return "Please select your age between 16 and 24.";
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 15) return "Please enter a valid phone number.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Please enter a valid email address.";
    return "";
  }

  async function continueToPayment() {
    setError("");
    try {
      const latest = await fetchRegistrationStatus();
      setRegistrationStatus(latest);
      const partySize = 1 + companionCount;
      const remaining = Math.max(0, latest.capacityLimit - latest.participantCount);
      if (!latest.registrationOpen) return;
      if (!latest.allowOverCapacity && partySize > remaining) {
        setError(`Only ${remaining} participant ${remaining === 1 ? "spot remains" : "spots remain"}. Please reduce the number of accompanying guests.`);
        return;
      }
      if (latest.earlyBirdSoldOut && !earlyBirdAcknowledged) return;
      setStep(3);
    } catch {
      setError("Could not confirm the remaining spots. Please try again before paying.");
    }
  }

  function nextFromContact() {
    const message = validateContact();
    if (message) return setError(message);
    setError("");
    setCompanions((current) =>
      Array.from({ length: companionCount }, (_, index) => current[index] ?? { fullName: "", age: "", phone: "" }),
    );
    if (companionCount > 0) setStep(2);
    else void continueToPayment();
  }

  function nextFromCompanions() {
    if (companions.some((person) => !person.fullName.trim())) {
      return setError("Please enter the name of every accompanying guest.");
    }
    if (companions.some((person) => !ALLOWED_AGES.includes(Number(person.age)))) {
      return setError("Please select an age between 16 and 24 for every guest.");
    }
    if (companions.some((person) => {
      const digits = person.phone.replace(/\D/g, "");
      return digits.length < 7 || digits.length > 15;
    })) {
      return setError("Please enter a valid phone number for every guest.");
    }
    setError("");
    void continueToPayment();
  }

  async function submitRegistration() {
    if (!sentProof) {
      return setError("Please confirm that you sent the payment screenshot to @kult.events.in.");
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientRegistrationId,
          fullName,
          age: Number(age),
          phone,
          email,
          companions,
          paymentConfirmationSent: true,
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; status?: RegistrationStatus };
      if (data.status) setRegistrationStatus(data.status);
      if (!response.ok || !data.ok) throw new Error(data.error || "Registration could not be completed.");
      setRegistrationComplete(true);
      sessionStorage.removeItem("kult-registration-draft");
      setStep(5);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Registration could not be completed.");
    } finally {
      setSubmitting(false);
    }
  }

  if (checkingAvailability) return <RegistrationGate kind="loading" onHome={onHome} />;
  if (availabilityError || !registrationStatus) return <RegistrationGate kind="error" onHome={onHome} onRetry={() => void loadAvailability()} />;
  if (!registrationStatus.registrationOpen && step < 5) return <RegistrationGate kind="closed" status={registrationStatus} onHome={onHome} />;
  if (registrationStatus.earlyBirdSoldOut && !earlyBirdAcknowledged && step < 5) {
    return <RegistrationGate kind="early-bird" status={registrationStatus} onHome={onHome} onContinue={() => setEarlyBirdAcknowledged(true)} />;
  }

  const progress = Math.min(step, 4) * 25;
  const ticketCount = 1 + companionCount;
  const ticketPrice = registrationStatus.ticketPrice;
  const totalAmount = ticketPrice * ticketCount;
  const titles: Record<number, [string, string]> = {
    1: ["Tell us about you", "One registration per phone number and email."],
    2: ["Who’s coming with you?", "Add each accompanying guest so the door list is accurate."],
    3: ["Complete payment", "Scan the QR using any UPI app."],
    4: ["Send payment proof", "Your registration needs Instagram verification."],
    5: ["Registration received", "Please allow the organizers a couple of hours to verify your payment."],
  };

  return (
    <main className="inner-shell">
      <InnerHeader onHome={onHome} />
      <div className="registration-layout">
        <aside className="registration-aside">
          <p className="eyebrow light">KULT · 24 OCTOBER</p>
          <h2>{step === 5 ? "See you after dark." : "Reserve your place."}</h2>
          <p>{EVENT.dress}</p>
          <EventDetails compact />
        </aside>

        <section className="form-panel">
          {step < 5 && (
            <div className="step-progress">
              <div className="step-meta"><span>STEP {step} OF 4</span><span>{progress}%</span></div>
              <Progress value={progress} aria-label={`Registration step ${step} of 4`} />
            </div>
          )}
          <div className="form-heading">
            <p className="eyebrow">REGISTRATION</p>
            <h1>{titles[step][0]}</h1>
            <p>{titles[step][1]}</p>
          </div>

          {step === 1 && (
            <div className="form-stack">
              <div className="form-grid">
                <Field label="Full name" htmlFor="full-name">
                  <Input id="full-name" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" />
                </Field>
                <Field label="Age (16–24)" htmlFor="age">
                  <select id="age" value={age} onChange={(event) => setAge(event.target.value)}>
                    <option value="">Select age</option>
                    {ALLOWED_AGES.map((allowedAge) => <option key={allowedAge} value={allowedAge}>{allowedAge}</option>)}
                  </select>
                </Field>
              </div>
              <div className="form-grid">
                <Field label="Phone number" htmlFor="phone">
                  <Input id="phone" autoComplete="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91 98765 43210" />
                </Field>
                <Field label="Email ID" htmlFor="email">
                  <Input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" />
                </Field>
              </div>
              <Field label="How many people are you bringing?" htmlFor="guest-count" hint={`Do not count yourself. ${registrationStatus.allowOverCapacity ? "Maximum 8 accompanying guests." : `${Math.max(0, registrationStatus.capacityLimit - registrationStatus.participantCount)} total participant spots currently remain.`}`}>
                <select id="guest-count" value={companionCount} onChange={(event) => setCompanionCount(Number(event.target.value))}>
                  {Array.from({ length: Math.min(8, registrationStatus.allowOverCapacity ? 8 : Math.max(0, registrationStatus.capacityLimit - registrationStatus.participantCount - 1)) + 1 }, (_, count) => <option key={count} value={count}>{count === 0 ? "Just me" : `${count} ${count === 1 ? "guest" : "guests"}`}</option>)}
                </select>
              </Field>
              <div className="live-total" aria-live="polite">
                <div><span>TICKETS</span><strong>{ticketCount}</strong></div>
                <span className="live-total-equation">{ticketCount} × {rupees.format(ticketPrice)}</span>
                <div><span>TOTAL TO PAY</span><strong>{rupees.format(totalAmount)}</strong></div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="companion-list">
              {companions.map((person, index) => (
                <div className="companion-card" key={index}>
                  <div className="companion-number">{String(index + 1).padStart(2, "0")}</div>
                  <div className="companion-fields">
                    <Field label="Guest name" htmlFor={`guest-name-${index}`}>
                      <Input id={`guest-name-${index}`} value={person.fullName} onChange={(event) => setCompanions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, fullName: event.target.value } : item))} placeholder="Full name" />
                    </Field>
                    <Field label="Age (16–24)" htmlFor={`guest-age-${index}`}>
                      <select id={`guest-age-${index}`} value={person.age} onChange={(event) => setCompanions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, age: event.target.value } : item))}>
                        <option value="">Select age</option>
                        {ALLOWED_AGES.map((allowedAge) => <option key={allowedAge} value={allowedAge}>{allowedAge}</option>)}
                      </select>
                    </Field>
                    <Field label="Phone number" htmlFor={`guest-phone-${index}`}>
                      <Input id={`guest-phone-${index}`} inputMode="tel" value={person.phone} onChange={(event) => setCompanions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, phone: event.target.value } : item))} placeholder="Required phone number" />
                    </Field>
                  </div>
                </div>
              ))}
            </div>
          )}

          {step === 3 && (
            <div className="payment-layout">
              <div className="qr-card">
                <div className="ticket-price"><span>TOTAL PAYMENT</span><strong>{rupees.format(totalAmount)}</strong><small>{ticketCount} {ticketCount === 1 ? "ticket" : "tickets"} × {rupees.format(ticketPrice)} each</small></div>
                <img src="/gpay-qr.jpg" alt="Google Pay QR code for Shreyaan Sreenivas, UPI ID shreyaansreenivas5@okaxis" />
              </div>
              <div className="payment-copy">
                <span className="secure-pill"><ShieldCheck /> UPI PAYMENT</span>
                <h3>Pay in 3 clear steps</h3>
                <ol className="payment-steps">
                  <li><span>1</span><div><strong>Open your UPI app</strong><p>Use Google Pay, PhonePe, Paytm, or any UPI app.</p></div></li>
                  <li><span>2</span><div><strong>Scan this QR and pay {rupees.format(totalAmount)}</strong><p>{ticketCount} {ticketCount === 1 ? "ticket" : "tickets"} × {rupees.format(ticketPrice)} per participant = <b>{rupees.format(totalAmount)}</b>.</p></div></li>
                  <li><span>3</span><div><strong>Save your payment proof</strong><p>Take a clear screenshot of the successful payment screen.</p></div></li>
                </ol>
                <div className="upi-id"><span>UPI ID</span><strong>shreyaansreenivas5@okaxis</strong></div>
                <a className="download-link" href="/gpay-qr.jpg" download="kult-events-gpay-qr.jpg">
                  <Download aria-hidden="true" /> Download QR to gallery
                </a>
                <div className="payment-critical" role="alert">
                  <strong>IMPORTANT: SEND ALL 3 ITEMS</strong>
                  <div className="proof-requirements">
                    <span><b>1</b> Payment <mark>SCREENSHOT</mark></span>
                    <span><b>2</b> Registered full name</span>
                    <span><b>3</b> Registered phone number</span>
                  </div>
                  <p>DM all three to <b>@kult.events.in</b>. Without the <b>payment screenshot</b>, registered name, and phone number, your payment cannot be matched and your registration will be invalid.</p>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="proof-panel">
              <div className="instagram-mark">@</div>
              <h3>Send the screenshot to <span>@kult.events.in</span></h3>
              <p>Send a clear payment screenshot together with the exact registered name and phone number: <b>{fullName}</b> · <b>{phone}</b>.</p>
              <a className="instagram-button" href="https://www.instagram.com/kult.events.in/" target="_blank" rel="noreferrer">
                Open Instagram <ExternalLink aria-hidden="true" />
              </a>
              <label className="confirmation-check">
                <Checkbox checked={sentProof} onCheckedChange={(checked) => setSentProof(checked === true)} />
                <span>I sent the screenshot, registered name, and phone number to @kult.events.in</span>
              </label>
              <div className="warning-note">
                <ShieldCheck aria-hidden="true" />
                <p>Please don’t skip any detail. Without the screenshot, registered name, and phone number, the organizers cannot match the payment and the registration will remain invalid.</p>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="success-panel">
              <div className="success-icon"><Check aria-hidden="true" /></div>
              <div className="verification-reminder">
                <span>CHECK AGAIN IN A COUPLE OF HOURS</span>
                <strong>{fullName}</strong>
                <p>Use this registered phone number to check verification: <b>{phone}</b></p>
              </div>
              <div className="final-details">
                <EventDetails compact />
                <div className="dress-card"><span>DRESS CODE</span><strong>{EVENT.dress}</strong></div>
              </div>
              <p className="pending-note">Your status will remain pending until an organizer matches the Instagram DM with your registration. <strong>After a couple of hours, open the Check verification page using your registered name and phone number. Your QR tickets will be available there after approval, and you must show those QR codes at the event entrance.</strong></p>
              <div className="success-actions"><Button onClick={() => onVerify(fullName, phone)}>Check verification</Button><Button variant="outline" onClick={onHome}>Back to event page</Button></div>
            </div>
          )}

          {error && <div className="form-error" role="alert"><XCircle aria-hidden="true" />{error}</div>}

          {step < 5 && (
            <div className="form-actions">
              <Button variant="ghost" onClick={() => step === 1 ? onHome() : setStep(step === 3 && companionCount === 0 ? 1 : step - 1)}>
                <ArrowLeft aria-hidden="true" /> Back
              </Button>
              {step === 1 && <Button className="next-button" onClick={nextFromContact}>Continue</Button>}
              {step === 2 && <Button className="next-button" onClick={nextFromCompanions}>Continue</Button>}
              {step === 3 && <Button className="next-button" onClick={() => setStep(4)}>I’ve completed payment</Button>}
              {step === 4 && (
                <Button className="next-button" onClick={submitRegistration} disabled={submitting}>
                  {submitting && <LoaderCircle className="spin" aria-hidden="true" />}
                  {submitting ? "Creating your tickets" : "Complete registration"}
                </Button>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field-group">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p>{hint}</p>}
    </div>
  );
}

function TicketQrAccess({ ticketId, holderName, ticketNumber, enabled, variant = "ticket" }: {
  ticketId: string;
  holderName: string;
  ticketNumber: number;
  enabled: boolean;
  variant?: "ticket" | "admin";
}) {
  const [qrImage, setQrImage] = useState("");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(`KULT-TICKET:${ticketId}`, {
      width: 360,
      margin: 2,
      errorCorrectionLevel: "H",
      color: { dark: "#151310", light: "#ffffff" },
    }).then((image) => { if (active) setQrImage(image); });
    return () => { active = false; };
  }, [ticketId]);

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [expanded]);

  const trigger = variant === "admin" ? (
    <button type="button" className="admin-qr-button" onClick={() => setExpanded(true)} disabled={!qrImage}>
      <QrCode aria-hidden="true" /> View QR
    </button>
  ) : enabled && qrImage ? (
    <button type="button" className="ticket-qr-trigger" onClick={() => setExpanded(true)} aria-label={`Expand QR ticket for ${holderName}`}>
      <img src={qrImage} alt={`Scannable entry ticket for ${holderName}`} />
      <span><Maximize2 aria-hidden="true" /> Tap to expand</span>
    </button>
  ) : (
    <div className="ticket-disabled-mark"><XCircle /><span>DISABLED</span></div>
  );

  return (
    <>
      {trigger}
      {expanded && qrImage && (
        <div className="ticket-qr-modal" role="dialog" aria-modal="true" aria-label={`Expanded QR ticket for ${holderName}`} onClick={() => setExpanded(false)}>
          <div className="ticket-qr-modal-card" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="ticket-qr-close" onClick={() => setExpanded(false)} aria-label="Close expanded ticket" autoFocus><X /></button>
            <p>KULT · ENTRY TICKET #{String(ticketNumber).padStart(2, "0")}</p>
            <h2>{holderName}</h2>
            {!enabled && <div className="ticket-qr-warning">This ticket is currently disabled.</div>}
            <img src={qrImage} alt={`Large scannable entry QR code for ${holderName}`} />
            <strong>Show this QR code at the event entrance.</strong>
            <a href={qrImage} download={`kult-ticket-${ticketNumber}.png`}><Download /> Save QR to phone</a>
          </div>
        </div>
      )}
    </>
  );
}

function TicketCard({ ticket }: { ticket: Ticket }) {

  return (
    <article className={`event-ticket ${ticket.enabled ? "enabled" : "disabled"}`}>
      <div className="ticket-header"><span>KULT · 24 OCT</span><strong>#{String(ticket.ticketNumber).padStart(2, "0")}</strong></div>
      <div className="ticket-body">
        <div><p>ADMIT ONE</p><h3>{ticket.holderName}</h3><small>{EVENT.time} · {EVENT.place}</small></div>
        <TicketQrAccess ticketId={ticket.id} holderName={ticket.holderName} ticketNumber={ticket.ticketNumber} enabled={ticket.enabled} />
      </div>
      <div className="ticket-footer">
        <span className={ticket.arrived ? "ticket-used" : "ticket-ready"}>{ticket.arrived ? "Already checked in" : ticket.enabled ? "Ready to scan at entrance" : "Contact the organizer"}</span>
        <span>{ticket.enabled ? "Tap the QR to enlarge it" : ""}</span>
      </div>
    </article>
  );
}

function VerifyPage({ fullName, setFullName, phone, setPhone, state, message, tickets, check, onHome }: {
  fullName: string;
  setFullName: (value: string) => void;
  phone: string;
  setPhone: (value: string) => void;
  state: VerifyState;
  message: string;
  tickets: Ticket[];
  check: () => void;
  onHome: () => void;
}) {
  return (
    <main className="inner-shell verify-shell">
      <InnerHeader onHome={onHome} />
      <section className="verify-card">
        <p className="eyebrow">REGISTRATION STATUS</p>
        <h1>Check payment and tickets.</h1>
        <p>Use the exact name and phone number saved during registration.</p>
        <div className="verify-fields">
          <Field label="Registered full name" htmlFor="verify-name"><Input id="verify-name" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your registered name" /></Field>
          <Field label="Registered phone number" htmlFor="verify-phone"><Input id="verify-phone" autoComplete="tel" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91 98765 43210" /></Field>
        </div>
        <Button className="verify-button" onClick={check} disabled={state === "loading" || fullName.trim().length < 2 || phone.replace(/\D/g, "").length < 7}>
          {state === "loading" && <LoaderCircle className="spin" />}
          {state === "loading" ? "Checking" : "Check registration"}
        </Button>

        {state === "verified" && (
          <><div className="status-card verified"><CheckCircle2 /><div><strong>Payment verified</strong><p>Your individual scannable tickets are ready below. Save every enabled ticket to the correct attendee’s phone.</p></div></div><div className="ticket-grid">{tickets.map((ticket) => <TicketCard ticket={ticket} key={ticket.id} />)}</div></>
        )}
        {state === "pending" && (
          <div className="status-card pending"><Clock3 /><div><strong>Verification pending</strong><p>Your registration exists. Please check again after a couple of hours while the organizers match your screenshot, registered name, and phone number.</p></div></div>
        )}
        {state === "not-found" && (
          <div className="status-card not-found"><XCircle /><div><strong>Registration not found</strong><p>Enter the exact full name and phone number used on the registration form.</p></div></div>
        )}
        {state === "error" && (
          <div className="status-card not-found"><XCircle /><div><strong>Could not check registration</strong><p>{message}</p></div></div>
        )}
        <button className="text-back" onClick={onHome}><ArrowLeft /> Back to event page</button>
      </section>
    </main>
  );
}

function OrganizerPage({ onHome }: { onHome: () => void }) {
  const [access, setAccess] = useState<"checking" | "login" | "dashboard">("checking");
  const [organizerCode, setOrganizerCode] = useState("");
  const [rows, setRows] = useState<Registration[]>([]);
  const [companions, setCompanions] = useState<AdminCompanion[]>([]);
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newPerson, setNewPerson] = useState({ fullName: "", age: "", phone: "", email: "" });
  const [savingPerson, setSavingPerson] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus | null>(null);
  const [savingCapacity, setSavingCapacity] = useState(false);
  const [eventConfig, setEventConfig] = useState({ ticketPrice: 599, capacityLimit: 35 });
  const [savingEventConfig, setSavingEventConfig] = useState(false);
  const [eventConfigSaved, setEventConfigSaved] = useState(false);
  const [ticketNotes, setTicketNotes] = useState<Record<string, string>>({});
  const [savingTicketNoteId, setSavingTicketNoteId] = useState("");
  const [savedTicketNoteId, setSavedTicketNoteId] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerState, setScannerState] = useState<"idle" | "starting" | "scanning" | "checking" | "success" | "error">("idle");
  const [scannerMessage, setScannerMessage] = useState("");
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const scanLockRef = useRef(false);

  const loadRegistrations = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/registrations", { cache: "no-store" });
      if (response.status === 401) {
        setAccess("login");
        return;
      }
      const data = (await response.json()) as { registrations?: Registration[]; companions?: AdminCompanion[]; tickets?: AdminTicket[]; status?: RegistrationStatus; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load registrations.");
      setRows(data.registrations ?? []);
      setCompanions(data.companions ?? []);
      setTickets(data.tickets ?? []);
      setRegistrationStatus(data.status ?? null);
      if (data.status) {
        setEventConfig({ ticketPrice: data.status.ticketPrice, capacityLimit: data.status.capacityLimit });
      }
      setTicketNotes(Object.fromEntries((data.tickets ?? []).map((ticket) => [ticket.id, ticket.organizer_note ?? ""])));
      setAccess("dashboard");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load registrations.");
      setAccess("login");
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadRegistrations(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadRegistrations]);

  useEffect(() => () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (scanner) void scanner.stop().catch(() => undefined).finally(() => { try { scanner.clear(); } catch { /* already cleared */ } });
  }, []);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: organizerCode }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Organizer sign-in failed.");
      setOrganizerCode("");
      await loadRegistrations();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Organizer sign-in failed.");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setRows([]);
    setAccess("login");
  }

  async function toggle(id: string, field: "verified" | "arrived", value: boolean) {
    const previous = rows;
    setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row));
    setError("");
    try {
      const response = await fetch("/api/admin/registrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, field, value }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Update failed.");
    } catch (updateError) {
      setRows(previous);
      setError(updateError instanceof Error ? updateError.message : "Update failed.");
    }
  }

  async function toggleTicket(id: string, field: "enabled" | "arrived", value: boolean) {
    const previous = tickets;
    setTickets((current) => current.map((ticket) => ticket.id === id ? { ...ticket, [field]: value } : ticket));
    setError("");
    try {
      const response = await fetch("/api/admin/registrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId: id, ticketField: field, value }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Ticket update failed.");
      if (field === "arrived") await loadRegistrations();
    } catch (updateError) {
      setTickets(previous);
      setError(updateError instanceof Error ? updateError.message : "Ticket update failed.");
    }
  }

  async function stopScannerCamera() {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try { await scanner.stop(); } catch { /* camera may already be stopped */ }
    try { scanner.clear(); } catch { /* reader may already be cleared */ }
  }

  async function processTicketScan(scanData: string) {
    if (scanLockRef.current) return;
    scanLockRef.current = true;
    setScannerState("checking");
    setScannerMessage("Checking ticket…");
    await stopScannerCamera();
    try {
      const response = await fetch("/api/admin/scan-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scanData }),
      });
      const data = (await response.json()) as { holderName?: string; alreadyArrived?: boolean; error?: string };
      if (!response.ok) throw new Error(data.error || "Ticket could not be checked.");
      setScannerState("success");
      setScannerMessage(data.alreadyArrived ? `${data.holderName} was already checked in.` : `${data.holderName} is checked in.`);
      await loadRegistrations();
    } catch (scanError) {
      setScannerState("error");
      setScannerMessage(scanError instanceof Error ? scanError.message : "Ticket could not be checked.");
    } finally {
      scanLockRef.current = false;
    }
  }

  async function startScanner() {
    setScannerOpen(true);
    setScannerState("starting");
    setScannerMessage("Starting camera…");
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    try {
      await stopScannerCamera();
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("kult-ticket-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => { void processTicketScan(decodedText); },
        () => undefined,
      );
      setScannerState("scanning");
      setScannerMessage("Point the camera at a KULT ticket QR code.");
    } catch (scannerError) {
      await stopScannerCamera();
      setScannerState("error");
      setScannerMessage(scannerError instanceof Error ? scannerError.message : "Camera scanner could not start.");
    }
  }

  async function closeScanner() {
    await stopScannerCamera();
    setScannerOpen(false);
    setScannerState("idle");
    setScannerMessage("");
  }

  async function toggleCapacityOverride(value: boolean) {
    const previous = registrationStatus;
    if (previous) {
      setRegistrationStatus({
        ...previous,
        allowOverCapacity: value,
        registrationOpen: previous.participantCount < previous.capacityLimit || value,
      });
    }
    setSavingCapacity(true);
    setError("");
    try {
      const response = await fetch("/api/admin/registrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setting: "allowOverCapacity", value }),
      });
      const data = (await response.json()) as { status?: RegistrationStatus; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not update registration capacity.");
      if (data.status) setRegistrationStatus(data.status);
    } catch (capacityError) {
      setRegistrationStatus(previous);
      setError(capacityError instanceof Error ? capacityError.message : "Could not update registration capacity.");
    } finally {
      setSavingCapacity(false);
    }
  }

  async function saveEventConfig(event: React.FormEvent) {
    event.preventDefault();
    const ticketPrice = Number(eventConfig.ticketPrice);
    const capacityLimit = Number(eventConfig.capacityLimit);
    if (!Number.isInteger(ticketPrice) || ticketPrice < 1) {
      setError("Enter a valid whole-number ticket price.");
      return;
    }
    if (!Number.isInteger(capacityLimit) || capacityLimit < 1) {
      setError("Enter a valid ticket limit.");
      return;
    }
    setSavingEventConfig(true);
    setEventConfigSaved(false);
    setError("");
    try {
      const response = await fetch("/api/admin/registrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setting: "eventConfig", ticketPrice, capacityLimit }),
      });
      const data = (await response.json()) as { status?: RegistrationStatus; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not update ticket settings.");
      if (data.status) {
        setRegistrationStatus(data.status);
        setEventConfig({ ticketPrice: data.status.ticketPrice, capacityLimit: data.status.capacityLimit });
      }
      setEventConfigSaved(true);
      window.setTimeout(() => setEventConfigSaved(false), 2500);
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "Could not update ticket settings.");
    } finally {
      setSavingEventConfig(false);
    }
  }

  async function saveTicketNote(ticketId: string) {
    setSavingTicketNoteId(ticketId);
    setSavedTicketNoteId("");
    setError("");
    try {
      const response = await fetch("/api/admin/registrations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, ticketNote: ticketNotes[ticketId] ?? "" }),
      });
      const data = (await response.json()) as { note?: string; error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save ticket note.");
      setTickets((current) => current.map((ticket) => ticket.id === ticketId ? { ...ticket, organizer_note: data.note ?? "" } : ticket));
      setTicketNotes((current) => ({ ...current, [ticketId]: data.note ?? "" }));
      setSavedTicketNoteId(ticketId);
      window.setTimeout(() => setSavedTicketNoteId((current) => current === ticketId ? "" : current), 2500);
    } catch (noteError) {
      setError(noteError instanceof Error ? noteError.message : "Could not save ticket note.");
    } finally {
      setSavingTicketNoteId("");
    }
  }

  async function addPerson(event: React.FormEvent) {
    event.preventDefault();
    setSavingPerson(true);
    setError("");
    try {
      const response = await fetch("/api/admin/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newPerson),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not add registration.");
      setNewPerson({ fullName: "", age: "", phone: "", email: "" });
      setShowAdd(false);
      await loadRegistrations();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Could not add registration.");
    } finally {
      setSavingPerson(false);
    }
  }

  async function removePerson(row: Registration) {
    if (!window.confirm(`Remove ${row.full_name} from the registration list? This cannot be undone.`)) return;
    setDeletingId(row.id);
    setError("");
    try {
      const response = await fetch("/api/admin/registrations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not remove registration.");
      await loadRegistrations();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove registration.");
    } finally {
      setDeletingId("");
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => [row.full_name, row.phone, row.email].some((value) => value.toLowerCase().includes(query)));
  }, [rows, search]);

  if (access !== "dashboard") {
    return (
      <main className="inner-shell organizer-login-shell">
        <InnerHeader onHome={onHome} />
        <section className="organizer-login-card">
          <div className="lock-orbit"><LockKeyhole /></div>
          <p className="eyebrow">ORGANIZERS ONLY</p>
          <h1>Door list access</h1>
          <p>Enter the organizer code to confirm payments and event arrivals.</p>
          {access === "checking" ? (
            <div className="checking-session"><LoaderCircle className="spin" /> Checking access</div>
          ) : (
            <form onSubmit={login}>
              <Label htmlFor="organizer-code">Organizer code</Label>
              <Input id="organizer-code" type="password" autoComplete="current-password" value={organizerCode} onChange={(event) => setOrganizerCode(event.target.value)} placeholder="Enter code" />
              {error && <div className="form-error" role="alert"><XCircle />{error}</div>}
              <Button type="submit" disabled={loading || !organizerCode}>
                {loading && <LoaderCircle className="spin" />}{loading ? "Opening dashboard" : "Open dashboard"}
              </Button>
            </form>
          )}
          <button className="text-back" onClick={onHome}><ArrowLeft /> Back to event page</button>
        </section>
      </main>
    );
  }

  const totalGuests = rows.reduce((total, row) => total + Number(row.companion_count), 0);
  const participantCount = registrationStatus?.participantCount ?? rows.length + totalGuests;
  const verifiedCount = rows.filter((row) => row.verified).length;
  const arrivedTicketCount = tickets.filter((ticket) => ticket.arrived).length;

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <button className="mini-brand" onClick={onHome}><span className="mini-mark">K</span><span>KULT ORGANIZERS</span></button>
        <Button variant="outline" onClick={logout}><LogOut /> Sign out</Button>
      </header>
      <section className="admin-content">
        <div className="admin-title"><div><p className="eyebrow">DOOR LIST · 24 OCTOBER</p><h1>Registration control</h1></div><span>Live organizer view</span></div>
        <div className="stats-grid">
          <div><span>PARTICIPANTS</span><strong>{participantCount}</strong><small>{rows.length} registrations including groups</small></div>
          <div><span>VERIFIED</span><strong>{verifiedCount}</strong><small>{rows.length - verifiedCount} awaiting payment check</small></div>
          <div><span>TICKETS SCANNED</span><strong>{arrivedTicketCount}</strong><small>{Math.max(0, tickets.filter((ticket) => ticket.enabled).length - arrivedTicketCount)} active tickets not checked in</small></div>
        </div>
        <div className="scanner-control">
          <div><span className="capacity-kicker">EVENT CHECK-IN</span><h2>Scan attendee tickets</h2><p>Each successful scan validates the ticket and marks that individual attendee as arrived.</p></div>
          <Button className="scanner-button" onClick={() => void startScanner()}><Camera /> Open ticket scanner</Button>
        </div>
        {scannerOpen && (
          <div className="scanner-panel" role="dialog" aria-label="KULT ticket scanner">
            <div className="scanner-panel-head"><div><span>LIVE SCANNER</span><h2>Scan entry ticket</h2></div><Button variant="ghost" onClick={() => void closeScanner()}>Close</Button></div>
            <div id="kult-ticket-reader" className="ticket-reader" />
            <div className={`scanner-result ${scannerState}`}>
              {scannerState === "success" ? <CheckCircle2 /> : scannerState === "error" ? <XCircle /> : <QrCode />}
              <div><strong>{scannerState === "success" ? "Ticket accepted" : scannerState === "error" ? "Ticket rejected" : "Scanner ready"}</strong><p>{scannerMessage}</p></div>
            </div>
            {(scannerState === "success" || scannerState === "error") && <Button className="scanner-next" onClick={() => void startScanner()}>Scan next ticket</Button>}
          </div>
        )}
        <form className="event-config-control" onSubmit={saveEventConfig}>
          <div className="event-config-copy">
            <span className="capacity-kicker">TICKET SETTINGS</span>
            <h2>Set the live price and ticket limit</h2>
            <p>These values update the public payment total and the number of participant tickets available.</p>
          </div>
          <div className="event-config-fields">
            <Field label="Price per ticket (₹)" htmlFor="ticket-price-setting">
              <Input id="ticket-price-setting" type="number" min={1} max={1000000} step={1} value={eventConfig.ticketPrice} onChange={(event) => setEventConfig((current) => ({ ...current, ticketPrice: Number(event.target.value) }))} />
            </Field>
            <Field label="Ticket limit" htmlFor="ticket-limit-setting">
              <Input id="ticket-limit-setting" type="number" min={1} max={10000} step={1} value={eventConfig.capacityLimit} onChange={(event) => setEventConfig((current) => ({ ...current, capacityLimit: Number(event.target.value) }))} />
            </Field>
            <Button type="submit" disabled={savingEventConfig}><Save />{savingEventConfig ? "Saving…" : eventConfigSaved ? "Saved" : "Save settings"}</Button>
          </div>
          <p className="event-config-warning"><IndianRupee /> Existing registrations keep their recorded amount. New registrations use the updated price.</p>
        </form>
        <div className={`capacity-control ${registrationStatus?.registrationOpen ? "open" : "paused"}`}>
          <div>
            <span className="capacity-kicker">REGISTRATION CAPACITY</span>
            <h2>{registrationStatus?.registrationOpen ? "Registration is open" : "Registration is paused"}</h2>
            <p>The public form automatically pauses at {registrationStatus?.capacityLimit ?? 35} participant tickets. Current attendance: <strong>{participantCount} / {registrationStatus?.capacityLimit ?? 35}</strong>.</p>
          </div>
          <label className="capacity-toggle">
            <Checkbox checked={Boolean(registrationStatus?.allowOverCapacity)} disabled={savingCapacity} onCheckedChange={(checked) => void toggleCapacityOverride(checked === true)} />
            <span><strong>Allow registrations beyond {registrationStatus?.capacityLimit ?? 35}</strong><small>Turn this on only when you intentionally want to exceed the saved ticket limit.</small></span>
          </label>
        </div>
        <div className="admin-table-card">
          <div className="table-toolbar">
            <div><h2>Registrations and tickets</h2><p>Confirm payment, enable the correct tickets, then scan each ticket at the entrance.</p></div>
            <div className="table-toolbar-actions">
              <div className="search-box"><Search /><Input aria-label="Search registrations" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone or email" /></div>
              <Button className="add-person-button" onClick={() => { setShowAdd((current) => !current); setError(""); }}>
                <Plus aria-hidden="true" /> {showAdd ? "Close" : "Add person"}
              </Button>
            </div>
          </div>
          {showAdd && (
            <form className="add-person-panel" onSubmit={addPerson}>
              <div className="add-person-heading"><div><h3>Add a person</h3><p>For walk-ins or manual entries. One scannable ticket will be created automatically.</p></div><Users aria-hidden="true" /></div>
              <div className="add-person-fields">
                <Field label="Full name" htmlFor="admin-full-name"><Input id="admin-full-name" value={newPerson.fullName} onChange={(event) => setNewPerson((current) => ({ ...current, fullName: event.target.value }))} placeholder="Full name" /></Field>
                <Field label="Age (16–24)" htmlFor="admin-age"><select id="admin-age" value={newPerson.age} onChange={(event) => setNewPerson((current) => ({ ...current, age: event.target.value }))}><option value="">Select age</option>{ALLOWED_AGES.map((allowedAge) => <option key={allowedAge} value={allowedAge}>{allowedAge}</option>)}</select></Field>
                <Field label="Phone number" htmlFor="admin-phone"><Input id="admin-phone" inputMode="tel" value={newPerson.phone} onChange={(event) => setNewPerson((current) => ({ ...current, phone: event.target.value }))} placeholder="+91 98765 43210" /></Field>
                <Field label="Email ID" htmlFor="admin-email"><Input id="admin-email" type="email" value={newPerson.email} onChange={(event) => setNewPerson((current) => ({ ...current, email: event.target.value }))} placeholder="you@example.com" /></Field>
              </div>
              <div className="add-person-actions"><p>Duplicate phone numbers and emails are blocked automatically.</p><Button type="submit" disabled={savingPerson || !newPerson.fullName || !newPerson.age || !newPerson.phone || !newPerson.email}>{savingPerson ? "Adding…" : "Add to list"}</Button></div>
            </form>
          )}
          {error && <div className="form-error admin-error"><XCircle />{error}</div>}
          {rows.length === 0 ? (
            <div className="empty-list"><Users /><h3>No registrations yet</h3><p>Completed registrations will appear here automatically.</p></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Registrant</TableHead>
                  <TableHead>Individual tickets</TableHead>
                  <TableHead className="check-column">Payment verified</TableHead>
                  <TableHead className="action-column">Manage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => {
                  const guests = companions.filter((person) => person.registration_id === row.id);
                  const rowTickets = tickets.filter((ticket) => ticket.registration_id === row.id);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="registrant-cell"><strong>{row.full_name}{row.age ? ` · Age ${row.age}` : ""}</strong><span>{row.phone} · {row.email}</span><span className="registration-amount">{1 + Number(row.companion_count)} {1 + Number(row.companion_count) === 1 ? "ticket" : "tickets"} · {rupees.format(Number(row.total_amount))} expected</span>{guests.length > 0 && <small>Guests: {guests.map((guest) => `${guest.full_name}${guest.age ? ` (Age ${guest.age})` : ""} · ${guest.phone ?? "No phone recorded"}`).join("; ")}</small>}</div>
                      </TableCell>
                      <TableCell><div className="admin-ticket-list">{rowTickets.map((ticket) => <div className={`admin-ticket-row ${ticket.enabled ? "" : "disabled"}`} key={ticket.id}><div><strong>#{ticket.ticket_number} · {ticket.holder_name}</strong><small>{ticket.arrived ? "Arrived" : ticket.enabled ? "Ready" : "Disabled"}</small></div><label><Checkbox aria-label={`Enable ticket for ${ticket.holder_name}`} checked={Boolean(ticket.enabled)} onCheckedChange={(checked) => void toggleTicket(ticket.id, "enabled", checked === true)} /><span>Enabled</span></label><label><Checkbox aria-label={`Mark ticket for ${ticket.holder_name} arrived`} checked={Boolean(ticket.arrived)} disabled={!ticket.enabled} onCheckedChange={(checked) => void toggleTicket(ticket.id, "arrived", checked === true)} /><span>Arrived</span></label><TicketQrAccess ticketId={ticket.id} holderName={ticket.holder_name} ticketNumber={ticket.ticket_number} enabled={ticket.enabled} variant="admin" /><div className="admin-ticket-note"><textarea aria-label={`Organizer note for ${ticket.holder_name}`} maxLength={500} rows={2} value={ticketNotes[ticket.id] ?? ""} onChange={(event) => setTicketNotes((current) => ({ ...current, [ticket.id]: event.target.value }))} placeholder="Private organizer note for this ticket…" /><Button type="button" variant="outline" onClick={() => void saveTicketNote(ticket.id)} disabled={savingTicketNoteId === ticket.id || (ticketNotes[ticket.id] ?? "") === ticket.organizer_note}>{savingTicketNoteId === ticket.id ? "Saving…" : savedTicketNoteId === ticket.id ? "Saved" : "Save note"}</Button></div></div>)}</div></TableCell>
                      <TableCell className="check-column"><Checkbox aria-label={`Verify ${row.full_name}`} checked={Boolean(row.verified)} onCheckedChange={(checked) => toggle(row.id, "verified", checked === true)} /></TableCell>
                      <TableCell className="action-column"><Button variant="ghost" className="remove-person-button" onClick={() => removePerson(row)} disabled={deletingId === row.id}><Trash2 aria-hidden="true" />{deletingId === row.id ? "Removing…" : "Remove"}</Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {rows.length > 0 && filtered.length === 0 && <div className="no-results">No registration matches “{search}”.</div>}
        </div>
      </section>
    </main>
  );
}
