export const velocityThemeNames = ["dark", "light", "blue", "purple", "amber"] as const;

export type VelocityThemeName = (typeof velocityThemeNames)[number];

export const defaultVelocityTheme: VelocityThemeName = "dark";

export const velocityThemeStorageKey = "velocity-theme";

export const velocityThemeScript = `
(function() {
  try {
    var key = "${velocityThemeStorageKey}";
    var stored = window.localStorage.getItem(key);
    var allowed = ${JSON.stringify(velocityThemeNames)};
    var theme = allowed.indexOf(stored) >= 0 ? stored : "${defaultVelocityTheme}";
    var root = document.documentElement;
    root.classList.remove("theme-dark", "theme-light", "theme-blue", "theme-purple", "theme-amber");
    root.classList.add("theme-" + theme);
    root.dataset.theme = theme;
  } catch (error) {
    document.documentElement.classList.add("theme-${defaultVelocityTheme}");
    document.documentElement.dataset.theme = "${defaultVelocityTheme}";
  }
})();
`;

export const velocityThemeTokens = {
  colors: {
    black: "var(--black)",
    carbon: "var(--carbon)",
    graphite: "var(--graphite)",
    slate: "var(--slate)",
    border: "var(--border)",
    volt: "var(--volt)",
    amber: "var(--amber)",
    ice: "var(--ice)",
    white: "var(--white)",
    muted: "var(--muted)",
  },
  radius: {
    sm: "var(--velocity-radius-sm)",
    md: "var(--velocity-radius-md)",
    lg: "var(--velocity-radius-lg)",
    xl: "var(--velocity-radius-xl)",
  },
  duration: {
    fast: "var(--velocity-duration-fast)",
    base: "var(--velocity-duration-base)",
    slow: "var(--velocity-duration-slow)",
  },
} as const;
