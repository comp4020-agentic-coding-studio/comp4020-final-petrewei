import { T } from "/i18n.js";
const lang = document.documentElement.lang.startsWith("ja") ? "ja" : document.documentElement.lang.startsWith("zh") ? "zh" : "en";
const words = T[lang].ui;
const menu = document.getElementById("lang");
menu.value = lang;
menu.onchange = () => location.assign((menu.value === "en" ? "" : "/" + menu.value) + "/about");
const theme = document.getElementById("theme");
const isLight = () => document.documentElement.dataset.theme === "light" || (!document.documentElement.dataset.theme && !matchMedia("(prefers-color-scheme: dark)").matches);
function label() {
  document.documentElement.dataset.modeShown = isLight() ? "light" : "dark";
  theme.setAttribute("aria-label", words[isLight() ? "toDark" : "toLight"]);
}
theme.onclick = () => {
  const light = isLight();
  document.documentElement.dataset.theme = light ? "dark" : "light";
  try { localStorage.setItem("theme", document.documentElement.dataset.theme); } catch {}
  label();
};
label();
const audio = document.getElementById("bgm");
const music = document.getElementById("music");
audio.volume = 0.35;
music.onclick = async () => {
  if (audio.paused) { try { await audio.play(); } catch { return; } } else audio.pause();
  music.setAttribute("aria-pressed", String(!audio.paused));
  music.setAttribute("aria-label", words[audio.paused ? "musicOn" : "musicOff"]);
};
