import { lenisScrollToY } from "./initLenis";

function scrollToSection(id: string, duration: number) {
  const el = document.getElementById(id);
  if (!el) return;
  const y = window.scrollY + el.getBoundingClientRect().top;
  lenisScrollToY(Math.max(0, y), { duration, lock: false });
}

export function scrollToAboutSection(duration = 1.4) {
  scrollToSection("about", duration);
}

export function scrollToWorkSection() {
  scrollToSection("work", 1.6);
}

/** Registra enlaces internos para que el scroll pase el hero fijado. */
export function setupScrollNavLinks() {
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((link) => {
    const id = link.getAttribute("href")?.slice(1) ?? "";
    if (!id || !document.getElementById(id)) return;
    link.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      scrollToSection(id, id === "contact" ? 1.8 : 1.45);
    });
  });
}
