import "./styles.css";
import { mountApp } from "./ui/App";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("找不到应用挂载节点 #app");

void mountApp(root);
