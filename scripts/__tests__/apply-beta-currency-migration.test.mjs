import test from "node:test";
import assert from "node:assert/strict";
import { assertBetaIdentity } from "../apply-beta-currency-migration.mjs";

const betaShow = `Name: beta-hermes
URL: libsql://beta-hermes-esteban-indiveri.aws-us-east-2.turso.io
ID: 01a0c0bd-0601-7f27-b147-915d105b19f2
`;

test("accepts only the isolated beta account and exact database identity", () => {
  assert.doesNotThrow(() => assertBetaIdentity("esteban-indiveri\n", betaShow));
  assert.throws(() => assertBetaIdentity("eindiveri\n", betaShow), /BETA_IDENTITY_MISMATCH/);
  assert.throws(() => assertBetaIdentity("esteban-indiveri", betaShow.replace("beta-hermes-esteban-indiveri", "hermes-acme-eindiveri")), /BETA_DATABASE_MISMATCH/);
  assert.throws(() => assertBetaIdentity("esteban-indiveri", betaShow.replace("01a0c0bd-0601-7f27-b147-915d105b19f2", "another-id")), /BETA_DATABASE_MISMATCH/);
});
