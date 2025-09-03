// lib/goal-store.tsx
"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useAuth } from "./auth-context";
import {
  UserGoal,
  addGoal as addGoalToFirestore,
  updateGoal as updateGoalInFirestore,
  deleteGoal as deleteGoalFromFirestore,
  subscribeToGoals,
} from "./firestore-goals";

interface GoalStore {
  goals: UserGoal[];
  loading: boolean;
  addGoal: (goalData: Omit<UserGoal, "id" | "createdAt" | "updatedAt">) => Promise<string | null>;
  updateGoal: (id: string, updates: Partial<UserGoal>) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
}

const GoalContext = createContext<GoalStore | undefined>(undefined);

export function GoalProvider({ children }: { children: ReactNode }) {
  const [goals, setGoals] = useState<UserGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const { userInfo, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated || !userInfo?.email) {
      setGoals([]);
      setLoading(false);
      return;
    }

    const userId = userInfo.email;
    const unsubscribe = subscribeToGoals(userId, (updatedGoals) => {
      setGoals(updatedGoals);
      setLoading(false);
    });

    return unsubscribe;
  }, [isAuthenticated, userInfo?.email]);

  const addGoal = async (goalData: Omit<UserGoal, "id" | "createdAt" | "updatedAt">) => {
    if (!userInfo?.email) return null;
    const newGoalRef = await addGoalToFirestore(userInfo.email, goalData);
    return newGoalRef.id;
  };

  const updateGoal = async (id: string, updates: Partial<UserGoal>) => {
    if (!userInfo?.email) return;
    await updateGoalInFirestore(userInfo.email, id, updates);
  };

  const deleteGoal = async (id: string) => {
    if (!userInfo?.email) return;
    await deleteGoalFromFirestore(userInfo.email, id);
  };

  return (
    <GoalContext.Provider value={{ goals, loading, addGoal, updateGoal, deleteGoal }}>
      {children}
    </GoalContext.Provider>
  );
}

export function useGoalStore() {
  const context = useContext(GoalContext);
  if (context === undefined) {
    throw new Error("useGoalStore must be used within a GoalProvider");
  }
  return context;
}