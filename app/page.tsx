import { Button } from "@/components/ui/button"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">
        Mon premier projet
      </h1>

      <p>Bienvenue sur mon application !</p>

      <Button>
        Cliquez ici
      </Button>
    </main>
  )
}