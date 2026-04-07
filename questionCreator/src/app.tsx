import React, { useState } from "react";
import { MainMenu } from "./components/MainMenu.js";
import { BulkGenerate } from "./components/BulkGenerate.js";
import { SelectGenerate } from "./components/SelectGenerate.js";
import { closeDb } from "./lib/db.js";
import type { Screen } from "./types.js";

/**
 * Root application component.
 *
 * @returns React element
 */
export function App(): React.ReactElement | null {
  /** Current active screen */
  const [screen, setScreen] = useState<Screen>("menu");

  /**
   * Handle screen navigation from main menu.
   *
   * @param next - Target screen
   */
  const handleSelect = (next: Screen) => {
    if (next === "exit") {
      closeDb();
      process.exit(0);
    }
    setScreen(next);
  };

  /** Return to main menu */
  const goBack = () => setScreen("menu");

  if (screen === "menu") {
    return <MainMenu onSelect={handleSelect} />;
  }

  if (screen === "bulk") {
    return <BulkGenerate onBack={goBack} />;
  }

  if (screen === "select") {
    return <SelectGenerate onBack={goBack} />;
  }

  return null;
}
