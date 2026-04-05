import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAuthViewModel,
  normalizeAuthMode,
  shouldShowAuthConfirm,
  validateAuthDraft
} from "./auth-form.mjs";

test("normalizeAuthMode falls back to login for unknown values", () => {
  assert.equal(normalizeAuthMode("weird"), "login");
  assert.equal(normalizeAuthMode("register"), "register");
});

test("shouldShowAuthConfirm only enables confirm field in register mode", () => {
  assert.equal(shouldShowAuthConfirm("login"), false);
  assert.equal(shouldShowAuthConfirm("register"), true);
});

test("validateAuthDraft rejects missing login credentials", () => {
  assert.deepEqual(validateAuthDraft({ mode: "login", email: "", password: "" }), {
    ok: false,
    reason: "missing_credentials"
  });
});

test("validateAuthDraft rejects short register passwords", () => {
  assert.deepEqual(
    validateAuthDraft({
      mode: "register",
      email: "buddy@example.com",
      password: "12345",
      confirmPassword: "12345"
    }),
    {
      ok: false,
      reason: "password_too_short"
    }
  );
});

test("validateAuthDraft rejects mismatched register passwords", () => {
  assert.deepEqual(
    validateAuthDraft({
      mode: "register",
      email: "buddy@example.com",
      password: "123456",
      confirmPassword: "654321"
    }),
    {
      ok: false,
      reason: "password_mismatch"
    }
  );
});

test("validateAuthDraft returns trimmed submit payload when valid", () => {
  assert.deepEqual(
    validateAuthDraft({
      mode: "register",
      email: "  buddy@example.com ",
      password: "123456",
      confirmPassword: "123456"
    }),
    {
      ok: true,
      mode: "register",
      email: "buddy@example.com",
      password: "123456"
    }
  );
});

test("buildAuthViewModel exposes register-mode form controls", () => {
  assert.deepEqual(
    buildAuthViewModel({
      auth: {
        configured: true,
        mode: "anonymous",
        isLoggedIn: false
      },
      authMode: "register",
      authFeedback: ""
    }),
    {
      variant: "form",
      titleKey: "account.registerTitle",
      metaKey: "account.authMeta",
      metaValues: null,
      metaText: "",
      showForm: true,
      showUserActions: false,
      formMode: "register",
      showConfirm: true,
      submitAction: "sign-up",
      submitLabelKey: "account.signUp",
      signOutAction: null,
      currentAccountEmail: null,
      userCopyKey: null
    }
  );
});

test("buildAuthViewModel exposes the signed-in session summary", () => {
  assert.deepEqual(
    buildAuthViewModel({
      auth: {
        configured: true,
        mode: "session",
        isLoggedIn: true,
        email: "yoyo@example.com",
        userId: "user-123"
      },
      syncActive: true,
      authMode: "login"
    }),
    {
      variant: "session",
      titleKey: null,
      metaKey: "account.sessionMeta",
      metaValues: {
        userId: "user-123"
      },
      metaText: "",
      showForm: false,
      showUserActions: true,
      formMode: "login",
      showConfirm: false,
      submitAction: "sign-in",
      submitLabelKey: "account.signIn",
      signOutAction: "sign-out",
      currentAccountEmail: "yoyo@example.com",
      userCopyKey: null
    }
  );
});

test("buildAuthViewModel keeps demo exit behavior separate from normal sign-out", () => {
  assert.deepEqual(
    buildAuthViewModel({
      auth: {
        configured: true,
        mode: "demo",
        isLoggedIn: true,
        email: "showcase@rovia.ai"
      },
      authMode: "login"
    }),
    {
      variant: "demo",
      titleKey: null,
      metaKey: "account.demoTitle",
      metaValues: null,
      metaText: "",
      showForm: false,
      showUserActions: true,
      formMode: "login",
      showConfirm: false,
      submitAction: "sign-in",
      submitLabelKey: "account.signIn",
      signOutAction: "exit-demo",
      currentAccountEmail: "showcase@rovia.ai",
      userCopyKey: "account.demoMode"
    }
  );
});
