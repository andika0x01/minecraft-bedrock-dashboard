import { defineMiddleware } from "astro:middleware";
import { isLoggedIn } from "./lib/auth";

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = context.url.pathname;
  const isApi = pathname.startsWith("/api/");
  const isProtectedPage = pathname === "/" || pathname.startsWith("/dashboard");
  const isAuthEndpoint = pathname === "/api/auth/login";
  const isAuthPage = pathname === "/login";

  const loggedIn = isLoggedIn(context.request);

  if ((isApi && !isAuthEndpoint) || isProtectedPage) {
    if (!loggedIn) {
      if (isApi) {
        return new Response(JSON.stringify({ ok: false, message: "Unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json; charset=utf-8" },
        });
      }

      return context.redirect("/login");
    }
  }

  if (isAuthPage && loggedIn) {
    return context.redirect("/dashboard");
  }

  return next();
});
