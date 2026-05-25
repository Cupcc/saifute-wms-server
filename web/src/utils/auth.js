import Cookies from "js-cookie";

const TokenKey = "Admin-Token";
const RefreshTokenKey = "Admin-Refresh-Token";
const AuthCookieExpiresDays = 30;

export function getToken() {
  return Cookies.get(TokenKey);
}

export function setToken(token) {
  return Cookies.set(TokenKey, token, { expires: AuthCookieExpiresDays });
}

export function getRefreshToken() {
  return Cookies.get(RefreshTokenKey);
}

export function setRefreshToken(token) {
  return Cookies.set(RefreshTokenKey, token, {
    expires: AuthCookieExpiresDays,
  });
}

export function removeToken() {
  return Cookies.remove(TokenKey);
}

export function removeRefreshToken() {
  return Cookies.remove(RefreshTokenKey);
}
