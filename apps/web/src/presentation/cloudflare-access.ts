// Cloudflare reserves `/cdn-cgi/access/*` endpoints for Access auth flows.
const ACCESS_PATH_PREFIX = "/cdn-cgi/access";

export const ACCESS_LOGIN_PATH = `${ACCESS_PATH_PREFIX}/login`;
export const ACCESS_LOGOUT_PATH = `${ACCESS_PATH_PREFIX}/logout`;
export const ACCESS_CERTS_PATH = `${ACCESS_PATH_PREFIX}/certs`;

export const resolveAccessUrl = (teamDomain: string, path: string): string => {
  return `https://${teamDomain}${path}`;
};
