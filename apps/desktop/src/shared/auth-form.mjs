export function normalizeAuthMode(mode) {
  return mode === "register" ? "register" : "login";
}

export function shouldShowAuthConfirm(mode) {
  return normalizeAuthMode(mode) === "register";
}

export function buildAuthViewModel({
  auth = {},
  syncActive = false,
  authMode = "login",
  authFeedback = ""
} = {}) {
  const formMode = normalizeAuthMode(authMode);
  const showConfirm = shouldShowAuthConfirm(formMode);
  const submitAction = formMode === "register" ? "sign-up" : "sign-in";
  const submitLabelKey = formMode === "register" ? "account.signUp" : "account.signIn";

  if (auth.mode === "demo") {
    return {
      variant: "demo",
      titleKey: null,
      metaKey: "account.demoTitle",
      metaValues: null,
      metaText: "",
      showForm: false,
      showUserActions: true,
      formMode,
      showConfirm: false,
      submitAction,
      submitLabelKey,
      signOutAction: "exit-demo",
      currentAccountEmail: auth.email || null,
      userCopyKey: "account.demoMode"
    };
  }

  if (!auth.configured) {
    return {
      variant: "not-configured",
      titleKey: "account.notConfiguredTitle",
      metaKey: "account.notConfiguredMeta",
      metaValues: null,
      metaText: "",
      showForm: false,
      showUserActions: false,
      formMode,
      showConfirm,
      submitAction,
      submitLabelKey,
      signOutAction: null,
      currentAccountEmail: null,
      userCopyKey: null
    };
  }

  if (auth.mode === "session" && auth.isLoggedIn) {
    return {
      variant: "session",
      titleKey: null,
      metaKey: syncActive ? "account.sessionMeta" : "account.waitingSyncMeta",
      metaValues: syncActive ? { userId: auth.userId || "" } : null,
      metaText: "",
      showForm: false,
      showUserActions: true,
      formMode,
      showConfirm: false,
      submitAction,
      submitLabelKey,
      signOutAction: "sign-out",
      currentAccountEmail: auth.email || null,
      userCopyKey: null
    };
  }

  if (auth.mode === "static-user" && auth.userId) {
    return {
      variant: "static-user",
      titleKey: "account.staticUserTitle",
      metaKey: "account.staticUserMeta",
      metaValues: { userId: auth.userId },
      metaText: "",
      showForm: false,
      showUserActions: false,
      formMode,
      showConfirm: false,
      submitAction,
      submitLabelKey,
      signOutAction: null,
      currentAccountEmail: null,
      userCopyKey: null
    };
  }

  return {
    variant: "form",
    titleKey: formMode === "register" ? "account.registerTitle" : "account.signInTitle",
    metaKey: authFeedback ? null : "account.authMeta",
    metaValues: null,
    metaText: authFeedback,
    showForm: true,
    showUserActions: false,
    formMode,
    showConfirm,
    submitAction,
    submitLabelKey,
    signOutAction: null,
    currentAccountEmail: null,
    userCopyKey: null
  };
}

export function validateAuthDraft({
  mode = "login",
  email = "",
  password = "",
  confirmPassword = ""
} = {}) {
  const normalizedMode = normalizeAuthMode(mode);
  const trimmedEmail = String(email || "").trim();
  const trimmedPassword = String(password || "");
  const trimmedConfirm = String(confirmPassword || "");

  if (!trimmedEmail || !trimmedPassword) {
    return { ok: false, reason: "missing_credentials" };
  }

  if (normalizedMode === "register") {
    if (trimmedPassword.length < 6) {
      return { ok: false, reason: "password_too_short" };
    }

    if (trimmedPassword !== trimmedConfirm) {
      return { ok: false, reason: "password_mismatch" };
    }
  }

  return {
    ok: true,
    mode: normalizedMode,
    email: trimmedEmail,
    password: trimmedPassword
  };
}
