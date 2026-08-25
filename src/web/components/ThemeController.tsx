import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export type AppTheme = "cupcake" | "coffee";
const THEME_KEY = "dofusguide.theme";

export function ThemeController() {
  const [theme, setTheme] = useState<AppTheme>("cupcake");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "coffee" ? "coffee" : "cupcake");
  }, []);

  function changeTheme(next: AppTheme) {
    document.documentElement.dataset.theme = next;
    localStorage.setItem(THEME_KEY, next);
    setTheme(next);
  }

  return (
    <label className="swap swap-rotate btn btn-ghost btn-circle" aria-label={theme === "coffee" ? "Activer le thème clair" : "Activer le thème sombre"}>
      <input className="theme-controller" type="checkbox" value="coffee" checked={theme === "coffee"} onChange={(event) => changeTheme(event.currentTarget.checked ? "coffee" : "cupcake")} />
      <Sun className="swap-off h-5 w-5" aria-hidden="true" />
      <Moon className="swap-on h-5 w-5" aria-hidden="true" />
    </label>
  );
}

export const themeBootScript = `(function(){try{var t=localStorage.getItem('${THEME_KEY}');document.documentElement.dataset.theme=t==='coffee'?'coffee':'cupcake'}catch(e){document.documentElement.dataset.theme='cupcake'}})();`;
