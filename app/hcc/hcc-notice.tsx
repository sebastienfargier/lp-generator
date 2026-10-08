import { tryReadHccConfig } from "@/lib/hcc/config"

/** Page d'information du parcours HCC : aucune donnée de session, un lien vers le HCC s'il est configuré. */
export function HccNotice({ title, text }: { title: string; text: string }) {
  const hcc = tryReadHccConfig()?.apiOrigin
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="flex max-w-md flex-col gap-3 text-center">
        <h1 className="text-h2">{title}</h1>
        <p className="text-body text-muted-foreground">{text}</p>
        {hcc ? (
          <a className="text-body font-semibold underline underline-offset-4" href={hcc}>
            Rouvrir depuis le HCC
          </a>
        ) : null}
      </div>
    </main>
  )
}
