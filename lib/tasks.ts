import { useState, useEffect, useCallback } from "react"

export interface Task {
  id: string
  user_id: string
  title: string
  description: string
  repo_owner: string | null
  repo_name: string | null
  branch: string
  status: "pending" | "running" | "completed" | "failed"
  logs: unknown[]
  diff: string | null
  pr_url: string | null
  created_at: string
  completed_at: string | null
}

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/tasks")
      if (!res.ok) throw new Error("Failed to fetch tasks")
      const data = await res.json()
      setTasks(data.tasks || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  return { tasks, loading, error, refresh: fetchTasks }
}

export function useTask(id: string) {
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchTask = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/tasks/${id}`)
      if (!res.ok) throw new Error("Failed to fetch task")
      const data = await res.json()
      setTask(data.task)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchTask()
  }, [fetchTask])

  return { task, loading, error, refresh: fetchTask }
}
