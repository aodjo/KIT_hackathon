import React from "react";
import { render } from "ink";
import { App } from "./app.js";
import { openDebugWindow } from "./lib/debug.js";

openDebugWindow();
render(<App />);
