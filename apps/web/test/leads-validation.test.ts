import assert from "node:assert/strict";
import { test } from "node:test";

import { validateLeadInput } from "../lib/leads/validation.ts";

const VALID = {
  name: "Jan Jansen",
  email: "Jan@Acme.NL ",
  phone: "0612345678",
  company: "Acme BV",
  service: "ai-assistent",
  message: "We willen een AI-assistent voor klantvragen.",
  website: "",
};

test("leads validatie: geldige input → genormaliseerd (email lowercase/getrimd)", () => {
  const result = validateLeadInput(VALID);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.email, "jan@acme.nl");
    assert.equal(result.data.name, "Jan Jansen");
    assert.equal(result.data.phone, "0612345678");
    assert.equal(result.data.service, "ai-assistent");
  }
});

test("leads validatie: optionele velden mogen leeg/afwezig zijn → null", () => {
  const without = validateLeadInput({
    name: "Piet",
    email: "piet@beta.nl",
    service: "anders",
    message: "Hallo",
  });
  assert.equal(without.ok, true);
  if (without.ok) {
    assert.equal(without.data.phone, null);
    assert.equal(without.data.company, null);
  }
  const withEmpty = validateLeadInput({ ...VALID, phone: "", company: "" });
  assert.equal(withEmpty.ok, true);
});

test("leads validatie: ongeldige input → INVALID_INPUT (fail-closed)", () => {
  // ontbrekende/lege verplichte velden
  assert.equal(validateLeadInput({ ...VALID, name: "" }).ok, false);
  assert.equal(validateLeadInput({ ...VALID, name: undefined }).ok, false);
  assert.equal(validateLeadInput({ ...VALID, email: "" }).ok, false);
  assert.equal(validateLeadInput({ ...VALID, message: "   " }).ok, false);
  assert.equal(validateLeadInput({ ...VALID, service: undefined }).ok, false);
  // ongeldige email
  assert.equal(validateLeadInput({ ...VALID, email: "geen-mail" }).ok, false);
  assert.equal(validateLeadInput({ ...VALID, email: "a@b" }).ok, false);
  // ongeldige service (whitelist)
  assert.equal(validateLeadInput({ ...VALID, service: "website-bouwen" }).ok, false);
  // onbekend veld (additionalProperties-gedrag)
  assert.equal(validateLeadInput({ ...VALID, extra: 1 }).ok, false);
  // niet-object
  assert.equal(validateLeadInput("tekst").ok, false);
  assert.equal(validateLeadInput(null).ok, false);
  // te lange waarden
  assert.equal(validateLeadInput({ ...VALID, name: "x".repeat(201) }).ok, false);
  assert.equal(validateLeadInput({ ...VALID, message: "x".repeat(4001) }).ok, false);
  assert.equal(validateLeadInput({ ...VALID, email: `${"a".repeat(320)}@b.nl` }).ok, false); // > 320
});

test("leads validatie: honeypot gevuld → HONEYPOT (stil negeren)", () => {
  const result = validateLeadInput({ ...VALID, website: "https://spam.example.com" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "HONEYPOT");
});
