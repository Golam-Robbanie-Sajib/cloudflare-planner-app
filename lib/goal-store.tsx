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
    if (!isAuthenticated || !userInfo?.uid) {
      setGoals([]);
      setLoading(false);
      return;
    }

    const userId = userInfo.uid;
    const unsubscribe = subscribeToGoals(userId, (updatedGoals) => {
      setGoals(updatedGoals);
      setLoading(false);
    });

    return unsubscribe;
  }, [isAuthenticated, userInfo?.email]);

  const addGoal = async (goalData: Omit<UserGoal, "id" | "createdAt" | "updatedAt">) => {
    if (!userInfo?.uid) return null;
    const newGoalRef = await addGoalToFirestore(userInfo.uid, goalData);
    return newGoalRef.id;
  };

  const updateGoal = async (id: string, updates: Partial<UserGoal>) => {
    if (!userInfo?.uid) return;
    await updateGoalInFirestore(userInfo.uid, id, updates);
  };

  const deleteGoal = async (id: string) => {
    if (!userInfo?.uid) return;
    await deleteGoalFromFirestore(userInfo.uid, id);
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