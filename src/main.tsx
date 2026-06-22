import React from "react";
import { AppRegistry } from "react-native";
import { App } from "./App";

AppRegistry.registerComponent("TimeAndFlow", () => App);
AppRegistry.runApplication("TimeAndFlow", {
  rootTag: document.getElementById("root"),
});
