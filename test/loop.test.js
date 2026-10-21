import { test } from "node:test";
import assert from "node:assert/strict";
import { needsFallback } from "../src/loop.js";

test("needsFallback lets food questions through when the Places key is set", () => {
  assert.equal(needsFallback("Where should I eat lunch?", true), false);
});

test("needsFallback gives the canned answer to food questions without the Places key", () => {
  assert.equal(needsFallback("Where should I eat lunch?", false), true);
});

test("needsFallback lets non-food questions through without the Places key", () => {
  assert.equal(needsFallback("Will it rain at Kallang?", false), false);
});
