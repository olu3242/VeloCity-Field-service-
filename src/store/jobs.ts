import { create } from "zustand";
import type { Job } from "@/types";

interface JobsState {
  jobs: Job[];
  activeJob: Job | null;
  isLoading: boolean;
  error: string | null;
  setJobs: (jobs: Job[]) => void;
  setActiveJob: (job: Job | null) => void;
  updateJob: (id: string, updates: Partial<Job>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useJobsStore = create<JobsState>((set) => ({
  jobs: [],
  activeJob: null,
  isLoading: false,
  error: null,
  setJobs: (jobs) => set({ jobs }),
  setActiveJob: (activeJob) => set({ activeJob }),
  updateJob: (id, updates) =>
    set((state) => ({
      jobs: state.jobs.map((j) => (j.id === id ? { ...j, ...updates } : j)),
      activeJob:
        state.activeJob?.id === id ? { ...state.activeJob, ...updates } : state.activeJob,
    })),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));
