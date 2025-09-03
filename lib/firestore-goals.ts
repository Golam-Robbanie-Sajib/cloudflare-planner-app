// lib/firestore-goals.ts

import { db } from "./firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

export interface UserGoal {
  id: string;
  title: string;
  description: string;
  status: "not_started" | "in_progress" | "completed";
  targetDate?: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

const getGoalsCollection = (userId: string) => {
  return collection(db, "users", userId, "goals");
};

// SUBSCRIBE to real-time goal updates
export const subscribeToGoals = (
  userId: string,
  callback: (goals: UserGoal[]) => void
) => {
  const q = query(getGoalsCollection(userId));
  return onSnapshot(q, (querySnapshot) => {
    const goals: UserGoal[] = [];
    querySnapshot.forEach((doc) => {
      goals.push({ id: doc.id, ...doc.data() } as UserGoal);
    });
    callback(goals);
  });
};

// ADD a new goal
export const addGoal = async (
  userId: string,
  goalData: Omit<UserGoal, "id" | "createdAt" | "updatedAt">
) => {
  await addDoc(getGoalsCollection(userId), {
    ...goalData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};

// UPDATE an existing goal
export const updateGoal = async (
  userId: string,
  goalId: string,
  updates: Partial<UserGoal>
) => {
  const goalDoc = doc(db, "users", userId, "goals", goalId);
  await updateDoc(goalDoc, { ...updates, updatedAt: serverTimestamp() });
};

// DELETE a goal
export const deleteGoal = async (userId: string, goalId: string) => {
  const goalDoc = doc(db, "users", userId, "goals", goalId);
  await deleteDoc(goalDoc);
};