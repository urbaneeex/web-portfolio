export const site = {
  name: "Alejandro Rodriguez",
  firstName: "Alejandro",
  lastName: "Rodriguez",
  role: "Web Developer & Interface Designer",
  location: "Remote · Europe",
  email: "alejandro@arkapp.es",
  socials: [
    { label: "GitHub", href: "https://github.com/urbaneeex" },
    { label: "LinkedIn", href: "https://www.linkedin.com/in/alejandro-rodriguez-challapa-b82630290" },
    { label: "Read.cv", href: "#" },
  ],
};

export const menuSocials = [
  { label: "Email", href: "mailto:alejandro@arkapp.es", icon: "/envelope.svg" },
  { label: "GitHub", href: "https://github.com/urbaneeex", icon: "/github.svg" },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/alejandro-rodriguez-challapa-b82630290", icon: "/linkedin.svg" },
] as const;

export const nav = [
  { label: "About", href: "#about" },
  { label: "Work", href: "#work" },
  { label: "Skills", href: "#skills" },
  { label: "Contact", href: "#contact" },
];

export type WorkProject = {
  id: string;
  index: string;
  title: string;
  year: string;
  href: string;
  image: string;
  imageAlt: string;
};

/** Imagen placeholder distinta por proyecto (Picsum). */
const projectImage = (seed: string) =>
  `https://picsum.photos/seed/${seed}/1200/750`;

export const workProjects: WorkProject[] = [
  {
    id: "arkapp",
    index: "01",
    title: "Arkapp",
    year: "2025",
    href: "#",
    image: projectImage("arkapp-portfolio"),
    imageAlt: "Arkapp project preview",
  },
  {
    id: "juan-cano",
    index: "02",
    title: "Juan Cano",
    year: "2025",
    href: "#",
    image: projectImage("juan-cano-portfolio"),
    imageAlt: "Juan Cano project preview",
  },
  {
    id: "angel-lavayen",
    index: "03",
    title: "Angel Lavayen",
    year: "2024",
    href: "#",
    image: projectImage("angel-lavayen-portfolio"),
    imageAlt: "Angel Lavayen project preview",
  },
];
