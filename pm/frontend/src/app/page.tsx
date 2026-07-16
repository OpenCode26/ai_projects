"use client";

import { useEffect, useState } from "react";
import { KanbanBoard } from "@/components/KanbanBoard";
import { LoginPage } from "@/components/LoginPage";

export default function Home() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    setAuthed(localStorage.getItem("authed") === "true");
  }, []);

  const handleLogin = () => {
    localStorage.setItem("authed", "true");
    setAuthed(true);
  };

  const handleLogout = () => {
    localStorage.removeItem("authed");
    setAuthed(false);
  };

  if (authed === null) return null;

  return authed ? (
    <KanbanBoard onLogout={handleLogout} />
  ) : (
    <LoginPage onLogin={handleLogin} />
  );
}
