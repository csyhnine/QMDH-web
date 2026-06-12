const REMEMBER_KEY = "qmdh_login_remember";
const NAME_KEY = "qmdh_login_name";
const PASSWORD_KEY = "qmdh_login_password";

export type RememberedLoginCredentials = {
  name: string;
  password: string;
  remember: boolean;
};

export function loadRememberedLoginCredentials(): RememberedLoginCredentials {
  if (typeof window === "undefined") {
    return { name: "", password: "", remember: false };
  }
  if (window.localStorage.getItem(REMEMBER_KEY) !== "1") {
    return { name: "", password: "", remember: false };
  }
  return {
    name: window.localStorage.getItem(NAME_KEY) ?? "",
    password: window.localStorage.getItem(PASSWORD_KEY) ?? "",
    remember: true,
  };
}

export function saveRememberedLoginCredentials(name: string, password: string) {
  window.localStorage.setItem(REMEMBER_KEY, "1");
  window.localStorage.setItem(NAME_KEY, name.trim());
  window.localStorage.setItem(PASSWORD_KEY, password);
}

export function clearRememberedLoginCredentials() {
  window.localStorage.removeItem(REMEMBER_KEY);
  window.localStorage.removeItem(NAME_KEY);
  window.localStorage.removeItem(PASSWORD_KEY);
}
