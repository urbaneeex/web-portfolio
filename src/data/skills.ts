export type SkillGroup = {
  id: string;
  label: string;
  items: string[];
};

export const skillGroups: SkillGroup[] = [
  {
    id: "frontend",
    label: "Frontend",
    items: [
      "HTML",
      "CSS",
      "JavaScript",
      "TypeScript",
      "Tailwind CSS",
      "Astro",
      "React",
      "Next.js",
    ],
  },
  {
    id: "backend",
    label: "Backend",
    items: ["Node.js", "Express.js", "Python", "Java", "PHP"],
  },
  {
    id: "devops",
    label: "DevOps",
    items: ["Docker", "Vercel", "Git", "GitHub", "Cloudflare"],
  },
];
