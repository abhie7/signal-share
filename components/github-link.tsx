"use client"

import { useEffect, useState } from "react"
import { GithubIcon, StarIcon } from "@hugeicons/core-free-icons"
import { Icon } from "@/components/icon"
import { cn } from "@/lib/utils"

type Repo = { url: string | null; stars: number | null }

// One request per page load, shared by every link on the page.
let pending: Promise<Repo> | null = null
const loadRepo = () =>
  (pending ??= fetch("/api/repo")
    .then((r) => r.json() as Promise<Repo>)
    .catch(() => ({ url: null, stars: null })))

function useRepo() {
  const [repo, setRepo] = useState<Repo | null>(null)
  useEffect(() => {
    let live = true
    void loadRepo().then((r) => live && setRepo(r))
    return () => {
      live = false
    }
  }, [])
  return repo
}

/** Header pill: GitHub mark and star count. Hidden when no repo is configured. */
export function GitHubStars({ className }: { className?: string }) {
  const repo = useRepo()
  if (!repo?.url) return null
  return (
    <a
      href={repo.url}
      target='_blank'
      rel='noopener noreferrer'
      aria-label={`SignalShare on GitHub${repo.stars !== null ? `, ${repo.stars} stars` : ""}`}
      className={cn(
        "pressable items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted-foreground backdrop-blur-md hover:border-teal/50 hover:text-foreground",
        className,
      )}
    >
      <Icon icon={GithubIcon} className='size-4' />
      {repo.stars !== null && (
        <>
          <Icon icon={StarIcon} className='size-3.5 text-amber' />
          <span className='tabular-nums'>{repo.stars}</span>
        </>
      )}
    </a>
  )
}

/** Footer text link. */
export function GitHubLink() {
  const repo = useRepo()
  if (!repo?.url) return null
  return (
    <a
      href={repo.url}
      target='_blank'
      rel='noopener noreferrer'
      className='inline-flex items-center gap-1.5 hover:text-foreground'
    >
      <Icon icon={GithubIcon} className='size-3.5' />
      Open source on GitHub
      {repo.stars !== null && (
        <span className='tabular-nums'>· {repo.stars} ★</span>
      )}
    </a>
  )
}
