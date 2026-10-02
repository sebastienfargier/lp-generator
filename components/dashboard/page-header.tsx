type PageHeaderProps = {
  title: string
  description?: string
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-1">
      <h1 className="text-h1">{title}</h1>
      {description ? <p className="text-body text-muted-foreground">{description}</p> : null}
    </header>
  )
}

export function SectionHeading({ title, description }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-h2">{title}</h2>
      {description ? <p className="text-body text-muted-foreground">{description}</p> : null}
    </div>
  )
}
