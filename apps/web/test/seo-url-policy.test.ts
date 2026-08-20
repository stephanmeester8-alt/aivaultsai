import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isPrivateIp,
  isPrivateIpv4,
  isPrivateIpv6,
  sameOrigin,
  validateUrl,
} from "../lib/seo/url-policy.ts";

test("URL scheme validation allows http and https", () => {
  assert.equal(validateUrl("https://example.com").ok, true);
  assert.equal(validateUrl("http://example.com").ok, true);
});

test("URL scheme validation blocks dangerous schemes", () => {
  const blocked = [
    "file:///etc/passwd",
    "ftp://example.com",
    "javascript:alert(1)",
    "data:text/html,x",
    "chrome://settings",
  ];
  for (const raw of blocked) {
    const result = validateUrl(raw);
    assert.equal(result.ok, false, raw);
    if (!result.ok) assert.match(result.reason, /scheme/i);
  }
});

test("URL validation rejects malformed input", () => {
  assert.equal(validateUrl("not a url").ok, false);
  assert.equal(validateUrl("").ok, false);
});

test("private IPv4 ranges are blocked", () => {
  assert.equal(isPrivateIpv4("127.0.0.1"), true);
  assert.equal(isPrivateIpv4("10.0.0.1"), true);
  assert.equal(isPrivateIpv4("172.16.0.1"), true);
  assert.equal(isPrivateIpv4("172.31.255.255"), true);
  assert.equal(isPrivateIpv4("172.32.0.1"), false);
  assert.equal(isPrivateIpv4("192.168.1.1"), true);
  assert.equal(isPrivateIpv4("169.254.169.254"), true);
  assert.equal(isPrivateIpv4("0.0.0.0"), true);
  assert.equal(isPrivateIpv4("100.64.0.1"), true);
});

test("public IPv4 addresses are allowed", () => {
  assert.equal(isPrivateIpv4("93.184.216.34"), false);
  assert.equal(isPrivateIpv4("8.8.8.8"), false);
  assert.equal(isPrivateIpv4("1.1.1.1"), false);
});

test("private IPv6 ranges are blocked", () => {
  assert.equal(isPrivateIpv6("::1"), true);
  assert.equal(isPrivateIpv6("fc00::1"), true);
  assert.equal(isPrivateIpv6("fd12:3456::1"), true);
  assert.equal(isPrivateIpv6("fe80::1"), true);
  assert.equal(isPrivateIpv6("::ffff:127.0.0.1"), true);
  assert.equal(isPrivateIpv6("::ffff:10.0.0.1"), true);
});

test("public IPv6 addresses are allowed", () => {
  assert.equal(isPrivateIpv6("2001:4860:4860::8888"), false);
  assert.equal(isPrivateIpv6("2606:4700:4700::1111"), false);
});

test("isPrivateIp handles both families", () => {
  assert.equal(isPrivateIp("10.1.2.3"), true);
  assert.equal(isPrivateIp("::1"), true);
  assert.equal(isPrivateIp("93.184.216.34"), false);
});

test("sameOrigin compares scheme, host and port", () => {
  assert.equal(sameOrigin(new URL("https://a.com/x"), new URL("https://a.com/y")), true);
  assert.equal(sameOrigin(new URL("https://a.com/x"), new URL("https://b.com/x")), false);
  assert.equal(sameOrigin(new URL("https://a.com/x"), new URL("http://a.com/x")), false);
  assert.equal(sameOrigin(new URL("https://a.com:8443/x"), new URL("https://a.com:8444/x")), false);
});
