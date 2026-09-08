"use client";

/**
 * LeadForm — werkend contactformulier (MVP lead workflow).
 *
 * Client component omdat het formulier interactie nodig heeft: loading,
 * disabled-submit, dubbele-submit-beveiliging, succes-/foutstatussen.
 * De server (POST /api/leads) blijft de enige bron van waarheid voor
 * validatie en opslag.
 *
 * Anti-spam: verborgen honeypot-veld "website" — mensen vullen het niet.
 */

import { FormEvent, useRef, useState } from "react";

const SERVICES = [
  { value: "ai-assistent", label: "AI Assistent" },
  { value: "ai-website", label: "AI Website" },
  { value: "automatisering", label: "Automatisering" },
  { value: "anders", label: "Anders" },
] as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FormStatus =
  | { state: "idle" }
  | { state: "submitting" }
  | { state: "success" }
  | { state: "error"; message: string };

const inputClasses =
  "w-full rounded-sm border border-line bg-canvas px-3 py-2.5 text-sm text-ink placeholder:text-faint focus:border-gold focus:outline-none";
const labelClasses = "mb-1.5 block text-sm font-medium text-ink";

export function LeadForm() {
  const [status, setStatus] = useState<FormStatus>({ state: "idle" });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const submittedRef = useRef(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittedRef.current || status.state === "submitting") return; // dubbele submit
    const form = event.currentTarget;
    const formData = new FormData(form);

    const errors: Record<string, string> = {};
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();
    const service = String(formData.get("service") ?? "");

    if (name.length === 0) errors.name = "Vul je naam in.";
    if (email.length === 0) errors.email = "Vul je e-mailadres in.";
    else if (!EMAIL_PATTERN.test(email)) errors.email = "Dit lijkt geen geldig e-mailadres.";
    if (service.length === 0) errors.service = "Kies waar we mee kunnen helpen.";
    if (message.length === 0) errors.message = "Vertel kort waar we mee kunnen helpen.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    submittedRef.current = true;
    setStatus({ state: "submitting" });
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone: String(formData.get("phone") ?? "").trim() || null,
          company: String(formData.get("company") ?? "").trim() || null,
          service,
          message,
          website: String(formData.get("website") ?? ""), // honeypot (leeg)
        }),
      });
      if (response.ok) {
        setStatus({ state: "success" });
      } else {
        submittedRef.current = false;
        setStatus({
          state: "error",
          message:
            response.status === 429
              ? "Je hebt te veel aanvragen verstuurd. Probeer het over een paar minuten opnieuw."
              : "Er ging iets mis. Probeer het opnieuw, of mail ons direct via aivaultsai@gmail.com.",
        });
      }
    } catch {
      submittedRef.current = false;
      setStatus({
        state: "error",
        message: "Er ging iets mis. Controleer je verbinding en probeer het opnieuw.",
      });
    }
  }

  if (status.state === "success") {
    return (
      <div role="status" className="border border-gold/40 bg-panel p-6 sm:p-8">
        <h3 className="text-lg font-medium text-ink">Bedankt! Je aanvraag is ontvangen.</h3>
        <p className="mt-2 text-sm leading-relaxed text-mute">
          We nemen zo snel mogelijk contact met je op.
        </p>
      </div>
    );
  }

  const submitting = status.state === "submitting";

  return (
    <form onSubmit={handleSubmit} noValidate={false} className="border border-gold/40 bg-panel p-6 sm:p-8">
      {/* Honeypot — onzichtbaar voor mensen, aantrekkelijk voor bots. */}
      <div className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="lead-website">Website</label>
        <input
          id="lead-website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value=""
          readOnly
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="lead-name" className={labelClasses}>
            Naam <span className="text-gold" aria-hidden="true">*</span>
          </label>
          <input
            id="lead-name"
            name="name"
            type="text"
            required
            maxLength={200}
            autoComplete="name"
            className={inputClasses}
          />
          {fieldErrors.name ? <p className="mt-1.5 text-xs text-gold">{fieldErrors.name}</p> : null}
        </div>

        <div>
          <label htmlFor="lead-email" className={labelClasses}>
            E-mail <span className="text-gold" aria-hidden="true">*</span>
          </label>
          <input
            id="lead-email"
            name="email"
            type="email"
            required
            maxLength={320}
            autoComplete="email"
            className={inputClasses}
          />
          {fieldErrors.email ? <p className="mt-1.5 text-xs text-gold">{fieldErrors.email}</p> : null}
        </div>

        <div>
          <label htmlFor="lead-company" className={labelClasses}>
            Bedrijfsnaam
          </label>
          <input
            id="lead-company"
            name="company"
            type="text"
            maxLength={200}
            autoComplete="organization"
            className={inputClasses}
          />
        </div>

        <div>
          <label htmlFor="lead-phone" className={labelClasses}>
            Telefoonnummer
          </label>
          <input
            id="lead-phone"
            name="phone"
            type="tel"
            maxLength={40}
            autoComplete="tel"
            className={inputClasses}
          />
        </div>
      </div>

      <fieldset className="mt-6">
        <legend className="mb-2 text-sm font-medium text-ink">
          Waar kunnen we mee helpen? <span className="text-gold" aria-hidden="true">*</span>
        </legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {SERVICES.map((service) => (
            <label
              key={service.value}
              className="flex cursor-pointer items-center gap-3 border border-line bg-canvas px-3 py-2.5 text-sm text-ink has-[:checked]:border-gold/70"
            >
              <input
                type="radio"
                name="service"
                value={service.value}
                required
                className="h-4 w-4 accent-[#d4af77]"
              />
              {service.label}
            </label>
          ))}
        </div>
        {fieldErrors.service ? <p className="mt-1.5 text-xs text-gold">{fieldErrors.service}</p> : null}
      </fieldset>

      <div className="mt-6">
        <label htmlFor="lead-message" className={labelClasses}>
          Jouw bericht <span className="text-gold" aria-hidden="true">*</span>
        </label>
        <textarea
          id="lead-message"
          name="message"
          required
          maxLength={4000}
          rows={5}
          className={`${inputClasses} resize-y`}
          placeholder="Vertel kort wat je bedrijf doet en waar je nu tijd verliest."
        />
        {fieldErrors.message ? <p className="mt-1.5 text-xs text-gold">{fieldErrors.message}</p> : null}
      </div>

      {status.state === "error" ? (
        <p role="alert" className="mt-5 border border-line bg-canvas p-4 text-sm text-ink">
          {status.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="mt-6 inline-flex items-center justify-center rounded-sm bg-ink px-6 py-3 text-sm font-medium text-canvas no-underline hover:bg-gold disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Versturen…" : "Verstuur aanvraag →"}
      </button>
      <p className="mt-3 text-xs leading-relaxed text-faint">
        We reageren zo snel mogelijk — meestal binnen één werkdag.
      </p>
    </form>
  );
}
