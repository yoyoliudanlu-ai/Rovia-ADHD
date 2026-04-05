export function mapAuthErrorMessage(message, { locale = "zh", fallback = "" } = {}) {
  const text = String(message || "").trim();
  const isZh = locale !== "en";

  if (!text) {
    return fallback;
  }

  if (text.includes("Invalid login credentials")) {
    return isZh ? "邮箱或密码错误。" : "Incorrect email or password.";
  }

  if (text.includes("Email not confirmed")) {
    return isZh
      ? "邮箱还没有完成验证，请先确认邮件后再登录。"
      : "Email is not confirmed yet. Please confirm it before signing in.";
  }

  if (text.includes("User already registered")) {
    return isZh
      ? "该邮箱已注册，请直接登录。"
      : "This email is already registered. Please sign in instead.";
  }

  if (text.includes("Signup is disabled")) {
    return isZh
      ? "当前环境未开启注册，请联系管理员。"
      : "Sign-up is disabled in this environment.";
  }

  if (
    text.includes("backend_unreachable") ||
    text.includes("fetch failed") ||
    text.includes("ECONNREFUSED") ||
    text.includes("timeout") ||
    text.includes("network")
  ) {
    return isZh
      ? "账号服务暂时不可用，请确认后端已经启动。"
      : "Account service is temporarily unavailable. Make sure the backend is running.";
  }

  return text || fallback;
}
