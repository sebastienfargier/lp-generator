/**
 * Classes réelles présentées par /design-system. Ce sont des NOMS de classes
 * Tailwind, jamais des valeurs : Tailwind ne génère que les classes écrites en
 * toutes lettres dans le code, une classe construite dynamiquement n'existerait
 * pas. Les tests vérifient que cette liste couvre exactement les tokens de
 * `app/globals.css`.
 */

export const typographyStyles = [
  { token: "display", className: "text-display", sample: "Se former, c'est avancer." },
  { token: "h1", className: "text-h1", sample: "Une formation qui vous ressemble" },
  { token: "h2", className: "text-h2", sample: "Les étapes de votre parcours" },
  { token: "body", className: "text-body", sample: "Explorez les formations Studi à votre rythme et trouvez celle qui correspond à votre projet." },
  { token: "caption", className: "text-caption", sample: "Formation 100 % en ligne" },
] as const

export const radiusSteps = [
  { token: "sm", className: "rounded-sm" },
  { token: "md", className: "rounded-md" },
  { token: "lg", className: "rounded-lg" },
  { token: "xl", className: "rounded-xl" },
  { token: "full", className: "rounded-full" },
] as const
