import test from "node:test";
import assert from "node:assert/strict";

import { mapAuthErrorMessage } from "./auth-errors.mjs";

test("mapAuthErrorMessage turns invalid backend credentials into a friendly Chinese message", () => {
  const result = mapAuthErrorMessage(
    '[backend] POST /api/auth/sign-in failed: 401 {"detail":"Invalid login credentials"}',
    {
      locale: "zh",
      fallback: "登录失败"
    }
  );

  assert.equal(result, "邮箱或密码错误。");
});

test("mapAuthErrorMessage turns invalid backend credentials into a friendly English message", () => {
  const result = mapAuthErrorMessage(
    '[backend] POST /api/auth/sign-in failed: 401 {"detail":"Invalid login credentials"}',
    {
      locale: "en",
      fallback: "Sign-in failed"
    }
  );

  assert.equal(result, "Incorrect email or password.");
});

test("mapAuthErrorMessage turns already-registered sign-up errors into a friendly Chinese message", () => {
  const result = mapAuthErrorMessage(
    '[backend] POST /api/auth/sign-up failed: 400 {"detail":"User already registered"}',
    {
      locale: "zh",
      fallback: "注册失败"
    }
  );

  assert.equal(result, "该邮箱已注册，请直接登录。");
});

test("mapAuthErrorMessage turns email-confirmation errors into a friendly English message", () => {
  const result = mapAuthErrorMessage(
    '[backend] POST /api/auth/sign-in failed: 403 {"detail":"Email not confirmed"}',
    {
      locale: "en",
      fallback: "Sign-in failed"
    }
  );

  assert.equal(result, "Email is not confirmed yet. Please confirm it before signing in.");
});
