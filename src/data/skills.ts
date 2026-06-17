export type SkillIcon = {
  name: string;
  icon: string;
  /** Posición horizontal en el stage (0–100). */
  x: number;
  /** Posición vertical en el stage (0–100). */
  y: number;
  scale?: number;
  rotate?: number;
};

export type SkillStack = {
  id: string;
  label: string;
  icons: SkillIcon[];
};

export const skillIconSrc = (icon: string) => `/icons/skills/${icon}.svg`;

export const frontendStack: SkillStack = {
  id: "frontend",
  label: "Frontend",
  icons: [
    { name: "HTML", icon: "html", x: 18, y: 20, scale: 1.12, rotate: -8 },
    { name: "CSS", icon: "css", x: 84, y: 18, scale: 1.08, rotate: 10 },
    { name: "JavaScript", icon: "javascript", x: 10, y: 51, scale: 1.15, rotate: -6 },
    { name: "TypeScript", icon: "typescript", x: 90, y: 51, scale: 1.1, rotate: 8 },
    { name: "Tailwind CSS", icon: "tailwind", x: 18, y: 80, scale: 1.06, rotate: -5 },
    { name: "Astro", icon: "astro", x: 84, y: 78, scale: 1.08, rotate: 12 },
    { name: "React", icon: "react", x: 50, y: 12, scale: 1.14, rotate: -10 },
    { name: "Next.js", icon: "nextjs", x: 50, y: 88, scale: 1.1, rotate: 6 },
  ],
};

export const backendStack: SkillStack = {
  id: "backend",
  label: "Backend",
  icons: [
    { name: "Node.js", icon: "nodejs", x: 16, y: 22, scale: 1.12, rotate: -8 },
    { name: "Express.js", icon: "express", x: 84, y: 20, scale: 1.1, rotate: 10 },
    { name: "Python", icon: "python", x: 12, y: 52, scale: 1.14, rotate: -6 },
    { name: "Java", icon: "java", x: 88, y: 50, scale: 1.1, rotate: 8 },
    { name: "PHP", icon: "php", x: 50, y: 86, scale: 1.08, rotate: 5 },
  ],
};

export const devopsStack: SkillStack = {
  id: "devops",
  label: "DevOps",
  icons: [
    { name: "Docker", icon: "docker", x: 18, y: 20, scale: 1.12, rotate: -8 },
    { name: "Vercel", icon: "vercel", x: 84, y: 18, scale: 1.08, rotate: 10 },
    { name: "Git", icon: "git", x: 10, y: 54, scale: 1.14, rotate: -6 },
    { name: "GitHub", icon: "github", x: 90, y: 52, scale: 1.1, rotate: 8 },
    { name: "Cloudflare", icon: "cloudflare", x: 50, y: 86, scale: 1.08, rotate: 5 },
  ],
};

export const skillStacks: SkillStack[] = [frontendStack, backendStack, devopsStack];
