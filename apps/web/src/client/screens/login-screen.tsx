import { useTranslation } from "react-i18next";

export function LoginScreen() {
  const { t } = useTranslation();

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">tatsumaki</h1>
        <p className="mt-2 text-sm text-gray-600">{t("loginScreen.prompt")}</p>
        <a
          href="/cdn-cgi/access/login"
          className="mt-6 inline-block w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          {t("loginScreen.login")}
        </a>

        <section className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-left">
          <h2 className="text-sm font-semibold text-gray-900">
            {t("loginScreen.passwordReset.title")}
          </h2>
          <p className="mt-1 text-xs leading-5 text-gray-600">
            {t("loginScreen.passwordReset.body")}
          </p>
          <a
            href="/cdn-cgi/access/login"
            className="mt-2 inline-block text-xs font-medium text-blue-700 hover:text-blue-800"
          >
            {t("loginScreen.passwordReset.action")}
          </a>
        </section>
      </div>
    </main>
  );
}
