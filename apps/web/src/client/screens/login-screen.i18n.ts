export const loginScreenJa = {
  loginScreen: {
    prompt: "アカウントにサインインして続行してください。",
    login: "ログイン",
    passwordReset: {
      title: "パスワードを忘れた場合",
      body: "Cloudflare Access のログイン画面で、OTPメール送信またはIdPのパスワード再設定導線を利用してください。",
      action: "パスワードリセットを開始する",
    },
  },
} as const;

export const loginScreenEn = {
  loginScreen: {
    prompt: "Continue to sign in to your account.",
    login: "Login",
    passwordReset: {
      title: "Forgot your password?",
      body: "Use the OTP email flow or your identity provider's password reset option on the Cloudflare Access login screen.",
      action: "Start password reset",
    },
  },
} as const;
